'use client';
import { useMemo, useState } from 'react';
import { colorVar, type SeriesDatum } from '@/lib/viz';

const W = 760, H = 300, ML = 40, MR = 20, MT = 14, MB = 34;
const PW = W - ML - MR, PH = H - MT - MB;

/** Cumulative number of registered names by days since the exposure, one step line per group. */
export function CumulativeChart({
  series, windowDays, observedDays, fake,
}: { series: SeriesDatum[]; windowDays: number; observedDays: number; fake?: boolean }) {
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  const obs = Math.max(1, Math.min(windowDays, Math.ceil(observedDays)));
  const countAt = (s: SeriesDatum, day: number) => s.days.filter((d) => d <= day).length;
  const maxCount = Math.max(0, ...series.map((s) => s.days.length));
  const yMax = Math.max(4, maxCount <= 4 ? 4 : Math.ceil(maxCount / 4) * 4);
  const x = (day: number) => ML + (day / windowDays) * PW;
  const y = (c: number) => MT + PH - (c / yMax) * PH;
  const xTicks = useMemo(() => {
    const step = windowDays > 60 ? 15 : windowDays > 20 ? 10 : 5;
    const t: number[] = [];
    for (let d = 0; d <= windowDays; d += step) t.push(d);
    return t;
  }, [windowDays]);
  const yTicks = [0, 1, 2, 3, 4].map((i) => (yMax / 4) * i);
  const empty = maxCount === 0;

  const path = (s: SeriesDatum) => {
    const evs = [...s.days].sort((a, b) => a - b);
    let d = `M${x(0)},${y(0)}`;
    let c = 0;
    for (const e of evs) { c++; d += ` H${x(Math.min(e, obs))} V${y(c)}`; }
    return d + ` H${x(obs)}`;
  };

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const day = Math.round(((e.clientX - r.left) / r.width) * windowDays);
    setHoverDay(Math.max(0, Math.min(obs, day)));
  };

  return (
    <figure className="chart" aria-label="Cumulative registered names by days since the search">
      {fake && <span className="badge-fake">Fake data</span>}
      <div className="linechart">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Line chart: cumulative registered names per group">
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={ML} x2={W - MR} y1={y(t)} y2={y(t)} className="grid" />
              <text x={ML - 8} y={y(t) + 4} textAnchor="end" className="axis">{Number.isInteger(t) ? t : t.toFixed(1)}</text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t} x={x(t)} y={H - 12} textAnchor="middle" className="axis">{t}d</text>
          ))}
          <line x1={ML} x2={W - MR} y1={y(0)} y2={y(0)} className="baseline" />

          {!empty && series.map((s) => (
            <g key={s.id}>
              <path d={path(s)} fill="none" stroke={colorVar(s.colorKey)} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={x(obs)} cy={y(countAt(s, obs))} r="6" className="ring" />
              <circle cx={x(obs)} cy={y(countAt(s, obs))} r="4" fill={colorVar(s.colorKey)} />
            </g>
          ))}

          {hoverDay != null && !empty && <line x1={x(hoverDay)} x2={x(hoverDay)} y1={MT} y2={MT + PH} className="crosshair" />}
          {!empty && <rect x={ML} y={MT} width={PW} height={PH} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHoverDay(null)} />}
        </svg>

        {empty && (
          <div className="chart-empty">
            <b>No registrations yet</b>
            <span>Lines appear here as the registry (RDAP) reports names that were registered after being searched.</span>
          </div>
        )}

        {hoverDay != null && !empty && (
          <div className="tooltip tooltip--abs" style={{ left: `${(x(hoverDay) / W) * 100}%`, top: 8 }}>
            <div className="tooltip__value">{hoverDay} days after the search</div>
            {series.map((s) => (
              <div key={s.id} className="tooltip__row">
                <i className="linekey" style={{ background: colorVar(s.colorKey) }} />
                {s.name}: <b>{countAt(s, hoverDay)}</b> registered
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="legend">
        {series.map((s) => (
          <span key={s.id} className="legend__item">
            <i className="linekey" style={{ background: colorVar(s.colorKey) }} /> {s.name} <span className="muted">({s.n} names)</span>
          </span>
        ))}
      </div>

      <details className="table-view">
        <summary>Table view</summary>
        <table>
          <thead><tr><th>Group</th><th className="n">Names</th><th className="n">Registered</th><th>Days after search</th></tr></thead>
          <tbody>
            {series.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td><td className="n">{s.n}</td><td className="n">{s.days.length}</td>
                <td>{s.days.length ? [...s.days].sort((a, b) => a - b).map((d) => d.toFixed(1)).join(', ') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
