import Link from 'next/link';
import { experimentStart } from '@/lib/experiment';
import { site } from '@/lib/site';
import { fmtDate } from '@/lib/viz';

export default async function About() {
  const start = await experimentStart();
  return (
    <>
      <div className="page-head">
        <span className="eyebrow">About · started {start ? fmtDate(start) : site.startDate}</span>
        <h1>A test of a suspicion, not an accusation</h1>
        <p className="lede">
          Some people report that a domain name they searched for on a registrar&apos;s website was registered by someone
          else shortly afterwards — a practice known as &quot;domain front running&quot;. Anecdotes can&apos;t be told apart
          from coincidence. This project measures it.
        </p>
      </div>

      <div className="prose">
        <h2>The question</h2>
        <p>
          If you search for an unregistered domain name (or add it to your cart) on a registrar&apos;s website, is that name
          more likely to be registered by a third party in the following weeks than a comparable name nobody searched for?
        </p>

        <h2>What this project does</h2>
        <div className="grid-3" style={{ margin: '12px 0 8px' }}>
          <div className="card step"><span className="step__num">1</span><h3>Generates names monthly</h3><p>On the 1st: brand-like names, not registered (confirmed with the registry, not a registrar), randomly assigned to groups. Every candidate is published.</p></div>
          <div className="card step"><span className="step__num">2</span><h3>Searches like a visitor</h3><p>One short search session a day in a real browser. Some names are also added to a cart — never bought. Controls are never searched.</p></div>
          <div className="card step"><span className="step__num">3</span><h3>Publishes everything</h3><p>Daily registry checks, the raw data, the code and the method — whatever the result is.</p></div>
        </div>

        <h2>What it can and can&apos;t show</h2>
        <div className="grid-2" style={{ margin: '12px 0 8px' }}>
          <div className="card">
            <h3>Can show</h3>
            <ul>
              <li>Whether names in one group are registered noticeably more often than control names.</li>
              <li>How long after the search it happened.</li>
              <li>Whether the pattern is specific to one registrar or appears everywhere.</li>
            </ul>
          </div>
          <div className="card">
            <h3>Can&apos;t show</h3>
            <ul>
              <li><b>Who</b> registered a name, or why.</li>
              <li>That anyone at a registrar acted deliberately.</li>
              <li>That the leak isn&apos;t elsewhere: a browser extension, a network or DNS provider, a shared tool. Comparing registrars with each other and with the control reduces that risk.</li>
            </ul>
          </div>
        </div>
        <p>A small, mixed or negative result is a valid result, and will be published just as prominently.</p>

        <h2>Who is behind this</h2>
        <p>
          {site.author}, an independent individual with no affiliation with, or compensation from, any registrar or
          competitor. Corrections and replies from registrars are welcome and will be added unedited:{' '}
          <b>{site.contact}</b>.
        </p>

        <h2>Open by default</h2>
        <p>
          Source code: {site.repoUrl}. Data: <a href="/api/export?table=domains">domains</a>,{' '}
          <a href="/api/export?table=search_log">search log</a>, <a href="/api/export?table=rdap_checks">registry checks</a>.
        </p>
        <div className="btn-row">
          <Link className="btn btn--primary" href="/method">Read the method</Link>
          <Link className="btn" href="/example-report">See an example report (fake data)</Link>
        </div>
      </div>
    </>
  );
}
