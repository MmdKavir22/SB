import { calcResult, ahFee, isValidPrice, liquidityScore, riskLevel } from './calculator.js';

const REFORGES = 'Gentle Odd Fast Fair Epic Sharp Heroic Spicy Legendary Deadly Fine Grand Hasty Neat Rapid Unreal Awkward Rich Precise Spiritual Headstrong Clean Fierce Heavy Light Mythic Pure Titanic Smart Wise Strong Superior Fabled Withered Renowned Giant Ancient Loving Ridiculous Necrotic Perfect Jaded Bizarre Itchy Ominous Pleasant Pretty Simple Strange Vivid Godly Zealous Salty Treacherous Lucky Stiff Dirty Candied Submerged Reinforced Cubic Warped Undead Fruitful Magnetic Refined Blessed Bountiful Moil Toil Bustling Mithraic Stellar Auspicious Fleet Heated Ambered Glistening Shaded Sweet Bloody Bulky Great Hurtful Keen Zooming Unpleasant Unyielding Shiny Forceful Demonic Silky Sturdy Boosted Dimensional Fortified Spiked'.split(' ');
const RE_REFORGE = new RegExp(`^(${REFORGES.join('|')}) `);
const STARS = /[✪➊➋➌➍➎]/g;
export const MIN_COMPARABLES = 5;

export function normalize(a) {
  const stars = (a.item_name.match(STARS) || []).length;
  const pet = /^\[Lvl (\d+)\]/.exec(a.item_name);
  let name = a.item_name.replace(STARS, '').replace(/^\[Lvl \d+\] /, '').trim();
  const book = name === 'Enchanted Book';
  if (!book) name = name.replace(RE_REFORGE, '');
  const lore = book ? (a.item_lore || '').split('\n')[0].replace(/§./g, '') : '';
  return { name: book && lore ? lore : name, stars, key: [name, a.tier, stars, pet?.[1] || '', lore].join('|') };
}

export function isValidAuction(a, nowMs) {
  return !!a && a.bin === true && !a.claimed && isValidPrice(a.starting_bid) && typeof a.item_name === 'string' && !!a.item_name &&
    Number.isFinite(a.end) && a.end > nowMs;
}

const median = (arr) => { const s = [...arr].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function scanAuctions(auctions, cfg, nowMs = Date.now(), updated = nowMs) {
  const groups = new Map(), seen = new Set();
  for (const a of auctions) {
    if (!isValidAuction(a, nowMs) || seen.has(a.uuid)) continue; seen.add(a.uuid);
    const n = normalize(a);
    if (!groups.has(n.key)) groups.set(n.key, { n, list: [] });
    groups.get(n.key).list.push(a);
  }
  const out = [];
  for (const { n, list } of groups.values()) {
    if (list.length < MIN_COMPARABLES) continue;
    list.sort((x, y) => x.starting_bid - y.starting_bid);
    const cand = list[0], others = list.slice(1, 11).map((a) => a.starting_bid);
    const ref = median(others), price = cand.starting_bid;
    const suspicious = price < ref * 0.4;
    const r = calcResult({ acquisition: price, revenue: ref, fees: ahFee(ref, cfg) });
    if (!r || r.net <= 0) continue;
    const liquidity = liquidityScore(list.length);
    const confidence = suspicious || list.length < 8 ? 'low' : 'medium'; // no NBT parsing: enchants/attributes not compared
    out.push({ id: `ah:${cand.uuid}`, itemId: cand.uuid, name: n.name, category: 'Auction House', acqMethod: 'BIN Buy', sellMethod: 'BIN Relist',
      unitCost: price, ...r, capital: price, liquidity, dailyVolume: list.length, comparables: list.length, medianPrice: ref,
      confidence, risk: riskLevel(liquidity, confidence), suspicious, updated, source: 'Hypixel Auctions API',
      note: `${list.length} comparables by name/tier/stars. Enchants, attributes, reforge NOT compared. ${suspicious ? 'Suspiciously low: verify in-game.' : ''}`.trim() });
  }
  return out;
}
