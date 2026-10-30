'use client';
import { useState } from 'react';
import { actionLabel, colorVar, niceMax, pct, type ArmDatum } from '@/lib/viz';

interface Tip { d: ArmDatum; x: number; y: number }
const fmtP = (p: number) => (p < 0.001 ? '< 0.001' : p.toFixed(3));

export function ArmBars({ data, fake }: { data: ArmDatum[]; fake?: boolean }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const max = niceMax(Math.max(...data.map((d) => pct(d.hits, d.n)), 0) * 1.25);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const registrars = Array.from(new Map(data.map((d) => [d.colorKey, d.registrar])).entries());

  const show = (d: ArmDatum, el: HTMLElement, e?: React.PointerEvent) => {
    const r = el.getBoundingClientRect();
    setTip({ d, x: e ? e.clientX : r.left + r.width / 2, y: e ? e.clientY : r.top });
  };

  return (
    <figure className="chart" aria-label="Share of names registered by someone else, per experiment group">
      {fake && <span className="badge-fake">Fake data</span>}
      <div className="bars">
        <div className="bars__grid" aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="bars__tick" style={{ left: `${(t / max) * 100}%` }} />
          ))}
        </div>
        {data.map((d) => {
          const p = pct(d.hits, d.n);
          return (
            <div
              key={d.id}
              className={`bars__row ${tip?.d.id === d.id ? 'is-hover' : ''}`}
              tabIndex={0}
              onPointerMove={(e) => show(d, e.currentTarget, e)}
              onPointerLeave={() => setTip(null)}
              onFocus={(e) => show(d, e.currentTarget)}
              onBlur={() => setTip(null)}
            >
              <div className="bars__label">
                <span className="bars__name">{d.registrar}</span>
                <span className="bars__action">{actionLabel[d.action]}</span>
              </div>
              <div className="bars__plot">
                <span className="bars__track" />
                {d.hits > 0 && (
                  <span className="bars__bar" style={{ width: `${(p / max) * 100}%`, background: colorVar(d.colorKey) }} />
                )}
                <span className="bars__value" style={{ left: `calc(${(p / max) * 100}% + 8px)` }}>
                  <b>{p.toFixed(1)}%</b> <span>{d.hits} / {d.n}</span>
                </span>
              </div>
            </div>
          );
        })}
        <div className="bars__axis" aria-hidden>
          {ticks.map((t) => (
            <span key={t} style={{ left: `${(t / max) * 100}%` }}>{t}%</span>
          ))}
        </div>
      </div>

      <div className="legend">
        {registrars.map(([key, name]) => (
          <span key={key} className="legend__item">
            <i className="legend__swatch" style={{ background: colorVar(key) }} /> {name}
          </span>
        ))}
      </div>

      <details className="table-view">
        <summary>Table view</summary>
        <table>
          <thead><tr><th>Registrar</th><th>Action</th><th className="n">Names</th><th className="n">Registered</th><th className="n">Rate</th><th className="n">p vs. control</th></tr></thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.id}>
                <td>{d.registrar}</td><td>{actionLabel[d.action]}</td><td className="n">{d.n}</td>
                <td className="n">{d.hits}</td><td className="n">{pct(d.hits, d.n).toFixed(1)}%</td>
                <td className="n">{d.p == null ? '—' : fmtP(d.p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      {tip && (
        <div className="tooltip" style={{ left: tip.x, top: tip.y }} role="status">
          <div className="tooltip__value">{pct(tip.d.hits, tip.d.n).toFixed(1)}% registered</div>
          <div className="tooltip__row">{tip.d.registrar} · {actionLabel[tip.d.action]}</div>
          <div className="tooltip__row">{tip.d.hits} of {tip.d.n} names</div>
          {tip.d.p != null && <div className="tooltip__row">p vs. control: {fmtP(tip.d.p)}</div>}
        </div>
      )}
    </figure>
  );
}
