import Link from 'next/link';
import { StatusPill } from '@/components/Pill';
import { ActionIcon, ActionLegend } from '@/components/ActionIcon';
import { InfoPop } from '@/components/InfoPop';
import { MonthPicker } from '@/components/MonthPicker';
import { Pager } from '@/components/Pager';
import { q } from '@/lib/db';
import { cohortFilter, listMonths, monthShort, resolveMonth } from '@/lib/months';
import { fmtDateTime, fmtDelay, fmtSpan, fmtWhen, type Action } from '@/lib/viz';

export const dynamic = 'force-dynamic';

const statuses = ['pending_search', 'monitoring', 'registered', 'window_closed', 'failed'];
const statusLabel: Record<string, string> = {
  pending_search: 'Queued', monitoring: 'Monitoring', registered: 'Registered', window_closed: 'Window closed', failed: 'Failed',
};

const SIZES = [25, 50, 100];
const DEFAULT_SIZE = 25;

// Sortable columns: URL key -> SQL expression (a whitelist, never user text).
const sortSql: Record<string, string> = {
  name: 'd.name',
  group: "COALESCE(r.name, 'Control')",
  action: 'd.assigned_action::text',
  status: 'd.status::text',
  searched: 'd.searched_at',
  registered: 'd.rdap_created_at',
  delay: 'EXTRACT(EPOCH FROM (COALESCE(d.rdap_created_at, d.registered_detected_at) - d.searched_at))',
  cohort: 'd.cohort',
};
const columns: { key: string; label: string; title?: string }[] = [
  { key: 'name', label: 'Domain' },
  { key: 'group', label: 'Group' },
  { key: 'action', label: 'Action' },
  { key: 'status', label: 'Status' },
  { key: 'searched', label: 'Searched (UTC)' },
  { key: 'registered', label: 'Registered (UTC)' },
  { key: 'delay', label: 'Delay', title: 'days hh:mm, or h:mm under a day' },
  { key: 'cohort', label: 'Cohort' },
];

interface Sp { status?: string; registrar?: string; month?: string; sort?: string; dir?: string; page?: string; size?: string }

