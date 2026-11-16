import { getBazaar, getAuctions } from './api.js';
import { scanBazaar } from './bazaar.js';
import { scanBits, summarizeBits } from './bits.js';
import { scanAuctions, priceIndex } from './auction.js';
import { maxQuantity, fmt } from './calculator.js';
import { popularItems } from './popular.js';
import { TYPES, DEFAULT_FILTERS, matchesFilters } from './filters.js';
import { loadShared, sanitizeShared, repoFromLocation, DEFAULT_SHARED } from './config.js';
import { verifyAdmin, publishConfig } from './admin.js';
import { KEYS } from './storage.js';
import { loadSettings, toConfig, renderSettings, readSettings, persist, applyTheme, resetAll } from './settings.js';
import { t, has, setLang, getLang } from './i18n.js';
import { sortRows, nextDir } from './sort.js';

const $ = (id) => document.getElementById(id);
let settings = loadSettings();
const state = {
  opps: [], popular: [], raw: { bz: null, ahOpps: [], ahIndex: null }, scanning: false, auto: false, timer: null, lastOk: null, sorts: {},
  src: { bazaar: { status: 'idle' }, auction: { status: settings.auction ? 'idle' : 'disabled' }, bits: { status: 'idle' }, config: { status: 'idle' } },
  shared: sanitizeShared(DEFAULT_SHARED), F: { ...DEFAULT_FILTERS, chips: [] }, bz: { buy: 'order', sell: 'offer' },
  admin: { token: null, login: null, owner: '', repo: '', branch: 'main', dirty: false }
};
let dis = new Set();
const cfg = () => toConfig(settings);
const save = () => persist(settings);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = (msg, err) => { const d = document.createElement('div'); d.className = 'toast' + (err ? ' err' : ''); d.textContent = msg; $('toasts').append(d); setTimeout(() => d.remove(), 5000); };
const age = (ms) => { if (!ms) return t('never'); const s = Math.round((Date.now() - ms) / 1000); return t('ago', s < 60 ? t('sec', s) : t('min', Math.round(s / 60))); };
const tag = (k, label) => `<span class="tag ${k}">${label ?? t(k)}</span>`;
const money = (n) => `<span class="${n >= 0 ? 'pos' : 'neg'}">${fmt(n, 1)}</span>`;
const budCoins = () => Number(settings.budCoins) > 0 ? Number(settings.budCoins) : Infinity;
const budBits = () => Number(settings.budBits) > 0 ? Number(settings.budBits) : Infinity;
const itemKey = (o) => o.category === 'Auction House' ? 'ah:' + o.name : o.category === 'Bits' ? 'bits:' + o.itemId : o.itemId;
const refreshDis = () => { dis = new Set(state.shared.disabled); };
const visible = (o) => !dis.has(itemKey(o));

function iconHtml(id, name) {
  const letter = esc((name || '?')[0].toUpperCase());
  if (!settings.images || !id || !state.shared.imageTemplate) return `<span class="ico"><b>${letter}</b></span>`;
  return `<span class="ico"><b>${letter}</b><img src="${esc(state.shared.imageTemplate.replace('{id}', encodeURIComponent(id)))}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`;
}
document.addEventListener('error', (e) => { if (e.target.tagName === 'IMG' && e.target.closest('.ico')) e.target.remove(); }, true);

// Units the budget buys, capped to 5% of daily volume (Bazaar) or 1 listing (AH). Profit is linear: ignores price impact.
function affordQty(o) {
  if (o.category === 'Bits') return Number.isFinite(budBits()) ? maxQuantity({ budget: budBits(), unitPrice: o.bitsCost, dailyVolume: o.dailyVolume }) : null;
  if (!Number.isFinite(budCoins())) return null;
  const ah = o.category === 'Auction House';
  return maxQuantity({ budget: budCoins(), unitPrice: o.unitCost, dailyVolume: ah ? 20 : o.dailyVolume, cap: ah ? 1 : Infinity });
}
const withinBudget = (o) => o.category === 'Bits' ? (o.bitsCost ?? 0) <= budBits() : o.unitCost <= budCoins();
function passes(o) {
  if (o.unavailable || !visible(o)) return false;
  const F = state.F;
  if (!F.loss && (o.net < Math.max(cfg().minProfit, F.minNet) || o.roi < Math.max(cfg().minRoi, F.minRoi))) return false;
  return withinBudget(o) && matchesFilters(o, F);
}

