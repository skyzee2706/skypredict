import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type MarketSymbol = 'BTCUSDT' | 'ETHUSDT';
type BinanceKline = [number, string, string, string, string, string, number, string, number, string, string, string];

function normalizeSymbol(value: string | null): MarketSymbol {
  const normalized = (value || 'BTC/USDT').replace('/', '').replace('-', '').toUpperCase();
  return normalized === 'ETHUSDT' ? 'ETHUSDT' : 'BTCUSDT';
}

function getSundayStartSeconds(): number {
  const now = new Date();
  const sunday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - now.getUTCDay(), 0, 0, 0, 0));
  return Math.floor(sunday.getTime() / 1000);
}

function normalizeSince(value: string | null, minimum: number): number {
  if (!value) return minimum;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(parsed, minimum) : minimum;
}

function readClosePrice(candle: BinanceKline): number | null {
  const value = Number(candle[4]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbol = normalizeSymbol(url.searchParams.get('symbol'));
    const sundayTs = getSundayStartSeconds();
    const sinceTs = normalizeSince(url.searchParams.get('since'), sundayTs);
    const elapsedMinutes = Math.max(1, Math.floor((Date.now() / 1000 - sinceTs) / 60) + 120);
    const limit = Math.min(elapsedMinutes, 1000);
    const params = new URLSearchParams({
      symbol,
      interval: '1m',
      startTime: String(sinceTs * 1000),
      limit: String(limit)
    });

    const response = await fetch(`https://api.binance.com/api/v3/klines?${params.toString()}`, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`History source unreachable for ${symbol}`);
    }

    const candles = (await response.json()) as BinanceKline[];
    const history = candles
      .map((candle) => {
        const value = readClosePrice(candle);
        return value ? { time: Math.floor(candle[0] / 1000), value } : null;
      })
      .filter((point): point is { time: number; value: number } => point !== null && point.time >= sundayTs);

    return NextResponse.json(
      {
        history,
        source: 'binance_1m',
        range_start: sundayTs,
        sources_count: history.length > 0 ? 1 : 0,
        timestamp: Math.floor(Date.now() / 1000)
      },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Cache-Control': 'no-store, max-age=0'
        }
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ history: [], error: message }, { status: 200 });
  }
}
