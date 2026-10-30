import Link from 'next/link';
import { monthShort } from '@/lib/months';

/** One row of chips: All time + one per month. Keeps other query params. */
export function MonthPicker({
  basePath, months, selected, extra = {},
}: { basePath: string; months: string[]; selected: string; extra?: Record<string, string | undefined> }) {
  const href = (m: string) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    p.set('month', m);
    return `${basePath}?${p}`;
  };
  return (
    <div className="filters">
      <div className="filters__group">
        <span>Test month</span>
        {months.map((m) => (
          <Link key={m} className="chip" href={href(m)} aria-current={selected === m}>{monthShort(m)}</Link>
        ))}
        <Link className="chip" href={href('all')} aria-current={selected === 'all'}>All time</Link>
      </div>
    </div>
  );
}
