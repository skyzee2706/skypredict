import type { Metadata } from 'next';
import { rowToMarketData } from '../../../lib/indexer/marketRows';
import { dedupeMarketsByEvent } from '../../../lib/markets/marketMath';
import { SKY_PREDICT_ORIGIN, getMarketShareText } from '../../../lib/markets/share';
import { getSupabaseAdmin, isSupabaseConfigured } from '../../../lib/supabase/server';

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

async function getMarketForMetadata(id: string) {
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

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { id } = await params;
  const market = await getMarketForMetadata(id);
  const url = `${SKY_PREDICT_ORIGIN}/markets/${encodeURIComponent(id)}`;
  const title = market ? `${market.title} | Sky Predict` : 'Sky Predict Market';
  const description = market ? getMarketShareText(market) : 'Predict crypto and football markets on Sky Predict.';
  const image = `${SKY_PREDICT_ORIGIN}/api/markets/${encodeURIComponent(id)}/og`;

  return {
    metadataBase: new URL(SKY_PREDICT_ORIGIN),
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: 'Sky Predict',
      type: 'website',
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}

export default function MarketLayout({ children }: LayoutProps) {
  return children;
}
