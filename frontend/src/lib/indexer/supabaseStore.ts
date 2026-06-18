import { CachedActivity, IndexerCache } from './cache';
import { buildLeaderboardFromPortfolioRows, ActivityAccountingRow } from './leaderboardAccounting';
import { toBigIntString } from '../numbers/bigintString';
import { getSupabaseAdmin, isSupabaseConfigured } from '../supabase/server';

const INDEXER_STATE_ID = 'main';
const DEFAULT_ACTIVITY_LIMIT = 50;
const DEFAULT_LEADERBOARD_LIMIT = 20;
const SUPABASE_PAGE_SIZE = 1000;

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
  status?: 'RUNNING' | 'WIN' | 'LOSE' | 'CLAIMED' | null;
  resolved_outcome?: number | null;
  payout?: string | number | null;
  claimed?: boolean | null;
};

function normalizeAddress(address: string) {
  return address.toLowerCase() as `0x${string}`;
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
    status: row.status ?? undefined,
    resolvedOutcome: row.resolved_outcome ?? undefined,
    payout: row.payout === undefined || row.payout === null ? undefined : String(row.payout),
    claimed: row.claimed ?? undefined,
  };
}

async function readAllPortfolioRows(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const rows: PortfolioRow[] = [];

  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('user_portfolios')
      .select('user_address, market_address, side_a_amount::text, draw_amount::text, side_b_amount::text, volume::text, payout::text, pnl::text')
      .range(from, from + SUPABASE_PAGE_SIZE - 1);

    if (error) throw error;
    const page = (data ?? []) as PortfolioRow[];
    rows.push(...page);
    if (page.length < SUPABASE_PAGE_SIZE) break;
  }

  return rows;
}

async function readAllLeaderboardActivityRows(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const rows: ActivityAccountingRow[] = [];

  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('user_activities')
      .select('user_address, type, outcome')
      .range(from, from + SUPABASE_PAGE_SIZE - 1);

    if (error) throw error;
    const page = (data ?? []) as ActivityAccountingRow[];
    rows.push(...page);
    if (page.length < SUPABASE_PAGE_SIZE) break;
  }

  return rows;
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
      .select('user_address, market_address, side_a_amount::text, draw_amount::text, side_b_amount::text, volume::text, payout::text, pnl::text, claimed, updated_at')
      .eq('user_address', user)
      .order('updated_at', { ascending: false }),
    supabase
      .from('user_activities')
      .select('tx_hash, log_index, user_address, market_address, type, outcome, amount::text, block_number::text, timestamp, status, resolved_outcome, payout::text, claimed')
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
      sideA: toBigIntString(row.side_a_amount),
      draw: toBigIntString(row.draw_amount),
      sideB: toBigIntString(row.side_b_amount),
      volume: toBigIntString(row.volume),
      payout: toBigIntString(row.payout),
      pnl: toBigIntString(row.pnl),
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
  const [portfolioRows, activityRows, stateResult] = await Promise.all([
    readAllPortfolioRows(supabase),
    readAllLeaderboardActivityRows(supabase),
    supabase
      .from('indexer_state')
      .select('last_processed_block, updated_at')
      .eq('id', INDEXER_STATE_ID)
      .maybeSingle(),
  ]);

  if (stateResult.error) throw stateResult.error;

  const { volumeLeaderboard, pnlLeaderboard, currentUser } = buildLeaderboardFromPortfolioRows({
    portfolioRows,
    activityRows,
    currentUserAddress: normalized,
    limit,
  });

  return {
    version: 1,
    updatedAt: stateResult.data?.updated_at ? Date.parse(stateResult.data.updated_at) : 0,
    lastProcessedBlock: stateResult.data?.last_processed_block ? String(stateResult.data.last_processed_block) : '0',
    leaderboard: volumeLeaderboard,
    volumeLeaderboard,
    pnlLeaderboard,
    currentUser,
    cached: true,
    source: 'supabase' as const,
  };
}
