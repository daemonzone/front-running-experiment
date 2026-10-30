import { fisherOneSided } from '@/lib/stats';

// ILLUSTRATIVE FAKE DATA — nothing on this page is a real result.
const arms = [
  { reg: 'Registrar A', action: 'search + cart', n: 40, hits: 6 },
  { reg: 'Registrar A', action: 'search only', n: 40, hits: 2 },
  { reg: 'Registrar B', action: 'search + cart', n: 40, hits: 0 },
  { reg: 'Registrar B', action: 'search only', n: 40, hits: 0 },
  { reg: 'Registrar C', action: 'search + cart', n: 40, hits: 1 },
  { reg: 'Registrar C', action: 'search only', n: 40, hits: 0 },
];
const control = { n: 60, hits: 0 };
const examples = [
  { d: 'examplealpha.com', reg: 'Registrar A', action: 'search + cart', delay: '1d 4h', via: 'Registrar X' },
  { d: 'examplebeta.com', reg: 'Registrar A', action: 'search + cart', delay: '2d 19h', via: 'Registrar X' },
  { d: 'examplegamma.net', reg: 'Registrar A', action: 'search only', delay: '9d 2h', via: 'Registrar Y' },
  { d: 'exampledelta.com', reg: 'Registrar C', action: 'search + cart', delay: '41d 7h', via: 'Registrar Z' },
];

export default function Example() {
  return (
    <>
      <div className="banner">
        EXAMPLE ONLY — ALL NUMBERS, NAMES AND REGISTRARS ON THIS PAGE ARE INVENTED. It shows how results would be
        presented. It says nothing about any real company.
      </div>

      <h1>Results after 90 days (example)</h1>
      <p className="muted">Experiment start: 2027-01-05 · report date: 2027-04-12 · 300 names · 6 searched groups + control</p>

      <h2>Summary</h2>
      <p>
        In this made-up scenario, names added to the cart at Registrar A were registered by a third party more often
        than control names. The pattern was not seen at Registrars B and C. The data does not show who registered the
        names or why.
      </p>

      <h2>Results by group</h2>
      <table>
        <thead>
          <tr><th>Registrar</th><th>Action</th><th className="n">Names</th><th className="n">Registered</th><th className="n">Rate</th><th className="n">p vs. control</th></tr>
        </thead>
        <tbody>
          {arms.map((a) => {
            const p = fisherOneSided(a.hits, a.n - a.hits, control.hits, control.n - control.hits);
            return (
              <tr key={a.reg + a.action}>
                <td>{a.reg}</td><td>{a.action}</td><td className="n">{a.n}</td>
                <td className={`n ${a.hits ? 'hit' : ''}`}>{a.hits}</td>
                <td className="n">{((100 * a.hits) / a.n).toFixed(1)}%</td>
                <td className="n">{p.toFixed(3)}</td>
              </tr>
            );
          })}
          <tr><td><i>Control</i></td><td>never searched</td><td className="n">{control.n}</td><td className="n">{control.hits}</td><td className="n">0.0%</td><td className="n">—</td></tr>
        </tbody>
      </table>
      <p className="muted">
        One-sided Fisher exact test against the control. Six groups were tested, so a single p-value near 0.05 is weak
        evidence on its own; only the Registrar A cart group is clearly separated from the control here.
      </p>

      <h2>Registered names (example)</h2>
      <table>
        <thead><tr><th>Domain</th><th>Searched on</th><th>Action</th><th>Delay</th><th>Registered via</th></tr></thead>
        <tbody>
          {examples.map((e) => (
            <tr key={e.d}><td>{e.d}</td><td>{e.reg}</td><td>{e.action}</td><td>{e.delay}</td><td>{e.via}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="muted">The last row is 41 days after the search, which is more consistent with an independent registration than the quick ones.</p>

      <h2>How to read this</h2>
      <ul>
        <li>The control group had 0 of 60. That sets a near-zero base rate, so even a few registrations in a group stand out.</li>
        <li>Registrars B and C show no clear effect. If the leak were on the user&apos;s side (an extension, a network), every group would show it.</li>
        <li>This shows an association between searching on a registrar and later registration. It does not prove intent or identify who registered the names.</li>
        <li>The result should be replicated, ideally by someone else with a different connection.</li>
      </ul>

      <h2>Registrar response</h2>
      <div className="callout">
        <p className="muted">
          [Registrar A was sent these findings on 2027-04-12 with a deadline of 2027-04-26. Their reply, unedited, would
          appear here. If there is no reply by the deadline, that is stated here too.]
        </p>
      </div>

      <h2>Verify it yourself</h2>
      <ul>
        <li>Assignment list hash and its OpenTimestamps receipt: <code>manifest-2027-01-04.txt</code>, <code>.ots</code> (example).</li>
        <li>Raw data: <code>domains.csv</code>, <code>search_log.csv</code>, <code>rdap_checks.csv</code>. Each screenshot&apos;s SHA-256 is in <code>search_log.csv</code>.</li>
        <li>Any name can be checked by anyone with an RDAP lookup.</li>
      </ul>
    </>
  );
}
