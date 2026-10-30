import type { ReactNode } from 'react';

export function StatTile({ label, value, hint, icon }: { label: string; value: string | number; hint?: string; icon?: ReactNode }) {
  return (
    <div className="tile">
      {icon && <span className="tile__icon" aria-hidden>{icon}</span>}
      <div className="tile__label">{label}</div>
      <div className="tile__value">{value}</div>
      {hint && <div className="tile__hint">{hint}</div>}
    </div>
  );
}
