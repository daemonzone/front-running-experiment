// Calendar months are always UTC, so cohort boundaries don't depend on the machine's timezone.
export const monthStart = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
export const prevMonth = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
export const monthKey = (d: Date) => d.toISOString().slice(0, 10); // 2026-11-01

export function parseMonth(arg?: string): Date {
  if (!arg) return monthStart();
  const m = /^(\d{4})-(\d{2})$/.exec(arg);
  if (!m) throw new Error(`month must look like YYYY-MM, got "${arg}"`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
}
