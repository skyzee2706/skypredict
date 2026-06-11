import { CachedLeaderboardEntry } from './cache';
import { toBigIntSafe } from '../numbers/bigintString';

type AmountValue = string | number | bigint | null | undefined;

export type PortfolioAccountingRow = {
  user_address: string;
  market_address?: string;
  side_a_amount?: AmountValue;
  draw_amount?: AmountValue;
  side_b_amount?: AmountValue;
  volume?: AmountValue;
  payout?: AmountValue;
  pnl?: AmountValue;
};

export type ActivityAccountingRow = {
  user_address: string;
  type?: string | null;
  outcome?: number | string | null;
};

type MutableLeaderboardEntry = CachedLeaderboardEntry;

type BuildLeaderboardOptions = {
  portfolioRows: PortfolioAccountingRow[];
  activityRows?: ActivityAccountingRow[];
  currentUserAddress?: string;
  limit?: number;
};

function normalizeAddress(address: string) {
  return address.toLowerCase() as `0x${string}`;
}

function compareBigintDesc(left: bigint, right: bigint) {
  if (left === right) return 0;
  return right > left ? 1 : -1;
}

function compareEntriesByAmount(
  left: CachedLeaderboardEntry,
  right: CachedLeaderboardEntry,
  field: 'volume' | 'pnl',
) {
  const amountOrder = compareBigintDesc(toBigIntSafe(left[field]), toBigIntSafe(right[field]));
  return amountOrder || left.address.localeCompare(right.address);
}

function getOrCreateEntry(entries: Map<string, MutableLeaderboardEntry>, address: string) {
  const key = normalizeAddress(address);
  let entry = entries.get(key);
  if (!entry) {
    entry = {
      address: key,
      volume: '0',
      payout: '0',
      pnl: '0',
      sideABets: 0,
      drawBets: 0,
      sideBBets: 0,
      totalBets: 0,
      volumeRank: 0,
      pnlRank: 0,
    };
    entries.set(key, entry);
  }
  return entry;
}

function rowStake(row: PortfolioAccountingRow) {
  const sideA = toBigIntSafe(row.side_a_amount);
  const draw = toBigIntSafe(row.draw_amount);
  const sideB = toBigIntSafe(row.side_b_amount);
  const sideTotal = sideA + draw + sideB;
  const volume = toBigIntSafe(row.volume);

  return {
    sideA,
    draw,
    sideB,
    volume: volume > 0n ? volume : sideTotal,
  };
}

function rowPositionValue(row: PortfolioAccountingRow, volume: bigint) {
  const payout = toBigIntSafe(row.payout);
  const pnl = toBigIntSafe(row.pnl);
  return payout > 0n ? payout : volume + pnl;
}

function countOutcome(entry: MutableLeaderboardEntry, outcome: number | string | null | undefined) {
  const numericOutcome = Number(outcome);
  if (numericOutcome === 1) entry.drawBets += 1;
  else if (numericOutcome === 2) entry.sideBBets += 1;
  else entry.sideABets += 1;
  entry.totalBets += 1;
}

export function buildLeaderboardFromPortfolioRows({
  portfolioRows,
  activityRows = [],
  currentUserAddress,
  limit = 20,
}: BuildLeaderboardOptions) {
  const entries = new Map<string, MutableLeaderboardEntry>();
  const fallbackBetCounts = new Map<string, { sideA: number; draw: number; sideB: number }>();

  for (const row of portfolioRows) {
    const entry = getOrCreateEntry(entries, row.user_address);
    const stake = rowStake(row);
    const positionValue = rowPositionValue(row, stake.volume);
    const currentVolume = toBigIntSafe(entry.volume);
    const currentPayout = toBigIntSafe(entry.payout);

    entry.volume = (currentVolume + stake.volume).toString();
    entry.payout = (currentPayout + positionValue).toString();
    entry.pnl = (toBigIntSafe(entry.payout) - toBigIntSafe(entry.volume)).toString();

    const key = entry.address;
    const fallback = fallbackBetCounts.get(key) ?? { sideA: 0, draw: 0, sideB: 0 };
    if (stake.sideA > 0n) fallback.sideA += 1;
    if (stake.draw > 0n) fallback.draw += 1;
    if (stake.sideB > 0n) fallback.sideB += 1;
    fallbackBetCounts.set(key, fallback);
  }

  for (const activity of activityRows) {
    if (String(activity.type || '').toUpperCase() !== 'BET') continue;
    const entry = getOrCreateEntry(entries, activity.user_address);
    countOutcome(entry, activity.outcome);
  }

  for (const [address, fallback] of fallbackBetCounts) {
    const entry = entries.get(address);
    if (!entry || entry.totalBets > 0) continue;
    entry.sideABets = fallback.sideA;
    entry.drawBets = fallback.draw;
    entry.sideBBets = fallback.sideB;
    entry.totalBets = fallback.sideA + fallback.draw + fallback.sideB;
  }

  const allEntries = [...entries.values()]
    .filter((entry) => (
      toBigIntSafe(entry.volume) > 0n
      || toBigIntSafe(entry.payout) !== 0n
    ));

  const byVolume = [...allEntries].sort((left, right) => compareEntriesByAmount(left, right, 'volume'));
  byVolume.forEach((entry, index) => { entry.volumeRank = index + 1; });

  const byPnl = [...allEntries].sort((left, right) => compareEntriesByAmount(left, right, 'pnl'));
  byPnl.forEach((entry, index) => { entry.pnlRank = index + 1; });

  const normalizedCurrentUser = currentUserAddress ? normalizeAddress(currentUserAddress) : null;

  return {
    allEntries,
    volumeLeaderboard: byVolume.slice(0, limit),
    pnlLeaderboard: byPnl.slice(0, limit),
    currentUser: normalizedCurrentUser
      ? allEntries.find((entry) => entry.address === normalizedCurrentUser) ?? null
      : null,
  };
}
