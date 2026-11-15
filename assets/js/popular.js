import { parseProduct } from './bazaar.js';

// Most traded Bazaar items by weekly instant-buy + instant-sell volume (from Hypixel's quick_status moving week).
export function popularItems(apiData) {
  const out = [], updated = apiData?.lastUpdated;
  for (const [id, raw] of Object.entries(apiData?.products || {})) {
    const p = parseProduct(id, raw);
    if (!p) continue;
    const weeklyBuys = Number.isFinite(p.buyVolWeek) ? p.buyVolWeek : 0, weeklySells = Number.isFinite(p.sellVolWeek) ? p.sellVolWeek : 0;
    const total = weeklyBuys + weeklySells;
    if (total <= 0) continue;
    out.push({ itemId: id, name: p.name, instBuy: p.offer, instSell: p.order, weeklyBuys, weeklySells, total,
      turnover: total * (p.offer + p.order) / 2, hourVol: total / 168, spreadPct: (p.offer - p.order) / p.offer * 100, updated });
  }
  return out;
}
