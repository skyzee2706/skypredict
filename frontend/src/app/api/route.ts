import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type PriceSource = {
  id: string;
  url: string;
  readPrice: (data: unknown) => number | null;
};

const priceSources: PriceSource[] = [
  {
    id: 'binance',
    url: 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT',
    readPrice: (data) => readNumericPath(data, ['price'])
  },
  {
    id: 'bybit',
    url: 'https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT',
    readPrice: (data) => readNumericPath(data, ['result', 'list', 0, 'lastPrice'])
  },
  {
    id: 'okx',
    url: 'https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT',
    readPrice: (data) => readNumericPath(data, ['data', 0, 'last'])
  },
  {
    id: 'kucoin',
    url: 'https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=BTC-USDT',
    readPrice: (data) => readNumericPath(data, ['data', 'price'])
  },
  {
    id: 'mexc',
    url: 'https://api.mexc.com/api/v3/ticker/price?symbol=BTCUSDT',
    readPrice: (data) => readNumericPath(data, ['price'])
  }
];

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
  return Number.isFinite(value) && value > 10000 ? value : null;
}

async function fetchPrice(source: PriceSource): Promise<number | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(source.url, {
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

export async function GET() {
  try {
    const results = await Promise.allSettled(priceSources.map(fetchPrice));
    const prices = results
      .filter((result): result is PromiseFulfilledResult<number | null> => result.status === 'fulfilled')
      .map((result) => result.value)
      .filter((price): price is number => price !== null);

    if (prices.length === 0) {
      throw new Error('Price sources unreachable');
    }

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
