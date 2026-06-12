import test from 'node:test';
import assert from 'node:assert/strict';
import { getLiveMarketState, getResolvableMarkets, filterOpenMarketRows } from './resolutionFilters';
import type { MarketData } from '../../data/markets';

function market(overrides: Partial<MarketData>): MarketData {
  return {
    id: overrides.id ?? '0x1',
    contractId: overrides.contractId ?? '0x1',
    title: overrides.title ?? 'Test Market',
    ticker: overrides.ticker ?? 'TEST',
    description: overrides.description ?? 'Test',
    type: overrides.type ?? 'crypto',
    category: overrides.category ?? 'CRYPTO',
    identifier: overrides.identifier ?? 'test',
    deadline: overrides.deadline ?? 100,
    bettingEndTime: overrides.bettingEndTime,
    resolutionSource: overrides.resolutionSource ?? 'Test',
    resolutionRule: overrides.resolutionRule ?? 'Test',
    liquidity: overrides.liquidity ?? 0,
    volume: overrides.volume ?? 0,
    state: overrides.state ?? 'ACTIVE',
    resolvedOutcome: overrides.resolvedOutcome,
    probYes: overrides.probYes ?? 0.5,
    probDraw: overrides.probDraw,
    probNo: overrides.probNo ?? 0.5,
    percentChange: overrides.percentChange ?? 0,
  };
}

test('getLiveMarketState never moves finalized markets back to resolving', () => {
  assert.equal(getLiveMarketState(market({ state: 'RESOLVED', bettingEndTime: 100 }), 200), 'RESOLVED');
  assert.equal(getLiveMarketState(market({ state: 'UNDETERMINED', bettingEndTime: 100 }), 200), 'UNDETERMINED');
  assert.equal(getLiveMarketState(market({ state: 'ACTIVE', bettingEndTime: 100 }), 200), 'RESOLVING');
});

test('getResolvableMarkets only returns expired unresolved markets', () => {
  const rows = [
    market({ id: 'future', contractId: 'future', state: 'ACTIVE', bettingEndTime: 300 }),
    market({ id: 'expired', contractId: 'expired', state: 'ACTIVE', bettingEndTime: 100 }),
    market({ id: 'resolving', contractId: 'resolving', state: 'RESOLVING', bettingEndTime: 100 }),
    market({ id: 'resolved', contractId: 'resolved', state: 'RESOLVED', bettingEndTime: 100 }),
  ];

  assert.deepEqual(getResolvableMarkets(rows, 200).map((item) => item.id), ['expired', 'resolving']);
});

test('filterOpenMarketRows removes stale active rows once activity marks the market finalized', () => {
  const rows = [
    { market_address: '0xAAA0000000000000000000000000000000000000', state: 'RESOLVING' },
    { market_address: '0xBBB0000000000000000000000000000000000000', state: 'ACTIVE' },
    { market_address: '0xCCC0000000000000000000000000000000000000', state: 'RESOLVED' },
  ];

  const filtered = filterOpenMarketRows(rows, new Set(['0xaaa0000000000000000000000000000000000000']));

  assert.deepEqual(filtered.map((row) => row.market_address), ['0xBBB0000000000000000000000000000000000000']);
});
