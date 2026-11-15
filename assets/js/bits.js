import { calcResult, bazaarSellFee, ahFee, liquidityScore, riskLevel } from './calculator.js';
import { parseProduct, prettyName } from './bazaar.js';
import { lookupPrice } from './auction.js';

// Bits Shop list. verified:true = same Bits cost found in several sources; false = derived from an old community price table, verify in game.
const D = (id, name, bits, source, verified, extra = {}) => ({ id, name, bits, source, ahName: source === 'ah' ? name : '', enabled: true, verified, note: verified ? '' : 'Cost derived from an old community price table; verify in game.', ...extra });
export const DEFAULT_BITS_ITEMS = [
  D('KISMET_FEATHER', 'Kismet Feather', 1350, 'bazaar', true),
  D('GOD_POTION', 'God Potion', 1500, 'ah', true),
  D('BITS_TALISMAN', 'Bits Talisman', 15000, 'ah', true),
  D('HYPER_CATALYST_UPGRADE', 'Hyper Catalyst Upgrade', 300, 'ah', true),
  D('KAT_FLOWER', 'Kat Flower', 500, 'ah', true),
  D('ULTIMATE_CARROT_CANDY_UPGRADE', 'Ultimate Carrot Candy Upgrade', 8000, 'ah', true),
  D('MINION_STORAGE_XPENDER', 'Minion Storage X-pender', 1500, 'ah', true),
  D('BUILDERS_WAND', "Builder's Wand", 12000, 'ah', false),
  D('BLOCK_ZAPPER', 'Block Zapper', 5000, 'ah', false),
  D('ENCHANTMENT_EXPERTISE_1', 'Expertise I Book', 4000, 'bazaar', false),
  D('ENCHANTMENT_COMPACT_1', 'Compact I Book', 4000, 'bazaar', false),
  D('ENCHANTMENT_CULTIVATING_1', 'Cultivating I Book', 4000, 'bazaar', false),
  D('ENCHANTMENT_CHAMPION_1', 'Champion I Book', 4000, 'bazaar', false),
  D('ENCHANTMENT_HECATOMB_1', 'Hecatomb I Book', 6000, 'bazaar', false)
];

// ahIndex: Map from priceIndex() or null when the Auction scan is off. Missing data is reported, never zero-filled.
export function scanBits(items, apiData, cfg, ahIndex = null) {
  const out = [], seen = new Set(), updated = apiData?.lastUpdated;
  for (const it of items) {
    const id = String(it.id || '').trim().toUpperCase();
    if (!id || it.enabled === false || seen.has(id) || !(it.bits > 0)) continue; seen.add(id);
    const name = it.name || prettyName(id), base = { itemId: id, name, category: 'Bits', bitsCost: it.bits, verified: it.verified === true, itemNote: it.note || '' };
    const rows = [];
    if (it.source === 'ah') {
      if (!ahIndex) { out.push({ ...base, id: `bits:${id}`, unavailable: true, reason: 'needsAuction' }); continue; }
      const q = lookupPrice(ahIndex, it.ahName || name);
      if (!q) { out.push({ ...base, id: `bits:${id}`, unavailable: true, reason: 'noListings' }); continue; }
      rows.push({ label: 'BIN Relist', price: q.ref, fees: ahFee(q.ref, cfg), conf: q.count >= 5 ? 'medium' : 'low', liq: liquidityScore(q.count), vol: q.count, src: 'Auctions API' });
    } else {
      const p = parseProduct(id, apiData?.products?.[id]);
      if (!p) { out.push({ ...base, id: `bits:${id}`, unavailable: true, reason: 'noBazaar' }); continue; }
      const dailyVol = Math.min(p.buyVolWeek || 0, p.sellVolWeek || 0) / 7, liq = liquidityScore(dailyVol);
      for (const [label, price, conf] of [['Instant Sell', p.order, 'high'], ['Sell Offer', p.offer - 0.1, 'medium']])
        rows.push({ label, price, fees: bazaarSellFee(price, cfg), conf, liq, vol: dailyVol, src: 'Bazaar API' });
    }
    for (const r of rows) {
      // "acquisition" is the Bits cost, so ROI / profitPerCoin mean coins earned per Bit spent.
      const c = calcResult({ acquisition: it.bits, revenue: r.price, fees: r.fees });
      if (!c) continue;
      out.push({ ...base, id: `bits:${id}:${r.label}`, acqMethod: `${it.bits} Bits`, sellMethod: r.label, unitCost: it.bits, ...c, capital: 0,
        profitPerBit: c.net / it.bits, liquidity: r.liq, dailyVolume: r.vol, confidence: r.conf, risk: riskLevel(r.liq, r.conf), updated, source: r.src,
        note: 'ROI is coins earned per Bit spent.' });
    }
  }
  return out;
}

// One row per item with the sell methods side by side. Unavailable items stay visible with a reason.
export function summarizeBits(opps) {
  const map = new Map(), key = { 'Instant Sell': 'inst', 'Sell Offer': 'offer', 'BIN Relist': 'bin' };
  for (const o of opps) {
    const r = map.get(o.itemId) || { itemId: o.itemId, name: o.name, bits: o.bitsCost, verified: o.verified, itemNote: o.itemNote, unavailable: false };
    if (o.unavailable) { r.unavailable = true; r.reason = o.reason; map.set(o.itemId, r); continue; }
    r.liquidity = o.liquidity; r.updated = o.updated; r.dailyVolume = o.dailyVolume;
    const k = key[o.sellMethod]; r[k + 'Price'] = o.revenue; r[k + 'Net'] = o.net; r[k + 'Cpb'] = o.profitPerBit;
    map.set(o.itemId, r);
  }
  return [...map.values()].map((r) => ({ ...r, bestCpb: r.unavailable ? null : Math.max(r.instCpb ?? -Infinity, r.offerCpb ?? -Infinity, r.binCpb ?? -Infinity) }));
}
