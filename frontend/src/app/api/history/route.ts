import { NextResponse } from 'next/server';
import ccxt from 'ccxt';

export const revalidate = 0;

type Candle = [number, number, number, number, number, number?];
type ExchangeLike = {
  fetchOHLCV: (symbol: string, timeframe?: string, since?: number, limit?: number) => Promise<Candle[]>;
};

const exchanges: Record<string, ExchangeLike> = {
  binance: new ccxt.binance({ timeout: 10000 }) as unknown as ExchangeLike,
  bybit: new ccxt.bybit({ timeout: 10000 }) as unknown as ExchangeLike,
  mexc: new ccxt.mexc({ timeout: 10000 }) as unknown as ExchangeLike,
  kucoin: new ccxt.kucoin({ timeout: 10000 }) as unknown as ExchangeLike,
  gate: new ccxt.gate({ timeout: 10000 }) as unknown as ExchangeLike,
  bitget: new ccxt.bitget({ timeout: 10000 }) as unknown as ExchangeLike,
  okx: new ccxt.okx({ timeout: 10000 }) as unknown as ExchangeLike,
  htx: new ccxt.htx({ timeout: 10000 }) as unknown as ExchangeLike,
  bitmart: new ccxt.bitmart({ timeout: 10000 }) as unknown as ExchangeLike,
  digifinex: new ccxt.digifinex({ timeout: 10000 }) as unknown as ExchangeLike
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sinceParam = url.searchParams.get('since');
    const symbol = url.searchParams.get('symbol') || 'BTC/USDT';

    const now = new Date();
    const sunday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - now.getUTCDay(), 0, 0, 0, 0));
    const sundayTs = Math.floor(sunday.getTime() / 1000);

    const sinceTs = sinceParam ? Math.max(parseInt(sinceParam, 10), sundayTs) : null;

    const limit = sinceTs
      ? Math.min(Math.floor((Date.now() / 1000 - sinceTs) / 60) + 120, 2000)
      : 2000;

    const fetchSince = sinceTs ? sinceTs * 1000 : undefined;
    const exchangeIds = Object.keys(exchanges);

    const allResults = await Promise.allSettled(
      exchangeIds.map(async (id) => {
        try {
          const ohlcv = await exchanges[id].fetchOHLCV(symbol, '1m', fetchSince, limit);
          return ohlcv.map((k) => ({ t: Math.floor(k[0] / 1000), v: k[4] }));
        } catch {
          return [] as Array<{ t: number; v: number }>;
        }
      })
    );

    const priceGroups: Record<number, number[]> = {};

    allResults.forEach((res) => {
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        res.value.forEach((p) => {
          if (p.t >= sundayTs) {
            if (!priceGroups[p.t]) priceGroups[p.t] = [];
            priceGroups[p.t].push(p.v);
          }
        });
      }
    });

    const sortedTimestamps = Object.keys(priceGroups)
      .map(Number)
      .sort((a, b) => a - b);

    const history = sortedTimestamps.map((t) => {
      const vals = priceGroups[t];
      vals.sort((a, b) => a - b);
      const mid = Math.floor(vals.length / 2);
      return { time: t, value: vals.length % 2 !== 0 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2 };
    });

    return NextResponse.json(
      {
        history,
        source: 'ccxt_optimized_1m',
        range_start: sundayTs,
        sources_count: allResults.filter((r) => r.status === 'fulfilled' && r.value.length > 0).length,
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
