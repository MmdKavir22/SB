import { calcResult, bazaarSellFee, isValidPrice, liquidityScore, riskLevel, isStale } from './calculator.js';

export const prettyName = (id) => id.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// Hypixel naming: sell_summary = Sell Offers (instant-buy price = [0]), buy_summary = Buy Orders (instant-sell price = [0]).
export function parseProduct(id, p) {
  const offer = p?.sell_summary?.[0]?.pricePerUnit, order = p?.buy_summary?.[0]?.pricePerUnit;
  const qs = p?.quick_status || {};
  if (!isValidPrice(offer) || !isValidPrice(order)) return null;
  return { id, name: prettyName(id), offer, order, buyVolWeek: qs.buyMovingWeek, sellVolWeek: qs.sellMovingWeek };
}

// All four buy/sell combinations. Order prices use a 0.1 coin undercut; fills are NOT guaranteed.
const BUY = { instant: { label: 'Instant Buy', price: (p) => p.offer }, order: { label: 'Buy Order', price: (p) => p.order + 0.1 } };
const SELL = { instant: { label: 'Instant Sell', price: (p) => p.order }, offer: { label: 'Sell Offer', price: (p) => p.offer - 0.1 } };

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
    const hourVol = dailyVol / 24; // estimate from weekly moving volume, not a measured 1h figure
    for (const [bk, b] of Object.entries(BUY)) for (const [sk, s] of Object.entries(SELL)) {
      const cost = b.price(p), rev = s.price(p);
      if (!(rev > 0) || !(cost > 0)) continue;
      const r = calcResult({ acquisition: cost, revenue: rev, fees: bazaarSellFee(rev, cfg) });
      if (!r) continue;
      const confidence = bk === 'instant' && sk === 'instant' ? 'high' : 'medium';
      out.push({
        id: `bz:${id}:${bk}-${sk}`, itemId: id, name: p.name, category: 'Bazaar', buyMode: bk, sellMode: sk,
        acqMethod: b.label, sellMethod: s.label, unitCost: cost, ...r, capital: r.acquisition,
        instBuy: p.offer, instSell: p.order, orderBuy: p.order + 0.1, sellOffer: p.offer - 0.1,
        liquidity, dailyVolume: dailyVol, hourVol, coinsPerHour: r.net * hourVol,
        confidence, risk: riskLevel(liquidity, confidence), updated, stale, source: 'Hypixel Bazaar API',
        note: confidence === 'high' ? 'Both prices are instant prices (confirmed).' : 'Order fills are not guaranteed; the spread may move.'
      });
    }
  }
  return out;
}
