import Link from 'next/link';
import { ArmBars } from '@/components/ArmBars';
import { CumulativeChart } from '@/components/CumulativeChart';
import { StatTile } from '@/components/StatTile';
import { q } from '@/lib/db';
import { fisherOneSided } from '@/lib/stats';
import { actionLabel, fmtDate, fmtDelay, type Action, type ArmDatum, type SeriesDatum } from '@/lib/viz';
import { site } from '@/lib/site';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const armRows = await q<{ slug: string | null; name: string | null; action: Action; n: number; hits: number }>(
    `SELECT r.slug, r.name, d.assigned_action AS action, COUNT(*)::int AS n,
            (COUNT(*) FILTER (WHERE d.status = 'registered'))::int AS hits
       FROM domains d LEFT JOIN registrars r ON r.id = d.assigned_registrar_id
      GROUP BY r.id, r.slug, r.name, d.assigned_action
      ORDER BY r.id NULLS LAST, d.assigned_action DESC`);
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
      WHERE d.status = 'registered' AND d.searched_at IS NOT NULL`);
  const groups = new Map<string, SeriesDatum>();
  for (const a of arms) {
    const g = groups.get(a.colorKey) ?? { id: a.colorKey, name: a.registrar, colorKey: a.colorKey, days: [], n: 0 };
    g.n += a.n;
    groups.set(a.colorKey, g);
  }
  for (const d of delays) groups.get(d.slug)?.days.push(d.days);

  const [t] = await q<{ total: number; active: number; registered: number; first: Date | null; last_check: Date | null; age: number | null }>(
    `SELECT COUNT(*)::int AS total,
            (COUNT(*) FILTER (WHERE status IN ('monitoring','pending_search')))::int AS active,
            (COUNT(*) FILTER (WHERE status = 'registered'))::int AS registered,
            MIN(searched_at) AS first,
            (SELECT MAX(checked_at) FROM rdap_checks) AS last_check,
            EXTRACT(EPOCH FROM (now() - MIN(searched_at))) / 86400 AS age
       FROM domains`);

  const hits = await q(
    `SELECT d.name, d.assigned_action AS action, r.name AS registrar, d.searched_at, d.rdap_registrar_name,
            EXTRACT(EPOCH FROM (COALESCE(d.rdap_created_at, d.registered_detected_at) - d.searched_at)) / 86400 AS days
       FROM domains d LEFT JOIN registrars r ON r.id = d.flagged_registrar_id
      WHERE d.status = 'registered' ORDER BY d.registered_detected_at DESC LIMIT 25`);

  return (
    <>
      <section className="hero">
        <div className="hero__copy">
          <span className="eyebrow">Open experiment · live data</span>
          <h1>Do registrars register names after you search for them?</h1>
          <p className="lede">
            A suspicion, tested. Unregistered, randomly generated names are searched on different registrars — or never —
            and then watched daily in the public registry data. Every result is published, whatever it shows.
          </p>
          <div className="btn-row">
            <Link className="btn btn--primary" href="/method">Read the method</Link>
            <Link className="btn" href="/domains">Browse all names</Link>
            <a className="btn" href="/api/export?table=domains">Download CSV</a>
          </div>
        </div>
        <aside className="hero-fig" aria-label="Names registered by someone else">
          <div className="hero-fig__label">Registered by someone else so far</div>
          <div className="hero-fig__value">{t.registered}</div>
          <div className="hero-fig__hint">
            out of {t.total} names · {t.active} still being watched
            {t.age != null && <> · running for {Math.floor(t.age)} days</>}
          </div>
        </aside>
      </section>

      <div className="tiles">
        <StatTile label="Names in the experiment" value={t.total} hint={`started ${t.first ? fmtDate(t.first) : site.startDate}`} />
        <StatTile label="Being monitored" value={t.active} hint={`${site.monitorDays}-day window each`} />
        <StatTile label="Last registry check" value={t.last_check ? fmtDate(t.last_check) : '—'} hint={t.last_check ? new Date(t.last_check).toISOString().slice(11, 16) + ' UTC' : 'no check yet'} />
        <StatTile label="Control names registered" value={control ? `${control.hits} / ${control.n}` : '—'} hint="never-searched baseline" />
      </div>

      <section className="section">
        <div className="section__head">
          <div>
            <h2>Share of names registered, by group</h2>
            <p>
              Each bar is one group of names. The control group — never searched anywhere — shows how often a name like
              these is registered anyway. Hover a bar for the numbers and the test against the control.
            </p>
          </div>
        </div>
        <div className="card">
          {arms.length ? <ArmBars data={arms} /> : <p className="empty">No names yet. Generate a batch to start the experiment.</p>}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <div>
            <h2>When do registrations happen?</h2>
            <p>Cumulative registered names, by days elapsed since the search (or since monitoring started, for the control).</p>
          </div>
        </div>
        <div className="card">
          <CumulativeChart series={[...groups.values()]} windowDays={site.monitorDays} observedDays={t.age ?? 1} />
        </div>
      </section>

      <section className="section">
        <div className="section__head"><h2>Registered names</h2><Link href="/domains?status=registered">View all →</Link></div>
        <div className="card card--flush table-wrap">
          {hits.length === 0 ? (
            <p className="empty">None so far. This table fills in as the registry reports registrations.</p>
          ) : (
            <table>
              <thead><tr><th>Domain</th><th>Searched on</th><th>Action</th><th>Searched</th><th className="n">Delay</th><th>Registered via</th></tr></thead>
              <tbody>
                {hits.map((h: any) => (
                  <tr key={h.name}>
                    <td><Link href={`/domains/${h.name}`}><b>{h.name}</b></Link></td>
                    <td>{h.registrar ?? 'Control'}</td>
                    <td>{actionLabel[h.action as Action]}</td>
                    <td>{fmtDate(h.searched_at)}</td>
                    <td className="n">{fmtDelay(h.days)}</td>
                    <td>{h.rdap_registrar_name ?? '—'}</td>
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
          <div className="card step"><span className="step__num">1</span><h3>Generate</h3><p>Brand-like names that the registry itself says are free. Each is randomly assigned to a group, and the assignment is fingerprinted before any search.</p></div>
          <div className="card step"><span className="step__num">2</span><h3>Search</h3><p>A real browser searches a few names a day, like a person would — some also added to the cart, never purchased. Control names are never typed anywhere.</p></div>
          <div className="card step"><span className="step__num">3</span><h3>Watch</h3><p>Every day the public registry (RDAP) is asked about each name. A newly registered name is flagged against the registrar it was searched on.</p></div>
        </div>
      </section>
    </>
  );
}
