const mem = {};
const ls = () => { try { return globalThis.localStorage || null; } catch { return null; } };
export function load(key, fallback) { try { const s = ls()?.getItem(key) ?? mem[key]; return s ? JSON.parse(s) : fallback; } catch { return fallback; } }
export function save(key, value) { const s = JSON.stringify(value); try { ls()?.setItem(key, s); } catch { /* quota */ } mem[key] = s; }
export function remove(key) { try { ls()?.removeItem(key); } catch {} delete mem[key]; }
export const KEYS = { settings: 'sfs.settings', history: 'sfs.history' };
const MAX_SNAPSHOTS = 150;
export function pushSnapshot(snap) {
  const h = load(KEYS.history, []); h.push(snap);
  while (h.length > MAX_SNAPSHOTS) h.shift();
  save(KEYS.history, h);
}
