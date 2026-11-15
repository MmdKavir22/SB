import { DEFAULT_CONFIG } from './calculator.js';
import { load, save, remove, KEYS } from './storage.js';

export const DEFAULT_SETTINGS = {
  refreshSec: 60, minProfit: 0, minRoi: 0, minVolume: 0, maxAgeSec: DEFAULT_CONFIG.maxAgeSec, auction: false,
  bazaarTaxPct: DEFAULT_CONFIG.bazaarTaxPct, ahClaimPct: DEFAULT_CONFIG.ahClaimPct, ahClaimCap: DEFAULT_CONFIG.ahClaimCap,
  theme: 'midnight', lang: 'en', images: true, budCoins: 0, budBits: 0, sbHidden: false, bzMode: 'cards', bitsMode: 'cards'
};
export const loadSettings = () => ({ ...DEFAULT_SETTINGS, ...load(KEYS.settings, {}) });
export const toConfig = (s) => ({ ...DEFAULT_CONFIG, minProfit: s.minProfit, minRoi: s.minRoi, minVolume: s.minVolume, maxAgeSec: s.maxAgeSec,
  bazaarTaxPct: s.bazaarTaxPct, ahClaimPct: s.ahClaimPct, ahClaimCap: s.ahClaimCap });

const $ = (id) => document.getElementById(id);
const num = (id, d) => { const v = Number($(id).value); return $(id).value !== '' && Number.isFinite(v) ? v : d; };
const FIELDS = [['setInterval', 'refreshSec'], ['setMinProfit', 'minProfit'], ['setMinRoi', 'minRoi'], ['setMinVol', 'minVolume'], ['setMaxAge', 'maxAgeSec'],
  ['setBzTax', 'bazaarTaxPct'], ['setAhClaim', 'ahClaimPct'], ['setAhCap', 'ahClaimCap']];

export const applyTheme = (t) => { document.documentElement.dataset.theme = t; };
export function renderSettings(s) {
  for (const [id, k] of FIELDS) $(id).value = s[k];
  $('setAuction').checked = s.auction; $('setImages').checked = s.images; $('setTheme').value = s.theme;
}
export function readSettings(s) {
  const n = { ...s };
  for (const [id, k] of FIELDS) n[k] = num(id, s[k]);
  n.refreshSec = Math.max(30, n.refreshSec); n.maxAgeSec = Math.max(30, n.maxAgeSec);
  n.auction = $('setAuction').checked; n.images = $('setImages').checked; n.theme = $('setTheme').value;
  return n;
}
export const persist = (s) => save(KEYS.settings, s);
export const resetAll = () => remove(KEYS.settings);
