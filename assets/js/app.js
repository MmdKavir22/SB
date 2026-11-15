import { getBazaar, getAuctions } from './api.js';
import { scanBazaar } from './bazaar.js';
import { scanBits, summarizeBits } from './bits.js';
import { scanAuctions } from './auction.js';
import { riskAdjusted, maxQuantity } from './calculator.js';
import { load, pushSnapshot, KEYS } from './storage.js';
import { loadSettings, toConfig, renderSettings, readSettings, persist, applyTheme, resetAll } from './settings.js';
import { bindSimulator, fmt } from './simulator.js';
import { draw, histogram, colors } from './charts.js';
import { t, setLang, getLang } from './i18n.js';
import { sortRows, nextDir } from './sort.js';

const $ = (id) => document.getElementById(id);
let settings = loadSettings();
const state = { opps: [], src: { bazaar: { status: 'idle' }, auction: { status: settings.auction ? 'idle' : 'disabled' }, bits: { status: 'idle' } },
  scanning: false, auto: false, timer: null, lastOk: null, sorts: {} };
const cfg = () => toConfig(settings);
const save = () => persist(settings);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toast(msg, err) { const d = document.createElement('div'); d.className = 'toast' + (err ? ' err' : ''); d.textContent = msg; $('toasts').append(d); setTimeout(() => d.remove(), 5000); }
const age = (ms) => { if (!ms) return t('never'); const s = Math.round((Date.now() - ms) / 1000); return t('ago', s < 60 ? t('sec', s) : t('min', Math.round(s / 60))); };
const tag = (k) => `<span class="tag ${k}">${t(k)}</span>`;
const money = (n) => `<span class="${n >= 0 ? 'pos' : 'neg'}">${fmt(n, 1)}</span>`;
const budCoins = () => Number(settings.budCoins) > 0 ? Number(settings.budCoins) : Infinity;
const budBits = () => Number(settings.budBits) > 0 ? Number(settings.budBits) : Infinity;

// How many units the budget buys, capped to 5% of daily volume (Bazaar) or 1 listing (AH). Linear profit: ignores price impact.
function affordQty(o) {
  if (o.category === 'Bits') return Number.isFinite(budBits()) ? maxQuantity({ budget: budBits(), unitPrice: o.bitsCost ?? o.bits, dailyVolume: o.dailyVolume }) : null;
  if (!Number.isFinite(budCoins())) return null;
  return maxQuantity({ budget: budCoins(), unitPrice: o.unitCost, dailyVolume: o.category === 'Auction House' ? 20 : o.dailyVolume, cap: o.category === 'Auction House' ? 1 : Infinity });
}
const withinBudget = (o) => o.category === 'Bits' ? (o.bitsCost ?? 0) <= budBits() : o.unitCost <= budCoins();

