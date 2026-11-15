import test from 'node:test';
import assert from 'node:assert/strict';
import { scanBazaar } from '../assets/js/bazaar.js';
import { scanBits } from '../assets/js/bits.js';
import { scanAuctions, normalize } from '../assets/js/auction.js';
import { fetchJson } from '../assets/js/api.js';
import { DEFAULT_CONFIG as C } from '../assets/js/calculator.js';

const now = 1_000_000_000;
const prod = (offer, order, vol = 70000) => ({ sell_summary: [{ pricePerUnit: offer }], buy_summary: [{ pricePerUnit: order }], quick_status: { buyMovingWeek: vol, sellMovingWeek: vol } });
const bz = { success: true, lastUpdated: now - 1000, products: { GOOD: prod(120, 100), BAD: prod(0, 100), MISSING: { sell_summary: [], buy_summary: [] } } };

test('bazaar skips invalid/missing data and never zero-fills', () => {
  const ids = new Set(scanBazaar(bz, C, now).map((o) => o.itemId));
  assert.deepEqual([...ids], ['GOOD']);
});
test('bazaar strategy B profit with fees', () => {
  const b = scanBazaar(bz, C, now).find((o) => o.id.endsWith(':order-offer'));
  const rev = 119.9, cost = 100.1;
  assert.ok(Math.abs(b.net - (rev - cost - rev * 0.0125)) < 1e-9);
});
test('bazaar flags stale data', () => {
  assert.equal(scanBazaar(bz, C, now + 10 * 60e3)[0].stale, true);
});
test('bits: unknown product is flagged, duplicates ignored', () => {
  const r = scanBits([{ id: 'good', bits: 10, source: 'bazaar' }, { id: 'GOOD', bits: 10, source: 'bazaar' }, { id: 'NOPE', bits: 5, source: 'bazaar' }, { id: 'X', bits: -1 }], bz, C);
  assert.equal(r.filter((o) => o.itemId === 'GOOD').length, 2);
  assert.equal(r.find((o) => o.itemId === 'NOPE').unavailable, true);
  assert.ok(Math.abs(r.find((o) => o.sellMethod === 'Instant Sell').profitPerBit - (100 * 0.9875 - 10) / 10) < 1e-9);
});
const mk = (i, price, over = {}) => ({ uuid: 'u' + i, item_name: 'Spicy Hyperion ✪✪✪', tier: 'LEGENDARY', bin: true, claimed: false, starting_bid: price, end: now + 1e6, ...over });
test('auction groups equivalents, ignores reforge and invalid listings', () => {
  assert.equal(normalize(mk(1, 1)).name, 'Hyperion');
  const list = [mk(1, 50), mk(2, 100), mk(3, 100), mk(4, 110), mk(5, 120), mk(6, 130), mk(7, 100), mk(8, 100), mk(9, 5, { bin: false }), mk(10, 5, { end: now - 1 }), mk(2, 100)];
  const r = scanAuctions(list, C, now);
  assert.equal(r.length, 1); assert.equal(r[0].unitCost, 50); assert.equal(r[0].comparables, 8);
});
test('auction needs enough comparables and flags suspicious prices', () => {
  assert.equal(scanAuctions([mk(1, 50), mk(2, 100), mk(3, 100)], C, now).length, 0);
  const l = [mk(1, 10), ...[1, 2, 3, 4, 5, 6, 7].map((i) => mk(i + 10, 100))];
  assert.equal(scanAuctions(l, C, now)[0].suspicious, true);
});
test('fetchJson retries then fails with clear error', async () => {
  let n = 0;
  const f = async () => { n++; throw new TypeError('Failed to fetch'); };
  await assert.rejects(fetchJson('x', { fetchImpl: f, retries: 1, retryDelayMs: 1 }), /CORS/);
  assert.equal(n, 2);
});
test('fetchJson rejects API failure payload and HTTP errors', async () => {
  await assert.rejects(fetchJson('x', { retries: 0, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ success: false, cause: 'bad' }) }) }), /bad/);
  await assert.rejects(fetchJson('x', { retries: 0, fetchImpl: async () => ({ ok: false, status: 500 }) }), /HTTP 500/);
});