// ---- data ----
function recompute() {
  const { bz, ahOpps, ahIndex } = state.raw;
  state.opps = bz ? scanBazaar(bz, cfg()) : [];
  state.popular = bz ? popularItems(bz) : [];
  const bits = scanBits(state.shared.bitsItems, bz || { products: {} }, cfg(), ahIndex);
  state.opps.push(...bits, ...ahOpps);
}
async function scan(manual) {
  if (state.scanning) { if (manual) toast(t('scanRunning')); return; }
  state.scanning = true; $('scanState').textContent = t('scanning'); $('scanNow').disabled = true;
  try {
    const bz = await getBazaar(manual ? 15000 : 25000);
    state.src.bazaar = { status: bz.status, fetchedAt: bz.fetchedAt, error: bz.error, stale: bz.stale };
    state.src.bits = bz.data ? { ...state.src.bazaar } : { status: 'unavailable', error: bz.error };
    state.raw.bz = bz.data;
    if (settings.auction) {
      state.src.auction = { status: 'loading' }; render();
      const ah = await getAuctions((d, tt) => { $('scanState').textContent = `Auctions ${d}/${tt}`; });
      state.src.auction = { status: ah.status, fetchedAt: ah.fetchedAt, error: ah.error, stale: ah.stale };
      if (ah.data) { state.raw.ahOpps = scanAuctions(ah.data.auctions, cfg(), Date.now(), ah.data.lastUpdated); state.raw.ahIndex = priceIndex(ah.data.auctions); }
    } else { state.src.auction = { status: 'disabled' }; state.raw.ahOpps = []; state.raw.ahIndex = null; }
    recompute();
    if (bz.status === 'live') state.lastOk = Date.now();
    if (bz.error) toast(`Bazaar: ${bz.error} ${bz.data ? t('showingStale') : ''}`, true);
  } catch (e) { toast(t('scanFail', e.message), true); }
  finally { state.scanning = false; $('scanNow').disabled = false; scanLabel(); render(); }
}
const scanLabel = () => { $('scanState').textContent = state.auto ? t('autoEvery', settings.refreshSec) : t('idle'); $('toggleAuto').textContent = t(state.auto ? 'stopAuto' : 'startAuto'); };
function setAuto(on) {
  state.auto = on; clearTimeout(state.timer); scanLabel();
  if (!on) return;
  const loop = async () => { await scan(false); if (state.auto) state.timer = setTimeout(loop, settings.refreshSec * 1000); };
  loop();
}