export default async function Domains({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const { status, registrar } = sp;
  const sel = sp.month ? await resolveMonth(sp.month) : 'all';
  const months = await listMonths();
  const registrars = await q<{ slug: string; name: string }>('SELECT slug, name FROM registrars WHERE enabled ORDER BY id');

  // ---- filters
  const cf = cohortFilter(sel);
  const where: string[] = [cf.sql];
  const params: string[] = [...cf.params];
  if (status && statuses.includes(status)) { params.push(status); where.push(`d.status = $${params.length}::domain_status`); }
  if (registrar === 'control') where.push('d.assigned_registrar_id IS NULL');
  else if (registrar && registrars.some((r) => r.slug === registrar)) { params.push(registrar); where.push(`r.slug = $${params.length}`); }
  const whereSql = 'WHERE ' + where.join(' AND ');

  // ---- sorting and paging (all validated against whitelists)
  const sort = sp.sort && sortSql[sp.sort] ? sp.sort : undefined;
  const dir = sp.dir === 'desc' ? 'desc' : 'asc';
  const orderSql = sort ? `${sortSql[sort]} ${dir.toUpperCase()} NULLS LAST, d.id DESC` : 'd.generated_at DESC, d.id DESC';
  const size = SIZES.includes(Number(sp.size)) ? Number(sp.size) : DEFAULT_SIZE;

  const [{ n: total }] = await q<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM domains d LEFT JOIN registrars r ON r.id = d.assigned_registrar_id ${whereSql}`, params);
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(pages, Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1));
  const offset = (page - 1) * size;

  const rows = await q(
    `SELECT d.name, d.status, d.assigned_action AS action, r.name AS registrar, d.searched_at, to_char(d.cohort, 'YYYY-MM') AS cohort,
            CASE WHEN d.status = 'registered' THEN EXTRACT(EPOCH FROM (COALESCE(d.rdap_created_at, d.registered_detected_at) - d.searched_at)) / 86400 END AS days,
            d.rdap_registrar_name, d.rdap_registrar_iana_id AS iana, d.rdap_created_at, rc.nameservers, rc.last_changed
       FROM domains d LEFT JOIN registrars r ON r.id = d.assigned_registrar_id
       LEFT JOIN LATERAL (
               SELECT c.nameservers,
                      (SELECT e->>'eventDate' FROM jsonb_array_elements(c.raw->'events') e WHERE e->>'eventAction' = 'last changed' LIMIT 1) AS last_changed
                 FROM rdap_checks c WHERE c.domain_id = d.id AND c.registered ORDER BY c.checked_at DESC LIMIT 1
             ) rc ON TRUE
      ${whereSql}
      ORDER BY ${orderSql} LIMIT ${size} OFFSET ${offset}`, params);

  // ---- links: everything lives in the URL; changing a filter or the sort goes back to page 1
  const cur: Record<string, string | undefined> = {
    status, registrar, month: sp.month ? sel : undefined, sort, dir: sort ? dir : undefined,
    size: size !== DEFAULT_SIZE ? String(size) : undefined,
  };
  const link = (over: Record<string, string | undefined>, keepPage = false) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...cur, ...(keepPage ? { page: page > 1 ? String(page) : undefined } : {}), ...over })) if (v) p.set(k, v);
    return `/domains${p.size ? `?${p}` : ''}`;
  };
  const sortHref = (key: string) => link({ sort: key, dir: sort === key && dir === 'asc' ? 'desc' : 'asc', page: undefined });
  const pageHref = (n: number) => link({ page: n > 1 ? String(n) : undefined }, false);

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Open data</span>
        <h1>All names</h1>
        <p className="lede">Every name in the experiment, its group, and its current status. Click a column header to sort.</p>
      </div>

      <MonthPicker basePath="/domains" months={months} selected={sel} extra={{ status, registrar, sort, dir: cur.dir, size: cur.size }} />
      <div className="filters">
        <div className="filters__group">
          <span>Status</span>
          <Link className="chip" href={link({ status: undefined, page: undefined })} aria-current={!status}>All</Link>
          {statuses.map((s) => <Link key={s} className="chip" href={link({ status: s, page: undefined })} aria-current={status === s}>{statusLabel[s]}</Link>)}
        </div>
        <div className="filters__group">
          <span>Group</span>
          <Link className="chip" href={link({ registrar: undefined, page: undefined })} aria-current={!registrar}>All</Link>
          {registrars.map((r) => <Link key={r.slug} className="chip" href={link({ registrar: r.slug, page: undefined })} aria-current={registrar === r.slug}>{r.name}</Link>)}
          <Link className="chip" href={link({ registrar: 'control', page: undefined })} aria-current={registrar === 'control'}>Control</Link>
        </div>
      </div>

      <div className="card card--flush table-wrap">
        {total === 0 ? <p className="empty">No names match these filters.</p> : (
          <table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} title={c.title} aria-sort={sort === c.key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <Link className="sorth" href={sortHref(c.key)}>
                      {c.label}<span className="sorth__arrow" aria-hidden>{sort === c.key ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((d: any) => (
                <tr key={d.name}>
                  <td><Link href={`/domains/${d.name}`}><b>{d.name}</b></Link></td>
                  <td>{d.registrar ?? 'Control'}</td>
                  <td><ActionIcon action={d.action as Action} /></td>
                  <td>
                    <StatusPill status={d.status} />
                    {d.status === 'registered' && (
                      <InfoPop info={{ registrar: d.rdap_registrar_name, iana: d.iana, nameservers: d.nameservers ?? [], registeredAt: d.rdap_created_at ? fmtWhen(d.rdap_created_at) : null, lastChanged: d.last_changed ? fmtWhen(d.last_changed) : null }} />
                    )}
                  </td>
                  <td>{fmtDateTime(d.searched_at)}</td>
                  <td>{d.status === 'registered' ? fmtDateTime(d.rdap_created_at) : <span className="muted">—</span>}</td>
                  <td className="delay" title={d.days != null ? `registered ${fmtSpan(d.days)}` : undefined}>{d.days != null ? fmtDelay(d.days) : <span className="muted">—</span>}</td>
                  <td className="muted"><Link href={`/generation?month=${d.cohort}`}>{monthShort(d.cohort)}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Pager page={page} pages={pages} total={total} from={offset + 1} to={Math.min(total, offset + size)} size={size} sizes={SIZES}
        pageHref={pageHref} sizeHref={(s) => link({ size: s === DEFAULT_SIZE ? undefined : String(s), page: undefined })} />
      {rows.length > 0 && <ActionLegend />}
    </>
  );
}
