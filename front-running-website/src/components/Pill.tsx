const map: Record<string, { label: string; icon: string; cls: string }> = {
  pending_search: { label: 'Queued', icon: '◔', cls: 'pill--quiet' },
  monitoring: { label: 'Monitoring', icon: '◉', cls: 'pill--info' },
  registered: { label: 'Registered', icon: '✓', cls: 'pill--solid' },
  window_closed: { label: 'Window closed', icon: '○', cls: 'pill--quiet' },
  failed: { label: 'Failed', icon: '!', cls: 'pill--quiet' },
};

export function StatusPill({ status }: { status: string }) {
  const s = map[status] ?? { label: status, icon: '·', cls: 'pill--quiet' };
  return (
    <span className={`pill ${s.cls}`}>
      <span aria-hidden>{s.icon}</span> {s.label}
    </span>
  );
}

export function KeyDot({ color, ring }: { color: string; ring?: boolean }) {
  return <span className={`keydot ${ring ? 'keydot--ring' : ''}`} style={{ background: color }} aria-hidden />;
}

const outcomes: Record<string, { label: string; icon: string; cls: string }> = {
  available: { label: 'Available', icon: '✓', cls: 'pill--info' },
  already_registered: { label: 'Already registered', icon: '✕', cls: 'pill--quiet' },
  inconclusive: { label: 'Inconclusive', icon: '?', cls: 'pill--quiet' },
  duplicate_label: { label: 'Duplicate word', icon: '≡', cls: 'pill--quiet' },
};

export function OutcomePill({ outcome }: { outcome: string }) {
  const o = outcomes[outcome] ?? { label: outcome, icon: '·', cls: 'pill--quiet' };
  return (
    <span className={`pill ${o.cls}`}>
      <span aria-hidden>{o.icon}</span> {o.label}
    </span>
  );
}
