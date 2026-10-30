import Link from 'next/link';
import { ActionIcon, ActionLegend } from '@/components/ActionIcon';
import { MonthPicker } from '@/components/MonthPicker';
import { OutcomePill } from '@/components/Pill';
import { StatTile } from '@/components/StatTile';
import { q } from '@/lib/db';
import { currentMonthKey, listMonths, monthLabel, nextMonthStart, resolveMonth } from '@/lib/months';
import { actionLabel, fmtDate, type Action } from '@/lib/viz';

export const dynamic = 'force-dynamic';

export default async function Generation({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const months = await listMonths();
  const resolved = await resolveMonth(sp.month);
  const sel = resolved === 'all' ? currentMonthKey() : resolved; // one cohort at a time
  const date = `${sel}-01`;

  const [cohort] = await q(
    `SELECT month, names_per_arm, generated_at, assignments_sha256, consolidated_at FROM cohorts WHERE month = $1::date`, [date]);
  const perArm: number = cohort?.names_per_arm ?? 5;

  const candidates = await q(
    `SELECT c.id, c.name, c.recipe, c.outcome, c.http_status, c.rdap_url, c.checked_at, c.error,
            d.assigned_action AS action, r.name AS registrar
       FROM name_candidates c
       LEFT JOIN domains d ON d.id = c.domain_id
       LEFT JOIN registrars r ON r.id = d.assigned_registrar_id
      WHERE c.cohort = $1::date ORDER BY c.id`, [date]);

  const registrars = await q<{ id: number; name: string; supports_cart: boolean }>('SELECT id, name, supports_cart FROM registrars WHERE enabled ORDER BY id');
  const assigned = await q<{ name: string; action: Action; rid: number | null; status: string }>(
    `SELECT name, assigned_action AS action, assigned_registrar_id AS rid, status FROM domains WHERE cohort = $1::date ORDER BY name`, [date]);

  const groups: { key: string; title: string; action: Action; rid: number | null }[] = [];
  for (const r of registrars) {
    groups.push({ key: `${r.id}-so`, title: r.name, action: 'search_only', rid: r.id });
    if (r.supports_cart) groups.push({ key: `${r.id}-sc`, title: r.name, action: 'search_cart', rid: r.id });
  }
  groups.push({ key: 'ctl', title: 'Control', action: 'no_search', rid: null });

  const [snap] = await q(`SELECT taken_at, total_names, total_registered, arms, registered, sha256 FROM cohort_snapshots WHERE cohort = $1::date`, [date]);

  const count = (o: string) => candidates.filter((c: any) => c.outcome === o).length;
  const next = nextMonthStart(sel);

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Transparency · name generation</span>
        <h1>How the names were chosen</h1>
        <p className="lede">
          Every month, on the 1st, {perArm} brand-style names — built from real words and roots, like <i>kleos + hq</i> — are generated for each group — each registrar × action, and the
          never-searched control. Every candidate is checked against the registry (RDAP) and listed here, including the
          ones that were rejected.
        </p>
      </div>

      <MonthPicker basePath="/generation" months={months} selected={sel} />

      {!cohort ? (
        <div className="card empty">
          <b>No names generated for {monthLabel(sel)} yet.</b>
          <p style={{ margin: '6px 0 0' }}>Generation runs automatically on the 1st of the month.</p>
        </div>
      ) : (
        <>
          <div className="tiles">
            <StatTile label="Cohort" value={monthLabel(sel)} hint={cohort.generated_at ? `generated ${fmtDate(cohort.generated_at, true)}` : 'generation incomplete'} />
            <StatTile label="Names selected" value={assigned.length} hint={`target ${perArm} × ${groups.length} groups`} />
            <StatTile label="Candidates tested" value={candidates.length} hint={`${count('already_registered')} rejected: already registered`} />
            <StatTile label="Consolidated" value={cohort.consolidated_at ? fmtDate(cohort.consolidated_at) : '—'} hint={cohort.consolidated_at ? 'results snapshot taken' : `on ${fmtDate(next)}`} />
          </div>

          {cohort.assignments_sha256 && (
            <div className="notice">
              <b>Pre-registration fingerprint.</b> SHA-256 of this month&apos;s final assignment list (name, action, registrar):{' '}
              <code style={{ wordBreak: 'break-all' }}>{cohort.assignments_sha256}</code>
            </div>
          )}

          <section className="section">
            <div className="section__head">
              <div><h2>Assignment to groups</h2><p>Each valid name was assigned at random to a group that still needed names. Target: {perArm} per group.</p></div>
            </div>
            <div className="grid-3">
              {groups.map((g) => {
                const names = assigned.filter((a) => a.action === g.action && a.rid === g.rid);
                return (
                  <div key={g.key} className="card">
                    <div className="group-head">
                      <h3>{g.title}</h3>
                      <span className="pill pill--quiet">{names.length} / {perArm}</span>
                    </div>
                    <p className="muted" style={{ margin: '2px 0 10px', fontSize: 13.5 }}>{actionLabel[g.action]}</p>
                    {names.length === 0 ? <p className="muted" style={{ margin: 0 }}>—</p> : (
                      <ul className="namelist">
                        {names.map((n) => <li key={n.name}><Link href={`/domains/${n.name}`}>{n.name}</Link></li>)}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="section">
            <div className="section__head">
              <div>
                <h2>Every candidate tested</h2>
                <p>
                  In order of generation. {count('available')} available · {count('already_registered')} already registered ·{' '}
                  {count('duplicate_label')} duplicate words · {count('inconclusive')} inconclusive. &quot;Verify&quot; opens the registry&apos;s own
                  RDAP answer (it reflects today&apos;s state, so a name accepted here may show as registered later).
                </p>
              </div>
            </div>
            <div className="card card--flush table-wrap">
              <table>
                <thead><tr><th className="n">#</th><th>Candidate</th><th>Built from</th><th>RDAP result</th><th>HTTP</th><th>Checked (UTC)</th><th>Assigned to</th><th></th></tr></thead>
                <tbody>
                  {candidates.map((c: any, i: number) => (
                    <tr key={c.id}>
                      <td className="n muted">{i + 1}</td>
                      <td><b>{c.name}</b></td>
                      <td className="muted">{c.recipe ?? '—'}</td>
                      <td><OutcomePill outcome={c.outcome} /></td>
                      <td>{c.http_status ?? '—'}</td>
                      <td>{c.checked_at ? fmtDate(c.checked_at, true) : '—'}</td>
                      <td>{c.action ? <>{c.registrar ?? 'Control'} <ActionIcon action={c.action as Action} /></> : <span className="muted">not used</span>}</td>
                      <td>{c.rdap_url ? <a href={c.rdap_url} target="_blank" rel="noreferrer">Verify ↗</a> : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ActionLegend />
          </section>

          <section className="section">
            <div className="section__head">
              <div>
                <h2>Month-end snapshot</h2>
                <p>On the 1st of the following month the cohort&apos;s results are frozen and published here. Names keep being monitored for their whole window afterwards, so the live numbers can still grow.</p>
              </div>
            </div>
            {snap ? (
              <div className="card card--flush table-wrap">
                <table>
                  <thead><tr><th>Registrar</th><th>Action</th><th className="n">Names</th><th className="n">Registered</th><th className="n">Still monitoring</th></tr></thead>
                  <tbody>
                    {snap.arms.map((a: any, i: number) => (
                      <tr key={i}><td>{a.registrar}</td><td>{actionLabel[a.action as Action]}</td><td className="n">{a.names}</td><td className="n">{a.registered}</td><td className="n">{a.monitoring}</td></tr>
                    ))}
                  </tbody>
                </table>
                <p className="muted" style={{ padding: '12px 16px', margin: 0, fontSize: 13.5 }}>
                  Taken {fmtDate(snap.taken_at, true)} · {snap.total_registered} of {snap.total_names} registered at that time · snapshot SHA-256{' '}
                  <code style={{ wordBreak: 'break-all' }}>{snap.sha256}</code>
                </p>
              </div>
            ) : (
              <div className="card empty">Not consolidated yet. The snapshot will be taken on {fmtDate(next)}.</div>
            )}
          </section>
        </>
      )}
    </>
  );
}
