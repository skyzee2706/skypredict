import { CachedActivity, CachedLeaderboardEntry, IndexerCache } from './cache';
import { getSupabaseAdmin, isSupabaseConfigured } from '../supabase/server';

const INDEXER_STATE_ID = 'main';
const DEFAULT_ACTIVITY_LIMIT = 50;
const DEFAULT_LEADERBOARD_LIMIT = 20;

type PortfolioRow = {
  user_address: string;
  market_address: string;
  side_a_amount?: string | number | null;
  draw_amount?: string | number | null;
  side_b_amount?: string | number | null;
  volume?: string | number | null;
  payout?: string | number | null;
  pnl?: string | number | null;
  claimed?: boolean | null;
  updated_at?: string;
};

type ActivityRow = {
  tx_hash: string;
  log_index: number;
  user_address: string;
  market_address: string;
  type: 'BET' | 'CLAIM';
  outcome: number | null;
  amount: string | number;
  block_number: string | number;
  timestamp: number;
};

type LeaderboardRow = {
  user_address: string;
  volume: string | number;
  payout: string | number;
  pnl: string | number;
  side_a_bets: number;
  draw_bets: number;
  side_b_bets: number;
  total_bets: number;
  volume_rank: number;
  pnl_rank: number;
};

function normalizeAddress(address: string) {
  return address.toLowerCase() as `0x${string}`;
}

function toLeaderboardEntry(row: LeaderboardRow): CachedLeaderboardEntry {
  return {
    address: normalizeAddress(row.user_address),
    volume: String(row.volume),
    payout: String(row.payout),
    pnl: String(row.pnl),
    sideABets: row.side_a_bets,
    drawBets: row.draw_bets,
    sideBBets: row.side_b_bets,
    totalBets: row.total_bets,
    volumeRank: row.volume_rank,
    pnlRank: row.pnl_rank,
  };
}

function toActivity(row: ActivityRow): CachedActivity {
  return {
    txHash: row.tx_hash,
    logIndex: row.log_index,
    user: normalizeAddress(row.user_address),
    market: normalizeAddress(row.market_address),
    type: row.type,
    outcome: row.outcome ?? undefined,
    amount: String(row.amount),
    blockNumber: String(row.block_number),
    timestamp: row.timestamp,
  };
}

export async function getSupabaseLastProcessedBlock() {
  if (!isSupabaseConfigured()) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('indexer_state')
    .select('last_processed_block')
    .eq('id', INDEXER_STATE_ID)
    .maybeSingle();

  if (error) throw error;
  return data?.last_processed_block ? BigInt(String(data.last_processed_block)) : 0n;
}

export async function saveIndexerCacheToSupabase(cache: IndexerCache) {
  if (!isSupabaseConfigured()) return false;

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const portfolioRows: PortfolioRow[] = [];
  const activityRows: ActivityRow[] = [];

  for (const [user, markets] of Object.entries(cache.userPortfolios)) {
    for (const market of markets) {
      portfolioRows.push({
        user_address: user.toLowerCase(),
        market_address: market.toLowerCase(),
        updated_at: now,
      });
    }
  }

  for (const activities of Object.values(cache.userActivity)) {
    for (const activity of activities) {
      activityRows.push({
        tx_hash: activity.txHash,
        log_index: activity.logIndex,
        user_address: activity.user.toLowerCase(),
        market_address: activity.market.toLowerCase(),
        type: activity.type,
        outcome: activity.outcome ?? null,
        amount: activity.amount,
        block_number: activity.blockNumber,
        timestamp: activity.timestamp,
      });
    }
  }

  const leaderboardRows = cache.leaderboard.map((entry) => ({
    user_address: entry.address.toLowerCase(),
    volume: entry.volume,
    payout: entry.payout,
    pnl: entry.pnl,
    side_a_bets: entry.sideABets,
    draw_bets: entry.drawBets,
    side_b_bets: entry.sideBBets,
    total_bets: entry.totalBets,
    volume_rank: entry.volumeRank,
    pnl_rank: entry.pnlRank,
    updated_at: now,
  }));

  if (portfolioRows.length) {
    const { error } = await supabase
      .from('user_portfolios')
      .upsert(portfolioRows, { onConflict: 'user_address,market_address' });
    if (error) throw error;
  }

  if (activityRows.length) {
    const { error } = await supabase
      .from('user_activities')
      .upsert(activityRows, { onConflict: 'tx_hash,log_index' });
    if (error) throw error;
  }

  if (leaderboardRows.length) {
    const { error } = await supabase
      .from('leaderboard')
      .upsert(leaderboardRows, { onConflict: 'user_address' });
    if (error) throw error;
  }

  const { error: stateError } = await supabase
    .from('indexer_state')
    .upsert({
      id: INDEXER_STATE_ID,
      last_processed_block: cache.lastProcessedBlock,
      updated_at: now,
    }, { onConflict: 'id' });

  if (stateError) throw stateError;
  return true;
}

