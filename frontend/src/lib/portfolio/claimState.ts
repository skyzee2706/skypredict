import { toBigIntString } from '../numbers/bigintString';

type PortfolioPositionLike = {
  market: string;
  claimed?: boolean;
  volume?: string | number | bigint | null;
  payout?: string | number | bigint | null;
  pnl?: string | number | bigint | null;
};

type PortfolioActivityLike = {
  market: string;
  status?: string;
  claimed?: boolean;
  payout?: string | number | bigint | null;
};

type PortfolioLike = {
  positions?: PortfolioPositionLike[];
  activity: PortfolioActivityLike[];
};

type ClaimablePositionLike = {
  market?: string | { contractId?: string | null };
  canClaim?: boolean;
  claimed?: boolean;
};

function normalizeAddress(address: string) {
  return address.toLowerCase();
}

function shouldMarkActivityClaimed(activity: PortfolioActivityLike) {
  const status = String(activity.status || '').toUpperCase();
  return status === 'WIN' || status === 'CLAIMED';
}

function applyClaimPayout<T extends PortfolioPositionLike>(position: T, payout?: string | number | bigint | null): T {
  if (payout === undefined || payout === null) return { ...position, claimed: true };

  const payoutValue = toBigIntString(payout);
  const volume = BigInt(toBigIntString(position.volume));
  const pnl = (BigInt(payoutValue) - volume).toString();
  return {
    ...position,
    claimed: true,
    payout: payoutValue,
    pnl,
  };
}

export function isAlreadyClaimedOnChainError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  const normalized = message.toLowerCase().replace(/[\s-]/g, '');
  return normalized.includes('alreadyclaimed') && normalized.includes('onchain');
}

function getMarketAddress(position: ClaimablePositionLike) {
  if (typeof position.market === 'string') return position.market.toLowerCase();
  return String(position.market?.contractId || '').toLowerCase();
}

export function getClaimableUnclaimedMarketAddresses(positions: ClaimablePositionLike[]) {
  const addresses = new Set<string>();

  for (const position of positions) {
    if (!position.canClaim || position.claimed) continue;
    const address = getMarketAddress(position);
    if (address) addresses.add(address);
  }

  return [...addresses];
}

export function markPortfolioMarketClaimed<T extends PortfolioLike>(portfolio: T, marketAddress: string, payout?: string | number | bigint | null): T {
  const target = normalizeAddress(marketAddress);
  const payoutValue = payout === undefined || payout === null ? undefined : toBigIntString(payout);

  return {
    ...portfolio,
    positions: portfolio.positions?.map((position) => (
      normalizeAddress(position.market) === target
        ? applyClaimPayout(position, payoutValue)
        : position
    )),
    activity: portfolio.activity.map((activity) => (
      normalizeAddress(activity.market) === target && shouldMarkActivityClaimed(activity)
        ? {
            ...activity,
            status: 'CLAIMED',
            claimed: true,
            ...(payoutValue === undefined ? {} : { payout: payoutValue }),
          }
        : activity
    )),
  };
}
