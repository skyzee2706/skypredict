import { NextResponse } from 'next/server';
import { NO_STORE_HEADERS } from '../../../lib/api/noStore';
import { getSupabaseAdmin, isSupabaseConfigured } from '../../../lib/supabase/server';
import { rowToMarketData } from '../../../lib/indexer/marketRows';
import { dedupeMarketsByEvent } from '../../../lib/markets/marketMath';
import { filterOpenMarketRows } from '../../../lib/markets/resolutionFilters';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ markets: [], source: 'unconfigured' }, { headers: NO_STORE_HEADERS });
  }

  try {
    const supabase = getSupabaseAdmin();
    const [marketResult, finalizedActivityResult] = await Promise.all([
      supabase
        .from('active_markets')
        .select('*')
        .order('deadline', { ascending: true }),
      supabase
        .from('user_activities')
        .select('market_address')
        .in('status', ['WIN', 'LOSE', 'CLAIMED']),
    ]);

    if (marketResult.error) throw marketResult.error;
    if (finalizedActivityResult.error) throw finalizedActivityResult.error;

    const finalizedMarketAddresses = new Set(
      (finalizedActivityResult.data || [])
        .map((row) => String(row.market_address || '').toLowerCase())
        .filter(Boolean)
    );
    const preferredRows = dedupeMarketsByEvent(marketResult.data || []);
    const openRows = filterOpenMarketRows(preferredRows, finalizedMarketAddresses);
    const dedupedRows = dedupeMarketsByEvent(openRows);

    return NextResponse.json({
      markets: dedupedRows.map(rowToMarketData),
      source: 'supabase',
      updatedAt: new Date().toISOString(),
    }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error('Failed to read indexed markets:', error);
    return NextResponse.json({ markets: [], source: 'error' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
