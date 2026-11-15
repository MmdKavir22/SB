import { calcResult, bazaarSellFee, isValidPrice, liquidityScore, riskLevel, isStale } from './calculator.js';

export const prettyName = (id) => id.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// Hypixel naming: sell_summary = Sell Offers (instant-buy price = [0]), buy_summary = Buy Orders (instant-sell price = [0]).
export function parseProduct(id, p) {
  const offer = p?.sell_summary?.[0]?.pricePerUnit, order = p?.buy_summary?.[0]?.pricePerUnit;
  const qs = p?.quick_status || {};
  if (!isValidPrice(offer) || !isValidPrice(order)) return null;
  return { id, name: prettyName(id), offer, order, buyVolWeek: qs.buyMovingWeek, sellVolWeek: qs.sellMovingWeek };
}

export function scanBazaar(apiData, cfg, nowMs = Date.now()) {
  const out = [], seen = new Set();
  const updated = apiData?.lastUpdated;
  const stale = isStale(updated, nowMs, cfg.maxAgeSec);
  for (const [id, raw] of Object.entries(apiData?.products || {})) {
    if (seen.has(id)) continue; seen.add(id);
    const p = parseProduct(id, raw);
    if (!p) continue;
    const dailyVol = Math.min(p.buyVolWeek || 0, p.sellVolWeek || 0) / 7;
    if (dailyVol * 7 < cfg.minVolume) continue;
    const liquidity = liquidityScore(dailyVol);
    const strategies = [
      { key: 'A', acq: 'Instant Buy', sell: 'Buy Order (instant sell)', cost: p.offer, rev: p.order, confidence: 'high' },
      // Order strategy uses 0.1 undercut/overcut; execution time and price drift are NOT guaranteed.
      { key: 'B', acq: 'Buy Order', sell: 'Sell Offer', cost: p.order + 0.1, rev: p.offer - 0.1, confidence: 'medium' }
    ];
    for (const s of strategies) {
      if (!(s.rev > 0)) continue;
      const r = calcResult({ acquisition: s.cost, revenue: s.rev, fees: bazaarSellFee(s.rev, cfg) });
      if (!r) continue;
      out.push({
        id: `bz:${id}:${s.key}`, itemId: id, name: p.name, category: 'Bazaar', acqMethod: s.acq, sellMethod: s.sell,
        unitCost: s.cost, ...r, capital: r.acquisition, liquidity, dailyVolume: dailyVol,
        confidence: s.confidence, risk: riskLevel(liquidity, s.confidence), updated, stale, source: 'Hypixel Bazaar API',
        note: s.key === 'B' ? 'Order fills are not guaranteed; spread may move.' : 'Confirmed instant prices.'
      });
    }
  }
  return out;
}
