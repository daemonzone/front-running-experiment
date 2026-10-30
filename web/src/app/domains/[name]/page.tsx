import Link from 'next/link';
import { notFound } from 'next/navigation';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';
const fmt = (d: Date | null) => (d ? new Date(d).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—');

export default async function DomainPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const [d] = await q(
    `SELECT d.*, r.name AS registrar FROM domains d LEFT JOIN registrars r ON r.id = d.assigned_registrar_id WHERE d.name = $1`,
    [name.toLowerCase()]);
  if (!d) notFound();
  const logs = await q(
    `SELECT s.*, r.name AS registrar FROM search_log s LEFT JOIN registrars r ON r.id = s.registrar_id
      WHERE s.domain_id = $1 ORDER BY s.started_at`, [d.id]);
  const checks = await q(
    `SELECT checked_at, http_status, registered, registrar_name, error FROM rdap_checks
      WHERE domain_id = $1 ORDER BY checked_at DESC LIMIT 200`, [d.id]);

  return (
    <>
      <p><Link href="/domains">← All names</Link></p>
      <h1>{d.name}</h1>
      <p>
        <span className="tag">{d.assigned_action}</span> <span className="tag">{d.registrar ?? 'control'}</span>{' '}
        <span className={`tag ${d.status === 'registered' ? 'hit' : ''}`}>{d.status}</span>
      </p>
      {d.status === 'registered' && (
        <p className="hit">
          Registered {fmt(d.rdap_created_at)} (RDAP) via {d.rdap_registrar_name ?? 'unknown'}; detected {fmt(d.registered_detected_at)}.
        </p>
      )}

      <h2>Actions</h2>
      <table>
        <thead><tr><th>Started</th><th>Action</th><th>Registrar</th><th>Outcome</th><th>Cart</th><th>Notes</th></tr></thead>
        <tbody>
          {logs.map((l: any) => (
            <tr key={l.id}>
              <td>{fmt(l.started_at)}</td><td>{l.action}</td><td>{l.registrar ?? '—'}</td>
              <td>{l.outcome}{l.manual ? ' (manual)' : ''}</td>
              <td>{l.cart_confirmed == null ? '—' : l.cart_confirmed ? 'yes' : 'no'}</td>
              <td className="muted">{l.error ?? l.notes ?? ''}{l.screenshot_sha256 ? ` · sha256 ${String(l.screenshot_sha256).slice(0, 12)}…` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>RDAP checks</h2>
      <table>
        <thead><tr><th>Checked</th><th>HTTP</th><th>Registered</th><th>Registrar</th></tr></thead>
        <tbody>
          {checks.map((c: any, i: number) => (
            <tr key={i}>
              <td>{fmt(c.checked_at)}</td><td>{c.http_status ?? '—'}</td>
              <td className={c.registered ? 'hit' : ''}>{c.registered == null ? `inconclusive (${c.error})` : c.registered ? 'yes' : 'no'}</td>
              <td>{c.registrar_name ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
