import { site } from '@/lib/site';

export default function Method() {
  return (
    <>
      <h1>Method</h1>
      <p className="muted">Version 1 · pre-registered before the first search</p>

      <h2>1. Hypothesis</h2>
      <p>
        <b>H1:</b> names searched (or searched and added to a cart) on a registrar&apos;s website are registered more
        often within {site.monitorDays} days than names never searched.
        <br /><b>H0:</b> the registration rate does not depend on where, or whether, the name was searched.
      </p>

      <h2>2. Names</h2>
      <ul>
        <li>Pseudo-words built from random syllables, 6–10 letters, brand-like (mostly <code>.com</code>, some <code>.net</code>/<code>.org</code>).</li>
        <li>A name is only used if the registry&apos;s RDAP service reports it as not registered at generation time. RDAP queries go to the registry, never to a registrar.</li>
        <li>A word is never reused under another TLD, so groups can&apos;t contaminate each other.</li>
        <li>Names are not checked for trademarks or meaning. Registration by an unrelated third party for ordinary reasons is possible, which is what the control group measures.</li>
      </ul>

      <h2>3. Groups</h2>
      <table>
        <thead><tr><th>Group</th><th>Action</th></tr></thead>
        <tbody>
          <tr><td>Search only</td><td>The name is searched on one registrar (one group per registrar).</td></tr>
          <tr><td>Search + cart</td><td>Searched, then added to the cart. The purchase is never completed (one group per registrar).</td></tr>
          <tr><td>Control</td><td>The name is never typed into any website.</td></tr>
        </tbody>
      </table>
      <p>
        Assignment is random, balanced to keep the groups the same size. The full assignment list is hashed and
        timestamped (OpenTimestamps) <b>before</b> the first search, so it can&apos;t be changed after seeing results.
      </p>

      <h2>4. Procedure</h2>
      <ul>
        <li>A real browser, from one home internet connection for the whole experiment, a few searches per day with random pauses. No CAPTCHA solving, proxies or disguise.</li>
        <li>Every action is logged with a timestamp, the IP address, a screenshot and the screenshot&apos;s SHA-256 hash. A cart addition that can&apos;t be confirmed is not counted.</li>
        <li>Registrars&apos; terms of service are respected. If a site challenges the browser, the search is done by hand and marked as manual.</li>
      </ul>

      <h2>5. Measurement</h2>
      <ul>
        <li>Every name is checked once a day via RDAP for {site.monitorDays} days. Each check is stored with the raw response.</li>
        <li>A name counts as registered when RDAP first returns a record. We store the registration date and the registrar reported by RDAP.</li>
        <li>The delay is the time between our action and the registration date reported by the registry.</li>
      </ul>

      <h2>6. Analysis</h2>
      <ul>
        <li>For each group: names, registrations and rate, compared with the control group by a one-sided Fisher exact test.</li>
        <li>Groups are compared across registrars: a leak that appears in every searched group, but not in the control, points away from any single registrar.</li>
        <li>Results are reported as counts first. With a near-zero control rate, a few registrations in a group can be meaningful, a single one is not. Multiple groups are tested, so an isolated small p-value is weak evidence.</li>
      </ul>

      <h2>7. Limits</h2>
      <ul>
        <li>The data can&apos;t identify who registered a name or why.</li>
        <li>Possible leaks outside registrars (browser extensions, DNS or network providers, shared tools) are reduced by a clean browser profile, but not excluded.</li>
        <li>A small sample can miss a real effect. A positive result needs replication.</li>
        <li>Websites change. Adapter breakages and manual searches are logged openly.</li>
      </ul>

      <h2>8. Publication</h2>
      <p>
        Everything is published whatever the result, including the code, the raw data and the timestamp receipts.
        Before publishing findings about a registrar, it is given the chance to respond and its reply is added unedited.
      </p>
    </>
  );
}
