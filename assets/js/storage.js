const mem = {};
const ls = () => { try { return globalThis.localStorage || null; } catch { return null; } };
export function load(key, fallback) { try { const s = ls()?.getItem(key) ?? mem[key]; return s ? JSON.parse(s) : fallback; } catch { return fallback; } }
export function save(key, value) { const s = JSON.stringify(value); try { ls()?.setItem(key, s); } catch { /* quota */ } mem[key] = s; }
export function remove(key) { try { ls()?.removeItem(key); } catch {} delete mem[key]; }
export const KEYS = { settings: 'sfs.settings', admin: 'sfs.admin' };
