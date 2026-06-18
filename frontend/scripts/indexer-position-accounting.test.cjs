const test = require('node:test');
const assert = require('node:assert/strict');
const { computePositionAccounting } = require('./indexer-position-accounting.cjs');

const ONE = 1_000_000_000_000_000_000n;

test('computePositionAccounting keeps open markets neutral', () => {
  const result = computePositionAccounting({
    position: [100n * ONE, 0n, 50n * ONE, false],
    resolved: false,
    winner: 0,
    pools: [100n * ONE, 0n, 50n * ONE],
  });

  assert.ok(result);
  assert.equal(result.volume, 150n * ONE);
  assert.equal(result.payout, 150n * ONE);
  assert.equal(result.pnl, 0n);
});

test('computePositionAccounting values losing resolved positions at zero', () => {
  const result = computePositionAccounting({
    position: [100n * ONE, 0n, 50n * ONE, false],
    resolved: true,
    winner: 1,
    pools: [100n * ONE, 200n * ONE, 50n * ONE],
  });

  assert.ok(result);
  assert.equal(result.volume, 150n * ONE);
  assert.equal(result.payout, 0n);
  assert.equal(result.pnl, -150n * ONE);
});

test('computePositionAccounting matches claim payout with 10 percent fee', () => {
  const result = computePositionAccounting({
    position: [50n * ONE, 0n, 0n, true],
    resolved: true,
    winner: 0,
    pools: [100n * ONE, 0n, 300n * ONE],
  });

  assert.ok(result);
  assert.equal(result.volume, 50n * ONE);
  assert.equal(result.payout, 180n * ONE);
  assert.equal(result.pnl, 130n * ONE);
  assert.equal(result.claimed, true);
});

test('computePositionAccounting returns null for stale zero on-chain positions', () => {
  const result = computePositionAccounting({
    position: [0n, 0n, 0n, false],
    resolved: true,
    winner: 0,
    pools: [0n, 0n, 0n],
  });

  assert.equal(result, null);
});
