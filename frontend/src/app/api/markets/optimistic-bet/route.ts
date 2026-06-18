import { NextResponse } from 'next/server';
import { createPublicClient, decodeEventLog, http, parseAbiItem, parseUnits } from 'viem';
import { NO_STORE_HEADERS } from '../../../../lib/api/noStore';
import { ROUTER_ADDRESS } from '../../../../lib/constants';
import { seismicTestnet } from '../../../../lib/onchain/seismicChain';
import { getSupabaseAdmin, isSupabaseConfigured } from '../../../../lib/supabase/server';
import { toBigIntString } from '../../../../lib/numbers/bigintString';

export const dynamic = 'force-dynamic';

const BetRoutedEvent = parseAbiItem('event BetRouted(address indexed user, address indexed market, uint8 outcome, uint256 amount)');

type OptimisticBetPayload = {
  txHash?: string;
  marketAddress?: string;
  userAddress?: string;
  outcome?: 'YES' | 'DRAW' | 'NO';
  amount?: number;
  amountInUnits?: string;
};

function normalizeAddress(value: string) {
  return value.toLowerCase();
}

function outcomeId(outcome: OptimisticBetPayload['outcome']) {
  if (outcome === 'DRAW') return 1;
  if (outcome === 'NO') return 2;
  return 0;
}

