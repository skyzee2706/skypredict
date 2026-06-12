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

export function isAlreadyClaimedOnChainError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  const normalized = message.toLowerCase().replace(/[\s-]/g, '');
  return normalized.includes('alreadyclaimed') && normalized.includes('onchain');
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
