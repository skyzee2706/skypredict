import type { MarketData } from '../../data/markets';

export type MarketOutcomeSide = 'YES' | 'DRAW' | 'NO';

export type MarketEventLike = {
  title?: unknown;
  category?: unknown;
  deadline?: unknown;
  volume?: unknown;
  updatedAt?: unknown;
  updated_at?: unknown;
  contractId?: unknown;
  market_address?: unknown;
};

function numericValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function timestampValue(value: unknown) {
  if (typeof value !== 'string' || !value) return Number.MAX_SAFE_INTEGER;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

export function normalizeMarketTitle(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getMarketEventKey(market: MarketEventLike) {
  const category = String(market.category || 'UNKNOWN').trim().toUpperCase();
  const title = normalizeMarketTitle(market.title);
  const deadline = String(market.deadline ?? '0').trim();
  return `${category}|${title}|${deadline}`;
}

function isPreferredMarket<T extends MarketEventLike>(candidate: T, current: T) {
  const candidateVolume = numericValue(candidate.volume);
  const currentVolume = numericValue(current.volume);
  if (candidateVolume !== currentVolume) return candidateVolume > currentVolume;

  const candidateUpdatedAt = timestampValue(candidate.updatedAt ?? candidate.updated_at);
  const currentUpdatedAt = timestampValue(current.updatedAt ?? current.updated_at);
  if (candidateUpdatedAt !== currentUpdatedAt) return candidateUpdatedAt < currentUpdatedAt;

  const candidateAddress = String(candidate.contractId ?? candidate.market_address ?? '');
  const currentAddress = String(current.contractId ?? current.market_address ?? '');
  return candidateAddress.localeCompare(currentAddress) < 0;
}

export function dedupeMarketsByEvent<T extends MarketEventLike>(markets: T[]) {
  const byEvent = new Map<string, T>();
  for (const market of markets) {
    const key = getMarketEventKey(market);
    const existing = byEvent.get(key);
    if (!existing || isPreferredMarket(market, existing)) {
      byEvent.set(key, market);
    }
  }
  return [...byEvent.values()];
}

function clampProbability(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function applyOptimisticBetToMarket(market: MarketData, outcome: MarketOutcomeSide, amount: number): MarketData {
  const betAmount = Math.max(0, numericValue(amount));
  if (betAmount <= 0) return market;

  const currentVolume = Math.max(0, numericValue(market.volume));
  const hasExistingPool = currentVolume > 0;
  let sideAPool = hasExistingPool ? clampProbability(market.probYes) * currentVolume : 0;
  let drawPool = hasExistingPool ? clampProbability(market.probDraw ?? 0) * currentVolume : 0;
  let sideBPool = hasExistingPool ? clampProbability(market.probNo) * currentVolume : 0;

  if (outcome === 'YES') sideAPool += betAmount;
  else if (outcome === 'DRAW') drawPool += betAmount;
  else sideBPool += betAmount;

  const nextVolume = sideAPool + drawPool + sideBPool;
  if (nextVolume <= 0) return market;

  return {
    ...market,
    liquidity: nextVolume,
    volume: nextVolume,
    probYes: sideAPool / nextVolume,
    probDraw: drawPool / nextVolume,
    probNo: sideBPool / nextVolume,
    statsLoading: false,
  };
}
