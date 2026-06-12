import test from 'node:test';
import assert from 'node:assert/strict';
import { isAlreadyClaimedOnChainError, markPortfolioMarketClaimed } from './claimState';

test('markPortfolioMarketClaimed marks the matching position and winning activities as claimed', () => {
  const portfolio = {
    marketAddresses: ['0xAAA0000000000000000000000000000000000000'],
    positions: [
      { market: '0xAAA0000000000000000000000000000000000000', claimed: false, payout: '100', pnl: '0' },
      { market: '0xBBB0000000000000000000000000000000000000', claimed: false, payout: '50', pnl: '0' },
    ],
    activity: [
      { market: '0xAAA0000000000000000000000000000000000000', status: 'WIN', claimed: false },
      { market: '0xAAA0000000000000000000000000000000000000', status: 'LOSE', claimed: false },
      { market: '0xBBB0000000000000000000000000000000000000', status: 'WIN', claimed: false },
    ],
    updatedAt: 1,
  };

  const updated = markPortfolioMarketClaimed(portfolio, '0xaaa0000000000000000000000000000000000000');

  assert.equal(updated.positions[0].claimed, true);
  assert.equal(updated.positions[1].claimed, false);
  assert.equal(updated.activity[0].status, 'CLAIMED');
  assert.equal(updated.activity[0].claimed, true);
  assert.equal(updated.activity[1].status, 'LOSE');
  assert.equal(updated.activity[1].claimed, false);
  assert.equal(updated.activity[2].status, 'WIN');
});

test('markPortfolioMarketClaimed does not mutate the previous portfolio object', () => {
  const portfolio = {
    positions: [{ market: '0xAAA0000000000000000000000000000000000000', claimed: false }],
    activity: [],
  };

  const updated = markPortfolioMarketClaimed(portfolio, '0xaaa0000000000000000000000000000000000000');

  assert.notEqual(updated, portfolio);
  assert.equal(portfolio.positions[0].claimed, false);
  assert.equal(updated.positions[0].claimed, true);
});

test('isAlreadyClaimedOnChainError recognizes on-chain claimed preflight failures', () => {
  assert.equal(isAlreadyClaimedOnChainError(new Error('This reward is already claimed on-chain.')), true);
  assert.equal(isAlreadyClaimedOnChainError(new Error('This reward is already claimed onchain.')), true);
  assert.equal(isAlreadyClaimedOnChainError(new Error('This market is not resolved on-chain yet.')), false);
  assert.equal(isAlreadyClaimedOnChainError('This reward is already claimed on-chain.'), true);
});
