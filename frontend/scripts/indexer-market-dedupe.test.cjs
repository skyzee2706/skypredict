const test = require('node:test');
const assert = require('node:assert/strict');
const { dedupeActiveMarketRows } = require('./indexer-market-dedupe.cjs');

function row(overrides) {
  return {
    market_address: overrides.market_address,
    title: overrides.title || 'Mexico vs South Africa',
    category: overrides.category || 'SPORTS',
    deadline: overrides.deadline || 1781204400,
    volume: overrides.volume || 0,
    state: overrides.state || 'RESOLVING',
    _factory_index: overrides._factory_index,
  };
}

test('dedupeActiveMarketRows removes an entire duplicate event when the canonical factory market is resolved', () => {
  const result = dedupeActiveMarketRows([
    row({ market_address: '0xe3c705be2426aa5f63899af5d30d9f4a2801cd6f', state: 'RESOLVED', _factory_index: 606 }),
    row({ market_address: '0x25d03c6f02661b2da484314bd8b4b03a88541946', state: 'RESOLVING', _factory_index: 626 }),
    row({ market_address: '0x1f6583afa17184b616759be3782b1a8f7cccd169', state: 'RESOLVING', _factory_index: 638 }),
  ]);

  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.removableMarkets.sort(), [
    '0x1f6583afa17184b616759be3782b1a8f7cccd169',
    '0x25d03c6f02661b2da484314bd8b4b03a88541946',
    '0xe3c705be2426aa5f63899af5d30d9f4a2801cd6f',
  ].sort());
});

test('dedupeActiveMarketRows keeps the earliest factory market when canonical is still open', () => {
  const result = dedupeActiveMarketRows([
    row({ market_address: '0xolder000000000000000000000000000000000000', state: 'RESOLVING', volume: 0, _factory_index: 10 }),
    row({ market_address: '0xnewer000000000000000000000000000000000000', state: 'RESOLVING', volume: 100, _factory_index: 11 }),
  ]);

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].market_address, '0xolder000000000000000000000000000000000000');
  assert.deepEqual(result.removableMarkets, ['0xnewer000000000000000000000000000000000000']);
});
