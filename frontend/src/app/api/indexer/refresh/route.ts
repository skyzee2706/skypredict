import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { seismicTestnet } from '../../../../lib/onchain/seismicChain';
import { refreshIndexerCache } from '../../../../lib/indexer/build';

export const dynamic = 'force-dynamic';

function getClient() {
    return createPublicClient({
        chain: seismicTestnet,
        transport: http(process.env.NEXT_PUBLIC_RITUAL_RPC_URL || 'https://rpc.ritualfoundation.org'),
    });
}

function isAuthorized(request: NextRequest) {
    const secret = process.env.INDEXER_SECRET;
    if (!secret) return true;
    return request.headers.get('x-indexer-secret') === secret;
}

export async function POST(request: NextRequest) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ ok: false, error: 'Unauthorized indexer refresh' }, { status: 401 });
    }

    try {
        const cache = await refreshIndexerCache(getClient());
        return NextResponse.json({ ok: true, ...cache });
    } catch (error) {
        console.error('Manual indexer refresh failed:', error);
        return NextResponse.json({ ok: false, error: 'Manual indexer refresh failed' }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    return POST(request);
}
