import Link from 'next/link';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';

const fmt = (d: Date | null) => (d ? new Date(d).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—');
const actionLabel: Record<string, string> = {
  search_only: 'search only', search_cart: 'search + cart', no_search: 'never searched',
};

export default async function Home() {
  const arms = await q(`SELECT * FROM arm_stats`);
  const hits = await q(
    `SELECT d.name, d.assigned_action, r.name AS registrar, d.searched_at, d.rdap_created_at,
            d.registered_detected_at, d.rdap_registrar_name,
            COALESCE(d.rdap_created_at, d.registered_detected_at) - d.searched_at AS delay
       FROM domains d LEFT JOIN registrars r ON r.id = d.flagged_registrar_id
      WHERE d.status = 'registered' ORDER BY d.registered_detected_at DESC`);
  const totals = (await q(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status IN ('monitoring','pending_search'))::int AS active,
            COUNT(*) FILTER (WHERE status = 'registered')::int AS registered,
            MAX(r.checked_at) AS last_check
       FROM domains d LEFT JOIN LATERAL (SELECT MAX(checked_at) AS checked_at FROM rdap_checks c WHERE c.domain_id = d.id) r ON TRUE`))[0];

  return (
    <>
      <h1>Domain front-running experiment</h1>
      <p className="muted">
        Randomly generated, brand-like names that were unregistered at generation time (verified via RDAP) are
        searched on different registrars (search only / search + add to cart) or never searched (control). RDAP is
        then polled daily. A name registered by someone else is flagged against the registrar it was searched on.
        Raw data: <a href="/api/export?table=domains">domains.csv</a> · <a href="/api/export?table=search_log">search_log.csv</a> ·{' '}
        <a href="/api/export?table=rdap_checks">rdap_checks.csv</a>
      </p>

      <p>
        <b>{totals.total}</b> names · <b>{totals.active}</b> monitored · <b className={totals.registered ? 'hit' : ''}>{totals.registered}</b> registered
        · last RDAP check {fmt(totals.last_check)}
      </p>

      <h2>Results by experiment arm</h2>
      <table>
        <thead><tr><th>Registrar</th><th>Action</th><th className="n">Names</th><th className="n">Registered</th><th className="n">Monitoring</th><th className="n">Rate</th></tr></thead>
        <tbody>
          {arms.map((a: any, i: number) => (
            <tr key={i}>
              <td>{a.registrar}</td>
              <td>{actionLabel[a.action]}</td>
              <td className="n">{a.domains}</td>
              <td className={`n ${a.registered > 0 ? 'hit' : ''}`}>{a.registered}</td>
              <td className="n">{a.still_monitoring}</td>
              <td className="n">{a.registered_pct ?? 0}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Registered names</h2>
      {hits.length === 0 ? (
        <p className="muted">None so far.</p>
      ) : (
        <table>
          <thead><tr><th>Domain</th><th>Searched on</th><th>Action</th><th>Searched at</th><th>Registered (RDAP)</th><th>Delay</th><th>Registered via</th></tr></thead>
          <tbody>
            {hits.map((h: any) => (
              <tr key={h.name}>
                <td><Link href={`/domains/${h.name}`}>{h.name}</Link></td>
                <td>{h.registrar ?? '(control)'}</td>
                <td>{actionLabel[h.assigned_action]}</td>
                <td>{fmt(h.searched_at)}</td>
                <td>{fmt(h.rdap_created_at ?? h.registered_detected_at)}</td>
                <td>{h.delay ? `${h.delay.days ?? 0}d ${h.delay.hours ?? 0}h` : '—'}</td>
                <td>{h.rdap_registrar_name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p><Link href="/domains">All names →</Link></p>
    </>
  );
}
