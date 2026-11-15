const charts = {};
const COL = { accent: '#7c5cff', cyan: '#38d5e8', good: '#3ddc97', bad: '#ff5d73', grid: '#262b57', text: '#8a90b5' };
export function draw(id, type, labels, datasets, opts = {}) {
  if (!globalThis.Chart) return false;
  charts[id]?.destroy();
  const el = document.getElementById(id); if (!el) return false;
  charts[id] = new Chart(el, { type, data: { labels, datasets }, options: { responsive: true, animation: false,
    plugins: { legend: { display: datasets.length > 1, labels: { color: COL.text } } },
    scales: { x: { ticks: { color: COL.text, maxRotation: 60 }, grid: { color: COL.grid } }, y: { ticks: { color: COL.text }, grid: { color: COL.grid } } }, ...opts } });
  return true;
}
export const colors = COL;
export function histogram(values, bins = 8) {
  if (!values.length) return { labels: [], counts: [] };
  const min = Math.min(...values), max = Math.max(...values), w = (max - min) / bins || 1;
  const counts = Array(bins).fill(0);
  for (const v of values) counts[Math.min(bins - 1, Math.floor((v - min) / w))]++;
  return { labels: counts.map((_, i) => Math.round(min + i * w).toLocaleString()), counts };
}
