import type { Action } from '@/lib/viz';

const svg = { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.1, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

const Search = () => (<svg {...svg}><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" /></svg>);
const Cart = () => (<svg {...svg} className="aicon__cart"><path d="M3 4h2.4l2.2 10.2a1.6 1.6 0 0 0 1.6 1.3h8.1a1.6 1.6 0 0 0 1.6-1.2L20.5 8H6.2" /><circle cx="9.5" cy="19.5" r="1.3" /><circle cx="17" cy="19.5" r="1.3" /></svg>);
const EyeOff = () => (<svg {...svg}><path d="M2 12s3.6-7 10-7c2 0 3.8.7 5.3 1.6M22 12s-3.6 7-10 7c-2 0-3.8-.7-5.3-1.6" /><circle cx="12" cy="12" r="3" /><path d="M3 3l18 18" /></svg>);

export const actionText: Record<Action, string> = {
  search_only: 'Search only',
  search_cart: 'Search + cart',
  no_search: 'Never searched',
};

/** The assigned action as icons; the text is in the tooltip and the accessible name. */
export function ActionIcon({ action }: { action: Action }) {
  return (
    <span className="aicon" role="img" aria-label={actionText[action]} title={actionText[action]}>
      {action === 'search_only' && <Search />}
      {action === 'search_cart' && (<><Search /><Cart /></>)}
      {action === 'no_search' && <EyeOff />}
    </span>
  );
}

/** Quick legend for the icons, shown under every table that uses them. */
export function ActionLegend() {
  return (
    <p className="actionlegend" aria-label="Legend for the action icons">
      <span className="actionlegend__title">Action:</span>
      <span className="actionlegend__item"><ActionIcon action="search_only" /> search only</span>
      <span className="actionlegend__item"><ActionIcon action="search_cart" /> search + added to cart</span>
      <span className="actionlegend__item"><ActionIcon action="no_search" /> never searched (control)</span>
    </p>
  );
}
