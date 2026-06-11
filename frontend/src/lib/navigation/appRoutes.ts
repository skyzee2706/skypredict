export const APP_PAGE_PATHS = {
  landing: '/',
  markets: '/markets',
  portfolio: '/portfolio',
  leaderboard: '/leaderboard',
  faucet: '/faucet',
} as const;

export type AppPage = keyof typeof APP_PAGE_PATHS;
export type AppPagePath = (typeof APP_PAGE_PATHS)[AppPage];

export function getAppPagePath(page: AppPage): AppPagePath {
  return APP_PAGE_PATHS[page];
}

export function isInternalAppPath(path: string) {
  if (!path.startsWith('/')) return false;
  if (path.startsWith('//')) return false;
  return !path.includes('://');
}
