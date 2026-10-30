import { ActionIcon, ActionLegend } from '@/components/ActionIcon';
import { ArmBars } from '@/components/ArmBars';
import { CumulativeChart } from '@/components/CumulativeChart';
import { StatTile } from '@/components/StatTile';
import { fisherOneSided } from '@/lib/stats';
import { fmtDateTime, fmtDelay, fmtSpan, type Action } from '@/lib/viz';
import type { ArmDatum, SeriesDatum } from '@/lib/viz';

// ILLUSTRATIVE FAKE DATA — nothing on this page is a real result.
// Registrars are anonymised as A/B/C and borrow the chart colors of slots 1-3.
const control = { n: 60, hits: 0 };
const raw: [string, string, ArmDatum['action'], number, number][] = [
  ['namecheap', 'Registrar A', 'search_cart', 40, 6],
  ['namecheap', 'Registrar A', 'search_only', 40, 2],
  ['godaddy', 'Registrar B', 'search_cart', 40, 0],
  ['godaddy', 'Registrar B', 'search_only', 40, 0],
  ['ionos', 'Registrar C', 'search_cart', 40, 1],
  ['ionos', 'Registrar C', 'search_only', 40, 0],
];
const arms: ArmDatum[] = [
  ...raw.map(([colorKey, registrar, action, n, hits]) => ({
    id: `${colorKey}-${action}`, colorKey, registrar, action, n, hits,
    p: fisherOneSided(hits, n - hits, control.hits, control.n - control.hits),
  })),
  { id: 'control', colorKey: 'control', registrar: 'Control', action: 'no_search', n: control.n, hits: control.hits, p: null },
];
const series: SeriesDatum[] = [
  { id: 'namecheap', name: 'Registrar A', colorKey: 'namecheap', n: 80, days: [1.2, 1.9, 2.8, 3.3, 6.1, 9.4, 11.0, 17.5] },
  { id: 'godaddy', name: 'Registrar B', colorKey: 'godaddy', n: 80, days: [] },
  { id: 'ionos', name: 'Registrar C', colorKey: 'ionos', n: 80, days: [41.3] },
  { id: 'control', name: 'Control', colorKey: 'control', n: 60, days: [] },
];
const examples = [
  { d: 'examplealpha.com', reg: 'Registrar A', action: 'search_cart' as Action, registered: '2027-01-12T09:42:00Z', delay: 1.17, via: 'Registrar X' },
  { d: 'examplebeta.com', reg: 'Registrar A', action: 'search_cart' as Action, registered: '2027-01-17T14:05:00Z', delay: 2.8, via: 'Registrar X' },
  { d: 'examplegamma.net', reg: 'Registrar A', action: 'search_only' as Action, registered: '2027-01-24T03:31:00Z', delay: 9.1, via: 'Registrar Y' },
  { d: 'exampledelta.com', reg: 'Registrar C', action: 'search_cart' as Action, registered: '2027-03-19T22:10:00Z', delay: 41.3, via: 'Registrar Z' },
];

export default function Example() {
  return (
    <>
      <div className="notice notice--fake">
        EXAMPLE ONLY — all numbers, names and registrars on this page are invented, to show how results would be
        presented. It says nothing about any real company.
      </div>

      <div className="page-head">
        <span className="eyebrow">Example report · 12/04/2027</span>
        <h1>Results after 90 days</h1>
        <p className="lede">
          In this made-up scenario, names added to the cart at Registrar A were registered by a third party more often than
          control names. The pattern was not seen at Registrars B and C. The data does not show who registered the names or why.
        </p>
      </div>

      <div className="tiles">
        <StatTile label="Names" value={300} hint="6 searched groups + control" />
        <StatTile label="Registered by others" value={9} hint="3.0% overall" />
        <StatTile label="Control registered" value="0 / 60" hint="near-zero baseline" />
        <StatTile label="Started" value="05/01/2027" hint="90-day window" />
      </div>

      <section className="section">
        <div className="section__head"><h2>Share registered, by group</h2></div>
        <div className="card"><ArmBars data={arms} fake /></div>
        <p className="muted" style={{ marginTop: 12, maxWidth: '70ch' }}>
          One-sided Fisher exact test against the control. Six groups were tested, so a single p-value near 0.05 is weak
          evidence on its own; only the Registrar A cart group is clearly separated from the control here.
        </p>
      </section>

      <section className="section">
        <div className="section__head"><h2>Timing</h2></div>
        <div className="card"><CumulativeChart series={series} windowDays={90} observedDays={90} fake /></div>
        <p className="muted" style={{ marginTop: 12, maxWidth: '70ch' }}>
          Registrar A&apos;s registrations cluster in the first days. The single registration at Registrar C came 41 days
          after the search, which is more consistent with an independent registration.
        </p>
      </section>

      <section className="section">
        <div className="section__head"><h2>Registered names (example)</h2></div>
        <div className="card card--flush table-wrap">
          <table>
            <thead><tr><th>Domain</th><th>Searched on</th><th>Action</th><th>Registered (UTC)</th><th title="days hh:mm, or h:mm under a day">Delay</th><th>Registered via</th></tr></thead>
            <tbody>
              {examples.map((e) => (
                <tr key={e.d}><td><b>{e.d}</b></td><td>{e.reg}</td><td><ActionIcon action={e.action} /></td>
                <td>{fmtDateTime(e.registered)}</td><td className="delay" title={`registered ${fmtSpan(e.delay)}`}>{fmtDelay(e.delay)}</td><td>{e.via}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <ActionLegend />
      </section>

      <section className="section prose">
        <h2>How to read this</h2>
        <ul>
          <li>The control group had 0 of 60. That sets a near-zero base rate, so even a few registrations in a group stand out.</li>
          <li>Registrars B and C show no clear effect. If the leak were on the user&apos;s side (an extension, a network), every group would show it.</li>
          <li>This shows an association between searching on a registrar and later registration. It does not prove intent or identify who registered the names.</li>
          <li>The result should be replicated, ideally by someone else with a different connection.</li>
        </ul>

        <h2>Registrar response</h2>
        <div className="notice">
          <span className="muted">
            [Registrar A was sent these findings on 12/04/2027 with a deadline of 26/04/2027. Their reply, unedited, would
            appear here. If there is no reply by the deadline, that is stated here too.]
          </span>
        </div>

        <h2>Verify it yourself</h2>
        <ul>
          <li>Assignment list hash and its OpenTimestamps receipt: <code>manifest-2027-01-04.txt</code> and <code>.ots</code> (example).</li>
          <li>Raw data: <code>domains.csv</code>, <code>search_log.csv</code>, <code>rdap_checks.csv</code>. Each screenshot&apos;s SHA-256 is in <code>search_log.csv</code>.</li>
          <li>Any name can be checked by anyone with an RDAP lookup.</li>
        </ul>
      </section>
    </>
  );
}
