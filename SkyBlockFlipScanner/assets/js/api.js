// Network layer: timeout, retry, throttle, cache. Never reports cached data as live.
const URLS = { bazaar: 'https://api.hypixel.net/v2/skyblock/bazaar', auctions: 'https://api.hypixel.net/v2/skyblock/auctions' };
const cache = {}; let lastCall = 0; const MIN_GAP_MS = 250;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchJson(url, { timeoutMs = 20000, retries = 2, fetchImpl = globalThis.fetch, retryDelayMs = 500 } = {}) {
  let err;
  for (let i = 0; i <= retries; i++) {
    const wait = lastCall + MIN_GAP_MS - Date.now(); if (wait > 0) await sleep(wait); lastCall = Date.now();
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { signal: ctl.signal });
      if (res.status === 429) { await sleep((Number(res.headers?.get?.('retry-after')) || 5) * 1000); throw new Error('Rate limited (429)'); }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json && json.success === false) throw new Error(json.cause || 'API reported failure');
      return json;
    } catch (e) { err = e.name === 'AbortError' ? new Error('Timeout') : e; if (i < retries) await sleep(retryDelayMs * (i + 1)); }
    finally { clearTimeout(t); }
  }
  throw new Error(err?.message === 'Failed to fetch' ? 'Network/CORS error (request blocked or offline)' : err?.message || 'Unknown error');
}

// Returns {status:'live'|'cached'|'unavailable', data, fetchedAt, error}
export async function getCached(name, loader, ttlMs) {
  const c = cache[name];
  if (c && Date.now() - c.fetchedAt < ttlMs) return { status: 'cached', data: c.data, fetchedAt: c.fetchedAt };
  try { const data = await loader(); cache[name] = { data, fetchedAt: Date.now() }; return { status: 'live', data, fetchedAt: cache[name].fetchedAt }; }
  catch (e) { return c ? { status: 'unavailable', data: c.data, fetchedAt: c.fetchedAt, error: e.message, stale: true } : { status: 'unavailable', data: null, error: e.message }; }
}

export const getBazaar = (ttl = 20000) => getCached('bazaar', () => fetchJson(URLS.bazaar), ttl);

export async function loadAllAuctions(onProgress, { concurrency = 4 } = {}) {
  const first = await fetchJson(`${URLS.auctions}?page=0`);
  const total = first.totalPages, all = [...first.auctions]; let next = 1, done = 1;
  const worker = async () => { while (next < total) { const p = next++; const j = await fetchJson(`${URLS.auctions}?page=${p}`); all.push(...j.auctions); onProgress?.(++done, total); } };
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(0, total - 1)) }, worker));
  return { auctions: all, lastUpdated: first.lastUpdated, totalPages: total };
}
export const getAuctions = (onProgress, ttl = 120000) => getCached('auctions', () => loadAllAuctions(onProgress), ttl);
