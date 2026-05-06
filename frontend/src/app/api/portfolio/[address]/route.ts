import { NextResponse } from 'next/server';
import { readIndexerCache } from '../../../../lib/indexer/cache';

export const dynamic = 'force-dynamic';

type Params = {
    params: Promise<{ address: string }>;
};

export async function GET(_request: Request, context: Params) {
    const { address } = await context.params;
    const normalized = address.toLowerCase();
    const cache = await readIndexerCache();
    const marketAddresses = cache.userPortfolios[normalized] ?? [];
    const activity = cache.userActivity[normalized] ?? [];

    return NextResponse.json({
        updatedAt: cache.updatedAt,
        lastProcessedBlock: cache.lastProcessedBlock,
        marketAddresses,
        activity,
        cached: true,
    });
}