// ---- sortable tables ----
const nameCell = (o) => iconHtml(o.category === 'Auction House' ? null : o.itemId, o.name) + esc(o.name) + (o.suspicious ? ' ⚠' : '');
const oppCols = [
  { k: 'rank', l: 'rank', nosort: 1 }, { k: 'name', l: 'item', cls: 'l', get: (o) => o.name, html: nameCell },
  { k: 'category', l: 'category', cls: 'l', get: (o) => o.category, html: (o) => o.category },
  { k: 'acq', l: 'acquire', cls: 'l', get: (o) => o.acqMethod, html: (o) => esc(o.acqMethod) }, { k: 'sell', l: 'sell', cls: 'l', get: (o) => o.sellMethod, html: (o) => esc(o.sellMethod) },
  { k: 'capital', l: 'capital', n: 1, get: (o) => o.category === 'Bits' ? Infinity : o.capital, html: (o) => o.category === 'Bits' ? `${fmt(o.bitsCost)} Bits` : fmt(o.capital, 1) },
  { k: 'revenue', l: 'revenue', n: 1, get: (o) => o.revenue, html: (o) => fmt(o.revenue, 1) }, { k: 'fees', l: 'fees', n: 1, get: (o) => o.fees, html: (o) => fmt(o.fees, 1) },
  { k: 'gross', l: 'gross', n: 1, get: (o) => o.gross, html: (o) => money(o.gross) }, { k: 'net', l: 'net', n: 1, get: (o) => o.net, html: (o) => money(o.net) },
  { k: 'roi', l: 'roi', n: 1, get: (o) => o.roi, html: (o) => fmt(o.roi, 2) },
  { k: 'qty', l: 'maxQty', n: 1, get: (o) => affordQty(o), html: (o) => { const q = affordQty(o); return q === null ? '—' : fmt(q); } },
  { k: 'tot', l: 'totalProfit', n: 1, get: (o) => { const q = affordQty(o); return q === null ? null : q * o.net; }, html: (o) => { const q = affordQty(o); return q === null ? '—' : money(q * o.net); } },
  { k: 'hv', l: 'hourVol', n: 1, get: (o) => o.hourVol ?? null, html: (o) => o.hourVol === undefined ? '—' : fmt(o.hourVol, 1) },
  { k: 'cph', l: 'perHour', n: 1, get: (o) => o.coinsPerHour ?? null, html: (o) => o.coinsPerHour === undefined ? '—' : fmt(o.coinsPerHour) },
  { k: 'liq', l: 'liq', n: 1, get: (o) => o.liquidity, html: (o) => o.liquidity }, { k: 'risk', l: 'risk', n: 1, get: (o) => ({ low: 0, medium: 1, high: 2 }[o.risk]), html: (o) => tag(o.risk) },
  { k: 'conf', l: 'conf', get: (o) => o.confidence, html: (o) => t(o.confidence) },
  { k: 'data', l: 'data', n: 1, get: (o) => o.updated ?? null, html: (o) => `${tag(o.stale ? 'cached' : 'live')} ${age(o.updated)}` }
];
const popCols = [
  { k: 'rank', l: 'rank', nosort: 1 }, { k: 'name', l: 'item', cls: 'l', get: (o) => o.name, html: (o) => iconHtml(o.itemId, o.name) + esc(o.name) },
  { k: 'ib', l: 'instBuyP', n: 1, get: (o) => o.instBuy, html: (o) => fmt(o.instBuy, 1) }, { k: 'is', l: 'instSellP', n: 1, get: (o) => o.instSell, html: (o) => fmt(o.instSell, 1) },
  { k: 'spr', l: 'spread', n: 1, get: (o) => o.spreadPct, html: (o) => fmt(o.spreadPct, 2) },
  { k: 'wb', l: 'weeklyBuys', n: 1, get: (o) => o.weeklyBuys, html: (o) => fmt(o.weeklyBuys) }, { k: 'ws', l: 'weeklySells', n: 1, get: (o) => o.weeklySells, html: (o) => fmt(o.weeklySells) },
  { k: 'total', l: 'totalVol', n: 1, get: (o) => o.total, html: (o) => fmt(o.total) }, { k: 'turn', l: 'turnover', n: 1, get: (o) => o.turnover, html: (o) => fmt(o.turnover) },
  { k: 'hv', l: 'hourVol', n: 1, get: (o) => o.hourVol, html: (o) => fmt(o.hourVol, 1) }
];
const bitsName = (r) => iconHtml(r.source === 'ah' ? null : r.itemId, r.name) + esc(r.name) + (r.verified ? '' : ` <span class="muted" title="${esc(t('unverified'))}">(?)</span>`);
const bitsCols = [
  { k: 'name', l: 'item', cls: 'l', get: (r) => r.name, html: bitsName },
  { k: 'bits', l: 'bitsCost', n: 1, get: (r) => r.bits, html: (r) => fmt(r.bits) },
  { k: 'inst', l: 'instSell', n: 1, get: (r) => r.instNet ?? null, html: (r) => r.instNet === undefined ? '—' : `${fmt(r.instPrice, 1)} (${money(r.instNet)})` },
  { k: 'offer', l: 'sellOffer', n: 1, get: (r) => r.offerNet ?? null, html: (r) => r.offerNet === undefined ? '—' : `${fmt(r.offerPrice, 1)} (${money(r.offerNet)})` },
  { k: 'bin', l: 'binSell', n: 1, get: (r) => r.binNet ?? null, html: (r) => r.binNet === undefined ? '—' : `${fmt(r.binPrice, 1)} (${money(r.binNet)})` },
  { k: 'cpb', l: 'perBit', n: 1, get: (r) => r.bestCpb, html: (r) => r.unavailable ? '—' : money(r.bestCpb) },
  { k: 'aff', l: 'afford', n: 1, get: (r) => Number.isFinite(budBits()) && !r.unavailable ? Math.floor(budBits() / r.bits) : null, html: (r) => Number.isFinite(budBits()) && !r.unavailable ? fmt(Math.floor(budBits() / r.bits)) : '—' },
  { k: 'liq', l: 'liq', n: 1, get: (r) => r.liquidity ?? null, html: (r) => r.liquidity ?? '—' },
  { k: 'st', l: 'status', get: (r) => r.unavailable ? 1 : 0, html: (r) => r.unavailable ? tag('unavailable', esc(t('reason_' + r.reason))) : tag('live') }
];
function tableHtml(id, rows, cols, defKey, defDir) {
  const s = state.sorts[id] || (state.sorts[id] = { k: defKey, dir: defDir });
  const col = cols.find((c) => c.k === s.k) || cols.find((c) => c.k === defKey);
  const sorted = col?.get ? sortRows(rows, col.get, s.dir) : rows;
  if (!sorted.length) return `<div class="empty">${t('noResults')}</div>`;
  const head = cols.map((c) => `<th class="${c.cls || ''}${c.k === s.k ? ' sorted' : ''}" ${has('tip_' + c.l) ? `title="${esc(t('tip_' + c.l))}"` : ''} ${c.nosort ? '' : `data-sort="${c.k}" data-num="${c.n ? 1 : 0}" data-table="${id}"`}>${t(c.l)}${c.k === s.k ? (s.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`).join('');
  const body = sorted.slice(0, 300).map((o, i) => `<tr title="${esc(o.note || '')}">${cols.map((c) => `<td class="${c.cls || ''}">${c.k === 'rank' ? i + 1 : c.html(o)}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
const fillTable = (el, id, rows, cols, defKey, defDir = 'desc') => { el.innerHTML = tableHtml(id, rows, cols, defKey, defDir); };

// ---- cards ----
const row = (k, v) => `<div class="r"><span>${k}</span><span>${v}</span></div>`;
function cardsHtml(rows, kind) {
  if (!rows.length) return `<div class="empty">${t('noResults')}</div>`;
  return `<div class="pcards">${rows.slice(0, 120).map((o) => kind === 'bits'
    ? `<div class="pcard"><div class="t"><span>${bitsName(o)}</span>${o.unavailable ? '' : tag('live')}</div>` + row(t('bitsCost'), fmt(o.bits)) +
      (o.unavailable ? `<div class="sub">${esc(t('reason_' + o.reason))}</div>` :
        (o.instNet === undefined ? '' : row(t('instSell'), `${fmt(o.instPrice, 1)} (${money(o.instNet)})`)) + (o.offerNet === undefined ? '' : row(t('sellOffer'), `${fmt(o.offerPrice, 1)} (${money(o.offerNet)})`)) +
        (o.binNet === undefined ? '' : row(t('binSell'), `${fmt(o.binPrice, 1)} (${money(o.binNet)})`)) + row(t('perBit'), money(o.bestCpb)) + row(t('liq'), o.liquidity)) + `</div>`
    : `<div class="pcard"><div class="t"><span>${nameCell(o)}</span>${tag(o.risk)}</div><div class="sub">${esc(o.acqMethod)} → ${esc(o.sellMethod)}</div>` +
      row(t('instBuyP'), fmt(o.instBuy, 1)) + row(t('instSellP'), fmt(o.instSell, 1)) + row(t('buyPrice'), fmt(o.unitCost, 1)) + row(t('sellPrice'), fmt(o.revenue, 1)) + row(t('margin'), money(o.net)) +
      row('ROI', fmt(o.roi, 2) + '%') + row(t('hourVol'), fmt(o.hourVol, 1)) + row(t('perHour'), fmt(o.coinsPerHour)) + (affordQty(o) === null ? '' : row(t('maxQty'), fmt(affordQty(o)))) + `</div>`).join('')}</div>`;
}

// ---- views ----
function ranking() {
  const cat = $('fCategory').value;
  fillTable($('tblRanking'), 'ranking', state.opps.filter((o) => passes(o) && (!cat || o.category === cat)), oppCols, 'net');
}
function bazaarView() {
  const { buy, sell } = state.bz, instantBoth = buy !== 'order' && sell !== 'offer';
  $('instantNote').hidden = !(buy === 'instant' || sell === 'instant');
  const rows = state.opps.filter((o) => o.category === 'Bazaar' && (buy === 'any' || o.buyMode === buy) && (sell === 'any' || o.sellMode === sell) && passes(o));
  const el = $('tblBazaar');
  if (settings.bzMode === 'cards') { el.className = ''; el.innerHTML = cardsHtml(sortRows(rows, (o) => o.coinsPerHour, 'desc'), 'bz'); }
  else { el.className = 'tablewrap'; fillTable(el, 'bazaar', rows, oppCols.filter((c) => c.k !== 'category'), instantBoth ? 'net' : 'cph'); }
}
function popularView() {
  const rows = state.popular.map((p) => ({ ...p, category: 'Bazaar', unitCost: p.instBuy })).filter((o) => visible(o) && o.instBuy <= budCoins() && matchesFilters(o, state.F));
  fillTable($('tblPopular'), 'popular', rows, popCols, 'total');
}
function auctionView() {
  const el = $('tblAuction');
  if (!settings.auction) { el.innerHTML = `<div class="empty">${t('auctionDisabled')}</div>`; return; }
  fillTable(el, 'auction', state.opps.filter((o) => o.category === 'Auction House' && passes(o)), oppCols.filter((c) => !['category', 'hv', 'cph'].includes(c.k)), 'net');
}
function bitsView() {
  const q = $('bitsSearch').value.toLowerCase();
  const rows = summarizeBits(state.opps.filter((o) => o.category === 'Bits')).filter((r) => !dis.has('bits:' + r.itemId) && (!q || r.name.toLowerCase().includes(q) || r.itemId.toLowerCase().includes(q)));
  const el = $('tblBits');
  if (settings.bitsMode === 'cards') { el.className = ''; el.innerHTML = cardsHtml(sortRows(rows, (r) => r.bestCpb, 'desc'), 'bits'); }
  else { el.className = 'tablewrap'; fillTable(el, 'bits', rows, bitsCols, 'cpb'); }
}
function dashboard() {
  const ok = state.opps.filter(passes), best = [...ok].sort((a, b) => b.net - a.net)[0], bestRoi = [...ok.filter((o) => o.category !== 'Bits')].sort((a, b) => b.roi - a.roi)[0];
  const top = [...state.popular].filter((p) => !dis.has(p.itemId)).sort((a, b) => b.total - a.total)[0];
  $('statusRow').innerHTML = Object.entries(state.src).map(([k, s]) => `<div class="card"><div class="k">${t('src' + k[0].toUpperCase() + k.slice(1))}</div><div class="v">${tag(s.status, k === 'config' && s.source ? t(s.source) : undefined)}</div>` +
    `<div class="small muted">${s.fetchedAt ? t('fetched') + ' ' + age(s.fetchedAt) : ''}${s.error ? ' · ' + esc(s.error) : ''}${s.stale ? ' · ' + t('staleW') : ''}</div></div>`).join('');
  const rb = ok.filter((o) => o.category !== 'Bits'), avg = rb.length ? rb.reduce((a, o) => a + o.roi, 0) / rb.length : NaN;
  const cards = [[t('oppsPassing'), fmt(ok.length)], [t('totalRows'), fmt(state.opps.filter((o) => !o.unavailable).length)],
    [t('bestNet'), best ? `${esc(best.name)}: ${fmt(best.net, 1)}` : 'n/a'], [t('bestRoi'), bestRoi ? `${esc(bestRoi.name)}: ${fmt(bestRoi.roi, 1)}%` : 'n/a'],
    [t('avgRoi'), fmt(avg, 2) + (rb.length ? '%' : '')], [t('topTraded'), top ? `${esc(top.name)}: ${fmt(top.total)}` : 'n/a'],
    [t('lastOk'), state.lastOk ? age(state.lastOk) : t('none')], [t('scannerState'), state.scanning ? t('scanning') : state.auto ? t('auto') : t('idle')]];
  $('statCards').innerHTML = cards.map(([k, v]) => `<div class="card"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
}

// ---- admin ----
const markDirty = () => { state.admin.dirty = true; render(); };
function adminView() {
  const a = state.admin, on = !!a.token;
  $('adminLogin').hidden = on; $('adminPanel').hidden = !on;
  if (!on) return;
  $('admUser').textContent = t('admWho', a.login); $('admDirty').hidden = !a.dirty; $('admImg').value = state.shared.imageTemplate;
  const q = $('admSearch').value.toLowerCase(), cat = $('admCat').value, items = new Map();
  if (!cat || cat === 'Bazaar') state.popular.forEach((p) => items.set(p.itemId, { key: p.itemId, name: p.name, cat: 'Bazaar', id: p.itemId }));
  if (!cat || cat === 'Auction House') state.opps.filter((o) => o.category === 'Auction House').forEach((o) => items.set('ah:' + o.name, { key: 'ah:' + o.name, name: o.name, cat: 'Auction House' }));
  const list = [...items.values()].filter((i) => !q || i.name.toLowerCase().includes(q)).sort((x, y) => x.name.localeCompare(y.name));
  $('admItems').innerHTML = list.slice(0, 300).map((i) => `<label><input type="checkbox" data-key="${esc(i.key)}" ${dis.has(i.key) ? '' : 'checked'}>${iconHtml(i.id, i.name)}<span>${esc(i.name)}</span><span class="muted small">${i.cat}</span></label>`).join('') || `<div class="empty">${t('noResults')}</div>`;
  const rows = state.shared.bitsItems.map((b, i) => `<tr><td><input type="checkbox" data-bi="${i}" data-f="enabled" ${b.enabled ? 'checked' : ''}></td><td class="l">${esc(b.id)}</td>` +
    `<td class="l"><input data-bi="${i}" data-f="name" value="${esc(b.name)}"></td><td><input type="number" min="1" data-bi="${i}" data-f="bits" value="${b.bits}"></td><td>${b.source}</td>` +
    `<td class="l"><input data-bi="${i}" data-f="ahName" value="${esc(b.ahName)}"></td><td>${b.verified ? '✔' : '?'}</td><td><button data-rm="${i}">${t('admRemove')}</button></td></tr>`).join('');
  $('admBits').innerHTML = `<table style="min-width:760px"><thead><tr><th></th><th class="l">${t('admId')}</th><th class="l">${t('admName')}</th><th>${t('admBits')}</th><th>${t('admSource')}</th><th class="l">${t('admAhName')}</th><th>✔</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}
function adminErr(code) { return t('admErr_' + code) !== 'admErr_' + code ? t('admErr_' + code) : t('admErr_generic', code); }
async function adminLogin(token, owner, repo, branch, silent) {
  const r = await verifyAdmin({ token, owner, repo });
  if (!r.ok) { if (!silent) toast(adminErr(r.error), true); return false; }
  state.admin = { ...state.admin, token, login: r.login, owner, repo, branch };
  try { sessionStorage.setItem(KEYS.admin, JSON.stringify({ token, owner, repo, branch })); } catch { /* private mode */ }
  return true;
}

function render() {
  const v = document.querySelector('.view.active').id.replace('view-', '');
  $('filterBar').hidden = !['ranking', 'bazaar', 'popular', 'auction'].includes(v);
  ({ dashboard, ranking, bazaar: bazaarView, popular: popularView, auction: auctionView, bits: bitsView, settings() {}, admin: adminView })[v]();
  updateHbar();
}

// ---- fixed bottom scrollbar for wide tables ----
let hbarTarget = null;
function updateHbar() {
  const wrap = document.querySelector('.view.active .tablewrap'), bar = $('hbar');
  if (hbarTarget && hbarTarget !== wrap) hbarTarget.onscroll = null;
  hbarTarget = wrap;
  if (!wrap || wrap.scrollWidth <= wrap.clientWidth + 2) { bar.hidden = true; return; }
  bar.hidden = false; $('hbarInner').style.width = wrap.scrollWidth + 'px'; bar.scrollLeft = wrap.scrollLeft;
  wrap.onscroll = () => { if (bar.scrollLeft !== wrap.scrollLeft) bar.scrollLeft = wrap.scrollLeft; };
}
$('hbar').addEventListener('scroll', () => { if (hbarTarget) hbarTarget.scrollLeft = $('hbar').scrollLeft; });
window.addEventListener('resize', updateHbar);

// ---- wiring ----
function buildChips() {
  $('chips').innerHTML = TYPES.map((x) => `<button class="chip${state.F.chips.includes(x.k) ? ' on' : ''}" data-chip="${x.k}">${t('type_' + x.k)}</button>`).join('');
}
function segActive(id, attr, val) { $(id).querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset[attr] === val)); }
function applyUi() {
  setLang(settings.lang); applyTheme(settings.theme); $('langBtn').textContent = t('langBtn');
  $('budCoins').value = settings.budCoins || ''; $('budBits').value = settings.budBits || '';
  document.body.classList.toggle('sb-hidden', !!settings.sbHidden);
  segActive('bzMode', 'mode', settings.bzMode); segActive('bitsMode', 'mode', settings.bitsMode); segActive('bzBuy', 'v', state.bz.buy); segActive('bzSell', 'v', state.bz.sell);
  buildChips(); renderSettings(settings); scanLabel(); render();
}
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('nav button, .view').forEach((e) => e.classList.remove('active'));
  b.classList.add('active'); $('view-' + b.dataset.view).classList.add('active'); document.body.classList.remove('sb-open'); render();
}));
$('sideToggle').onclick = () => { if (matchMedia('(max-width:800px)').matches) document.body.classList.toggle('sb-open'); else { settings.sbHidden = !settings.sbHidden; save(); document.body.classList.toggle('sb-hidden', settings.sbHidden); updateHbar(); } };
$('langBtn').onclick = () => { settings.lang = getLang() === 'fa' ? 'en' : 'fa'; save(); applyUi(); };
$('scanNow').onclick = () => scan(true);
$('toggleAuto').onclick = () => setAuto(!state.auto);
for (const k of ['budCoins', 'budBits']) $(k).addEventListener('input', () => { settings[k] = Math.max(0, Number($(k).value) || 0); save(); render(); });
const numOr = (id, d) => { const v = $(id).value; return v === '' || !Number.isFinite(Number(v)) ? d : Number(v); };
function readFilters() {
  Object.assign(state.F, { q: $('fSearch').value, pmin: numOr('fPmin', 0), pmax: numOr('fPmax', Infinity), minNet: numOr('fNet', 0), minRoi: numOr('fRoi', 0), minHour: numOr('fHour', 0), risk: $('fRisk').value, loss: $('fLoss').checked });
  render();
}
['fSearch', 'fPmin', 'fPmax', 'fNet', 'fRoi', 'fHour', 'fRisk', 'fLoss'].forEach((id) => $(id).addEventListener('input', readFilters));
$('chips').addEventListener('click', (e) => { const k = e.target.dataset.chip; if (!k) return; const c = state.F.chips; state.F.chips = c.includes(k) ? c.filter((x) => x !== k) : [...c, k]; buildChips(); render(); });
$('fReset').onclick = () => { state.F = { ...DEFAULT_FILTERS, chips: [] }; for (const id of ['fSearch', 'fPmin', 'fPmax', 'fNet', 'fRoi', 'fHour']) $(id).value = ''; $('fRisk').value = ''; $('fLoss').checked = false; buildChips(); render(); };
$('fCategory').addEventListener('input', render); $('bitsSearch').addEventListener('input', render);
for (const [id, key] of [['bzMode', 'bzMode'], ['bitsMode', 'bitsMode']]) $(id).addEventListener('click', (e) => { const m = e.target.dataset.mode; if (!m) return; settings[key] = m; save(); applyUi(); });
$('bzBuy').addEventListener('click', (e) => { const v = e.target.dataset.v; if (!v) return; state.bz.buy = v; segActive('bzBuy', 'v', v); render(); });
$('bzSell').addEventListener('click', (e) => { const v = e.target.dataset.v; if (!v) return; state.bz.sell = v; segActive('bzSell', 'v', v); render(); });
document.addEventListener('click', (e) => {   // sortable headers: numbers start high to low, text A to Z; click again to flip
  const th = e.target.closest('th[data-sort]'); if (!th) return;
  const id = th.dataset.table;
  state.sorts[id] = { k: th.dataset.sort, dir: nextDir(state.sorts[id], th.dataset.sort, th.dataset.num === '1') }; render();
});
$('saveSettings').onclick = () => { settings = readSettings(settings); save(); applyUi(); toast(t('saved')); if (state.auto) setAuto(true); };
$('resetAll').onclick = () => { if (confirm(t('confirmReset'))) { resetAll(); location.reload(); } };

