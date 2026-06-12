import type { MarketData, MarketState } from '../../data/markets';

export type MarketRowLike = Record<string, unknown>;

const FINAL_MARKET_STATES = new Set(['RESOLVED', 'UNDETERMINED']);

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rowAddress(row: MarketRowLike) {
  return String(row.market_address ?? row.contractId ?? row.id ?? '').toLowerCase();
}

function rowState(row: MarketRowLike) {
  return String(row.state ?? '').toUpperCase();
}

export function isFinalMarketState(state: unknown) {
  return FINAL_MARKET_STATES.has(String(state ?? '').toUpperCase());
}

export function getLiveMarketState(market: MarketData, nowSeconds = Math.floor(Date.now() / 1000)): MarketState {
  if (isFinalMarketState(market.state)) return market.state;

  const deadline = numberValue(market.bettingEndTime || market.deadline);
  if (deadline > 0 && deadline <= nowSeconds) return 'RESOLVING';
  return market.state;
}

export function getResolvableMarkets(markets: MarketData[], nowSeconds = Math.floor(Date.now() / 1000)) {
  return markets.filter((market) => {
    if (isFinalMarketState(market.state)) return false;
    const deadline = numberValue(market.bettingEndTime || market.deadline);
    return deadline > 0 && deadline <= nowSeconds;
  });
}

export function filterOpenMarketRows<T extends MarketRowLike>(rows: T[], finalizedMarketAddresses: Set<string>) {
  return rows.filter((row) => {
    if (isFinalMarketState(rowState(row))) return false;
    const address = rowAddress(row);
    return !address || !finalizedMarketAddresses.has(address);
  });
}
