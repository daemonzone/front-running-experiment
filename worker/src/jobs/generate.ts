import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool, q, type Action, type Registrar } from '../db.js';
import { generateLabel, weightedTld } from '../namegen.js';
import { rdapLookup, rdapPause } from '../rdap.js';

interface Arm { registrarId: number | null; action: Action; count: number }

/** Every (registrar, action) combination the registrars support, plus the no_search control. */
async function loadArms(): Promise<Arm[]> {
  const registrars = await q<Registrar>('SELECT * FROM registrars WHERE enabled ORDER BY id');
  const counts = await q<{ rid: number | null; action: Action; n: string }>(
    'SELECT assigned_registrar_id AS rid, assigned_action AS action, COUNT(*) AS n FROM domains GROUP BY 1, 2',
  );
  const countOf = (rid: number | null, action: Action) =>
    Number(counts.find((c) => c.rid === rid && c.action === action)?.n ?? 0);

  const arms: Arm[] = [];
  for (const r of registrars) {
    arms.push({ registrarId: r.id, action: 'search_only', count: countOf(r.id, 'search_only') });
    if (r.supports_cart) arms.push({ registrarId: r.id, action: 'search_cart', count: countOf(r.id, 'search_cart') });
  }
  arms.push({ registrarId: null, action: 'no_search', count: countOf(null, 'no_search') });
  return arms;
}

/** Least-filled arm wins, ties broken at random => balanced groups with random assignment. */
function nextArm(arms: Arm[]): Arm {
  const min = Math.min(...arms.map((a) => a.count));
  const candidates = arms.filter((a) => a.count === min);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export async function generate(total = config.generateBatchSize): Promise<void> {
  const batch = `b-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 6)}`;
  const arms = await loadArms();
  let created = 0;
  let attempts = 0;
  console.log(`[generate] batch ${batch}, target ${total}, ${arms.length} arms`);

  while (created < total && attempts < total * 10) {
    attempts++;
    const label = generateLabel();
    const tld = weightedTld(config.tldWeights);
    const name = `${label}.${tld}`;

    // Skip labels we already used under any TLD (avoid cross-contamination between arms).
    const dup = await q('SELECT 1 FROM domains WHERE label = $1', [label]);
    if (dup.length) continue;

    const rdap = await rdapLookup(name);
    await rdapPause();
    if (rdap.registered !== false) {
      if (rdap.registered === true) console.log(`  skip ${name} (already registered)`);
      else console.log(`  skip ${name} (RDAP inconclusive: ${rdap.error})`);
      continue;
    }

    const arm = nextArm(arms);
    const control = arm.action === 'no_search';
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ins = await client.query(
        `INSERT INTO domains (name, label, tld, batch, assigned_action, assigned_registrar_id, status, searched_at, monitor_until)
         VALUES ($1,$2,$3,$4,$5,$6,$7, $8, $9) RETURNING id`,
        [
          name, label, tld, batch, arm.action, arm.registrarId,
          control ? 'monitoring' : 'pending_search',
          control ? new Date() : null,
          control ? new Date(Date.now() + config.monitorDays * 86400_000) : null,
        ],
      );
      const id = ins.rows[0].id;
      await client.query(
        `INSERT INTO rdap_checks (domain_id, http_status, registered, rdap_url) VALUES ($1,$2,FALSE,$3)`,
        [id, rdap.httpStatus, rdap.url],
      );
      if (control) {
        await client.query(
          `INSERT INTO search_log (domain_id, registrar_id, action, outcome, finished_at, notes)
           VALUES ($1, NULL, 'no_search', 'ok', now(), 'control: never searched, monitoring started')`,
          [id],
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    arm.count++;
    created++;
    console.log(`  + ${name}  -> ${arm.action}${arm.registrarId ? ` @registrar ${arm.registrarId}` : ''}`);
  }
  console.log(`[generate] created ${created} domains in batch ${batch}`);
}
