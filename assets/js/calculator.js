// Pure calculation functions. No DOM or network access, so they run in the browser and in Node tests.
// ASSUMPTIONS (verify against the wiki, they change): see DEFAULT_CONFIG and README "Fee assumptions".
export const DEFAULT_CONFIG = {
  bazaarTaxPct: 1.25,          // Bazaar sell tax; lowered by Community Shop upgrade. Editable in Settings.
  ahTiers: [                   // Auction House listing fee tiers (max price exclusive, fee %)
    { upTo: 10e6, pct: 1 }, { upTo: 100e6, pct: 2 }, { upTo: Infinity, pct: 2.5 }
  ],
  ahClaimPct: 1,               // Fee on claiming sold BIN, capped below
  ahClaimCap: 1e6,
  minProfit: 0, minRoi: 0, minVolume: 0,
  maxAgeSec: 300               // data older than this is flagged stale
};

export const isValidPrice = (p) => typeof p === 'number' && Number.isFinite(p) && p > 0;

export function calcResult({ acquisition, revenue, fees = 0, extra = 0, units = 1 }) {
  if (![acquisition, revenue, fees, extra].every(Number.isFinite) || acquisition <= 0 || units <= 0) return null;
  const gross = revenue - acquisition;
  const net = revenue - acquisition - fees - extra;
  return {
    acquisition, revenue, fees, extra, gross, net,
    roi: (net / acquisition) * 100,
    profitPerUnit: net / units,
    profitPerCoin: net / acquisition
  };
}

export function bazaarSellFee(revenue, cfg = DEFAULT_CONFIG) { return revenue * cfg.bazaarTaxPct / 100; }

export function ahFee(price, cfg = DEFAULT_CONFIG) {
  const tier = cfg.ahTiers.find((t) => price < t.upTo);
  const listing = price * tier.pct / 100;
  const claim = Math.min(price * cfg.ahClaimPct / 100, cfg.ahClaimCap);
  return listing + claim;
}

export function isStale(updatedMs, nowMs, maxAgeSec) {
  return !Number.isFinite(updatedMs) || (nowMs - updatedMs) / 1000 > maxAgeSec;
}

// 0..100 liquidity from daily volume of the thinner side.
export function liquidityScore(dailyVolume) {
  if (!Number.isFinite(dailyVolume) || dailyVolume <= 0) return 0;
  return Math.min(100, Math.round(Math.log10(dailyVolume + 1) / 5 * 100));
}

export function riskLevel(liquidity, confidence) {
  if (confidence === 'low' || liquidity < 25) return 'high';
  if (confidence === 'medium' || liquidity < 55) return 'medium';
  return 'low';
}

// Risk-adjusted: net profit scaled by liquidity and confidence.
export function riskAdjusted(opp) {
  const c = { high: 1, medium: 0.7, low: 0.4 }[opp.confidence] ?? 0.4;
  return opp.net * (opp.liquidity / 100) * c;
}

// Max quantity actually executable: limited by budget and by a share of daily volume.
export function maxQuantity({ budget, unitPrice, dailyVolume = Infinity, volumeShare = 0.05, cap = Infinity }) {
  if (!isValidPrice(unitPrice) || !(budget > 0)) return 0;
  const byBudget = Math.floor(budget / unitPrice);
  const byVolume = Number.isFinite(dailyVolume) ? Math.floor(dailyVolume * volumeShare) : Infinity;
  return Math.max(0, Math.min(byBudget, byVolume, cap));
}

export const fmt = (n, d = 0) => Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : 'n/a';
