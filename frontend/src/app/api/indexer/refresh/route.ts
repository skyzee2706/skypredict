import { NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { seismicTestnet } from '../../../../lib/onchain/seismicChain';
import { refreshIndexerCache } from '../../../../lib/indexer/build';

export const dynamic = 'force-dynamic';

function getClient() {
    return createPublicClient({
        chain: seismicTestnet,
        transport: http(),
    });
}

export async function POST() {
    try {
        const cache = await refreshIndexerCache(getClient());
        return NextResponse.json({ ok: true, ...cache });
    } catch (error) {
        console.error('Manual indexer refresh failed:', error);
        return NextResponse.json({ ok: false, error: 'Manual indexer refresh failed' }, { status: 500 });
    }
}

export async function GET() {
    return POST();
}
