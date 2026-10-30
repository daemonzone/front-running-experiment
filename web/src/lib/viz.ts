// Shared helpers for the charts. Colors follow the ENTITY (registrar), never its rank,
// so filtering a group out never repaints the others. Slots 1-3 of the validated palette.
export type Action = 'search_only' | 'search_cart' | 'no_search';

export const actionLabel: Record<Action, string> = {
  search_only: 'Search only',
  search_cart: 'Search + cart',
  no_search: 'Never searched',
};

const colors: Record<string, string> = {
  namecheap: 'var(--s1)',
  godaddy: 'var(--s2)',
  ionos: 'var(--s3)',
  control: 'var(--ctrl)',
};
export const colorVar = (key: string) => colors[key] ?? 'var(--s4)';

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

export const fmtDelay = (days: number | null | undefined) => {
  if (days == null) return '—';
  const d = Math.floor(days);
  const h = Math.round((days - d) * 24);
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
};
