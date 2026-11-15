import { calcResult, bazaarSellFee, liquidityScore, riskLevel } from './calculator.js';
import { parseProduct } from './bazaar.js';

// Seed list: Bits prices change with game updates. VERIFY and edit in Settings.
export const DEFAULT_BITS_ITEMS = [
  { id: 'BOOSTER_COOKIE', bits: 4800 },
  { id: 'KISMET_FEATHER', bits: 1350 },
  { id: 'HYPER_CATALYST', bits: 300 }
];

export function scanBits(items, apiData, cfg) {
  const out = [], seen = new Set();
  const updated = apiData?.lastUpdated;
  for (const it of items) {
    const id = String(it.id || '').trim().toUpperCase();
    if (!id || seen.has(id) || !(it.bits > 0)) continue; seen.add(id);
    const p = parseProduct(id, apiData?.products?.[id]);
    if (!p) { out.push({ id: `bits:${id}`, itemId: id, name: id, category: 'Bits', unavailable: true, note: 'No valid Bazaar data for this ID.' }); continue; }
    const dailyVol = Math.min(p.buyVolWeek || 0, p.sellVolWeek || 0) / 7;
    const liquidity = liquidityScore(dailyVol);
    for (const [label, price, conf] of [['Instant Sell', p.order, 'high'], ['Sell Offer', p.offer - 0.1, 'medium']]) {
      const fees = bazaarSellFee(price, cfg);
      // "acquisition" here is the Bits cost, so ROI/profitPerCoin mean coins earned per Bit spent.
      const r = calcResult({ acquisition: it.bits, revenue: price, fees });
      if (!r) continue;
      out.push({ id: `bits:${id}:${label}`, itemId: id, name: p.name, category: 'Bits', acqMethod: `${it.bits} Bits`, sellMethod: label,
        unitCost: it.bits, ...r, capital: 0, bitsCost: it.bits, profitPerBit: r.net / it.bits, liquidity, dailyVolume: dailyVol,
        confidence: conf, risk: riskLevel(liquidity, conf), updated, source: 'Bits list + Bazaar API',
        note: 'ROI is coins earned per Bit spent. Bits cost is user-configured.' });
    }
  }
  return out;
}

// One row per item with both sell methods side by side. Unavailable items are kept (never silently dropped).
export function summarizeBits(opps) {
  const map = new Map();
  for (const o of opps) {
    const r = map.get(o.itemId) || { itemId: o.itemId, name: o.name, unavailable: false };
    if (o.unavailable) { r.unavailable = true; map.set(o.itemId, r); continue; }
    r.bits = o.bitsCost; r.liquidity = o.liquidity; r.updated = o.updated; r.dailyVolume = o.dailyVolume;
    if (o.sellMethod === 'Instant Sell') { r.instPrice = o.revenue; r.instNet = o.net; r.instCpb = o.profitPerBit; }
    else { r.offerPrice = o.revenue; r.offerNet = o.net; r.offerCpb = o.profitPerBit; }
    map.set(o.itemId, r);
  }
  return [...map.values()].map((r) => ({ ...r, bestCpb: r.unavailable ? null : Math.max(r.instCpb ?? -Infinity, r.offerCpb ?? -Infinity) }));
}
