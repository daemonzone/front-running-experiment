import Link from 'next/link';
import { StatusPill } from '@/components/Pill';
import { MonthPicker } from '@/components/MonthPicker';
import { q } from '@/lib/db';
import { cohortFilter, listMonths, monthShort, resolveMonth } from '@/lib/months';
import { actionLabel, fmtDate, type Action } from '@/lib/viz';

export const dynamic = 'force-dynamic';

const statuses = ['pending_search', 'monitoring', 'registered', 'window_closed', 'failed'];
const statusLabel: Record<string, string> = {
  pending_search: 'Queued', monitoring: 'Monitoring', registered: 'Registered', window_closed: 'Window closed', failed: 'Failed',
};

export default async function Domains({ searchParams }: { searchParams: Promise<{ status?: string; registrar?: string; month?: string }> }) {
  const sp = await searchParams;
  const { status, registrar } = sp;
  const sel = sp.month ? resolveMonth(sp.month) : 'all';
  const months = await listMonths();
  const registrars = await q<{ slug: string; name: string }>('SELECT slug, name FROM registrars WHERE enabled ORDER BY id');
  const cf = cohortFilter(sel);
  const where: string[] = [cf.sql];
  const params: string[] = [...cf.params];
  if (status && statuses.includes(status)) { params.push(status); where.push(`d.status = $${params.length}::domain_status`); }
  if (registrar === 'control') where.push('d.assigned_registrar_id IS NULL');
  else if (registrar && registrars.some((r) => r.slug === registrar)) { params.push(registrar); where.push(`r.slug = $${params.length}`); }

  const rows = await q(
    `SELECT d.name, d.status, d.assigned_action AS action, r.name AS registrar, d.searched_at, to_char(d.cohort, 'YYYY-MM') AS cohort
       FROM domains d LEFT JOIN registrars r ON r.id = d.assigned_registrar_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY d.generated_at DESC, d.id DESC LIMIT 1000`, params);

  const href = (s?: string, r?: string) => {
    const p = new URLSearchParams();
    if (s) p.set('status', s);
    if (r) p.set('registrar', r);
    if (sp.month) p.set('month', sel);
    return `/domains${p.size ? `?${p}` : ''}`;
  };

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Open data</span>
        <h1>All names</h1>
        <p className="lede">Every name in the experiment, its group, and its current status. {rows.length} shown.</p>
      </div>

      <MonthPicker basePath="/domains" months={months} selected={sel} extra={{ status, registrar }} />
      <div className="filters">
        <div className="filters__group">
          <span>Status</span>
          <Link className="chip" href={href(undefined, registrar)} aria-current={!status}>All</Link>
          {statuses.map((s) => <Link key={s} className="chip" href={href(s, registrar)} aria-current={status === s}>{statusLabel[s]}</Link>)}
        </div>
        <div className="filters__group">
          <span>Group</span>
          <Link className="chip" href={href(status)} aria-current={!registrar}>All</Link>
          {registrars.map((r) => <Link key={r.slug} className="chip" href={href(status, r.slug)} aria-current={registrar === r.slug}>{r.name}</Link>)}
          <Link className="chip" href={href(status, 'control')} aria-current={registrar === 'control'}>Control</Link>
        </div>
      </div>

      <div className="card card--flush table-wrap">
        {rows.length === 0 ? <p className="empty">No names match these filters.</p> : (
          <table>
            <thead><tr><th>Domain</th><th>Group</th><th>Action</th><th>Status</th><th>Searched</th><th>Cohort</th></tr></thead>
            <tbody>
              {rows.map((d: any) => (
                <tr key={d.name}>
                  <td><Link href={`/domains/${d.name}`}><b>{d.name}</b></Link></td>
                  <td>{d.registrar ?? 'Control'}</td>
                  <td>{actionLabel[d.action as Action]}</td>
                  <td><StatusPill status={d.status} /></td>
                  <td>{fmtDate(d.searched_at)}</td>
                  <td className="muted"><Link href={`/generation?month=${d.cohort}`}>{monthShort(d.cohort)}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
