// "I want this kind of item" filters. Pure, shared by every list.
export const TYPES = [
  { k: 'enchanted', re: /^ENCHANTED_/ }, { k: 'essence', re: /^ESSENCE_/ }, { k: 'book', re: /^ENCHANTMENT_/ },
  { k: 'gem', re: /_GEM$/ }, { k: 'shard', re: /^SHARD_/ }, { k: 'potion', re: /POTION/ }, { k: 'dye', re: /_DYE$/ }
];
export const itemTypes = (id) => TYPES.filter((t) => t.re.test(String(id || '').toUpperCase())).map((t) => t.k);
export const DEFAULT_FILTERS = { q: '', chips: [], pmin: 0, pmax: Infinity, minNet: 0, minRoi: 0, minHour: 0, risk: '', loss: false };

export function matchesFilters(o, F) {
  const q = F.q.trim().toLowerCase();
  if (q && !(String(o.name).toLowerCase().includes(q) || String(o.itemId || '').toLowerCase().includes(q))) return false;
  if (F.chips.length && !(o.category !== 'Auction House' && itemTypes(o.itemId).some((k) => F.chips.includes(k)))) return false;
  if (o.category !== 'Bits' && Number.isFinite(o.unitCost) && (o.unitCost < F.pmin || o.unitCost > F.pmax)) return false;
  const hv = o.hourVol ?? (o.category !== 'Auction House' && Number.isFinite(o.dailyVolume) ? o.dailyVolume / 24 : null);
  if (F.minHour > 0 && hv !== null && hv < F.minHour) return false;
  if (F.risk && o.risk) { if (F.risk === 'low' ? o.risk !== 'low' : o.risk === 'high') return false; }
  return true;
}
