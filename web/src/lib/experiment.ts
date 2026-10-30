import { q } from './db';

/** The day the experiment began: when the first cohort was generated (null before any cohort exists). */
export async function experimentStart(): Promise<Date | null> {
  const [r] = await q<{ d: Date | null }>('SELECT MIN(generated_at) AS d FROM cohorts');
  return r?.d ?? null;
}
