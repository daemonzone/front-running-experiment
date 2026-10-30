'use client';
import { useEffect, useRef, useState } from 'react';

export interface RegInfo {
  registrar: string | null;
  iana: number | null;
  nameservers: string[];
  registeredAt: string | null; // already formatted, e.g. "Oct 30, 07:28 UTC"
  lastChanged: string | null;
}

/** Clickable (i) icon that opens a small card with the registry details of a registered name. */
export function InfoPop({ info, label = 'Registration details' }: { info: RegInfo; label?: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.infopop, .infobtn')) close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [pos]);

  const toggle = () => {
    if (pos) return setPos(null);
    const r = btn.current!.getBoundingClientRect();
    setPos({ x: Math.min(r.left, window.innerWidth - 340), y: r.bottom + 8 });
  };

  return (
    <>
      <button ref={btn} type="button" className="infobtn" onClick={toggle} aria-expanded={!!pos} aria-label={label} title={label}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="9.5" /><path d="M12 11v5.5" /><circle cx="12" cy="7.6" r=".6" fill="currentColor" />
        </svg>
      </button>
      {pos && (
        <div className="infopop" role="dialog" aria-label={label} style={{ left: pos.x, top: pos.y }}>
          <div className="infopop__title">Registered by someone else</div>
          <div>registrar of record: <b>{info.registrar ?? 'unknown'}</b>{info.iana ? ` (IANA ${info.iana})` : ''}</div>
          {info.nameservers.length > 0 && <div>nameservers: {info.nameservers.join(', ')}</div>}
          {info.registeredAt && <div>registered {info.registeredAt}</div>}
          {info.lastChanged && <div>record last changed {info.lastChanged}</div>}
        </div>
      )}
    </>
  );
}
