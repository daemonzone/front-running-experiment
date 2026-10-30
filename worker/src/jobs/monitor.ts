import { config } from '../config.js';
import { q, type DomainRow } from '../db.js';
import { createLogger, type Logger } from '../logger.js';
import { rdapLookup, rdapPause } from '../rdap.js';

/** Check every monitored domain via RDAP and flag the ones that became registered. */
export async function monitor(log: Logger = createLogger('monitor')): Promise<Record<string, unknown>> {
  const domains = await q<DomainRow & { monitor_until: Date | null }>(
    `SELECT id, name, label, tld, assigned_action, assigned_registrar_id, monitor_until
       FROM domains WHERE status = 'monitoring' ORDER BY id`,
  );
  log.info('checking monitored domains', { count: domains.length, window_days: config.monitorDays });
  let registered = 0, inconclusive = 0, closed = 0, checked = 0;

  for (const d of domains) {
    const r = await rdapLookup(d.name);
    await rdapPause();
    checked++;

    await q(
      `INSERT INTO rdap_checks (domain_id, http_status, registered, registrar_name, registrar_iana_id,
                                created_at_rdap, nameservers, rdap_url, raw, error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [d.id, r.httpStatus, r.registered, r.registrarName, r.registrarIanaId, r.createdAt,
       r.nameservers, r.url, r.raw ? JSON.stringify(r.raw) : null, r.error],
    );

    if (r.registered === true) {
      registered++;
      // Flag = the registrar this domain was searched on (NULL for the control arm).
      await q(
        `UPDATE domains SET status = 'registered', registered_detected_at = now(),
                rdap_created_at = $2, rdap_registrar_name = $3, rdap_registrar_iana_id = $4,
                flagged_registrar_id = assigned_registrar_id
          WHERE id = $1`,
        [d.id, r.createdAt, r.registrarName, r.registrarIanaId],
      );
      log.warn('DOMAIN REGISTERED', {
        domain: d.name, searched_on_registrar_id: d.assigned_registrar_id ?? 'none (control)', action: d.assigned_action,
        registrar_of_record: r.registrarName, created: r.createdAt,
      });
    } else if (r.registered === null) {
      inconclusive++;
      log.warn('check inconclusive, will retry next run', { domain: d.name, error: r.error });
    } else if (d.monitor_until && d.monitor_until < new Date()) {
      closed++;
      await q(`UPDATE domains SET status = 'window_closed' WHERE id = $1`, [d.id]);
      log.info('monitoring window closed, still unregistered', { domain: d.name });
    }
    if (checked % 10 === 0) log.info('progress', { checked, of: domains.length, registered });
  }
  return { checked, newly_registered: registered, inconclusive, window_closed: closed };
}
