import test from 'node:test';
import assert from 'node:assert/strict';
import { toBigIntString } from './bigintString';

test('toBigIntString keeps plain integer strings intact', () => {
  assert.equal(toBigIntString('1001900000000000000000'), '1001900000000000000000');
  assert.equal(toBigIntString('-2500000000000000000'), '-2500000000000000000');
});

test('toBigIntString expands scientific notation from Supabase numeric values', () => {
  assert.equal(toBigIntString('1.0019e+21'), '1001900000000000000000');
  assert.equal(toBigIntString('2.5e+18'), '2500000000000000000');
  assert.equal(toBigIntString('-3.75e+18'), '-3750000000000000000');
});

test('toBigIntString accepts numeric and bigint input', () => {
  assert.equal(toBigIntString(1.0019e+21), '1001900000000000000000');
  assert.equal(toBigIntString(25n), '25');
});

test('toBigIntString trims fractional dust instead of throwing', () => {
  assert.equal(toBigIntString('123.9'), '123');
  assert.equal(toBigIntString('1.239e+2'), '123');
});

test('toBigIntString returns zero for invalid input', () => {
  assert.equal(toBigIntString(null), '0');
  assert.equal(toBigIntString(undefined), '0');
  assert.equal(toBigIntString('not-a-number'), '0');
});
