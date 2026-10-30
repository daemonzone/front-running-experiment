// Shared helpers for the charts. Colors follow the ENTITY (registrar), never its rank,
// so filtering a group out never repaints the others. Violet / amber / pink validate all-pairs in both
// modes and deliberately avoid the blue-green interface colors, so a hue never means two things.
export type Action = 'search_only' | 'search_cart' | 'no_search';

export const actionLabel: Record<Action, string> = {
  search_only: 'Search only',
  search_cart: 'Search + cart',
  no_search: 'Never searched',
};

const colors: Record<string, string> = {
  namecheap: 'var(--reg-namecheap)',
  godaddy: 'var(--reg-godaddy)',
  ionos: 'var(--reg-ionos)',
  control: 'var(--ctrl)',
};
export const colorVar = (key: string) => colors[key] ?? 'var(--reg-other)';

export interface ArmDatum {
  id: string;
  colorKey: string; // registrar slug or 'control'
  registrar: string; // display name
  action: Action;
  n: number;
  hits: number;
  p?: number | null; // one-sided Fisher p vs. control
}

export interface SeriesDatum {
  id: string;
  name: string;
  colorKey: string;
  days: number[]; // delay in days between exposure and registration, one entry per registered name
  n: number;
}

export const pct = (hits: number, n: number) => (n ? (100 * hits) / n : 0);

/** Smallest "nice" axis maximum >= v. */
export function niceMax(v: number, steps = [4, 8, 12, 20, 40, 60, 80, 100]): number {
  return steps.find((s) => s >= v) ?? 100;
}

export const fmtDate = (d: Date | string | null | undefined, withTime = false) => {
  if (!d) return '—';
  const s = new Date(d).toISOString();
  return withTime ? `${s.slice(0, 10)} ${s.slice(11, 16)} UTC` : s.slice(0, 10);
};

/**
 * Plain-language gap between the search and the registration: "6 hours later", "23 days later".
 * Minutes under an hour, hours under two days, days beyond; "earlier" if the registration predates the search.
 */
export function fmtSpan(days: number | null | undefined): string {
  if (days == null || Number.isNaN(Number(days))) return '—';
  const d = Number(days);
  const abs = Math.abs(d);
  const minutes = Math.round(abs * 1440);
  const hours = Math.round(abs * 24);
  let n: number;
  let unit: string;
  if (minutes < 60) { n = Math.max(1, minutes); unit = 'minute'; }   // rounds at the boundary: 59.9 min -> 1 hour
  else if (hours < 48) { n = hours; unit = 'hour'; }
  else { n = Math.round(abs); unit = 'day'; }
  return `${n} ${unit}${n === 1 ? '' : 's'} ${d < 0 ? 'earlier' : 'later'}`;
}
