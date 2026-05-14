import { NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { seismicTestnet } from '../../../lib/onchain/seismicChain';
import { readIndexerCache } from '../../../lib/indexer/cache';
import { refreshIndexerCache } from '../../../lib/indexer/build';

export const revalidate = 60;
export const dynamic = 'force-dynamic';

const INDEXER_TTL_MS = 60 * 1000;
const STALE_TTL_MS = 30 * 60 * 1000;
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

export async function GET() {
    const cache = await readIndexerCache();
    const age = Date.now() - cache.updatedAt;
    const hasUsableCache = cache.updatedAt > 0 && age < STALE_TTL_MS;

    if (cache.updatedAt > 0 && age < INDEXER_TTL_MS) {
        return NextResponse.json({ ...cache, cached: true });
    }

    if (hasUsableCache) {
        void refreshOnce().catch((error) => console.error('Background indexer refresh failed:', error));
        return NextResponse.json({ ...cache, cached: true, refreshing: true });
    }

    try {
        const fresh = await refreshOnce();
        return NextResponse.json({ ...fresh, cached: false });
    } catch (error: unknown) {
        console.error('Indexer Error:', error);
        return NextResponse.json({ ...cache, cached: true, stale: true, error: 'Failed to refresh indexer data' });
    }
}
