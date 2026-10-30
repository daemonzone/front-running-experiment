import { site } from '@/lib/site';

const toc = [
  ['hypothesis', 'Hypothesis'], ['names', 'Names'], ['groups', 'Groups'], ['procedure', 'Procedure'],
  ['measurement', 'Measurement'], ['analysis', 'Analysis'], ['limits', 'Limits'], ['publication', 'Publication'],
];

export default function Method() {
  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Method · version 1 · pre-registered before the first search</span>
        <h1>How the experiment works</h1>
        <p className="lede">Everything below is fixed before any data is collected, so the result can&apos;t be steered afterwards.</p>
      </div>

      <div className="doc">
        <nav className="toc" aria-label="On this page">
          {toc.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
        </nav>

        <div className="prose">
          <h2 id="hypothesis" style={{ marginTop: 0 }}>1. Hypothesis</h2>
          <div className="hyp">
            <div className="card"><span className="tag">H1</span><p>Names searched (or searched and added to a cart) on a registrar&apos;s website are registered more often within {site.monitorDays} days than names never searched.</p></div>
            <div className="card"><span className="tag">H0</span><p>The registration rate does not depend on where, or whether, the name was searched.</p></div>
          </div>

          <h2 id="names">2. Names</h2>
          <ul>
            <li><b>Monthly cohorts.</b> On the 1st of every month, 5 new names are generated for each group, and for the control. Every candidate tried — accepted or rejected — is published on the <a href="/generation">Generation</a> page with its RDAP result.</li>
            <li>Pseudo-words built from random syllables, 6–10 letters, brand-like (mostly <code>.com</code>, some <code>.net</code>/<code>.org</code>).</li>
            <li>A name is only used if the registry&apos;s RDAP service says it is not registered at generation time. RDAP queries go to the registry, never to a registrar.</li>
            <li>A word is never reused under another TLD, so groups can&apos;t contaminate each other.</li>
            <li>Names are not checked for trademarks or meaning. Unrelated third parties may register one for ordinary reasons — that is what the control group measures.</li>
          </ul>

          <h2 id="groups">3. Groups</h2>
          <div className="card card--flush table-wrap" style={{ marginBottom: 16 }}>
            <table>
              <thead><tr><th>Group</th><th>Action</th></tr></thead>
              <tbody>
                <tr><td><b>Search only</b></td><td>The name is searched on one registrar (one group per registrar).</td></tr>
                <tr><td><b>Search + cart</b></td><td>Searched, then added to the cart. The purchase is never completed (one group per registrar).</td></tr>
                <tr><td><b>Control</b></td><td>The name is never typed into any website.</td></tr>
              </tbody>
            </table>
          </div>
          <p>
            Assignment is random but balanced, to keep the groups the same size. The full assignment list is hashed and
            timestamped (OpenTimestamps) <b>before</b> the first search, so it can&apos;t be changed after seeing results. Each
            month&apos;s fingerprint is shown on the Generation page.
          </p>

          <h2 id="procedure">4. Procedure</h2>
          <ul>
            <li>A real browser, from one home internet connection for the whole experiment, a few searches per day with random pauses. No CAPTCHA solving, proxies or disguise.</li>
            <li>Every action is logged with a timestamp, the IP address, a screenshot and its SHA-256 hash. A cart addition that can&apos;t be confirmed is not counted.</li>
            <li>Registrars&apos; terms of service are respected. If a site challenges the browser, the search is done by hand and marked as manual.</li>
          </ul>

          <h2 id="measurement">5. Measurement</h2>
          <ul>
            <li>Every name is checked once a day via RDAP for {site.monitorDays} days; each check is stored with the raw response.</li>
            <li>A name counts as registered when RDAP first returns a record. The registration date, the registrar of record and the nameservers reported by RDAP are stored.</li>
            <li><b>Attribution follows the search, not the registrar of record.</b> A registration is flagged against the registrar where the name was searched. Whoever registers a name can use any registrar, so the registrar of record is kept as information and never decides which registrar a registration is attributed to.</li>
            <li>The delay is the time between our action and the registration date reported by the registry.</li>
          </ul>

          <h2 id="analysis">6. Analysis</h2>
          <ul>
            <li>On the 1st of each month, the previous month&apos;s cohort is <b>consolidated</b>: its results are frozen into a published snapshot with its own fingerprint. Names keep being monitored for their full window afterwards, so later registrations show in the live numbers but not in the snapshot. The headline total always counts every month since the start.</li>
            <li>Per group: names, registrations and rate, compared with the control by a one-sided Fisher exact test.</li>
            <li>Groups are compared across registrars: a pattern that appears in every searched group but not in the control points away from any single registrar.</li>
            <li>Counts come first. With a near-zero control rate, a few registrations in a group can be meaningful; a single one is not. Several groups are tested, so an isolated small p-value is weak evidence.</li>
          </ul>

          <h2 id="limits">7. Limits</h2>
          <ul>
            <li>The data can&apos;t identify who registered a name or why.</li>
            <li>Leaks outside registrars (browser extensions, DNS or network providers, shared tools) are reduced by a clean browser profile but not excluded.</li>
            <li>A small sample can miss a real effect, and a positive result needs replication.</li>
            <li>Websites change. Adapter breakages and manual searches are logged openly.</li>
          </ul>

          <h2 id="publication">8. Publication</h2>
          <p>
            Everything is published whatever the result: code, raw data and timestamp receipts. Before findings about a
            registrar are published, it is given the chance to respond, and its reply is added unedited.
          </p>
        </div>
      </div>
    </>
  );
}
