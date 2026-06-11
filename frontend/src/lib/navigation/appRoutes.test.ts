import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_PAGE_PATHS, getAppPagePath, isInternalAppPath } from './appRoutes';

test('app page paths stay internal for client-side navigation', () => {
  assert.deepEqual(APP_PAGE_PATHS, {
    landing: '/',
    markets: '/markets',
    portfolio: '/portfolio',
    leaderboard: '/leaderboard',
    faucet: '/faucet',
  });

  for (const path of Object.values(APP_PAGE_PATHS)) {
    assert.equal(isInternalAppPath(path), true);
  }
});

test('getAppPagePath resolves known pages without hard reload targets', () => {
  assert.equal(getAppPagePath('landing'), '/');
  assert.equal(getAppPagePath('markets'), '/markets');
  assert.equal(getAppPagePath('portfolio'), '/portfolio');
  assert.equal(getAppPagePath('leaderboard'), '/leaderboard');
  assert.equal(getAppPagePath('faucet'), '/faucet');
});

test('isInternalAppPath rejects external or protocol-relative URLs', () => {
  assert.equal(isInternalAppPath('https://skypredict.app/markets'), false);
  assert.equal(isInternalAppPath('//skypredict.app/markets'), false);
  assert.equal(isInternalAppPath('javascript:alert(1)'), false);
});
