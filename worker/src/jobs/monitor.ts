import { config } from '../config.js';
import { q, type DomainRow } from '../db.js';
import { rdapLookup, rdapPause } from '../rdap.js';

/** Check every monitored domain via RDAP and flag the ones that became registered. */
export async function monitor(): Promise<void> {
  const domains = await q<DomainRow & { monitor_until: Date | null }>(
    `SELECT id, name, label, tld, assigned_action, assigned_registrar_id, monitor_until
       FROM domains WHERE status = 'monitoring' ORDER BY id`,
  );
  console.log(`[monitor] checking ${domains.length} domains`);
  let flagged = 0;

  for (const d of domains) {
    const r = await rdapLookup(d.name);
    await rdapPause();

    await q(
      `INSERT INTO rdap_checks (domain_id, http_status, registered, registrar_name, registrar_iana_id,
                                created_at_rdap, nameservers, rdap_url, raw, error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [d.id, r.httpStatus, r.registered, r.registrarName, r.registrarIanaId, r.createdAt,
       r.nameservers, r.url, r.raw ? JSON.stringify(r.raw) : null, r.error],
    );

    if (r.registered === true) {
      flagged++;
      // Flag = the registrar this domain was searched against (NULL for the control arm).
      await q(
        `UPDATE domains SET status = 'registered', registered_detected_at = now(),
                rdap_created_at = $2, rdap_registrar_name = $3, rdap_registrar_iana_id = $4,
                flagged_registrar_id = assigned_registrar_id
          WHERE id = $1`,
        [d.id, r.createdAt, r.registrarName, r.registrarIanaId],
      );
      console.log(`  !! ${d.name} REGISTERED (searched on registrar ${d.assigned_registrar_id ?? 'none'}, action ${d.assigned_action}) via ${r.registrarName}`);
    } else if (d.monitor_until && d.monitor_until < new Date()) {
      await q(`UPDATE domains SET status = 'window_closed' WHERE id = $1`, [d.id]);
      console.log(`  - ${d.name} monitoring window closed (still unregistered)`);
    }
  }
  console.log(`[monitor] done, ${flagged} newly registered. (window = ${config.monitorDays} days)`);
}
