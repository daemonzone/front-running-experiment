import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { pool, q, type Action, type Registrar } from '../db.js';
import { monthKey, monthStart } from '../month.js';
import { generateLabel, weightedTld } from '../namegen.js';
import { rdapLookup, rdapPause } from '../rdap.js';

interface Arm { registrarId: number | null; action: Action; need: number }

/** Every (registrar, action) combination the registrars support, plus the no_search control. */
async function loadArms(cohort: string, perArm: number): Promise<Arm[]> {
  const registrars = await q<Registrar>('SELECT * FROM registrars WHERE enabled ORDER BY id');
  const have = await q<{ rid: number | null; action: Action; n: string }>(
    `SELECT assigned_registrar_id AS rid, assigned_action AS action, COUNT(*) AS n
       FROM domains WHERE cohort = $1 GROUP BY 1, 2`, [cohort]);
  const need = (rid: number | null, action: Action) =>
    Math.max(0, perArm - Number(have.find((h) => h.rid === rid && h.action === action)?.n ?? 0));

  const arms: Arm[] = [];
  for (const r of registrars) {
    arms.push({ registrarId: r.id, action: 'search_only', need: need(r.id, 'search_only') });
    if (r.supports_cart) arms.push({ registrarId: r.id, action: 'search_cart', need: need(r.id, 'search_cart') });
  }
  arms.push({ registrarId: null, action: 'no_search', need: need(null, 'no_search') });
  return arms;
}

/**
 * Generate the cohort for a month: `namesPerArm` RDAP-verified free names for every group.
 * Idempotent: re-running only tops up groups that are short. Every candidate tried is logged
 * in name_candidates (accepted or not), so the whole selection process is auditable.
 */
export async function generate(month: Date = monthStart()): Promise<void> {
  const cohort = monthKey(monthStart(month));
  const perArm = config.namesPerArm;
  await q(`INSERT INTO cohorts (month, names_per_arm) VALUES ($1, $2) ON CONFLICT (month) DO NOTHING`, [cohort, perArm]);

  const arms = await loadArms(cohort, perArm);
  const missing = () => arms.reduce((s, a) => s + a.need, 0);
  console.log(`[generate] cohort ${cohort}: ${perArm} per group, ${arms.length} groups, ${missing()} names to go`);

  let attempts = 0;
  const maxAttempts = Math.max(50, missing() * 25);
  while (missing() > 0 && attempts < maxAttempts) {
    attempts++;
    const label = generateLabel();
    const tld = weightedTld(config.tldWeights);
    const name = `${label}.${tld}`;

    const dup = await q('SELECT 1 FROM name_candidates WHERE label = $1 LIMIT 1', [label]);
    if (dup.length) {
      await q(`INSERT INTO name_candidates (cohort, name, label, tld, outcome) VALUES ($1,$2,$3,$4,'duplicate_label')`, [cohort, name, label, tld]);
      continue;
    }

    const rdap = await rdapLookup(name);
    await rdapPause();
    const outcome = rdap.registered === false ? 'available' : rdap.registered === true ? 'already_registered' : 'inconclusive';

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cand = await client.query(
        `INSERT INTO name_candidates (cohort, name, label, tld, outcome, http_status, rdap_url, error)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [cohort, name, label, tld, outcome, rdap.httpStatus, rdap.url || null, rdap.error]);

      if (outcome !== 'available') {
        await client.query('COMMIT');
        console.log(`  skip ${name} (${outcome})`);
        continue;
      }

      // Random group among those that still need names.
      const open = arms.filter((a) => a.need > 0);
      const arm = open[Math.floor(Math.random() * open.length)];
      const control = arm.action === 'no_search';
      const ins = await client.query(
        `INSERT INTO domains (name, label, tld, cohort, assigned_action, assigned_registrar_id, status, searched_at, monitor_until)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [name, label, tld, cohort, arm.action, arm.registrarId,
         control ? 'monitoring' : 'pending_search',
         control ? new Date() : null,
         control ? new Date(Date.now() + config.monitorDays * 86400_000) : null]);
      const id = ins.rows[0].id;
      await client.query('UPDATE name_candidates SET domain_id = $2 WHERE id = $1', [cand.rows[0].id, id]);
      await client.query(`INSERT INTO rdap_checks (domain_id, http_status, registered, rdap_url) VALUES ($1,$2,FALSE,$3)`, [id, rdap.httpStatus, rdap.url]);
      if (control) {
        await client.query(
          `INSERT INTO search_log (domain_id, registrar_id, action, outcome, finished_at, notes)
           VALUES ($1, NULL, 'no_search', 'ok', now(), 'control: never searched, monitoring started')`, [id]);
      }
      await client.query('COMMIT');
      arm.need--;
      console.log(`  + ${name}  -> ${arm.action}${arm.registrarId ? ` @registrar ${arm.registrarId}` : ''}`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  if (missing() > 0) {
    console.log(`[generate] cohort ${cohort} still short of ${missing()} names after ${attempts} candidates; re-run to top up`);
    return;
  }

  // Pre-registration: hash of the final assignment list for this cohort.
  const rows = await q<{ name: string; action: string; registrar: string | null }>(
    `SELECT d.name, d.assigned_action AS action, r.slug AS registrar
       FROM domains d LEFT JOIN registrars r ON r.id = d.assigned_registrar_id WHERE d.cohort = $1 ORDER BY d.name`, [cohort]);
  const canonical = rows.map((r) => `${r.name}\t${r.action}\t${r.registrar ?? '-'}`).join('\n');
  const sha = createHash('sha256').update(canonical).digest('hex');
  await q(`UPDATE cohorts SET generated_at = COALESCE(generated_at, now()), assignments_sha256 = $2 WHERE month = $1`, [cohort, sha]);
  console.log(`[generate] cohort ${cohort} complete after ${attempts} candidates; assignments sha256 ${sha}`);
}
