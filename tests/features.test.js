import test from 'node:test';
import assert from 'node:assert/strict';
import { sortRows, nextDir } from '../assets/js/sort.js';
import { scanBazaar } from '../assets/js/bazaar.js';
import { scanBits, summarizeBits, DEFAULT_BITS_ITEMS } from '../assets/js/bits.js';
import { priceIndex, lookupPrice } from '../assets/js/auction.js';
import { popularItems } from '../assets/js/popular.js';
import { matchesFilters, DEFAULT_FILTERS, itemTypes } from '../assets/js/filters.js';
import { sanitizeShared, repoFromLocation, loadShared, DEFAULT_SHARED } from '../assets/js/config.js';
import { verifyAdmin, publishConfig, toBase64Utf8 } from '../assets/js/admin.js';
import { allEntries, t } from '../assets/js/i18n.js';
import { DEFAULT_CONFIG as C } from '../assets/js/calculator.js';

const now = 1e9;
const prod = (offer, order, w = 168000) => ({ sell_summary: [{ pricePerUnit: offer }], buy_summary: [{ pricePerUnit: order }], quick_status: { buyMovingWeek: w, sellMovingWeek: w } });
const bz = { lastUpdated: now, products: { A: prod(200, 100), LOSS: prod(100, 90), ENCHANTED_COAL: prod(50, 40, 7000) } };

