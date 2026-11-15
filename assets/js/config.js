// Shared (admin-managed) configuration: disabled items, Bits Shop list, image URL template.
import { DEFAULT_BITS_ITEMS } from './bits.js';

export const CONFIG_PATH = 'config/items.json';
export const DEFAULT_IMAGE_TEMPLATE = 'https://sky.shiiyu.moe/item/{id}'; // community item renders; unverified, falls back to a letter
export const DEFAULT_SHARED = { version: 1, disabled: [], imageTemplate: DEFAULT_IMAGE_TEMPLATE, bitsItems: DEFAULT_BITS_ITEMS };

export function repoFromLocation(loc) {
  const host = loc?.hostname || '', m = /^([^.]+)\.github\.io$/i.exec(host);
  const repo = (loc?.pathname || '').split('/').filter(Boolean)[0];
  return m && repo ? { owner: m[1], repo } : null;
}

export function sanitizeShared(o) {
  const src = o && typeof o === 'object' ? o : {};
  const seen = new Set(), bitsItems = [];
  for (const it of Array.isArray(src.bitsItems) ? src.bitsItems : DEFAULT_BITS_ITEMS) {
    const id = String(it?.id ?? '').trim().toUpperCase();
    const bits = Number(it?.bits);
    if (!id || seen.has(id) || !(bits > 0) || !Number.isFinite(bits)) continue; seen.add(id);
    const source = it.source === 'ah' ? 'ah' : 'bazaar';
    bitsItems.push({ id, name: String(it.name || ''), bits, source, ahName: String(it.ahName || ''), enabled: it.enabled !== false, verified: it.verified === true, note: String(it.note || '') });
  }
  const tpl = typeof src.imageTemplate === 'string' && /^https:\/\/.+\{id\}/.test(src.imageTemplate) ? src.imageTemplate : DEFAULT_IMAGE_TEMPLATE;
  const disabled = [...new Set((Array.isArray(src.disabled) ? src.disabled : []).filter((x) => typeof x === 'string' && x))];
  return { version: 1, disabled, imageTemplate: tpl, bitsItems };
}

// Order: raw GitHub (fresh after an admin save) -> file shipped with the site -> built-in defaults.
export async function loadShared(fetchImpl, loc) {
  const repo = repoFromLocation(loc);
  const urls = [];
  if (repo) urls.push([`https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/main/${CONFIG_PATH}`, 'github']);
  urls.push([CONFIG_PATH, 'site']);
  for (const [url, source] of urls) {
    try { const res = await fetchImpl(url, { cache: 'no-store' }); if (res.ok) return { cfg: sanitizeShared(await res.json()), source }; } catch { /* try next */ }
  }
  return { cfg: sanitizeShared(DEFAULT_SHARED), source: 'default' };
}
