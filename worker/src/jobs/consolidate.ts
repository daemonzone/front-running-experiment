import { createHash } from 'node:crypto';
import { q } from '../db.js';
import { createLogger, type Logger } from '../logger.js';
import { monthKey, monthStart, prevMonth } from '../month.js';

/**
 * Freeze a cohort's results as an immutable snapshot (run on the 1st for the previous month).
 * Names stay monitored for the whole window afterwards, so live numbers may still grow.
 */
export async function consolidate(month: Date = prevMonth(), log: Logger = createLogger('consolidate')): Promise<Record<string, unknown>> {
  const cohort = monthKey(monthStart(month));
  const [c] = await q<{ consolidated_at: Date | null }>('SELECT consolidated_at FROM cohorts WHERE month = $1', [cohort]);
  if (!c) { log.info('no cohort for that month, nothing to do', { cohort }); return { cohort, snapshot: false }; }
  if (c.consolidated_at) { log.info('already consolidated', { cohort }); return { cohort, snapshot: false }; }

  const arms = await q(
    `SELECT COALESCE(r.name, 'Control') AS registrar, d.assigned_action AS action, COUNT(*)::int AS names,
            (COUNT(*) FILTER (WHERE d.status = 'registered'))::int AS registered,
            (COUNT(*) FILTER (WHERE d.status IN ('monitoring','pending_search')))::int AS monitoring
       FROM domains d LEFT JOIN registrars r ON r.id = d.assigned_registrar_id
      WHERE d.cohort = $1 GROUP BY r.id, r.name, d.assigned_action ORDER BY r.id NULLS LAST, d.assigned_action`, [cohort]);
  const registered = await q(
    `SELECT d.name, COALESCE(r.name, 'Control') AS registrar, d.assigned_action AS action,
            ROUND((EXTRACT(EPOCH FROM (COALESCE(d.rdap_created_at, d.registered_detected_at) - d.searched_at)) / 86400)::numeric, 2) AS delay_days,
            d.rdap_registrar_name AS registered_via
       FROM domains d LEFT JOIN registrars r ON r.id = d.assigned_registrar_id
      WHERE d.cohort = $1 AND d.status = 'registered' ORDER BY d.name`, [cohort]);

  const totalNames = arms.reduce((s: number, a: any) => s + a.names, 0);
  const totalRegistered = registered.length;
  const sha = createHash('sha256').update(JSON.stringify({ cohort, arms, registered })).digest('hex');

  await q(
    `INSERT INTO cohort_snapshots (cohort, total_names, total_registered, arms, registered, sha256)
     VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (cohort) DO NOTHING`,
    [cohort, totalNames, totalRegistered, JSON.stringify(arms), JSON.stringify(registered), sha]);
  await q('UPDATE cohorts SET consolidated_at = now() WHERE month = $1', [cohort]);
  log.info('snapshot taken', { cohort, registered: totalRegistered, names: totalNames, sha256: sha });
  return { cohort, snapshot: true, names: totalNames, registered: totalRegistered };
}

/** Catch-up for a worker that was down on the 1st: consolidate every finished month still open. */
export async function consolidateDue(log: Logger = createLogger('consolidate')): Promise<Record<string, unknown>> {
  const due = await q<{ month: string }>(
    `SELECT month FROM cohorts WHERE consolidated_at IS NULL AND month < $1 ORDER BY month`, [monthKey(monthStart())]);
  log.info('finished months awaiting consolidation', { count: due.length });
  let done = 0;
  for (const c of due) { const r = await consolidate(new Date(`${c.month}T00:00:00Z`), log); if (r.snapshot) done++; }
  return { due: due.length, snapshots: done };
}
