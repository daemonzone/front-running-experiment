import { colorVar } from '@/lib/viz';
import type { RdapInfo } from '@/lib/rdap';

interface Search { registrar: string; colorKey: string; action: string; date: string }

const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleString('en', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const stamp = (iso: string) => `${new Date(iso).toLocaleString('en', { day: 'numeric', month: 'short', timeZone: 'UTC' })}, ${iso.slice(11, 16)} UTC`;

export function CaseStudy({ domain, searches, rdap }: { domain: string; searches: Search[]; rdap: RdapInfo | null }) {
  const searchDate = searches[0]?.date;
  const regDay = rdap?.registeredAt?.slice(0, 10);
  const calendarDays = searchDate && regDay ? Math.round((Date.parse(regDay) - Date.parse(searchDate)) / 86400000) : null;
  const regLabel = calendarDays === 1 ? 'the next day' : calendarDays === 0 ? 'the same day' : calendarDays != null ? `${calendarDays} days later` : 'later';

  return (
    <section className="case section" aria-labelledby="case-title">
      <div className="case__head">
        <span className="badge-anecdote">Case that started it · not counted in the results below</span>
        <h2 id="case-title"><span className="grad-text">{domain}</span>: searched, then registered</h2>
      </div>

      <div className="case__flow">
        <div className="case__col">
          <div className="case__when">{searchDate ? day(searchDate) : '—'} · searched</div>
          {searches.map((s) => (
            <div key={s.registrar} className="case__node" style={{ borderLeftColor: colorVar(s.colorKey) }}>
              <b>{s.registrar}</b>
              <span>{s.action}</span>
            </div>
          ))}
        </div>

        <div className="case__link" aria-hidden>
          <span className="case__line" />
          <span className="case__gap">{regLabel}</span>
          <span className="case__line case__line--arrow" />
        </div>

        <div className="case__col">
          <div className="case__when">{rdap?.registeredAt ? stamp(rdap.registeredAt) : 'registered'} · per the registry</div>
          <div className="case__node case__node--hit">
            <b>Registered by someone else</b>
            <span>
              {rdap?.registrar ? <>registrar of record: <b>{rdap.registrar}</b>{rdap.registrarIana ? ` (IANA ${rdap.registrarIana})` : ''}</> : 'registrar of record not available'}
            </span>
            {rdap && rdap.nameservers.length > 0 && <span className="muted">nameservers: {rdap.nameservers.join(', ')}</span>}
            {rdap?.lastChanged && <span className="muted">record last changed {stamp(rdap.lastChanged)}</span>}
          </div>
          {rdap?.url && <a className="case__verify" href={rdap.url} target="_blank" rel="noreferrer">Verify at the registry (RDAP) ↗</a>}
        </div>
      </div>

      <div className="case__caveats">
        <h3>What this does — and doesn&apos;t — show</h3>
        <ul>
          <li><b>It&apos;s one anecdote.</b> There is no control group here, and a name can be registered the day after a search by coincidence. That is exactly what the experiment below measures.</li>
          <li><b>Two registrars were searched</b> (Namecheap with an added cart, IONOS search only), so this case can&apos;t separate their effects. The experiment below searches each name on one registrar only.</li>
          <li><b>The search is what counts.</b> Names are grouped by where they were searched. The registrar of record is recorded for information only: a third party can register a name through any registrar, so it is never used to attribute a registration.</li>
          <li><b>Only the day of the searches was noted</b>, not the time, so no precise delay is claimed.</li>
        </ul>
      </div>
    </section>
  );
}