function amountToUnits(amount: number, amountInUnits?: string) {
  if (amountInUnits && /^\d+$/.test(amountInUnits)) return BigInt(amountInUnits);
  return parseUnits(String(amount), 18);
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function recomputeMarket(row: Record<string, unknown>, outcome: OptimisticBetPayload['outcome'], amount: number) {
  const currentVolume = Math.max(0, numberValue(row.volume));
  let sideA = currentVolume > 0 ? numberValue(row.prob_yes, 0.5) * currentVolume : 0;
  let draw = currentVolume > 0 ? numberValue(row.prob_draw, 0) * currentVolume : 0;
  let sideB = currentVolume > 0 ? numberValue(row.prob_no, 0.5) * currentVolume : 0;

  if (outcome === 'YES') sideA += amount;
  else if (outcome === 'DRAW') draw += amount;
  else sideB += amount;

  const volume = sideA + draw + sideB;
  return {
    liquidity: volume,
    volume,
    prob_yes: volume > 0 ? sideA / volume : numberValue(row.prob_yes, 0.5),
    prob_draw: volume > 0 ? draw / volume : numberValue(row.prob_draw, 0),
    prob_no: volume > 0 ? sideB / volume : numberValue(row.prob_no, 0.5),
    updated_at: new Date().toISOString(),
  };
}

function addUnits(value: unknown, amount: bigint) {
  return (BigInt(toBigIntString(value)) + amount).toString();
}

async function verifyBetRouted(payload: Required<OptimisticBetPayload>, amountInUnits: bigint) {
  const client = createPublicClient({
    chain: seismicTestnet,
    transport: http(process.env.NEXT_PUBLIC_RITUAL_RPC_URL || 'https://rpc.ritualfoundation.org'),
  });
  const receipt = await client.getTransactionReceipt({ hash: payload.txHash as `0x${string}` });
  if (receipt.status !== 'success') throw new Error('Transaction receipt is not successful');

  const expectedUser = normalizeAddress(payload.userAddress);
  const expectedMarket = normalizeAddress(payload.marketAddress);
  const expectedOutcome = outcomeId(payload.outcome);
  const router = normalizeAddress(ROUTER_ADDRESS);

  for (const log of receipt.logs) {
    if (normalizeAddress(log.address) !== router) continue;
    try {
      const decoded = decodeEventLog({ abi: [BetRoutedEvent], data: log.data, topics: log.topics });
      if (decoded.eventName !== 'BetRouted') continue;
      const args = decoded.args as { user?: string; market?: string; outcome?: number; amount?: bigint };
      if (
        args.user && normalizeAddress(args.user) === expectedUser &&
        args.market && normalizeAddress(args.market) === expectedMarket &&
        Number(args.outcome) === expectedOutcome &&
        args.amount === amountInUnits
      ) {
        return { blockNumber: receipt.blockNumber, logIndex: log.logIndex };
      }
    } catch {
      continue;
    }
  }

  throw new Error('Verified receipt does not contain matching BetRouted event');
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: 'Supabase is not configured' }, { status: 503, headers: NO_STORE_HEADERS });
  }

  try {
    const payload = (await request.json()) as OptimisticBetPayload;
    if (!payload.txHash || !payload.marketAddress || !payload.userAddress || !payload.outcome || !Number.isFinite(Number(payload.amount)) || Number(payload.amount) <= 0) {
      return NextResponse.json({ ok: false, error: 'Invalid optimistic bet payload' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const normalizedPayload = {
      txHash: payload.txHash,
      marketAddress: normalizeAddress(payload.marketAddress),
      userAddress: normalizeAddress(payload.userAddress),
      outcome: payload.outcome,
      amount: Number(payload.amount),
      amountInUnits: payload.amountInUnits,
    } as Required<OptimisticBetPayload>;
    const amountInUnits = amountToUnits(normalizedPayload.amount, normalizedPayload.amountInUnits);
    const verified = await verifyBetRouted(normalizedPayload, amountInUnits);
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    const { data: existingActivity, error: existingActivityError } = await supabase
      .from('user_activities')
      .select('tx_hash')
      .eq('tx_hash', normalizedPayload.txHash)
      .eq('log_index', Number(verified.logIndex))
      .maybeSingle();
    if (existingActivityError) throw existingActivityError;
    if (existingActivity) return NextResponse.json({ ok: true, skipped: 'already-persisted' }, { headers: NO_STORE_HEADERS });


    const { data: marketRow, error: marketError } = await supabase
      .from('active_markets')
      .select('*')
      .eq('market_address', normalizedPayload.marketAddress)
      .maybeSingle();
    if (marketError) throw marketError;
    if (marketRow) {
      const { error } = await supabase
        .from('active_markets')
        .update(recomputeMarket(marketRow, normalizedPayload.outcome, normalizedPayload.amount))
        .eq('market_address', normalizedPayload.marketAddress);
      if (error) throw error;
    }

    const { data: existingPosition, error: positionError } = await supabase
      .from('user_portfolios')
      .select('user_address, market_address, side_a_amount::text, draw_amount::text, side_b_amount::text, volume::text, payout::text, pnl::text, claimed')
      .eq('user_address', normalizedPayload.userAddress)
      .eq('market_address', normalizedPayload.marketAddress)
      .maybeSingle();
    if (positionError) throw positionError;

    const sideA = normalizedPayload.outcome === 'YES' ? addUnits(existingPosition?.side_a_amount, amountInUnits) : toBigIntString(existingPosition?.side_a_amount);
    const draw = normalizedPayload.outcome === 'DRAW' ? addUnits(existingPosition?.draw_amount, amountInUnits) : toBigIntString(existingPosition?.draw_amount);
    const sideB = normalizedPayload.outcome === 'NO' ? addUnits(existingPosition?.side_b_amount, amountInUnits) : toBigIntString(existingPosition?.side_b_amount);
    const volume = (BigInt(sideA) + BigInt(draw) + BigInt(sideB)).toString();

    const { error: upsertPositionError } = await supabase.from('user_portfolios').upsert({
      user_address: normalizedPayload.userAddress,
      market_address: normalizedPayload.marketAddress,
      side_a_amount: sideA,
      draw_amount: draw,
      side_b_amount: sideB,
      volume,
      payout: volume,
      pnl: '0',
      claimed: Boolean(existingPosition?.claimed),
      updated_at: now,
    }, { onConflict: 'user_address,market_address' });
    if (upsertPositionError) throw upsertPositionError;

    const { error: activityError } = await supabase.from('user_activities').upsert({
      tx_hash: normalizedPayload.txHash,
      log_index: Number(verified.logIndex),
      user_address: normalizedPayload.userAddress,
      market_address: normalizedPayload.marketAddress,
      type: 'BET',
      outcome: outcomeId(normalizedPayload.outcome),
      amount: amountInUnits.toString(),
      block_number: verified.blockNumber.toString(),
      timestamp: Date.now(),
      status: 'RUNNING',
      resolved_outcome: null,
      payout: '0',
      claimed: false,
      updated_at: now,
    }, { onConflict: 'tx_hash,log_index' });
    if (activityError) throw activityError;

    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error('Optimistic bet persistence failed:', error);
    return NextResponse.json({ ok: false, error: 'Optimistic bet persistence failed' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
