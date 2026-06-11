import type { MarketData } from '../../data/markets';

export const SKY_PREDICT_ORIGIN = 'https://skypredict.app';

export function getMarketShareUrl(market: MarketData) {
  const id = encodeURIComponent(market.contractId || market.id);
  return `${SKY_PREDICT_ORIGIN}/markets/${id}`;
}

export function getMarketShareText(market: MarketData) {
  if (market.category === 'SPORTS') {
    return `Predict ${market.sideAName ?? 'Home'}, ${market.drawName ?? 'Draw'}, or ${market.sideBName ?? 'Away'} on Sky Predict.`;
  }
  return `Predict this market on Sky Predict.`;
}

export async function shareMarket(market: MarketData) {
  const url = getMarketShareUrl(market);
  const payload = {
    title: `${market.title} | Sky Predict`,
    text: getMarketShareText(market),
    url,
  };

  if (typeof navigator !== 'undefined' && navigator.share) {
    await navigator.share(payload);
    return 'native' as const;
  }

  await navigator.clipboard?.writeText(url);
  return 'clipboard' as const;
}