export async function readSupabasePortfolio(address: string, limit = DEFAULT_ACTIVITY_LIMIT) {
  if (!isSupabaseConfigured()) return null;

  const supabase = getSupabaseAdmin();
  const user = address.toLowerCase();
  const [portfolioResult, activityResult, stateResult] = await Promise.all([
    supabase
      .from('user_portfolios')
      .select('*')
      .eq('user_address', user)
      .order('updated_at', { ascending: false }),
    supabase
      .from('user_activities')
      .select('*')
      .eq('user_address', user)
      .order('block_number', { ascending: false })
      .limit(limit),
    supabase
      .from('indexer_state')
      .select('last_processed_block, updated_at')
      .eq('id', INDEXER_STATE_ID)
      .maybeSingle(),
  ]);

  if (portfolioResult.error) throw portfolioResult.error;
  if (activityResult.error) throw activityResult.error;
  if (stateResult.error) throw stateResult.error;

  const portfolioRows = (portfolioResult.data ?? []) as PortfolioRow[];

  return {
    updatedAt: stateResult.data?.updated_at ? Date.parse(stateResult.data.updated_at) : 0,
    lastProcessedBlock: stateResult.data?.last_processed_block ? String(stateResult.data.last_processed_block) : '0',
    marketAddresses: portfolioRows.map((row) => normalizeAddress(row.market_address)),
    positions: portfolioRows.map((row) => ({
      market: normalizeAddress(row.market_address),
      sideA: String(row.side_a_amount ?? '0'),
      draw: String(row.draw_amount ?? '0'),
      sideB: String(row.side_b_amount ?? '0'),
      volume: String(row.volume ?? '0'),
      payout: String(row.payout ?? '0'),
      pnl: String(row.pnl ?? '0'),
      claimed: Boolean(row.claimed),
      updatedAt: row.updated_at ?? null,
    })),
    activity: ((activityResult.data ?? []) as ActivityRow[]).map(toActivity),
    cached: true,
    source: 'supabase' as const,
  };
}

export async function readSupabaseLeaderboard(address?: string, limit = DEFAULT_LEADERBOARD_LIMIT) {
  if (!isSupabaseConfigured()) return null;

  const supabase = getSupabaseAdmin();
  const normalized = address?.toLowerCase();
  const [leaderboardResult, currentUserResult, stateResult] = await Promise.all([
    supabase
      .from('leaderboard')
      .select('*')
      .order('volume_rank', { ascending: true })
      .limit(limit),
    normalized
      ? supabase
        .from('leaderboard')
        .select('*')
        .eq('user_address', normalized)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from('indexer_state')
      .select('last_processed_block, updated_at')
      .eq('id', INDEXER_STATE_ID)
      .maybeSingle(),
  ]);

  if (leaderboardResult.error) throw leaderboardResult.error;
  if (currentUserResult.error) throw currentUserResult.error;
  if (stateResult.error) throw stateResult.error;

  const leaderboard = ((leaderboardResult.data ?? []) as LeaderboardRow[]).map(toLeaderboardEntry);
  const currentUser = currentUserResult.data
    ? toLeaderboardEntry(currentUserResult.data as LeaderboardRow)
    : null;

  return {
    version: 1,
    updatedAt: stateResult.data?.updated_at ? Date.parse(stateResult.data.updated_at) : 0,
    lastProcessedBlock: stateResult.data?.last_processed_block ? String(stateResult.data.last_processed_block) : '0',
    leaderboard,
    currentUser,
    cached: true,
    source: 'supabase' as const,
  };
}
