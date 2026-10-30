import Link from 'next/link';

/** Page numbers to show: first, last, and a window around the current page, with "…" between gaps. */
function windowed(page: number, pages: number): (number | '…')[] {
  const keep = new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2].filter((n) => n >= 1 && n <= pages));
  const out: (number | '…')[] = [];
  let prev = 0;
  for (const n of [...keep].sort((a, b) => a - b)) {
    if (n - prev > 1) out.push('…');
    out.push(n);
    prev = n;
  }
  return out;
}

export function Pager({
  page, pages, total, from, to, size, sizes, pageHref, sizeHref,
}: {
  page: number; pages: number; total: number; from: number; to: number; size: number; sizes: number[];
  pageHref: (p: number) => string; sizeHref: (s: number) => string;
}) {
  return (
    <nav className="pager" aria-label="Pagination">
      <span className="pager__info">Showing <b>{total === 0 ? 0 : from}–{to}</b> of <b>{total}</b></span>
      {pages > 1 && (
        <span className="pager__pages">
          {page > 1 ? <Link className="chip" href={pageHref(page - 1)} rel="prev">← Previous</Link> : <span className="chip chip--off">← Previous</span>}
          {windowed(page, pages).map((n, i) =>
            n === '…' ? <span key={`g${i}`} className="pager__gap">…</span>
              : <Link key={n} className="chip" href={pageHref(n)} aria-current={n === page ? 'page' : undefined}>{n}</Link>)}
          {page < pages ? <Link className="chip" href={pageHref(page + 1)} rel="next">Next →</Link> : <span className="chip chip--off">Next →</span>}
        </span>
      )}
      <span className="pager__size">
        Rows
        {sizes.map((s) => <Link key={s} className="chip" href={sizeHref(s)} aria-current={s === size}>{s}</Link>)}
      </span>
    </nav>
  );
}
