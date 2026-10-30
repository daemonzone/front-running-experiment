import Link from 'next/link';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';
const fmt = (d: Date | null) => (d ? new Date(d).toISOString().replace('T', ' ').slice(0, 16) : '—');

export default async function Domains() {
  const rows = await q(
    `SELECT d.name, d.status, d.assigned_action, r.name AS registrar, d.searched_at, d.generated_at, d.batch
       FROM domains d LEFT JOIN registrars r ON r.id = d.assigned_registrar_id
      ORDER BY d.generated_at DESC, d.id DESC LIMIT 1000`);
  return (
    <>
      <p><Link href="/">← Overview</Link></p>
      <h1>All names</h1>
      <table>
        <thead><tr><th>Domain</th><th>Registrar</th><th>Action</th><th>Status</th><th>Searched at (UTC)</th><th>Batch</th></tr></thead>
        <tbody>
          {rows.map((d: any) => (
            <tr key={d.name}>
              <td><Link href={`/domains/${d.name}`}>{d.name}</Link></td>
              <td>{d.registrar ?? '(control)'}</td>
              <td>{d.assigned_action}</td>
              <td className={d.status === 'registered' ? 'hit' : ''}>{d.status}</td>
              <td>{fmt(d.searched_at)}</td>
              <td className="muted">{d.batch}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
