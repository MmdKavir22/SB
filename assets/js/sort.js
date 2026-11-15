// Pure sorting helper: numbers/strings, null/NaN always last, dir = 'asc' | 'desc'.
export function sortRows(rows, get, dir = 'desc') {
  const m = dir === 'asc' ? 1 : -1;
  const bad = (v) => v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v));
  return [...rows].sort((a, b) => {
    const x = get(a), y = get(b);
    if (bad(x) && bad(y)) return 0; if (bad(x)) return 1; if (bad(y)) return -1;
    if (typeof x === 'string' || typeof y === 'string') return m * String(x).localeCompare(String(y));
    return m * (x - y);
  });
}
export const nextDir = (cur, key, numeric) => (cur && cur.k === key ? (cur.dir === 'desc' ? 'asc' : 'desc') : numeric ? 'desc' : 'asc');