test('sortRows asc/desc, strings, null last; nextDir toggles', () => {
  const r = [{ v: 2 }, { v: null }, { v: 5 }, { v: NaN }, { v: 1 }];
  assert.deepEqual(sortRows(r, (x) => x.v, 'desc').map((x) => x.v).slice(0, 3), [5, 2, 1]);
  assert.deepEqual(sortRows(r, (x) => x.v, 'asc').map((x) => x.v).slice(0, 3), [1, 2, 5]);
  assert.equal(nextDir({ k: 'n', dir: 'desc' }, 'n', true), 'asc');
  assert.equal(nextDir(undefined, 'name', false), 'asc');
});
test('bazaar emits all four buy/sell combinations; instant+instant is high confidence', () => {
  const rows = scanBazaar(bz, C, now).filter((o) => o.itemId === 'A');
  assert.deepEqual(rows.map((o) => `${o.buyMode}-${o.sellMode}`).sort(), ['instant-instant', 'instant-offer', 'order-instant', 'order-offer']);
  const ii = rows.find((o) => o.id.endsWith('instant-instant'));
  assert.equal(ii.confidence, 'high'); assert.equal(ii.unitCost, 200); assert.equal(ii.revenue, 100); assert.ok(ii.net < 0);
  const oo = rows.find((o) => o.id.endsWith('order-offer'));
  assert.ok(Math.abs(oo.net - (199.9 - 100.1 - 199.9 * 0.0125)) < 1e-9);
  assert.equal(oo.instBuy, 200); assert.equal(oo.instSell, 100);
  assert.equal(oo.hourVol, 1000); assert.ok(Math.abs(oo.coinsPerHour - oo.net * 1000) < 1e-9);
});
test('popular items ranked data: totals, turnover, skips invalid', () => {
  const rows = popularItems({ lastUpdated: now, products: { ...bz.products, BAD: { sell_summary: [], buy_summary: [] } } });
  assert.equal(rows.length, 3);
  const a = rows.find((r) => r.itemId === 'A');
  assert.equal(a.total, 336000); assert.equal(a.turnover, 336000 * 150); assert.equal(a.hourVol, 2000);
});
test('filters: search, type chips, price range, risk, hourly volume', () => {
  const o = { name: 'Enchanted Coal', itemId: 'ENCHANTED_COAL', category: 'Bazaar', unitCost: 50, hourVol: 5, risk: 'medium' };
  const F = (x) => ({ ...DEFAULT_FILTERS, chips: [], ...x });
  assert.ok(matchesFilters(o, F({ q: 'coal' })) && !matchesFilters(o, F({ q: 'gold' })));
  assert.ok(matchesFilters(o, F({ chips: ['enchanted'] })) && !matchesFilters(o, F({ chips: ['essence'] })));
  assert.ok(!matchesFilters(o, F({ pmin: 60 })) && !matchesFilters(o, F({ pmax: 40 })));
  assert.ok(!matchesFilters(o, F({ minHour: 10 })) && !matchesFilters(o, F({ risk: 'low' })) && matchesFilters(o, F({ risk: 'medium' })));
  assert.deepEqual(itemTypes('ESSENCE_WITHER'), ['essence']);
  assert.ok(!matchesFilters({ name: 'X', category: 'Auction House', unitCost: 5 }, F({ chips: ['enchanted'] })));
});
const ah = (i, name, price) => ({ uuid: 'u' + i, item_name: name, tier: 'RARE', bin: true, claimed: false, starting_bid: price, end: now + 1e6 });
test('bits: AH items need the Auction scan, never zero-filled', () => {
  const items = [{ id: 'GOD_POTION', name: 'God Potion', bits: 1500, source: 'ah', ahName: 'God Potion', enabled: true }];
  assert.equal(scanBits(items, bz, C, null)[0].reason, 'needsAuction');
  assert.equal(scanBits(items, bz, C, priceIndex([ah(1, 'God Potion', 100)], now))[0].reason, 'noListings');
  const idx = priceIndex([ah(1, 'God Potion', 1e6), ah(2, 'God Potion', 1.2e6), ah(3, 'God Potion', 1.1e6), ah(4, 'God Potion', 9e6)], now);
  assert.equal(lookupPrice(idx, 'god potion').ref, 1.1e6);
  const r = scanBits(items, bz, C, idx);
  assert.equal(r.length, 1); assert.equal(r[0].sellMethod, 'BIN Relist'); assert.ok(r[0].profitPerBit > 600);
  assert.equal(summarizeBits(r)[0].binNet, r[0].net);
});
test('bits: disabled items skipped, unverified flag carried, defaults are unique', () => {
  const r = scanBits([{ id: 'A', bits: 10, source: 'bazaar', enabled: false }, { id: 'LOSS', bits: 1000, source: 'bazaar', verified: false }], bz, C);
  assert.ok(r.every((o) => o.itemId === 'LOSS') && r[0].verified === false);
  const sum = summarizeBits(r)[0]; assert.ok(sum.bestCpb < 0);
  assert.equal(new Set(DEFAULT_BITS_ITEMS.map((i) => i.id)).size, DEFAULT_BITS_ITEMS.length);
});
test('config: sanitize, repo from location, loading order', async () => {
  const s = sanitizeShared({ disabled: ['x', 'x', 5], imageTemplate: 'http://bad', bitsItems: [{ id: 'a', bits: 5 }, { id: 'a', bits: 6 }, { id: 'b', bits: -1 }] });
  assert.deepEqual(s.disabled, ['x']); assert.equal(s.bitsItems.length, 1); assert.ok(s.imageTemplate.startsWith('https://') && s.imageTemplate.includes('{id}'));
  assert.deepEqual(repoFromLocation({ hostname: 'MmdKavir22.github.io', pathname: '/SB/' }), { owner: 'MmdKavir22', repo: 'SB' });
  assert.equal(repoFromLocation({ hostname: 'localhost', pathname: '/' }), null);
  const calls = [];
  const f = async (url) => { calls.push(url); return url.startsWith('https://raw') ? { ok: false } : { ok: true, json: async () => ({ disabled: ['q'] }) }; };
  const r = await loadShared(f, { hostname: 'u.github.io', pathname: '/R/' });
  assert.equal(r.source, 'site'); assert.deepEqual(r.cfg.disabled, ['q']); assert.ok(calls[0].includes('raw.githubusercontent.com/u/R/main/config/items.json'));
  const d = await loadShared(async () => { throw new Error('x'); }, { hostname: 'localhost', pathname: '/' });
  assert.equal(d.source, 'default'); assert.deepEqual(d.cfg.bitsItems.length, DEFAULT_SHARED.bitsItems.length);
});
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
test('admin: verify token and write permission', async () => {
  const mk = (u, r) => async (url) => (url.endsWith('/user') ? u : r);
  assert.equal((await verifyAdmin({ token: 't', owner: 'o', repo: 'r', fetchImpl: mk(res(401), null) })).error, 'badToken');
  assert.equal((await verifyAdmin({ token: 't', owner: 'o', repo: 'r', fetchImpl: mk(res(200, { login: 'me' }), res(404)) })).error, 'noRepo');
  assert.equal((await verifyAdmin({ token: 't', owner: 'o', repo: 'r', fetchImpl: mk(res(200, { login: 'me' }), res(200, { permissions: { push: false } })) })).error, 'noWrite');
  const ok = await verifyAdmin({ token: 't', owner: 'o', repo: 'r', fetchImpl: mk(res(200, { login: 'me' }), res(200, { permissions: { push: true } })) });
  assert.deepEqual(ok, { ok: true, login: 'me' });
  assert.equal((await verifyAdmin({ token: '', owner: 'o', repo: 'r' })).error, 'missing');
});
test('admin: publish sends sha + base64 content, retries once on conflict', async () => {
  const puts = []; let n = 0;
  const f = async (url, opts = {}) => {
    if (opts.method === 'PUT') { puts.push(JSON.parse(opts.body)); return n++ === 0 ? res(409) : res(200, {}); }
    return res(200, { sha: 'sha' + n });
  };
  const r = await publishConfig({ token: 't', owner: 'o', repo: 'r', cfg: { disabled: ['é'] }, fetchImpl: f });
  assert.equal(r.ok, true); assert.equal(puts.length, 2); assert.equal(puts[1].sha, 'sha1'); assert.equal(puts[1].branch, 'main');
  assert.deepEqual(JSON.parse(Buffer.from(puts[1].content, 'base64').toString('utf8')), { disabled: ['é'] });
  assert.equal(toBase64Utf8('é'), Buffer.from('é').toString('base64'));
  const nf = await publishConfig({ token: 't', owner: 'o', repo: 'r', cfg: {}, fetchImpl: async (u, o = {}) => (o.method === 'PUT' ? res(403) : res(404)) });
  assert.equal(nf.error, 'noWrite');
});
test('every translation has English and Persian text', () => {
  for (const [k, v] of allEntries()) assert.ok(v[0] && v[1], `missing text for ${k}`);
  assert.equal(t('autoEvery', 30), 'Auto every 30s');
});
