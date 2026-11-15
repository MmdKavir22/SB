import { getBazaar, getAuctions } from './api.js';
import { scanBazaar } from './bazaar.js';
import { scanBits } from './bits.js';
import { scanAuctions } from './auction.js';
import { riskAdjusted } from './calculator.js';
import { load, pushSnapshot, KEYS } from './storage.js';
import { loadSettings, toConfig, renderSettings, readSettings, persist, applyTheme, resetAll } from './settings.js';
import { bindSimulator, fmt } from './simulator.js';
import { draw, histogram, colors } from './charts.js';

const $ = (id) => document.getElementById(id);
let settings = loadSettings();
const state = { opps: [], src: { bazaar: { status: 'idle' }, auction: { status: settings.auction ? 'idle' : 'disabled' }, bits: { status: 'idle' } },
  scanning: false, auto: false, timer: null, lastOk: null, auctionOpps: [], bzData: null };
const cfg = () => toConfig(settings);

function toast(msg, err) { const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg; $('toasts').append(t); setTimeout(() => t.remove(), 5000); }
const age = (ms) => { if (!ms) return 'never'; const s = Math.round((Date.now() - ms) / 1000); return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`; };
const tag = (t) => `<span class="tag ${t}">${t}</span>`;

// ---- scanning ----
async function scan(manual) {
  if (state.scanning) { if (manual) toast('A scan is already running.'); return; }
  state.scanning = true; $('scanState').textContent = 'Scanning…'; $('scanNow').disabled = true;
  try {
    const bz = await getBazaar(manual ? 15000 : 25000);
    state.src.bazaar = { status: bz.status, fetchedAt: bz.fetchedAt, error: bz.error, stale: bz.stale };
    let bzOpps = [], bitsOpps = [];
    if (bz.data) {
      state.bzData = bz.data;
      bzOpps = scanBazaar(bz.data, cfg());
      bitsOpps = scanBits(settings.bitsItems, bz.data, cfg());
      state.src.bits = { status: bz.status, fetchedAt: bz.fetchedAt, error: bz.error, stale: bz.stale };
    } else state.src.bits = { status: 'unavailable', error: 'Depends on Bazaar data: ' + bz.error };
    if (settings.auction) {
      state.src.auction = { status: 'loading' }; render();
      const ah = await getAuctions((d, t) => { $('scanState').textContent = `Auctions ${d}/${t}`; });
      state.src.auction = { status: ah.status, fetchedAt: ah.fetchedAt, error: ah.error, stale: ah.stale };
      if (ah.data) state.auctionOpps = scanAuctions(ah.data.auctions, cfg(), Date.now(), ah.data.lastUpdated);
    } else { state.src.auction = { status: 'disabled' }; state.auctionOpps = []; }
    state.opps = [...bzOpps, ...bitsOpps, ...state.auctionOpps];
    if (bz.status === 'live') {
      state.lastOk = Date.now();
      const top = state.opps.filter((o) => !o.unavailable && o.category !== 'Bits').sort((a, b) => b.net - a.net).slice(0, 40);
      const bits = state.opps.filter((o) => o.category === 'Bits' && !o.unavailable);
      pushSnapshot({ t: state.lastOk, items: [...top, ...bits].map((o) => ({ id: o.id, name: `${o.name} (${o.sellMethod})`, net: o.net, roi: o.roi, cost: o.unitCost })) });
    }
    if (bz.error) toast(`Bazaar: ${bz.error}${bz.data ? ' (showing last data, marked stale)' : ''}`, true);
  } catch (e) { toast('Scan failed: ' + e.message, true); }
  finally { state.scanning = false; $('scanNow').disabled = false; $('scanState').textContent = state.auto ? `Auto every ${settings.refreshSec}s` : 'Idle'; render(); }
}
function setAuto(on) {
  state.auto = on; clearTimeout(state.timer); $('toggleAuto').textContent = on ? 'Stop auto' : 'Start auto';
  $('scanState').textContent = on ? `Auto every ${settings.refreshSec}s` : 'Idle';
  if (!on) return;
  const loop = async () => { await scan(false); if (state.auto) state.timer = setTimeout(loop, settings.refreshSec * 1000); };
  loop();
}

// ---- filtering / rendering ----
const passes = (o) => !o.unavailable && o.net >= cfg().minProfit && o.roi >= cfg().minRoi;
const money = (n) => `<span class="${n >= 0 ? 'pos' : 'neg'}">${fmt(n, 1)}</span>`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function table(el, rows) {
  if (!rows.length) { el.innerHTML = '<div class="empty">No results. Run a scan, or relax the filters. Data may be unavailable (see Dashboard).</div>'; return; }
  const head = ['#', 'Item', 'Category', 'Acquire', 'Sell', 'Capital', 'Revenue', 'Fees', 'Gross', 'Net', 'ROI %', 'Liquidity', 'Risk', 'Confidence', 'Data'];
  el.innerHTML = `<table><thead><tr>${head.map((h, i) => `<th class="${i === 1 ? 'l' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, 300).map((o, i) =>
    `<tr title="${esc(o.note || '')}"><td>${i + 1}</td><td class="l">${esc(o.name)}${o.suspicious ? ' ⚠' : ''}</td><td class="l">${o.category}</td><td class="l">${esc(o.acqMethod)}</td><td class="l">${esc(o.sellMethod)}</td>` +
    `<td>${o.category === 'Bits' ? fmt(o.bitsCost) + ' Bits' : fmt(o.capital, 1)}</td><td>${fmt(o.revenue, 1)}</td><td>${fmt(o.fees, 1)}</td><td>${money(o.gross)}</td><td>${money(o.net)}</td>` +
    `<td>${fmt(o.roi, 2)}</td><td>${o.liquidity}</td><td>${tag(o.risk)}</td><td>${o.confidence}</td><td>${o.stale ? tag('cached') : tag('live')} ${age(o.updated)}</td></tr>`).join('')}</tbody></table>`;
}
const sorters = { net: (o) => o.net, roi: (o) => o.roi, profitPerCoin: (o) => o.profitPerCoin, liquidity: (o) => o.liquidity, capital: (o) => -(o.category === 'Bits' ? Infinity : o.capital), riskAdj: riskAdjusted };

function ranking() {
  const q = $('fSearch').value.toLowerCase(), cat = $('fCategory').value, risk = $('fRisk').value, max = Number($('fMax').value) || Infinity, liq = Number($('fLiq').value) || 0;
  const key = sorters[$('fSort').value];
  let rows = state.opps.filter(passes).filter((o) => (!q || o.name.toLowerCase().includes(q)) && (!cat || o.category === cat) && o.liquidity >= liq && (o.category === 'Bits' || o.capital <= max) &&
    (!risk || (risk === 'low' ? o.risk === 'low' : o.risk !== 'high')));
  const k = $('fSort').value;
  if (k === 'capital') rows = rows.filter((o) => o.category !== 'Bits').sort((a, b) => a.capital - b.capital);
  else rows.sort((a, b) => (k === 'profitPerCoin' ? (b.profitPerBit ?? b.profitPerCoin) - (a.profitPerBit ?? a.profitPerCoin) : key(b) - key(a)));
  table($('tblRanking'), rows);
}
const cat = (name, el) => {
  const q = document.querySelector(`.search[data-for="${name}"]`)?.value.toLowerCase() || '';
  const base = state.opps.filter((o) => o.category === (name === 'bazaar' ? 'Bazaar' : name === 'auction' ? 'Auction House' : 'Bits'));
  if (name === 'auction' && !settings.auction) { $(el).innerHTML = '<div class="empty">Auction scanning is disabled. Enable it in Settings.</div>'; return; }
  const na = base.filter((o) => o.unavailable);
  table($(el), base.filter(passes).filter((o) => !q || o.name.toLowerCase().includes(q)).sort((a, b) => b.net - a.net));
  if (na.length) $(el).insertAdjacentHTML('beforeend', `<div class="empty">No valid Bazaar data for: ${na.map((o) => esc(o.itemId)).join(', ')}. Check the IDs in Settings.</div>`);
};

function dashboard() {
  const ok = state.opps.filter(passes), best = [...ok].sort((a, b) => b.net - a.net)[0], bestRoi = [...ok].sort((a, b) => b.roi - a.roi)[0];
  $('statusRow').innerHTML = Object.entries(state.src).map(([k, s]) => `<div class="card"><div class="k">${k[0].toUpperCase() + k.slice(1)} source</div><div class="v">${tag(s.status)}</div>` +
    `<div class="small muted">${s.fetchedAt ? 'Fetched ' + age(s.fetchedAt) : ''}${s.error ? ' · ' + esc(s.error) : ''}${s.stale ? ' · STALE' : ''}</div></div>`).join('');
  const avg = ok.length ? ok.reduce((a, o) => a + o.roi, 0) / ok.length : NaN;
  const cards = [['Opportunities (passing filters)', fmt(ok.length)], ['Total scanned rows', fmt(state.opps.filter((o) => !o.unavailable).length)],
    ['Best net profit', best ? `${esc(best.name)}: ${fmt(best.net, 1)}` : 'n/a'], ['Best ROI', bestRoi ? `${esc(bestRoi.name)}: ${fmt(bestRoi.roi, 1)}%` : 'n/a'],
    ['Average ROI', fmt(avg, 2) + (ok.length ? '%' : '')], ['Last successful live update', state.lastOk ? age(state.lastOk) : 'none yet'], ['Scanner', state.scanning ? 'Scanning' : state.auto ? 'Auto' : 'Idle']];
  $('statCards').innerHTML = cards.map(([k, v]) => `<div class="card"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  const cnt = ['Bazaar', 'Auction House', 'Bits'].map((c) => ok.filter((o) => o.category === c).length);
  draw('chCategory', 'bar', ['Bazaar', 'Auction House', 'Bits'], [{ label: 'Opportunities', data: cnt, backgroundColor: colors.accent }]);
  const h = histogram(ok.filter((o) => o.category !== 'Bits').map((o) => o.net));
  draw('chDist', 'bar', h.labels, [{ label: 'Count', data: h.counts, backgroundColor: colors.cyan }]);
  const top = [...ok].sort((a, b) => b.net - a.net).slice(0, 10);
  draw('chTop', 'bar', top.map((o) => o.name), [{ label: 'Net per unit', data: top.map((o) => o.net), backgroundColor: colors.good }]);
  const hist = load(KEYS.history, []);
  const pts = hist.map((s) => ({ t: s.t, v: Math.max(...s.items.filter((i) => !i.id.startsWith('bits:')).map((i) => i.net), 0) }));
  draw('chBest', 'line', pts.map((p) => new Date(p.t).toLocaleTimeString()), [{ label: 'Best net', data: pts.map((p) => p.v), borderColor: colors.accent, tension: .2 }]);
  $('chBestNote').textContent = pts.length < 2 ? 'Needs at least 2 scans stored in this browser. No history yet, nothing is simulated.' : `${pts.length} stored scans (this browser only).`;
}

function history() {
  const hist = load(KEYS.history, []), sel = $('hItem'), prev = sel.value;
  const names = new Map(); hist.forEach((s) => s.items.forEach((i) => names.set(i.id, i.name)));
  sel.innerHTML = [...names].map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join('');
  if (names.has(prev)) sel.value = prev;
  $('hInfo').textContent = hist.length ? `${hist.length} stored scans` : 'No history collected yet. Run scans first.';
  const id = sel.value, series = hist.map((s) => ({ t: s.t, i: s.items.find((x) => x.id === id) }));
  draw('chHist', 'line', series.map((p) => new Date(p.t).toLocaleString()), [
    { label: 'Net profit', data: series.map((p) => p.i?.net ?? null), borderColor: colors.good, spanGaps: false },
    { label: 'Unit cost', data: series.map((p) => p.i?.cost ?? null), borderColor: colors.cyan, spanGaps: false }]);
  const [a, b] = [hist.at(-2), hist.at(-1)];
  if (!a || !b) { $('hDiff').textContent = 'Needs two scans.'; return; }
  const A = new Set(a.items.map((i) => i.id)), B = new Set(b.items.map((i) => i.id));
  const appeared = [...B].filter((x) => !A.has(x)).map((x) => names.get(x)), gone = [...A].filter((x) => !B.has(x)).map((x) => names.get(x));
  $('hDiff').textContent = `Appeared: ${appeared.join(', ') || 'none'}. Disappeared: ${gone.join(', ') || 'none'}. (Only top rows per scan are stored.)`;
}

function render() {
  const v = document.querySelector('.view.active').id.replace('view-', '');
  $('itemList').innerHTML = [...new Set(state.opps.filter((o) => !o.unavailable && o.category !== 'Bits').map((o) => o.name))].slice(0, 500).map((n) => `<option value="${esc(n)}">`).join('');
  ({ dashboard, ranking, bazaar: () => cat('bazaar', 'tblBazaar'), auction: () => cat('auction', 'tblAuction'), bits: () => cat('bits', 'tblBits'), history, simulator() {}, settings() {} })[v]();
}

// ---- wiring ----
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('nav button, .view').forEach((e) => e.classList.remove('active'));
  b.classList.add('active'); $('view-' + b.dataset.view).classList.add('active'); $('sidebar').classList.remove('open'); render();
}));
$('menuBtn').onclick = () => $('sidebar').classList.toggle('open');
$('scanNow').onclick = () => scan(true);
$('toggleAuto').onclick = () => setAuto(!state.auto);
['fSearch', 'fCategory', 'fSort', 'fRisk', 'fMax', 'fLiq'].forEach((id) => $(id).addEventListener('input', render));
document.querySelectorAll('.search').forEach((e) => e.addEventListener('input', render));
$('hItem').addEventListener('change', render);
$('saveSettings').onclick = () => { settings = readSettings(settings); persist(settings); applyTheme(settings.theme); renderSettings(settings); toast('Settings saved. Rescan to apply.'); if (state.auto) setAuto(true); };
$('bitsAdd').onclick = () => {
  const id = $('bitsId').value.trim().toUpperCase().replace(/\s+/g, '_'), bits = Number($('bitsCost').value);
  if (!id || !(bits > 0)) return toast('Enter an ID and a positive Bits cost.', true);
  settings.bitsItems = [...settings.bitsItems.filter((i) => i.id !== id), { id, bits }]; persist(settings); renderSettings(settings);
};
$('bitsEditor').addEventListener('click', (e) => {
  const d = e.target.dataset; if (d.del) { settings.bitsItems = settings.bitsItems.filter((i) => i.id !== d.del); persist(settings); renderSettings(settings); }
  if (d.edit) { const it = settings.bitsItems.find((i) => i.id === d.edit); $('bitsId').value = it.id; $('bitsCost').value = it.bits; }
});
$('clearHistory').onclick = () => { localStorage.removeItem(KEYS.history); toast('History cleared.'); render(); };
$('resetAll').onclick = () => { if (confirm('Delete all saved settings and history in this browser?')) { resetAll(); location.reload(); } };
bindSimulator(cfg, () => state.opps);
applyTheme(settings.theme); renderSettings(settings); render();
scan(false);
