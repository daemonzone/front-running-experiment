import { q } from './db';

/** Month keys are 'YYYY-MM' (UTC). 'all' means every cohort. */
export const currentMonthKey = () => new Date().toISOString().slice(0, 7);
export const monthLabel = (key: string) =>
  new Date(`${key}-01T00:00:00Z`).toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' });
export const monthShort = (key: string) =>
  new Date(`${key}-01T00:00:00Z`).toLocaleString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' });
export const nextMonthStart = (key: string) => {
  const d = new Date(`${key}-01T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
};

/** Months that have a cohort, plus the current month, newest first. */
export async function listMonths(): Promise<string[]> {
  const rows = await q<{ m: string }>(`SELECT to_char(month, 'YYYY-MM') AS m FROM cohorts`);
  return Array.from(new Set([...rows.map((r) => r.m), currentMonthKey()])).sort().reverse();
}

/** ?month=YYYY-MM | all ; defaults to the current month. */
export function resolveMonth(param: string | undefined): string {
  if (param === 'all') return 'all';
  return param && /^\d{4}-\d{2}$/.test(param) ? param : currentMonthKey();
}

/** SQL fragment + params to scope a query on `domains d` to the selected month. */
export function cohortFilter(sel: string, startIndex = 1): { sql: string; params: string[] } {
  return sel === 'all' ? { sql: 'TRUE', params: [] } : { sql: `d.cohort = $${startIndex}::date`, params: [`${sel}-01`] };
}
