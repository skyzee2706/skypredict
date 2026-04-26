import { NextResponse } from 'next/server';
import ccxt from 'ccxt';

export const revalidate = 0;

type ExchangeLike = {
  fetchTicker: (symbol: string) => Promise<{ last?: number | null }>;
};

const exchanges: Record<string, ExchangeLike> = {
  binance: new ccxt.binance({ timeout: 5000 }) as unknown as ExchangeLike,
  bybit: new ccxt.bybit({ timeout: 5000 }) as unknown as ExchangeLike,
  mexc: new ccxt.mexc({ timeout: 5000 }) as unknown as ExchangeLike,
  kucoin: new ccxt.kucoin({ timeout: 5000 }) as unknown as ExchangeLike,
  gate: new ccxt.gate({ timeout: 5000 }) as unknown as ExchangeLike,
  bitget: new ccxt.bitget({ timeout: 5000 }) as unknown as ExchangeLike,
  okx: new ccxt.okx({ timeout: 5000 }) as unknown as ExchangeLike,
  htx: new ccxt.htx({ timeout: 5000 }) as unknown as ExchangeLike,
  bitmart: new ccxt.bitmart({ timeout: 5000 }) as unknown as ExchangeLike,
  digifinex: new ccxt.digifinex({ timeout: 5000 }) as unknown as ExchangeLike
};

export async function GET() {
  try {
    const exchangeIds = Object.keys(exchanges);

    const results = await Promise.allSettled(
      exchangeIds.map(async (id) => {
        try {
          const ticker = await exchanges[id].fetchTicker('BTC/USDT');
          return typeof ticker?.last === 'number' ? ticker.last : null;
        } catch {
          return null;
        }
      })
    );

    const prices = results
      .filter((r): r is PromiseFulfilledResult<number | null> => r.status === 'fulfilled')
      .map((r) => r.value)
      .filter((p): p is number => p !== null && p > 10000);

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
