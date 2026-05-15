import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { seismicTestnet } from '../../../lib/onchain/seismicChain';
import { readIndexerCache } from '../../../lib/indexer/cache';
import { refreshIndexerCache } from '../../../lib/indexer/build';
import { readSupabaseLeaderboard } from '../../../lib/indexer/supabaseStore';

export const revalidate = 60;
export const dynamic = 'force-dynamic';

const INDEXER_TTL_MS = 60 * 1000;
const STALE_TTL_MS = 30 * 60 * 1000;
const LEADERBOARD_LIMIT = 20;
let inFlight: Promise<Awaited<ReturnType<typeof refreshIndexerCache>>> | null = null;

function getClient() {
    return createPublicClient({
        chain: seismicTestnet,
        transport: http(process.env.NEXT_PUBLIC_RITUAL_RPC_URL || 'https://rpc.ritualfoundation.org'),
    });
}

async function refreshOnce() {
    if (!inFlight) {
        inFlight = refreshIndexerCache(getClient()).finally(() => {
            inFlight = null;
        });
    }
    return inFlight;
}

export async function GET(request: NextRequest) {
    const address = request.nextUrl.searchParams.get('address') ?? undefined;
    const forceFallback = request.nextUrl.searchParams.get('fallback') === 'chain';

    if (!forceFallback) {
        try {
            const supabaseData = await readSupabaseLeaderboard(address, LEADERBOARD_LIMIT);
            if (supabaseData && (supabaseData.leaderboard.length > 0 || supabaseData.currentUser)) {
                return NextResponse.json(supabaseData);
            }
        } catch (error) {
            console.error('Supabase leaderboard read failed, falling back to local cache:', error);
        }
    }

    const cache = await readIndexerCache();
    const age = Date.now() - cache.updatedAt;
    const hasUsableCache = cache.updatedAt > 0 && age < STALE_TTL_MS;
    const topLeaderboard = cache.leaderboard
        .slice()
        .sort((a, b) => a.volumeRank - b.volumeRank)
        .slice(0, LEADERBOARD_LIMIT);
    const normalized = address?.toLowerCase();
    const currentUser = normalized
        ? cache.leaderboard.find((entry) => entry.address.toLowerCase() === normalized) ?? null
        : null;
    const responseCache = {
        ...cache,
        leaderboard: topLeaderboard,
        currentUser,
        source: 'file',
    };

    if (cache.updatedAt > 0 && age < INDEXER_TTL_MS) {
        return NextResponse.json({ ...responseCache, cached: true });
    }

    if (hasUsableCache) {
        void refreshOnce().catch((error) => console.error('Background indexer refresh failed:', error));
        return NextResponse.json({ ...responseCache, cached: true, refreshing: true });
    }

    try {
        const fresh = await refreshOnce();
        const freshTop = fresh.leaderboard
            .slice()
            .sort((a, b) => a.volumeRank - b.volumeRank)
            .slice(0, LEADERBOARD_LIMIT);
        const freshCurrentUser = normalized
            ? fresh.leaderboard.find((entry) => entry.address.toLowerCase() === normalized) ?? null
            : null;

        return NextResponse.json({
            ...fresh,
            leaderboard: freshTop,
            currentUser: freshCurrentUser,
            cached: false,
            source: 'file',
        });
    } catch (error: unknown) {
        console.error('Indexer Error:', error);
        return NextResponse.json({
            ...responseCache,
            cached: true,
            stale: true,
            error: 'Failed to refresh indexer data',
        });
    }
}
