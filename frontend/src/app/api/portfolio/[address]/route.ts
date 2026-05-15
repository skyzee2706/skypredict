import { NextResponse } from 'next/server';
import { readIndexerCache } from '../../../../lib/indexer/cache';
import { readSupabasePortfolio } from '../../../../lib/indexer/supabaseStore';

export const dynamic = 'force-dynamic';

type Params = {
    params: Promise<{ address: string }>;
};

export async function GET(_request: Request, context: Params) {
    const { address } = await context.params;
    const normalized = address.toLowerCase();

    try {
        const supabasePortfolio = await readSupabasePortfolio(normalized);
        if (supabasePortfolio) {
            return NextResponse.json(supabasePortfolio);
        }
    } catch (error) {
        console.error('Supabase portfolio read failed, falling back to local cache:', error);
    }

    const cache = await readIndexerCache();
    const marketAddresses = cache.userPortfolios[normalized] ?? [];
    const activity = cache.userActivity[normalized] ?? [];

    return NextResponse.json({
        updatedAt: cache.updatedAt,
        lastProcessedBlock: cache.lastProcessedBlock,
        marketAddresses,
        activity,
        cached: true,
        source: 'file',
    });
}
