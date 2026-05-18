import { NextResponse } from 'next/server';
import { NO_STORE_HEADERS } from '../../../lib/api/noStore';
import { getSupabaseAdmin, isSupabaseConfigured } from '../../../lib/supabase/server';
import { rowToMarketData } from '../../../lib/indexer/marketRows';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ markets: [], source: 'unconfigured' }, { headers: NO_STORE_HEADERS });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('active_markets')
      .select('*')
      .order('deadline', { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      markets: (data || []).map(rowToMarketData),
      source: 'supabase',
      updatedAt: new Date().toISOString(),
    }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error('Failed to read indexed markets:', error);
    return NextResponse.json({ markets: [], source: 'error' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
