import Link from 'next/link';
import { ArmBars } from '@/components/ArmBars';
import { CaseStudy } from '@/components/CaseStudy';
import { CumulativeChart } from '@/components/CumulativeChart';
import { MonthPicker } from '@/components/MonthPicker';
import { StatTile } from '@/components/StatTile';
import { IconClock, IconEye, IconNames, IconShield } from '@/components/icons';
import { kleoshq } from '@/lib/cases';
import { q } from '@/lib/db';
import { fetchRdap } from '@/lib/rdap';
import { cohortFilter, listMonths, monthLabel, resolveMonth } from '@/lib/months';
import { fisherOneSided } from '@/lib/stats';
import { actionLabel, fmtDate, fmtSpan, type Action, type ArmDatum, type SeriesDatum } from '@/lib/viz';
import { site } from '@/lib/site';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sel = await resolveMonth((await searchParams).month);
  const caseRdap = await fetchRdap(kleoshq.domain);
  const months = await listMonths();
  const f = cohortFilter(sel);
  const scope = sel === 'all' ? 'all months' : monthLabel(sel);

  // Experiment-wide totals (always all months): these feed the hero box.
  const [all] = await q<{ total: number; registered: number; active: number }>(
    `SELECT COUNT(*)::int AS total,
            (COUNT(*) FILTER (WHERE status = 'registered'))::int AS registered,
            (COUNT(*) FILTER (WHERE status IN ('monitoring','pending_search')))::int AS active
       FROM domains`);
  const [firstCohort] = await q<{ first: Date | null }>('SELECT MIN(month) AS first FROM cohorts');

  const armRows = await q<{ slug: string | null; name: string | null; action: Action; n: number; hits: number }>(
    `SELECT r.slug, r.name, d.assigned_action AS action, COUNT(*)::int AS n,
            (COUNT(*) FILTER (WHERE d.status = 'registered'))::int AS hits
       FROM domains d LEFT JOIN registrars r ON r.id = d.assigned_registrar_id
      WHERE ${f.sql}
      GROUP BY r.id, r.slug, r.name, d.assigned_action
      ORDER BY r.id NULLS LAST, d.assigned_action DESC`, f.params);
  const control = armRows.find((a) => a.action === 'no_search');
  const arms: ArmDatum[] = armRows.map((a) => ({
    id: `${a.slug ?? 'control'}-${a.action}`,
    colorKey: a.slug ?? 'control',
    registrar: a.name ?? 'Control',
    action: a.action,
    n: a.n,
    hits: a.hits,
    p: a.action !== 'no_search' && control ? fisherOneSided(a.hits, a.n - a.hits, control.hits, control.n - control.hits) : null,
  }));

  const delays = await q<{ slug: string; days: number }>(
    `SELECT COALESCE(r.slug, 'control') AS slug,
            GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(d.rdap_created_at, d.registered_detected_at) - d.searched_at)) / 86400)::float AS days
       FROM domains d LEFT JOIN registrars r ON r.id = d.assigned_registrar_id
      WHERE d.status = 'registered' AND d.searched_at IS NOT NULL AND ${f.sql}`, f.params);
  const groups = new Map<string, SeriesDatum>();
  for (const a of arms) {
    const g = groups.get(a.colorKey) ?? { id: a.colorKey, name: a.registrar, colorKey: a.colorKey, days: [], n: 0 };
    g.n += a.n;
    groups.set(a.colorKey, g);
  }
  for (const d of delays) groups.get(d.slug)?.days.push(d.days);

  const [t] = await q<{ total: number; active: number; registered: number; last_check: Date | null; age: number | null }>(
    `SELECT COUNT(*)::int AS total,
            (COUNT(*) FILTER (WHERE d.status IN ('monitoring','pending_search')))::int AS active,
            (COUNT(*) FILTER (WHERE d.status = 'registered'))::int AS registered,
            (SELECT MAX(checked_at) FROM rdap_checks) AS last_check,
            EXTRACT(EPOCH FROM (now() - MIN(d.searched_at))) / 86400 AS age
       FROM domains d WHERE ${f.sql}`, f.params);

  const hits = await q(
    `SELECT d.name, d.assigned_action AS action, r.name AS registrar, d.searched_at, d.rdap_registrar_name,
            EXTRACT(EPOCH FROM (COALESCE(d.rdap_created_at, d.registered_detected_at) - d.searched_at)) / 86400 AS days
       FROM domains d LEFT JOIN registrars r ON r.id = d.flagged_registrar_id
      WHERE d.status = 'registered' AND ${f.sql} ORDER BY d.registered_detected_at DESC LIMIT 25`, f.params);

  const via = await q<{ via: string | null; n: number }>(
    `SELECT d.rdap_registrar_name AS via, COUNT(*)::int AS n
       FROM domains d WHERE d.status = 'registered' AND ${f.sql}
      GROUP BY d.rdap_registrar_name ORDER BY n DESC`, f.params);

  const history = await q(
    `SELECT to_char(c.month, 'YYYY-MM') AS month, c.consolidated_at, c.generated_at,
            COUNT(d.id)::int AS names,
            (COUNT(d.id) FILTER (WHERE d.status = 'registered'))::int AS registered,
            (COUNT(d.id) FILTER (WHERE d.status IN ('monitoring','pending_search')))::int AS monitoring
       FROM cohorts c LEFT JOIN domains d ON d.cohort = c.month
      GROUP BY c.month ORDER BY c.month DESC`);

  return (
    <>
      <section className="hero">
        <div className="hero__copy">
          <span className="eyebrow">Open experiment · live data</span>
          <h1>Do registrars register names <span className="grad-text">after you search for them?</span></h1>
          <p className="lede">
            A suspicion, tested. Every month, new unregistered, randomly generated names are searched on different
            registrars — or never — and then watched daily in the public registry data. Every result is published,
            whatever it shows.
          </p>
          <div className="btn-row">
            <Link className="btn btn--primary" href="/method">Read the method</Link>
            <Link className="btn" href="/generation">How names are chosen</Link>
            <a className="btn" href="/api/export?table=domains">Download CSV</a>
          </div>
        </div>
        <aside className="hero-fig" aria-label="Names registered by someone else, since the beginning of the experiment">
          <div className="hero-fig__label">Registered by someone else so far</div>
          <div className="hero-fig__value">{all.registered}</div>
          <div className="hero-fig__hint">
            total since the beginning of the experiment{firstCohort?.first && <> ({fmtDate(firstCohort.first)})</>}
            <br />
            out of {all.total} names · {all.active} still being watched
            {sel !== 'all' && <> · {t.registered} of them in {scope}</>}
          </div>
        </aside>
      </section>

      <CaseStudy domain={kleoshq.domain} searches={kleoshq.searches} rdap={caseRdap} />

      <MonthPicker basePath="/" months={months} selected={sel} />

      <div className="tiles">
        <StatTile label={`Names · ${sel === 'all' ? 'all time' : monthLabel(sel)}`} value={t.total} hint={`${t.registered} registered`} icon={<IconNames />} />
        <StatTile label="Being monitored" value={t.active} hint={`${site.monitorDays}-day window each`} icon={<IconEye />} />
        <StatTile label="Last registry check" value={t.last_check ? fmtDate(t.last_check) : '—'} hint={t.last_check ? new Date(t.last_check).toISOString().slice(11, 16) + ' UTC' : 'no check yet'} icon={<IconClock />} />
        <StatTile label="Control names registered" value={control ? `${control.hits} / ${control.n}` : '—'} hint="never-searched baseline" icon={<IconShield />} />
      </div>

      <section className="section">
        <div className="section__head">
          <div>
            <h2>Share of names registered, by group · {scope}</h2>
            <p>
              Each bar is one group of names. The control group — never searched anywhere — shows how often a name like
              these is registered anyway. Hover a bar for the numbers and the test against the control.
            </p>
          </div>
        </div>
        <div className="card">
          {arms.length ? <ArmBars data={arms} /> : (
            <p className="empty">No names for {scope} yet. Each month&apos;s names are generated on the 1st — see <Link href="/generation">Generation</Link>.</p>
          )}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <div>
            <h2>When do registrations happen? · {scope}</h2>
            <p>Cumulative registered names, by days elapsed since the search (or since monitoring started, for the control).</p>
          </div>
        </div>
        <div className="card">
          <CumulativeChart series={[...groups.values()]} windowDays={site.monitorDays} observedDays={t.age ?? 1} />
        </div>
      </section>

      <section className="section">
        <div className="section__head"><h2>Registered names · {scope}</h2><Link href={`/domains?status=registered${sel === 'all' ? '&month=all' : `&month=${sel}`}`}>View all →</Link></div>
        <div className="card card--flush table-wrap">
          {hits.length === 0 ? (
            <p className="empty">None so far. This table fills in as the registry reports registrations.</p>
          ) : (
            <table>
              <thead><tr><th>Domain</th><th>Searched on</th><th>Action</th><th>Searched</th><th>Timespan</th><th>Registered via</th></tr></thead>
              <tbody>
                {hits.map((h: any) => (
                  <tr key={h.name}>
                    <td><Link href={`/domains/${h.name}`}><b>{h.name}</b></Link></td>
                    <td>{h.registrar ?? 'Control'}</td>
                    <td>{actionLabel[h.action as Action]}</td>
                    <td>{fmtDate(h.searched_at)}</td>
                    <td>registered {fmtSpan(h.days)}</td>
                    <td>{h.rdap_registrar_name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {via.length > 0 && (
          <p className="muted via">
            Registrar of record for these names (information only — names are attributed to where they were searched):{' '}
            {via.map((v) => <span key={v.via ?? 'unknown'} className="chip">{v.via ?? 'unknown'} · {v.n}</span>)}
          </p>
        )}
      </section>

      <section className="section">
        <div className="section__head">
          <div><h2>Month by month</h2><p>One cohort per month. Each is frozen into a published snapshot on the 1st of the following month.</p></div>
        </div>
        <div className="card card--flush table-wrap">
          {history.length === 0 ? <p className="empty">No cohort yet. The first one is generated on the 1st of the month.</p> : (
            <table>
              <thead><tr><th>Month</th><th className="n">Names</th><th className="n">Registered (live)</th><th className="n">Monitoring</th><th>Consolidated</th><th></th></tr></thead>
              <tbody>
                {history.map((h: any) => (
                  <tr key={h.month}>
                    <td><b>{monthLabel(h.month)}</b></td>
                    <td className="n">{h.names}</td>
                    <td className="n">{h.registered}</td>
                    <td className="n">{h.monitoring}</td>
                    <td>{h.consolidated_at ? fmtDate(h.consolidated_at) : <span className="muted">pending</span>}</td>
                    <td><Link href={`/?month=${h.month}`}>Results</Link> · <Link href={`/generation?month=${h.month}`}>Names</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="section">
        <div className="section__head"><h2>How it works</h2></div>
        <div className="grid-3">
          <div className="card step"><span className="step__num">1</span><h3>Generate monthly</h3><p>On the 1st, brand-like names that the registry itself says are free — 5 per group, every candidate logged. Each is randomly assigned to a group, and the assignment is fingerprinted.</p></div>
          <div className="card step"><span className="step__num">2</span><h3>Search</h3><p>A real browser searches a few names a day, like a person would — some also added to the cart, never purchased. Control names are never typed anywhere.</p></div>
          <div className="card step"><span className="step__num">3</span><h3>Watch &amp; consolidate</h3><p>Every day the public registry (RDAP) is asked about each name. A newly registered name is flagged against the registrar it was searched on. Each month is frozen into a snapshot.</p></div>
        </div>
      </section>
    </>
  );
}
