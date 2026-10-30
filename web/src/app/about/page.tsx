import Link from 'next/link';
import { site } from '@/lib/site';

export default function About() {
  return (
    <>
      <h1>Do registrars register names after you search for them?</h1>
      <p className="muted">An independent experiment · started {site.startDate}</p>

      <div className="callout">
        <b>This is a test of a suspicion, not an accusation.</b> Some people report that a domain name they searched
        for on a registrar&apos;s website was registered by someone else shortly afterwards. The practice is known as
        &quot;domain front running&quot;. Anecdotes can&apos;t distinguish it from coincidence, so this project measures it.
      </div>

      <h2>The question</h2>
      <p>
        If you search for an unregistered domain name (or add it to your cart) on a registrar&apos;s website, is that
        name more likely to be registered by a third party in the following weeks than a comparable name that nobody
        searched for?
      </p>

      <h2>What this project does</h2>
      <ul>
        <li>Generates brand-like names that are not registered (checked with the registry, not with a registrar).</li>
        <li>Randomly assigns each name to one of a few groups: searched on registrar X, searched and added to the cart on registrar X, or never searched (control).</li>
        <li>Performs the searches exactly like a visitor would, a few per day.</li>
        <li>Checks the public registry data (RDAP) every day to see which names become registered, and when.</li>
        <li>Publishes all the data and the method, whatever the result is.</li>
      </ul>

      <h2>What it can and can&apos;t show</h2>
      <ul>
        <li><b>Can show:</b> whether names in one group are registered noticeably more often than in the control group.</li>
        <li><b>Can&apos;t show:</b> <i>who</i> registered a name, why, or whether anyone at a registrar did anything deliberately. A leak could also come from somewhere else: a browser extension, a network or DNS provider, or another service the page uses. That is why the groups for different registrars are compared with each other and with the control.</li>
        <li>A result that is small, mixed or negative is a valid result and will be published just as prominently.</li>
      </ul>

      <h2>Who is behind this</h2>
      <p>
        {site.author}, an independent individual. No affiliation with, or compensation from, any registrar or
        competitor. Comments, corrections and replies from registrars are welcome and will be added to the site
        unedited: <b>{site.contact}</b>.
      </p>

      <h2>Open by default</h2>
      <p>
        Source code: {site.repoUrl}. Raw data (CSV): <a href="/api/export?table=domains">domains</a>,{' '}
        <a href="/api/export?table=search_log">search log</a>, <a href="/api/export?table=rdap_checks">RDAP checks</a>.
        Read <Link href="/method">the method</Link> for the details, or the{' '}
        <Link href="/example-report">example report</Link> (with fake data) to see how results are presented.
      </p>
    </>
  );
}
