import { ImageResponse } from 'next/og';
import { rowToMarketData } from '../../../../../lib/indexer/marketRows';
import { dedupeMarketsByEvent } from '../../../../../lib/markets/marketMath';
import { getSupabaseAdmin, isSupabaseConfigured } from '../../../../../lib/supabase/server';

export const runtime = 'edge';

const imageSize = { width: 1200, height: 630 };

type Params = {
  params: Promise<{ id: string }>;
};

async function getMarket(id: string) {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseAdmin();
  const target = id.toLowerCase();
  const { data, error } = await supabase
    .from('active_markets')
    .select('*')
    .or(`market_address.eq.${target},identifier.eq.${target}`)
    .limit(10);
  if (error || !data?.length) return null;
  return rowToMarketData(dedupeMarketsByEvent(data)[0]);
}

export async function GET(_request: Request, context: Params) {
  const { id } = await context.params;
  const market = await getMarket(id);
  const title = market?.title ?? 'Sky Predict Market';
  const sideA = market?.sideAName ?? 'YES';
  const draw = market?.drawName ?? 'DRAW';
  const sideB = market?.sideBName ?? 'NO';
  const probA = Math.round((market?.probYes ?? 0.5) * 100);
  const probD = Math.round((market?.probDraw ?? 0) * 100);
  const probB = Math.round((market?.probNo ?? 0.5) * 100);

  return new ImageResponse(
    (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 64,
        color: '#f4f7f0',
        background: 'linear-gradient(135deg, #07130d 0%, #0f2f1e 55%, #07130d 100%)',
        fontFamily: 'Arial, Helvetica, sans-serif',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 34, fontWeight: 800 }}>Sky Predict</div>
          <div style={{ fontSize: 22, color: '#a7f3d0' }}>skypredict.app</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div style={{ fontSize: 62, fontWeight: 900, lineHeight: 1.08, maxWidth: 980 }}>{title}</div>
          <div style={{ display: 'flex', gap: 18 }}>
            <div style={{ padding: '18px 24px', border: '2px solid #8be0b0', borderRadius: 18, fontSize: 28, fontWeight: 800 }}>{sideA} {probA}%</div>
            {market?.category === 'SPORTS' || market?.category === 'POLITICS' ? (
              <div style={{ padding: '18px 24px', border: '2px solid #facc15', borderRadius: 18, fontSize: 28, fontWeight: 800 }}>{draw} {probD}%</div>
            ) : null}
            <div style={{ padding: '18px 24px', border: '2px solid #fb9b73', borderRadius: 18, fontSize: 28, fontWeight: 800 }}>{sideB} {probB}%</div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#d1d5db', fontSize: 24 }}>
          <span>{market?.category ?? 'MARKET'}</span>
          <span>{market?.state ?? 'ACTIVE'}</span>
        </div>
      </div>
    ),
    imageSize,
  );
}
