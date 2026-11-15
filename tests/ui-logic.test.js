import test from 'node:test';
import assert from 'node:assert/strict';
import { sortRows, nextDir } from '../assets/js/sort.js';
import { summarizeBits, scanBits } from '../assets/js/bits.js';
import { scanBazaar } from '../assets/js/bazaar.js';
import { allEntries, t } from '../assets/js/i18n.js';
import { DEFAULT_CONFIG as C } from '../assets/js/calculator.js';

test('sortRows handles asc/desc, strings and puts null/NaN last', () => {
  const r = [{ v: 2 }, { v: null }, { v: 5 }, { v: NaN }, { v: 1 }];
  assert.deepEqual(sortRows(r, (x) => x.v, 'desc').map((x) => x.v).slice(0, 3), [5, 2, 1]);
  assert.deepEqual(sortRows(r, (x) => x.v, 'asc').map((x) => x.v).slice(0, 3), [1, 2, 5]);
  assert.deepEqual(sortRows([{ n: 'b' }, { n: 'a' }], (x) => x.n, 'asc').map((x) => x.n), ['a', 'b']);
});
test('nextDir toggles on same column, defaults by type on new column', () => {
  assert.equal(nextDir(undefined, 'net', true), 'desc');
  assert.equal(nextDir(undefined, 'name', false), 'asc');
  assert.equal(nextDir({ k: 'net', dir: 'desc' }, 'net', true), 'asc');
  assert.equal(nextDir({ k: 'net', dir: 'asc' }, 'net', true), 'desc');
});
const now = 1e9;
const prod = (offer, order) => ({ sell_summary: [{ pricePerUnit: offer }], buy_summary: [{ pricePerUnit: order }], quick_status: { buyMovingWeek: 168000, sellMovingWeek: 168000 } });
const bz = { lastUpdated: now, products: { A: prod(200, 100), LOSS: prod(100, 90) } };
test('bits summary keeps losing and unavailable items, one row per item', () => {
  const rows = summarizeBits(scanBits([{ id: 'A', bits: 10 }, { id: 'LOSS', bits: 1000 }, { id: 'GONE', bits: 5 }], bz, C));
  assert.equal(rows.length, 3);
  const loss = rows.find((r) => r.itemId === 'LOSS');
  assert.ok(loss.bestCpb < 0 && loss.instNet !== undefined && loss.offerNet !== undefined);
  assert.equal(rows.find((r) => r.itemId === 'GONE').unavailable, true);
  assert.equal(rows.find((r) => r.itemId === 'GONE').bestCpb, null);
});
test('bazaar rows carry estimated hourly volume and coins per hour', () => {
  const a = scanBazaar(bz, C, now).find((o) => o.id === 'bz:A:B');
  assert.equal(a.hourVol, 1000); // 168000 weekly / 7 days / 24 hours
  assert.ok(Math.abs(a.coinsPerHour - a.net * a.hourVol) < 1e-9);
});
test('every translation has English and Persian text', () => {
  for (const [k, v] of allEntries()) assert.ok(v[0] && v[1], `missing text for ${k}`);
  assert.equal(t('autoEvery', 30), 'Auto every 30s');
});
