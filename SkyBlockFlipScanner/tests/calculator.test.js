import test from 'node:test';
import assert from 'node:assert/strict';
import { calcResult, bazaarSellFee, ahFee, isStale, simulate, maxQuantity, DEFAULT_CONFIG as C } from '../assets/js/calculator.js';

test('net profit and ROI', () => {
  const r = calcResult({ acquisition: 1000, revenue: 1200, fees: 50, extra: 10 });
  assert.equal(r.gross, 200); assert.equal(r.net, 140); assert.ok(Math.abs(r.roi - 14) < 1e-9);
});
test('invalid inputs return null', () => {
  assert.equal(calcResult({ acquisition: 0, revenue: 10 }), null);
  assert.equal(calcResult({ acquisition: NaN, revenue: 10 }), null);
});
test('bazaar fee uses configured rate', () => {
  assert.equal(bazaarSellFee(1000, C), 12.5);
  assert.equal(bazaarSellFee(1000, { ...C, bazaarTaxPct: 1 }), 10);
});
test('auction fee tiers and claim cap', () => {
  assert.equal(ahFee(1e6, C), 1e6 * 0.01 + 1e6 * 0.01);
  assert.equal(ahFee(50e6, C), 50e6 * 0.02 + 5e5);
  assert.equal(ahFee(500e6, C), 500e6 * 0.025 + 1e6);
});
test('stale detection', () => {
  assert.equal(isStale(1000, 1000 + 301e3, 300), true);
  assert.equal(isStale(1000, 1000 + 10e3, 300), false);
  assert.equal(isStale(undefined, 5, 300), true);
});
test('simulator limits quantity by coins', () => {
  const s = simulate({ coins: 1050, buyPrice: 100, sellPrice: 150, quantity: 50 }, C);
  assert.equal(s.quantity, 10); assert.equal(s.remaining, 50);
  assert.ok(Math.abs(s.net - (1500 - 1000 - 18.75)) < 1e-9);
});
test('simulator rejects bad prices', () => {
  assert.ok(simulate({ coins: 100, buyPrice: -1, sellPrice: 5 }).error);
  assert.ok(simulate({ coins: 10, buyPrice: 100, sellPrice: 150 }).error);
});
test('maxQuantity caps by volume share', () => {
  assert.equal(maxQuantity({ budget: 1e6, unitPrice: 10, dailyVolume: 1000 }), 50);
  assert.equal(maxQuantity({ budget: 100, unitPrice: 10 }), 10);
  assert.equal(maxQuantity({ budget: 100, unitPrice: 0 }), 0);
});
