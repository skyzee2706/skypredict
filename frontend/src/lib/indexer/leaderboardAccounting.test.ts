import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLeaderboardFromPortfolioRows } from './leaderboardAccounting';

const ONE = 1_000_000_000_000_000_000n;

test('buildLeaderboardFromPortfolioRows uses the same volume and pnl basis as portfolio positions', () => {
  const { allEntries, volumeLeaderboard, pnlLeaderboard, currentUser } = buildLeaderboardFromPortfolioRows({
    portfolioRows: [
      {
        user_address: '0xAAA0000000000000000000000000000000000000',
        market_address: '0x1110000000000000000000000000000000000000',
        side_a_amount: (100n * ONE).toString(),
        draw_amount: '0',
        side_b_amount: '0',
        volume: (100n * ONE).toString(),
        payout: (100n * ONE).toString(),
        pnl: '0',
      },
      {
        user_address: '0xAAA0000000000000000000000000000000000000',
        market_address: '0x2220000000000000000000000000000000000000',
        side_a_amount: '0',
        draw_amount: '0',
        side_b_amount: (50n * ONE).toString(),
        volume: (50n * ONE).toString(),
        payout: '0',
        pnl: (-50n * ONE).toString(),
      },
      {
        user_address: '0xBBB0000000000000000000000000000000000000',
        market_address: '0x3330000000000000000000000000000000000000',
        side_a_amount: '1.0019e+21',
        draw_amount: '0',
        side_b_amount: '0',
        volume: '1.0019e+21',
        payout: '1.0019e+21',
        pnl: '0',
      },
    ],
    activityRows: [
      { user_address: '0xAAA0000000000000000000000000000000000000', type: 'BET', outcome: 0 },
      { user_address: '0xAAA0000000000000000000000000000000000000', type: 'BET', outcome: 2 },
      { user_address: '0xBBB0000000000000000000000000000000000000', type: 'BET', outcome: 0 },
    ],
    currentUserAddress: '0xaaa0000000000000000000000000000000000000',
    limit: 20,
  });

  const firstUser = allEntries.find((entry) => entry.address === '0xaaa0000000000000000000000000000000000000');
  assert.ok(firstUser);
  assert.equal(firstUser.volume, (150n * ONE).toString());
  assert.equal(firstUser.pnl, (-50n * ONE).toString());
  assert.equal(firstUser.payout, (100n * ONE).toString());
  assert.equal(firstUser.totalBets, 2);
  assert.equal(firstUser.sideABets, 1);
  assert.equal(firstUser.sideBBets, 1);

  const secondUser = allEntries.find((entry) => entry.address === '0xbbb0000000000000000000000000000000000000');
  assert.ok(secondUser);
  assert.equal(secondUser.volume, '1001900000000000000000');
  assert.equal(secondUser.pnl, '0');

  assert.equal(volumeLeaderboard[0].address, '0xbbb0000000000000000000000000000000000000');
  assert.equal(pnlLeaderboard[0].address, '0xbbb0000000000000000000000000000000000000');
  assert.equal(currentUser?.address, '0xaaa0000000000000000000000000000000000000');
});

test('buildLeaderboardFromPortfolioRows falls back to side amounts when row volume is zero', () => {
  const { allEntries } = buildLeaderboardFromPortfolioRows({
    portfolioRows: [{
      user_address: '0xAAA0000000000000000000000000000000000000',
      market_address: '0x1110000000000000000000000000000000000000',
      side_a_amount: '1e+18',
      draw_amount: '2e+18',
      side_b_amount: '0',
      volume: '0',
      payout: '3e+18',
      pnl: '0',
    }],
  });

  assert.equal(allEntries[0].volume, (3n * ONE).toString());
  assert.equal(allEntries[0].payout, (3n * ONE).toString());
  assert.equal(allEntries[0].pnl, '0');
});