// ---- scanning ----
async function scan(manual) {
  if (state.scanning) { if (manual) toast(t('scanRunning')); return; }
  state.scanning = true; $('scanState').textContent = t('scanning'); $('scanNow').disabled = true;
  try {
    const bz = await getBazaar(manual ? 15000 : 25000);
    state.src.bazaar = { status: bz.status, fetchedAt: bz.fetchedAt, error: bz.error, stale: bz.stale };
    let bzOpps = [], bitsOpps = [];
    if (bz.data) {
      bzOpps = scanBazaar(bz.data, cfg()); bitsOpps = scanBits(settings.bitsItems, bz.data, cfg());
      state.src.bits = { status: bz.status, fetchedAt: bz.fetchedAt, error: bz.error, stale: bz.stale };
    } else state.src.bits = { status: 'unavailable', error: bz.error };
    let ahOpps = [];
    if (settings.auction) {
      state.src.auction = { status: 'loading' }; render();
      const ah = await getAuctions((d, tt) => { $('scanState').textContent = `Auctions ${d}/${tt}`; });
      state.src.auction = { status: ah.status, fetchedAt: ah.fetchedAt, error: ah.error, stale: ah.stale };
      if (ah.data) ahOpps = scanAuctions(ah.data.auctions, cfg(), Date.now(), ah.data.lastUpdated);
    } else state.src.auction = { status: 'disabled' };
    state.opps = [...bzOpps, ...bitsOpps, ...ahOpps];
    if (bz.status === 'live') {
      state.lastOk = Date.now();
      const top = state.opps.filter((o) => !o.unavailable && o.category !== 'Bits').sort((a, b) => b.net - a.net).slice(0, 40);
      const bits = state.opps.filter((o) => o.category === 'Bits' && !o.unavailable);
      pushSnapshot({ t: state.lastOk, items: [...top, ...bits].map((o) => ({ id: o.id, name: `${o.name} (${o.sellMethod})`, net: o.net, roi: o.roi, cost: o.unitCost })) });
    }
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

// ---- generic sortable table ----
const passes = (o) => !o.unavailable && o.net >= cfg().minProfit && o.roi >= cfg().minRoi && withinBudget(o);
const oppCols = [
  { k: 'rank', l: 'rank', n: 1, nosort: 1 }, { k: 'name', l: 'item', cls: 'l', get: (o) => o.name, html: (o) => esc(o.name) + (o.suspicious ? ' ⚠' : '') },
  { k: 'category', l: 'category', cls: 'l', get: (o) => o.category, html: (o) => o.category },
  { k: 'acq', l: 'acquire', cls: 'l', get: (o) => o.acqMethod, html: (o) => esc(o.acqMethod) }, { k: 'sell', l: 'sell', cls: 'l', get: (o) => o.sellMethod, html: (o) => esc(o.sellMethod) },
  { k: 'capital', l: 'capital', n: 1, get: (o) => o.category === 'Bits' ? Infinity : o.capital, html: (o) => o.category === 'Bits' ? `${fmt(o.bitsCost)} Bits` : fmt(o.capital, 1) },
  { k: 'revenue', l: 'revenue', n: 1, get: (o) => o.revenue, html: (o) => fmt(o.revenue, 1) }, { k: 'fees', l: 'fees', n: 1, get: (o) => o.fees, html: (o) => fmt(o.fees, 1) },
  { k: 'gross', l: 'gross', n: 1, get: (o) => o.gross, html: (o) => money(o.gross) }, { k: 'net', l: 'net', n: 1, get: (o) => o.net, html: (o) => money(o.net) },
  { k: 'roi', l: 'roi', n: 1, get: (o) => o.roi, html: (o) => fmt(o.roi, 2) },
  { k: 'qty', l: 'maxQty', n: 1, get: (o) => affordQty(o), html: (o) => { const q = affordQty(o); return q === null ? '—' : fmt(q); } },
  { k: 'tot', l: 'totalProfit', n: 1, get: (o) => { const q = affordQty(o); return q === null ? null : q * o.net; }, html: (o) => { const q = affordQty(o); return q === null ? '—' : money(q * o.net); } },
  { k: 'cph', l: 'perHour', n: 1, get: (o) => o.coinsPerHour ?? null, html: (o) => o.coinsPerHour === undefined ? '—' : fmt(o.coinsPerHour) },
  { k: 'liq', l: 'liq', n: 1, get: (o) => o.liquidity, html: (o) => o.liquidity }, { k: 'risk', l: 'risk', n: 1, get: (o) => ({ low: 0, medium: 1, high: 2 }[o.risk]), html: (o) => tag(o.risk) },
  { k: 'conf', l: 'conf', n: 1, get: (o) => o.confidence, html: (o) => t(o.confidence) },
  { k: 'data', l: 'data', n: 1, get: (o) => o.updated ?? null, html: (o) => `${tag(o.stale ? 'cached' : 'live')} ${age(o.updated)}` }
];
const bitsCols = [
  { k: 'name', l: 'item', cls: 'l', get: (r) => r.name, html: (r) => esc(r.name) },
  { k: 'bits', l: 'bitsCost', n: 1, get: (r) => r.bits ?? null, html: (r) => r.unavailable ? '—' : fmt(r.bits) },
  { k: 'inst', l: 'instSell', n: 1, get: (r) => r.instNet ?? null, html: (r) => r.instNet === undefined ? '—' : `${fmt(r.instPrice, 1)} (${money(r.instNet)})` },
  { k: 'offer', l: 'sellOffer', n: 1, get: (r) => r.offerNet ?? null, html: (r) => r.offerNet === undefined ? '—' : `${fmt(r.offerPrice, 1)} (${money(r.offerNet)})` },
  { k: 'cpb', l: 'perBit', n: 1, get: (r) => r.bestCpb, html: (r) => r.unavailable ? '—' : money(r.bestCpb) },
  { k: 'aff', l: 'afford', n: 1, get: (r) => Number.isFinite(budBits()) && !r.unavailable ? Math.floor(budBits() / r.bits) : null, html: (r) => Number.isFinite(budBits()) && !r.unavailable ? fmt(Math.floor(budBits() / r.bits)) : '—' },
  { k: 'liq', l: 'liq', n: 1, get: (r) => r.liquidity ?? null, html: (r) => r.liquidity ?? '—' },
  { k: 'st', l: 'status', get: (r) => r.unavailable ? 1 : 0, html: (r) => r.unavailable ? tag('unavailable') : tag('live') }
];
function tableHtml(id, rows, cols, defKey, defDir) {
  const s = state.sorts[id] || (state.sorts[id] = { k: defKey, dir: defDir });
  const col = cols.find((c) => c.k === s.k) || cols.find((c) => c.k === defKey);
  const sorted = col?.get ? sortRows(rows, col.get, s.dir) : rows;
  if (!sorted.length) return `<div class="empty">${t('noResults')}</div>`;
  const head = cols.map((c) => `<th class="${c.cls || ''}${c.k === s.k ? ' sorted' : ''}" ${c.nosort ? '' : `data-sort="${c.k}" data-num="${c.n ? 1 : 0}" data-table="${id}"`}>${t(c.l)}${c.k === s.k ? (s.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`).join('');
  const body = sorted.slice(0, 300).map((o, i) => `<tr title="${esc(o.note || '')}">${cols.map((c) => `<td class="${c.cls || ''}">${c.k === 'rank' ? i + 1 : c.html(o)}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
function fillTable(el, id, rows, cols, defKey, defDir = 'desc') { el.innerHTML = tableHtml(id, rows, cols, defKey, defDir); updateHbar(); }

// ---- cards (skyblock.bz style) ----
function cardsHtml(rows, kind) {
  if (!rows.length) return `<div class="empty">${t('noResults')}</div>`;
  const row = (k, v) => `<div class="r"><span>${k}</span><span>${v}</span></div>`;
  return `<div class="pcards">${rows.slice(0, 120).map((o) => kind === 'bits'
    ? `<div class="pcard"><div class="t"><span>${esc(o.name)}</span>${o.unavailable ? tag('unavailable') : ''}</div>` +
      (o.unavailable ? '' : row(t('bitsCost'), fmt(o.bits)) + row(t('instSell'), o.instNet === undefined ? '—' : `${fmt(o.instPrice, 1)} (${money(o.instNet)})`) + row(t('sellOffer'), o.offerNet === undefined ? '—' : `${fmt(o.offerPrice, 1)} (${money(o.offerNet)})`) + row(t('perBit'), money(o.bestCpb)) + row(t('liq'), o.liquidity)) + `</div>`
    : `<div class="pcard"><div class="t"><span>${esc(o.name)}</span>${tag(o.risk)}</div><div class="sub">${esc(o.acqMethod)} → ${esc(o.sellMethod)}</div>` +
      row(t('buyPrice'), fmt(o.unitCost, 1)) + row(t('sellPrice'), fmt(o.revenue, 1)) + row(t('margin'), money(o.net)) + row('ROI', fmt(o.roi, 2) + '%') +
      row(t('hourVol'), fmt(o.hourVol, 1)) + row(t('perHour'), fmt(o.coinsPerHour)) + (affordQty(o) === null ? '' : row(t('maxQty'), fmt(affordQty(o)))) + `</div>`).join('')}</div>`;
}

// ---- views ----
function ranking() {
  const q = $('fSearch').value.toLowerCase(), cat = $('fCategory').value, risk = $('fRisk').value, max = Number($('fMax').value) || Infinity, liq = Number($('fLiq').value) || 0;
  const rows = state.opps.filter(passes).filter((o) => (!q || o.name.toLowerCase().includes(q)) && (!cat || o.category === cat) && o.liquidity >= liq && (o.category === 'Bits' || o.capital <= max) &&
    (!risk || (risk === 'low' ? o.risk === 'low' : o.risk !== 'high')));
  fillTable($('tblRanking'), 'ranking', rows, oppCols, 'net');
}
const searchVal = (n) => document.querySelector(`.search[data-for="${n}"]`)?.value.toLowerCase() || '';
function bazaarView() {
  const rows = state.opps.filter((o) => o.category === 'Bazaar' && passes(o) && (!searchVal('bazaar') || o.name.toLowerCase().includes(searchVal('bazaar'))));
  const el = $('tblBazaar');
  if (settings.bzMode === 'cards') { el.className = ''; el.innerHTML = cardsHtml(sortRows(rows, (o) => o.coinsPerHour, 'desc'), 'bz'); }
  else { el.className = 'tablewrap'; fillTable(el, 'bazaar', rows, oppCols.filter((c) => !['category'].includes(c.k)), 'cph'); }
}
function auctionView() {
  const el = $('tblAuction');
  if (!settings.auction) { el.innerHTML = `<div class="empty">${t('auctionDisabled')}</div>`; return; }
  fillTable(el, 'auction', state.opps.filter((o) => o.category === 'Auction House' && passes(o) && (!searchVal('auction') || o.name.toLowerCase().includes(searchVal('auction')))), oppCols.filter((c) => !['category', 'cph'].includes(c.k)), 'net');
}
function bitsView() {
  const all = summarizeBits(state.opps.filter((o) => o.category === 'Bits')), q = searchVal('bits');
  const rows = all.filter((r) => !q || r.name.toLowerCase().includes(q));   // never filtered by profit/ROI/coin budget
  const el = $('tblBits'), na = rows.filter((r) => r.unavailable);
  if (settings.bitsMode === 'cards') { el.className = ''; el.innerHTML = cardsHtml(sortRows(rows, (r) => r.bestCpb, 'desc'), 'bits'); }
  else { el.className = 'tablewrap'; fillTable(el, 'bits', rows, bitsCols, 'cpb'); }
  if (na.length) el.insertAdjacentHTML('beforeend', `<div class="empty">${t('bitsMissing', na.map((r) => esc(r.itemId)).join(', '))}</div>`);
}
function dashboard() {
  const ok = state.opps.filter(passes), best = [...ok].sort((a, b) => b.net - a.net)[0], bestRoi = [...ok].sort((a, b) => b.roi - a.roi)[0];
  $('statusRow').innerHTML = Object.entries(state.src).map(([k, s]) => `<div class="card"><div class="k">${t('src' + k[0].toUpperCase() + k.slice(1))}</div><div class="v">${tag(s.status)}</div>` +
    `<div class="small muted">${s.fetchedAt ? t('fetched') + ' ' + age(s.fetchedAt) : ''}${s.error ? ' · ' + esc(s.error) : ''}${s.stale ? ' · ' + t('staleW') : ''}</div></div>`).join('');
  const avg = ok.length ? ok.reduce((a, o) => a + o.roi, 0) / ok.length : NaN;
  const cards = [[t('oppsPassing'), fmt(ok.length)], [t('totalRows'), fmt(state.opps.filter((o) => !o.unavailable).length)],
    [t('bestNet'), best ? `${esc(best.name)}: ${fmt(best.net, 1)}` : 'n/a'], [t('bestRoi'), bestRoi ? `${esc(bestRoi.name)}: ${fmt(bestRoi.roi, 1)}%` : 'n/a'],
    [t('avgRoi'), fmt(avg, 2) + (ok.length ? '%' : '')], [t('lastOk'), state.lastOk ? age(state.lastOk) : t('none')], [t('scannerState'), state.scanning ? t('scanning') : state.auto ? t('auto') : t('idle')]];
  $('statCards').innerHTML = cards.map(([k, v]) => `<div class="card"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  draw('chCategory', 'bar', ['Bazaar', 'Auction House', 'Bits'], [{ label: '#', data: ['Bazaar', 'Auction House', 'Bits'].map((c) => ok.filter((o) => o.category === c).length), backgroundColor: colors.accent }]);
  const h = histogram(ok.filter((o) => o.category !== 'Bits').map((o) => o.net));
  draw('chDist', 'bar', h.labels, [{ label: '#', data: h.counts, backgroundColor: colors.cyan }]);
  const top = [...ok].sort((a, b) => b.net - a.net).slice(0, 10);
  draw('chTop', 'bar', top.map((o) => o.name), [{ label: t('net'), data: top.map((o) => o.net), backgroundColor: colors.good }]);
  const hist = load(KEYS.history, []);
  const pts = hist.map((s) => ({ t: s.t, v: Math.max(...s.items.filter((i) => !i.id.startsWith('bits:')).map((i) => i.net), 0) }));
  draw('chBest', 'line', pts.map((p) => new Date(p.t).toLocaleTimeString()), [{ label: t('net'), data: pts.map((p) => p.v), borderColor: colors.accent, tension: .2 }]);
  $('chBestNote').textContent = pts.length < 2 ? t('needScans') : t('storedScans', pts.length);
}
function history() {
  const hist = load(KEYS.history, []), sel = $('hItem'), prev = sel.value;
  const names = new Map(); hist.forEach((s) => s.items.forEach((i) => names.set(i.id, i.name)));
  sel.innerHTML = [...names].map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join('');
  if (names.has(prev)) sel.value = prev;
  $('hInfo').textContent = hist.length ? t('storedScans', hist.length) : t('noHist');
  const id = sel.value, series = hist.map((s) => ({ t: s.t, i: s.items.find((x) => x.id === id) }));
  draw('chHist', 'line', series.map((p) => new Date(p.t).toLocaleString()), [
    { label: t('net'), data: series.map((p) => p.i?.net ?? null), borderColor: colors.good }, { label: t('buyPrice'), data: series.map((p) => p.i?.cost ?? null), borderColor: colors.cyan }]);
  const [a, b] = [hist.at(-2), hist.at(-1)];
  if (!a || !b) { $('hDiff').textContent = t('needTwo'); return; }
  const A = new Set(a.items.map((i) => i.id)), B = new Set(b.items.map((i) => i.id));
  $('hDiff').textContent = `${t('appeared')}: ${[...B].filter((x) => !A.has(x)).map((x) => names.get(x)).join(', ') || '—'}. ${t('disappeared')}: ${[...A].filter((x) => !B.has(x)).map((x) => names.get(x)).join(', ') || '—'}.`;
}
function render() {
  const v = document.querySelector('.view.active').id.replace('view-', '');
  $('itemList').innerHTML = [...new Set(state.opps.filter((o) => !o.unavailable && o.category !== 'Bits').map((o) => o.name))].slice(0, 500).map((n) => `<option value="${esc(n)}">`).join('');
  ({ dashboard, ranking, bazaar: bazaarView, auction: auctionView, bits: bitsView, history, simulator() {}, settings() {} })[v]();
  updateHbar();
}

// ---- bottom horizontal scrollbar for wide tables (small screens) ----
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
function applyUi() {
  setLang(settings.lang); applyTheme(settings.theme); $('langBtn').textContent = t('langBtn');
  $('budCoins').value = settings.budCoins || ''; $('budBits').value = settings.budBits || '';
  document.body.classList.toggle('sb-hidden', !!settings.sbHidden);
  for (const [id, key] of [['bzMode', 'bzMode'], ['bitsMode', 'bitsMode']]) $(id).querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.mode === settings[key]));
  renderSettings(settings); scanLabel(); render();
}
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('nav button, .view').forEach((e) => e.classList.remove('active'));
  b.classList.add('active'); $('view-' + b.dataset.view).classList.add('active'); document.body.classList.remove('sb-open'); render();
}));
$('sideToggle').onclick = () => { if (matchMedia('(max-width:800px)').matches) document.body.classList.toggle('sb-open'); else { settings.sbHidden = !settings.sbHidden; save(); document.body.classList.toggle('sb-hidden', settings.sbHidden); updateHbar(); } };
$('langBtn').onclick = () => { settings.lang = getLang() === 'fa' ? 'en' : 'fa'; save(); applyUi(); };
$('scanNow').onclick = () => scan(true);
$('toggleAuto').onclick = () => setAuto(!state.auto);
for (const [id, key] of [['budCoins', 'budCoins'], ['budBits', 'budBits']]) $(id).addEventListener('input', () => { settings[key] = Math.max(0, Number($(id).value) || 0); save(); render(); });
['fSearch', 'fCategory', 'fRisk', 'fMax', 'fLiq'].forEach((id) => $(id).addEventListener('input', render));
document.querySelectorAll('.search').forEach((e) => e.addEventListener('input', render));
for (const [id, key] of [['bzMode', 'bzMode'], ['bitsMode', 'bitsMode']]) $(id).addEventListener('click', (e) => { const m = e.target.dataset.mode; if (!m) return; settings[key] = m; save(); applyUi(); });
document.addEventListener('click', (e) => {   // sortable headers: first click numeric = high→low, text = A→Z; click again to flip
  const th = e.target.closest('th[data-sort]'); if (!th) return;
  const id = th.dataset.table, cur = state.sorts[id];
  state.sorts[id] = { k: th.dataset.sort, dir: nextDir(cur, th.dataset.sort, th.dataset.num === '1') }; render();
});
$('hItem').addEventListener('change', render);
$('saveSettings').onclick = () => { settings = readSettings(settings); save(); applyUi(); toast(t('saved')); if (state.auto) setAuto(true); };
$('bitsAdd').onclick = () => {
  const id = $('bitsId').value.trim().toUpperCase().replace(/\s+/g, '_'), bits = Number($('bitsCost').value);
  if (!id || !(bits > 0)) return toast(t('needIdBits'), true);
  settings.bitsItems = [...settings.bitsItems.filter((i) => i.id !== id), { id, bits }]; save(); renderSettings(settings); scan(true);
};
$('bitsEditor').addEventListener('click', (e) => {
  const d = e.target.dataset;
  if (d.del) { settings.bitsItems = settings.bitsItems.filter((i) => i.id !== d.del); save(); renderSettings(settings); scan(true); }
  if (d.edit) { const it = settings.bitsItems.find((i) => i.id === d.edit); $('bitsId').value = it.id; $('bitsCost').value = it.bits; }
});
$('clearHistory').onclick = () => { try { localStorage.removeItem(KEYS.history); } catch {} toast(t('histCleared')); render(); };
$('resetAll').onclick = () => { if (confirm(t('confirmReset'))) { resetAll(); location.reload(); } };
bindSimulator(cfg, () => state.opps);
applyUi();
scan(false);
