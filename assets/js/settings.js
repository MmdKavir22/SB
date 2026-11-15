import { DEFAULT_CONFIG } from './calculator.js';
import { DEFAULT_BITS_ITEMS } from './bits.js';
import { load, save, remove, KEYS } from './storage.js';
import { t } from './i18n.js';

export const DEFAULT_SETTINGS = {
  refreshSec: 60, minProfit: 0, minRoi: 0, minVolume: 0, maxAgeSec: DEFAULT_CONFIG.maxAgeSec, auction: false,
  bazaarTaxPct: DEFAULT_CONFIG.bazaarTaxPct, ahClaimPct: DEFAULT_CONFIG.ahClaimPct, ahClaimCap: DEFAULT_CONFIG.ahClaimCap,
  theme: 'midnight', bitsItems: DEFAULT_BITS_ITEMS, lang: 'en', budCoins: 0, budBits: 0, sbHidden: false, bzMode: 'cards', bitsMode: 'cards'
};
export const loadSettings = () => ({ ...DEFAULT_SETTINGS, ...load(KEYS.settings, {}) });
export const toConfig = (s) => ({ ...DEFAULT_CONFIG, minProfit: s.minProfit, minRoi: s.minRoi, minVolume: s.minVolume, maxAgeSec: s.maxAgeSec,
  bazaarTaxPct: s.bazaarTaxPct, ahClaimPct: s.ahClaimPct, ahClaimCap: s.ahClaimCap });

const $ = (id) => document.getElementById(id);
const num = (id, d) => { const v = Number($(id).value); return $(id).value !== '' && Number.isFinite(v) ? v : d; };
const FIELDS = [['setInterval', 'refreshSec'], ['setMinProfit', 'minProfit'], ['setMinRoi', 'minRoi'], ['setMinVol', 'minVolume'], ['setMaxAge', 'maxAgeSec'],
  ['setBzTax', 'bazaarTaxPct'], ['setAhClaim', 'ahClaimPct'], ['setAhCap', 'ahClaimCap']];

export function applyTheme(t) { document.documentElement.dataset.theme = t; }

export function renderSettings(s) {
  for (const [id, k] of FIELDS) $(id).value = s[k];
  $('setAuction').checked = s.auction; $('setTheme').value = s.theme;
  const ed = $('bitsEditor'); ed.textContent = '';
  if (!s.bitsItems.length) ed.textContent = t('noItems');
  for (const it of s.bitsItems) {
    const r = document.createElement('div'); r.className = 'row small';
    r.textContent = `${it.id}: ${it.bits} Bits `;
    const del = document.createElement('button'); del.textContent = t('remove'); del.dataset.del = it.id; r.append(del);
    const ed2 = document.createElement('button'); ed2.textContent = t('edit'); ed2.dataset.edit = it.id; r.append(ed2);
    ed.append(r);
  }
}

export function readSettings(s) {
  const n = { ...s };
  for (const [id, k] of FIELDS) n[k] = num(id, s[k]);
  n.refreshSec = Math.max(30, n.refreshSec); n.maxAgeSec = Math.max(30, n.maxAgeSec);
  n.auction = $('setAuction').checked; n.theme = $('setTheme').value;
  return n;
}
export const persist = (s) => save(KEYS.settings, s);
export function resetAll() { remove(KEYS.settings); remove(KEYS.history); }
