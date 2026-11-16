// Admin = anyone whose GitHub token can push to the repo. The token stays in this tab only (sessionStorage) and is only sent to api.github.com.
import { CONFIG_PATH } from './config.js';

const API = 'https://api.github.com';
const headers = (token) => ({ Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
export function toBase64Utf8(str) { let bin = ''; for (const b of new TextEncoder().encode(str)) bin += String.fromCharCode(b); return btoa(bin); }

export async function verifyAdmin({ token, owner, repo, fetchImpl = globalThis.fetch }) {
  if (!token || !owner || !repo) return { ok: false, error: 'missing' };
  try {
    const u = await fetchImpl(`${API}/user`, { headers: headers(token) });
    if (u.status === 401) return { ok: false, error: 'badToken' };
    if (!u.ok) return { ok: false, error: `HTTP ${u.status}` };
    const login = (await u.json()).login;
    const r = await fetchImpl(`${API}/repos/${owner}/${repo}`, { headers: headers(token) });
    if (r.status === 404) return { ok: false, error: 'noRepo' };
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const perms = (await r.json()).permissions;
    return perms?.push ? { ok: true, login } : { ok: false, error: 'noWrite' };
  } catch (e) { return { ok: false, error: e.message || 'network' }; }
}

async function currentSha({ token, owner, repo, branch, fetchImpl }) {
  const r = await fetchImpl(`${API}/repos/${owner}/${repo}/contents/${CONFIG_PATH}?ref=${encodeURIComponent(branch)}`, { headers: headers(token) });
  if (r.status === 404) return undefined;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()).sha;
}

export async function publishConfig({ token, owner, repo, branch = 'main', cfg, fetchImpl = globalThis.fetch }) {
  const content = toBase64Utf8(JSON.stringify(cfg, null, 2) + '\n');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const sha = await currentSha({ token, owner, repo, branch, fetchImpl });
      const body = { message: 'Update item configuration (admin panel)', content, branch, ...(sha ? { sha } : {}) };
      const r = await fetchImpl(`${API}/repos/${owner}/${repo}/contents/${CONFIG_PATH}`, { method: 'PUT', headers: { ...headers(token), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (r.ok) return { ok: true };
      if ((r.status === 409 || r.status === 422) && attempt === 0) continue; // stale sha: refetch once
      return { ok: false, error: r.status === 401 || r.status === 403 ? 'noWrite' : `HTTP ${r.status}` };
    } catch (e) { return { ok: false, error: e.message || 'network' }; }
  }
  return { ok: false, error: 'conflict' };
}
