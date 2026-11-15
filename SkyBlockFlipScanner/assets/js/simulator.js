import { simulate } from './calculator.js';
const $ = (id) => document.getElementById(id);
export const fmt = (n, d = 0) => Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : 'n/a';

export function bindSimulator(getCfg, getOpps) {
  $('sItem').addEventListener('change', () => {
    const o = getOpps().find((x) => x.name === $('sItem').value && !x.unavailable && x.category !== 'Bits');
    if (o) { $('sBuy').value = o.unitCost.toFixed(1); $('sSell').value = (o.revenue).toFixed(1); $('sVenue').value = o.category === 'Bazaar' ? 'bazaar' : 'auction'; }
  });
  $('simGo').addEventListener('click', () => {
    const r = simulate({ coins: Number($('sCoins').value), buyPrice: Number($('sBuy').value), sellPrice: Number($('sSell').value),
      quantity: Number($('sQty').value), venue: $('sVenue').value }, getCfg());
    const out = $('simOut'); out.textContent = '';
    if (r.error) { out.textContent = r.error; return; }
    const rows = [['Quantity', fmt(r.quantity)], ['Max affordable', fmt(r.affordable)], ['Total investment', fmt(r.acquisition, 1)], ['Gross revenue', fmt(r.revenue, 1)],
      ['Fees', fmt(r.fees, 1)], ['Net profit', fmt(r.net, 1)], ['ROI', fmt(r.roi, 2) + '%'], ['Profit per item', fmt(r.profitPerUnit, 2)], ['Remaining coins', fmt(r.remaining, 1)]];
    for (const [k, v] of rows) { const d = document.createElement('div'); d.className = 'row'; d.style.justifyContent = 'space-between';
      const a = document.createElement('span'); a.textContent = k; const b = document.createElement('strong'); b.textContent = v;
      if (k === 'Net profit') b.className = r.net >= 0 ? 'pos' : 'neg'; d.append(a, b); out.append(d); }
  });
}
