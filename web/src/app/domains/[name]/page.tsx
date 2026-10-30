import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StatusPill } from '@/components/Pill';
import { StatTile } from '@/components/StatTile';
import { q } from '@/lib/db';
import { monthLabel } from '@/lib/months';
import { actionLabel, fmtDate, fmtSpan, type Action } from '@/lib/viz';

export const dynamic = 'force-dynamic';

export default async function DomainPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const [d] = await q(
    `SELECT d.*, r.name AS registrar,
            EXTRACT(EPOCH FROM (COALESCE(d.rdap_created_at, d.registered_detected_at) - d.searched_at)) / 86400 AS days
       FROM domains d LEFT JOIN registrars r ON r.id = d.assigned_registrar_id WHERE d.name = $1`,
    [decodeURIComponent(name).toLowerCase()]);
  if (!d) notFound();
  const logs = await q(
    `SELECT s.*, r.name AS registrar FROM search_log s LEFT JOIN registrars r ON r.id = s.registrar_id
      WHERE s.domain_id = $1 ORDER BY s.started_at`, [d.id]);
  const checks = await q(
    `SELECT checked_at, http_status, registered, registrar_name, error FROM rdap_checks
      WHERE domain_id = $1 ORDER BY checked_at DESC LIMIT 200`, [d.id]);

  return (
    <>
      <p><Link href="/domains" className="muted">← All names</Link></p>
      <div className="page-head">
        <StatusPill status={d.status} />
        <h1>{d.name}</h1>
        <p className="lede">
          {actionLabel[d.assigned_action as Action]}{d.registrar ? ` on ${d.registrar}` : ''} · cohort{' '}
          <Link href={`/generation?month=${String(d.cohort).slice(0, 7)}`}>{monthLabel(String(d.cohort).slice(0, 7))}</Link>
        </p>
      </div>

      <div className="detail-grid" style={{ marginTop: 0 }}>
        <StatTile label="Group" value={d.registrar ?? 'Control'} hint={actionLabel[d.assigned_action as Action]} />
        <StatTile label="Searched" value={fmtDate(d.searched_at)} hint={d.searched_at ? 'exposure start' : 'not yet'} />
        <StatTile label="Registered (RDAP)" value={d.status === 'registered' ? fmtDate(d.rdap_created_at ?? d.registered_detected_at) : '—'} hint={d.rdap_registrar_name ? `via ${d.rdap_registrar_name}` : undefined} />
        <StatTile label="Timespan" value={d.status === 'registered' ? fmtSpan(d.days) : '—'} hint="between the search and the registration" />
      </div>

      <section className="section">
        <div className="section__head"><h2>Timeline</h2></div>
        <div className="card">
          <ul className="timeline" style={{ margin: 0 }}>
            <li><time>{fmtDate(d.generated_at, true)}</time><b>Generated</b> — RDAP confirmed the name was not registered.</li>
            {logs.map((l: any) => (
              <li key={l.id}>
                <time>{fmtDate(l.started_at, true)}</time>
                <b>{actionLabel[l.action as Action]}</b>{l.registrar ? ` on ${l.registrar}` : ''} — {l.outcome}
                {l.manual ? ' (manual)' : ''}
                {l.cart_confirmed != null && <> · cart {l.cart_confirmed ? 'confirmed' : 'not confirmed'}</>}
                {(l.error || l.notes) && <span className="muted"> · {l.error ?? l.notes}</span>}
                {l.screenshot_sha256 && <span className="muted"> · screenshot sha256 <code>{String(l.screenshot_sha256).slice(0, 12)}…</code></span>}
              </li>
            ))}
            {d.status === 'registered' && (
              <li className="is-hit">
                <time>{fmtDate(d.rdap_created_at ?? d.registered_detected_at, true)}</time>
                <b>Registered by a third party</b> via {d.rdap_registrar_name ?? 'an unknown registrar'} (detected {fmtDate(d.registered_detected_at)}).
              </li>
            )}
          </ul>
        </div>
      </section>

      <section className="section">
        <div className="section__head"><h2>Registry checks</h2><span className="muted">{checks.length} shown</span></div>
        <div className="card card--flush table-wrap">
          <table>
            <thead><tr><th>Checked (UTC)</th><th>HTTP</th><th>Result</th><th>Registrar</th></tr></thead>
            <tbody>
              {checks.map((c: any, i: number) => (
                <tr key={i}>
                  <td>{fmtDate(c.checked_at, true)}</td>
                  <td>{c.http_status ?? '—'}</td>
                  <td>{c.registered == null ? `inconclusive (${c.error})` : c.registered ? <b>registered</b> : 'not registered'}</td>
                  <td>{c.registrar_name ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
