import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { pool, q, type Action } from '../db.js';
import { createLogger, type Logger } from '../logger.js';
import { monthKey, monthStart } from '../month.js';
import { rdapLookup, rdapPause, type RdapResult } from '../rdap.js';
import { computeFingerprint } from './generate.js';

interface Line { name: string; label: string; tld: string; action: Action; registrar: string; recipe: string }

const ACTIONS: Action[] = ['search_only', 'search_cart', 'no_search'];

/**
 * Re-create a cohort from an exact list (name<TAB>action<TAB>registrar[<TAB>recipe]; registrar "-" for the control),
 * instead of generating names at random. Every name is checked against the registry first. A name the registry
 * reports as registered is refused unless it is named in `allowRegistered`. Nothing is written unless every check
 * passes, and the whole cohort is inserted in one transaction. The fingerprint is computed right at the end,
 * before any search, so it is a valid pre-registration.
 */
export async function importCohort(
  file: string, month: Date, allowRegistered: string[] = [], log: Logger = createLogger('import'),
): Promise<Record<string, unknown>> {
  const cohort = monthKey(monthStart(month));
  const allow = new Set(allowRegistered.map((s) => s.trim().toLowerCase()).filter(Boolean));

  // ---- 1. parse and validate the list
  const registrars = await q<{ id: number; slug: string }>('SELECT id, slug FROM registrars');
  const idOf = new Map(registrars.map((r) => [r.slug, r.id]));
  const text = await readFile(file, 'utf8');
  const lines: Line[] = [];
  const seen = new Set<string>();
  for (const [i, raw] of text.split('\n').map((l) => l.replace(/\r$/, '')).entries()) {
    if (!raw.trim()) continue;
    const [name, action, registrar, ...rest] = raw.split('\t');
    const where = `${path.basename(file)} line ${i + 1}`;
    if (!name || !action || !registrar) throw new Error(`${where}: expected name<TAB>action<TAB>registrar`);
    if (!/^[a-z0-9-]+\.[a-z]{2,}$/.test(name)) throw new Error(`${where}: "${name}" is not a plain lower-case domain name`);
    if (!ACTIONS.includes(action as Action)) throw new Error(`${where}: unknown action "${action}"`);
    if ((action === 'no_search') !== (registrar === '-')) throw new Error(`${where}: the control (no_search) must have registrar "-", and only the control`);
    if (registrar !== '-' && !idOf.has(registrar)) throw new Error(`${where}: unknown registrar "${registrar}"`);
    if (seen.has(name)) throw new Error(`${where}: duplicate name ${name}`);
    seen.add(name);
    const dot = name.lastIndexOf('.');
    lines.push({ name, label: name.slice(0, dot), tld: name.slice(dot + 1), action: action as Action, registrar, recipe: rest.join('\t').trim() || `imported from ${path.basename(file)}` });
  }
  if (!lines.length) throw new Error('the list is empty');
  for (const a of allow) if (!seen.has(a)) throw new Error(`--allow-registered names ${a}, which is not in the list`);

  const [existing] = await q<{ n: number }>('SELECT COUNT(*)::int AS n FROM domains WHERE cohort = $1', [cohort]);
  if (existing.n > 0) throw new Error(`cohort ${cohort.slice(0, 7)} already has ${existing.n} names; import only into an empty cohort`);
  log.info('list read', { file: path.basename(file), names: lines.length, cohort: cohort.slice(0, 7), allow_registered: [...allow].join(',') || 'none' });

  // ---- 2. check every name against the registry (nothing is written yet)
  const results = new Map<string, RdapResult>();
  for (const [i, l] of lines.entries()) {
    const r = await rdapLookup(l.name);
    await rdapPause();
    results.set(l.name, r);
    log.info('registry check', { n: `${i + 1}/${lines.length}`, name: l.name, result: r.registered === false ? 'free' : r.registered ? 'registered' : 'inconclusive', http: r.httpStatus ?? 'none' });
  }
  const inconclusive = lines.filter((l) => results.get(l.name)!.registered === null);
  if (inconclusive.length) throw new Error(`registry answer inconclusive for ${inconclusive.map((l) => l.name).join(', ')}; nothing was written, try again`);
  const unexpected = lines.filter((l) => results.get(l.name)!.registered === true && !allow.has(l.name));
  if (unexpected.length) throw new Error(`already registered and not allowed: ${unexpected.map((l) => l.name).join(', ')}. Nothing was written. Pass --allow-registered=<names> if that is intended`);
  for (const a of allow) if (results.get(a)!.registered === false) log.warn('allowed as registered, but the registry says it is free', { name: a });

  // ---- 3. write everything in one transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO cohorts (month, names_per_arm) VALUES ($1, $2)', [cohort, config.namesPerArm]);
    for (const l of lines) {
      const r = results.get(l.name)!;
      const control = l.action === 'no_search';
      const cand = await client.query(
        `INSERT INTO name_candidates (cohort, name, label, tld, outcome, recipe, http_status, rdap_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [cohort, l.name, l.label, l.tld, r.registered ? 'already_registered' : 'available', l.recipe, r.httpStatus, r.url || null]);
      const dom = await client.query(
        `INSERT INTO domains (name, label, tld, cohort, assigned_action, assigned_registrar_id, status, searched_at, monitor_until)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [l.name, l.label, l.tld, cohort, l.action, l.registrar === '-' ? null : idOf.get(l.registrar),
         control ? 'monitoring' : 'pending_search', control ? new Date() : null,
         control ? new Date(Date.now() + config.monitorDays * 86400_000) : null]);
      const id = dom.rows[0].id;
      await client.query('UPDATE name_candidates SET domain_id = $2 WHERE id = $1', [cand.rows[0].id, id]);
      await client.query(
        `INSERT INTO rdap_checks (domain_id, http_status, registered, registrar_name, registrar_iana_id, created_at_rdap, nameservers, rdap_url, raw)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, r.httpStatus, r.registered, r.registrarName, r.registrarIanaId, r.createdAt, r.nameservers, r.url || null, r.raw ? JSON.stringify(r.raw) : null]);
      if (control) {
        await client.query(
          `INSERT INTO search_log (domain_id, registrar_id, action, outcome, finished_at, notes)
           VALUES ($1, NULL, 'no_search', 'ok', now(), 'control: never searched, monitoring started')`, [id]);
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  // ---- 4. fingerprint, now, before any search
  const { sha, count } = await computeFingerprint(cohort);
  await q('UPDATE cohorts SET generated_at = now(), assignments_sha256 = $2, assignments_hashed_at = now() WHERE month = $1', [cohort, sha]);

  const groups = await q<{ registrar: string; action: string; n: number }>(
    `SELECT COALESCE(r.slug, 'control') AS registrar, d.assigned_action::text AS action, COUNT(*)::int AS n
       FROM domains d LEFT JOIN registrars r ON r.id = d.assigned_registrar_id WHERE d.cohort = $1 GROUP BY 1, 2 ORDER BY 1, 2`, [cohort]);
  for (const g of groups) if (g.n !== config.namesPerArm) log.warn('group size differs from the target', { group: `${g.registrar}/${g.action}`, names: g.n, target: config.namesPerArm });
  log.info('cohort restored, fingerprint computed before any search', { cohort: cohort.slice(0, 7), names: count, sha256: sha });
  return { cohort: cohort.slice(0, 7), names: count, groups: groups.length, sha256: sha };
}
