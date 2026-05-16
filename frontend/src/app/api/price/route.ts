import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type MarketSymbol = 'BTCUSDT' | 'ETHUSDT';

type PriceSource = {
  id: string;
  buildUrl: (symbol: MarketSymbol) => string;
  readPrice: (data: unknown) => number | null;
};

const priceSources: PriceSource[] = [
  {
    id: 'binance',
    buildUrl: (symbol) => `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
    readPrice: (data) => readNumericPath(data, ['price'])
  },
  {
    id: 'bybit',
    buildUrl: (symbol) => `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbol}`,
    readPrice: (data) => readNumericPath(data, ['result', 'list', 0, 'lastPrice'])
  },
  {
    id: 'mexc',
    buildUrl: (symbol) => `https://api.mexc.com/api/v3/ticker/price?symbol=${symbol}`,
    readPrice: (data) => readNumericPath(data, ['price'])
  }
];

function normalizeSymbol(value: string | null): MarketSymbol {
  const normalized = (value || 'BTC/USDT').replace('/', '').replace('-', '').toUpperCase();
  return normalized === 'ETHUSDT' ? 'ETHUSDT' : 'BTCUSDT';
}

function readNumericPath(data: unknown, path: Array<string | number>): number | null {
  let current: unknown = data;

  for (const key of path) {
    if (typeof key === 'number') {
      if (!Array.isArray(current)) return null;
      current = current[key];
      continue;
    }

    if (!current || typeof current !== 'object' || !(key in current)) return null;
    current = (current as Record<string, unknown>)[key];
  }

  const value = typeof current === 'number' ? current : Number(current);
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function fetchPrice(source: PriceSource, symbol: MarketSymbol): Promise<number | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(source.buildUrl(symbol), {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'application/json'
      }
    });

    if (!response.ok) return null;
    return source.readPrice(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbol = normalizeSymbol(url.searchParams.get('symbol'));
    const results = await Promise.allSettled(priceSources.map((source) => fetchPrice(source, symbol)));
    const prices = results
      .filter((result): result is PromiseFulfilledResult<number | null> => result.status === 'fulfilled')
      .map((result) => result.value)
      .filter((price): price is number => price !== null);

    if (prices.length === 0) throw new Error(`Price sources unreachable for ${symbol}`);

    prices.sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    const finalPrice = prices.length % 2 !== 0 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;

    return NextResponse.json(
      {
        price: finalPrice,
        sources: prices.length,
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
