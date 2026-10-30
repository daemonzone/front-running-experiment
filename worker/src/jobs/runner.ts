import { q } from '../db.js';
import { createLogger, type Logger } from '../logger.js';

export type Trigger = 'manual' | 'cron' | 'startup';

/** A manual run waits no longer than this for a "running" row before it is considered stale. */
const STALE_HOURS = 3;

/** Rows left "running" by a scheduler that crashed or was restarted. Called when the scheduler starts. */
export async function abortOrphanedRuns(): Promise<void> {
  const rows = await q(
    `UPDATE job_runs SET status = 'aborted', finished_at = now(), error = 'worker restarted while running'
      WHERE status = 'running' AND trigger <> 'manual' RETURNING id, job`);
  if (rows.length) createLogger('runner').warn('marked orphaned runs as aborted', { runs: rows.map((r: any) => `${r.job}#${r.id}`).join(',') });
}

/**
 * Runs a job with start/finish logging and a job_runs record. Refuses to start while another run
 * is in progress (e.g. the scheduler container is searching), unless force is set.
 */
export async function runJob<T extends Record<string, unknown> | void>(
  job: string,
  fn: (log: Logger, runId: number) => Promise<T>,
  opts: { trigger?: Trigger; force?: boolean } = {},
): Promise<T> {
  const trigger = opts.trigger ?? 'manual';

  if (!opts.force) {
    const busy = await q<{ id: number; job: string; started_at: Date }>(
      `SELECT id, job, started_at FROM job_runs
        WHERE status = 'running' AND started_at > now() - make_interval(hours => $1) ORDER BY id`, [STALE_HOURS]);
    if (busy.length) {
      const b = busy[0];
      throw new Error(
        `another run is in progress (${b.job}#${b.id} since ${b.started_at.toISOString()}). ` +
        `Stop the worker container (docker compose stop worker) or pass --force.`);
    }
  }

  const [{ id }] = await q<{ id: number }>(
    `INSERT INTO job_runs (job, trigger) VALUES ($1, $2) RETURNING id`, [job, trigger]);
  const log = createLogger(`${job}#${id}`);
  const t0 = Date.now();
  log.info('job started', { trigger });

  try {
    const summary = (await fn(log, id)) ?? {};
    await q(`UPDATE job_runs SET status = 'ok', finished_at = now(), summary = $2 WHERE id = $1`, [id, JSON.stringify(summary)]);
    log.info('job finished', { status: 'ok', duration_s: Math.round((Date.now() - t0) / 100) / 10, ...(summary as object) });
    return summary as T;
  } catch (e) {
    const err = e as Error;
    await q(`UPDATE job_runs SET status = 'error', finished_at = now(), error = $2 WHERE id = $1`, [id, err.message]);
    log.error('job failed', { duration_s: Math.round((Date.now() - t0) / 100) / 10, error: err.message });
    log.debug('stack', { stack: err.stack });
    throw e;
  }
}
