import assert from 'node:assert/strict';
import test from 'node:test';
import { applyOptimisticBetToMarket, dedupeMarketsByEvent, getMarketEventKey } from './marketMath';

const baseSportMarket = {
  id: '0xaaa',
  contractId: '0xaaa',
  title: 'South Korea vs Czechia',
  ticker: 'SPORT',
  description: 'Football match',
  type: 'sport' as const,
  category: 'SPORTS' as const,
  identifier: 'south-korea-vs-czechia',
  deadline: 1781229600,
  resolutionSource: 'Live score API',
  resolutionRule: 'Home / Draw / Away',
  liquidity: 0,
  volume: 0,
  state: 'ACTIVE' as const,
  probYes: 0.4,
  probDraw: 0.2,
  probNo: 0.4,
  percentChange: 0,
};

test('getMarketEventKey normalizes title/category/deadline', () => {
  assert.equal(
    getMarketEventKey({ category: 'SPORTS', title: '  South   Korea vs Czechia ', deadline: '1781229600' }),
    'SPORTS|south korea vs czechia|1781229600',
  );
});

test('dedupeMarketsByEvent keeps highest volume and then earliest row', () => {
  const rows = [
    { ...baseSportMarket, contractId: '0xold', id: '0xold', volume: 5, liquidity: 5, updatedAt: '2026-06-11T14:00:00Z' },
    { ...baseSportMarket, contractId: '0xnew', id: '0xnew', volume: 0, liquidity: 0, updatedAt: '2026-06-11T14:10:00Z' },
    { ...baseSportMarket, contractId: '0xbest', id: '0xbest', volume: 7, liquidity: 7, updatedAt: '2026-06-11T14:20:00Z' },
  ];

  const deduped = dedupeMarketsByEvent(rows);

  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].contractId, '0xbest');
});

test('applyOptimisticBetToMarket updates volume and three-way probabilities instantly', () => {
  const updated = applyOptimisticBetToMarket(baseSportMarket, 'DRAW', 25);

  assert.equal(updated.volume, 25);
  assert.equal(updated.liquidity, 25);
  assert.equal(updated.probYes, 0);
  assert.equal(updated.probDraw, 1);
  assert.equal(updated.probNo, 0);
});

test('applyOptimisticBetToMarket preserves existing pools from displayed probabilities', () => {
  const updated = applyOptimisticBetToMarket({
    ...baseSportMarket,
    volume: 100,
    liquidity: 100,
    probYes: 0.4,
    probDraw: 0.2,
    probNo: 0.4,
  }, 'NO', 100);

  assert.equal(updated.volume, 200);
  assert.equal(updated.probYes, 0.2);
  assert.equal(updated.probDraw, 0.1);
  assert.equal(updated.probNo, 0.7);
});