// admin wiring
$('admLoginBtn').onclick = async () => {
  const token = $('admTokenIn').value.trim(), owner = $('admOwner').value.trim(), repo = $('admRepo').value.trim(), branch = $('admBranch').value.trim() || 'main';
  if (!token || !owner || !repo) return toast(adminErr('missing'), true);
  if (await adminLogin(token, owner, repo, branch)) { $('admTokenIn').value = ''; render(); }
};
$('admLogout').onclick = () => { state.admin = { token: null, login: null, owner: state.admin.owner, repo: state.admin.repo, branch: state.admin.branch, dirty: false }; try { sessionStorage.removeItem(KEYS.admin); } catch {} toast(t('admLoggedOut')); render(); };
$('admPublish').onclick = async () => {
  const a = state.admin, r = await publishConfig({ token: a.token, owner: a.owner, repo: a.repo, branch: a.branch, cfg: sanitizeShared(state.shared) });
  if (r.ok) { state.admin.dirty = false; toast(t('admOk')); render(); } else toast(adminErr(r.error), true);
};
['admSearch', 'admCat'].forEach((id) => $(id).addEventListener('input', render));
$('admItems').addEventListener('change', (e) => {
  const k = e.target.dataset.key; if (!k) return;
  const s = new Set(state.shared.disabled); e.target.checked ? s.delete(k) : s.add(k);
  state.shared.disabled = [...s]; refreshDis(); markDirty();
});
const bulk = (show) => { const s = new Set(state.shared.disabled); $('admItems').querySelectorAll('input[data-key]').forEach((i) => show ? s.delete(i.dataset.key) : s.add(i.dataset.key)); state.shared.disabled = [...s]; refreshDis(); markDirty(); };
$('admShowAll').onclick = () => bulk(true); $('admHideAll').onclick = () => bulk(false);
$('admBits').addEventListener('change', (e) => {
  const d = e.target.dataset; if (d.bi === undefined) return;
  const it = state.shared.bitsItems[Number(d.bi)]; if (!it) return;
  if (d.f === 'enabled') it.enabled = e.target.checked; else if (d.f === 'bits') it.bits = Number(e.target.value) || it.bits; else it[d.f] = e.target.value;
  it.verified = d.f === 'bits' ? true : it.verified; state.shared = sanitizeShared(state.shared); recompute(); markDirty();
});
$('admBits').addEventListener('click', (e) => { const i = e.target.dataset.rm; if (i === undefined) return; state.shared.bitsItems.splice(Number(i), 1); recompute(); markDirty(); });
$('abAdd').onclick = () => {
  const id = $('abId').value.trim().toUpperCase().replace(/\s+/g, '_'), bits = Number($('abBits').value);
  if (!id || !(bits > 0)) return toast(t('admBadId'), true);
  const it = { id, name: $('abName').value.trim(), bits, source: $('abSource').value, ahName: $('abAh').value.trim(), enabled: true, verified: true, note: '' };
  state.shared.bitsItems = [...state.shared.bitsItems.filter((b) => b.id !== id), it]; state.shared = sanitizeShared(state.shared); recompute(); markDirty();
};
$('admImg').addEventListener('change', () => { state.shared = sanitizeShared({ ...state.shared, imageTemplate: $('admImg').value.trim() }); markDirty(); });

// ---- start ----
(async function init() {
  applyUi();
  const repo = repoFromLocation(location);
  if (repo) { state.admin.owner = repo.owner; state.admin.repo = repo.repo; $('admOwner').value = repo.owner; $('admRepo').value = repo.repo; }
  try { const s = JSON.parse(sessionStorage.getItem(KEYS.admin) || 'null'); if (s?.token) { $('admOwner').value = s.owner; $('admRepo').value = s.repo; $('admBranch').value = s.branch; await adminLogin(s.token, s.owner, s.repo, s.branch, true); } } catch { /* ignore */ }
  const cfgRes = await loadShared(globalThis.fetch.bind(globalThis), location);
  state.shared = cfgRes.cfg; state.src.config = { status: cfgRes.source === 'default' ? 'unavailable' : 'live', source: cfgRes.source };
  refreshDis(); render();
  scan(false);
})();
