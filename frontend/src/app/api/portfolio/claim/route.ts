import { NextResponse } from 'next/server';
import { Abi, createPublicClient, decodeEventLog, http, parseAbiItem } from 'viem';
import PredictionMarketArtifact from '../../../../lib/contracts/PredictionMarket.json';
import { NO_STORE_HEADERS } from '../../../../lib/api/noStore';
import { seismicTestnet } from '../../../../lib/onchain/seismicChain';
import { getSupabaseAdmin, isSupabaseConfigured } from '../../../../lib/supabase/server';
import { toBigIntString } from '../../../../lib/numbers/bigintString';

export const dynamic = 'force-dynamic';

const MARKET_ABI = PredictionMarketArtifact.abi as unknown as Abi;
const ClaimedEvent = parseAbiItem('event Claimed(address indexed user, uint256 payout)');

type ClaimPayload = {
  txHash?: string;
  marketAddress?: string;
  userAddress?: string;
};

function normalizeAddress(value: string) {
  return value.toLowerCase();
}

function isAddressLike(value: unknown) {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isHashLike(value: unknown) {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{64}$/.test(value);
}

function getClient() {
  return createPublicClient({
    chain: seismicTestnet,
    transport: http(process.env.NEXT_PUBLIC_RITUAL_RPC_URL || 'https://rpc.ritualfoundation.org'),
  });
}

type NormalizedClaimPayload = {
  txHash?: string;
  marketAddress: string;
  userAddress: string;
};

async function verifyClaimEvent(payload: NormalizedClaimPayload & { txHash: string }) {
  const client = getClient();
  const receipt = await client.getTransactionReceipt({ hash: payload.txHash as `0x${string}` });
  if (receipt.status !== 'success') throw new Error('Claim transaction receipt is not successful');

  const expectedUser = normalizeAddress(payload.userAddress);
  const expectedMarket = normalizeAddress(payload.marketAddress);

  for (const log of receipt.logs) {
    if (normalizeAddress(log.address) !== expectedMarket) continue;
    try {
      const decoded = decodeEventLog({ abi: [ClaimedEvent], data: log.data, topics: log.topics });
      if (decoded.eventName !== 'Claimed') continue;
      const args = decoded.args as { user?: string; payout?: bigint };
      if (args.user && normalizeAddress(args.user) === expectedUser && args.payout !== undefined) {
        return { payout: args.payout };
      }
    } catch {
      continue;
    }
  }

  throw new Error('Verified receipt does not contain matching Claimed event');
}

async function verifyAlreadyClaimedPosition(payload: NormalizedClaimPayload) {
  const client = getClient();
  const position = await client.readContract({
    address: payload.marketAddress as `0x${string}`,
    abi: MARKET_ABI,
    functionName: 'getUserPosition',
    args: [payload.userAddress],
  });

  const raw = position as [bigint, bigint, bigint, boolean];
  if (!raw[3]) throw new Error('Position is not claimed on-chain');
  return { payout: null };
}

async function readWinningOutcome(marketAddress: string) {
  const client = getClient();
  const raw = await client.readContract({
    address: marketAddress as `0x${string}`,
    abi: MARKET_ABI,
    functionName: 'winningOutcome',
  }).catch(() => null);

  return raw === null || raw === undefined ? null : Number(raw);
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: 'Supabase is not configured' }, { status: 503, headers: NO_STORE_HEADERS });
  }

  try {
    const payload = (await request.json()) as ClaimPayload;
    if (!isAddressLike(payload.marketAddress) || !isAddressLike(payload.userAddress)) {
      return NextResponse.json({ ok: false, error: 'Invalid claim payload' }, { status: 400, headers: NO_STORE_HEADERS });
    }
    if (payload.txHash !== undefined && !isHashLike(payload.txHash)) {
      return NextResponse.json({ ok: false, error: 'Invalid claim payload' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const marketAddress = payload.marketAddress as string;
    const userAddress = payload.userAddress as string;
    const normalizedPayload: NormalizedClaimPayload = {
      txHash: payload.txHash,
      marketAddress: normalizeAddress(marketAddress),
      userAddress: normalizeAddress(userAddress),
    };
    const verified = normalizedPayload.txHash
      ? await verifyClaimEvent({ ...normalizedPayload, txHash: normalizedPayload.txHash })
      : await verifyAlreadyClaimedPosition(normalizedPayload);
    const winningOutcome = await readWinningOutcome(normalizedPayload.marketAddress);
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    const { data: position, error: positionError } = await supabase
      .from('user_portfolios')
      .select('volume')
      .eq('user_address', normalizedPayload.userAddress)
      .eq('market_address', normalizedPayload.marketAddress)
      .maybeSingle();
    if (positionError) throw positionError;

    const volume = BigInt(toBigIntString(position?.volume));
    const payout = verified.payout;
    const portfolioUpdate = payout === null
      ? { claimed: true, updated_at: now }
      : {
          claimed: true,
          payout: payout.toString(),
          pnl: (payout - volume).toString(),
          updated_at: now,
        };
    const { error: portfolioError } = await supabase
      .from('user_portfolios')
      .update(portfolioUpdate)
      .eq('user_address', normalizedPayload.userAddress)
      .eq('market_address', normalizedPayload.marketAddress);
    if (portfolioError) throw portfolioError;

    const claimedActivityUpdate = {
      status: 'CLAIMED',
      claimed: true,
      ...(payout === null ? {} : { payout: payout.toString() }),
      updated_at: now,
    };

    const { error: winStatusError } = await supabase
      .from('user_activities')
      .update(claimedActivityUpdate)
      .eq('user_address', normalizedPayload.userAddress)
      .eq('market_address', normalizedPayload.marketAddress)
      .in('status', ['WIN', 'CLAIMED']);
    if (winStatusError) throw winStatusError;

    if (winningOutcome !== null && Number.isFinite(winningOutcome)) {
      const { error: winningOutcomeError } = await supabase
        .from('user_activities')
        .update({
          ...claimedActivityUpdate,
          resolved_outcome: winningOutcome,
        })
        .eq('user_address', normalizedPayload.userAddress)
        .eq('market_address', normalizedPayload.marketAddress)
        .eq('outcome', winningOutcome);
      if (winningOutcomeError) throw winningOutcomeError;
    }

    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error('Claim persistence failed:', error);
    return NextResponse.json({ ok: false, error: 'Claim persistence failed' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
