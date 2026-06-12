type PortfolioPositionLike = {
  market: string;
  claimed?: boolean;
};

type PortfolioActivityLike = {
  market: string;
  status?: string;
  claimed?: boolean;
};

type PortfolioLike = {
  positions?: PortfolioPositionLike[];
  activity: PortfolioActivityLike[];
};

function normalizeAddress(address: string) {
  return address.toLowerCase();
}

function shouldMarkActivityClaimed(activity: PortfolioActivityLike) {
  const status = String(activity.status || '').toUpperCase();
  return status === 'WIN' || status === 'CLAIMED';
}

export function markPortfolioMarketClaimed<T extends PortfolioLike>(portfolio: T, marketAddress: string): T {
  const target = normalizeAddress(marketAddress);

  return {
    ...portfolio,
    positions: portfolio.positions?.map((position) => (
      normalizeAddress(position.market) === target
        ? { ...position, claimed: true }
        : position
    )),
    activity: portfolio.activity.map((activity) => (
      normalizeAddress(activity.market) === target && shouldMarkActivityClaimed(activity)
        ? { ...activity, status: 'CLAIMED', claimed: true }
        : activity
    )),
  };
}
