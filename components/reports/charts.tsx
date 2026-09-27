'use client';

import { useState } from 'react';

/**
 * Minimal SVG charts for reports (the project has no chart library). Every
 * value plotted comes straight from a report API response.
 * Palette: validated categorical slots (dataviz validator: blue / orange /
 * aqua pass CVD + normal-vision checks; aqua's low surface contrast is
 * relieved by the table that accompanies every chart).
 */
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a'];

export interface BarSeries {
  key: string;
  label: string;
  /** null = no data for that period (drawn as a gap, never as a fake zero). */
  values: Array<number | null>;
  format: (v: number | null) => string;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

export function BarChart({
  labels,
  series,
  ariaLabel,
  maxValue,
  axisFormat,
}: {
  labels: string[];
  series: BarSeries[];
  ariaLabel: string;
  maxValue?: number;
  axisFormat: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = 240;
  const L = 64;
  const R = 36;
  const T = 12;
  const B = 34;
  const plotW = W - L - R;
  const plotH = H - T - B;
  const max = maxValue ?? niceMax(Math.max(0, ...series.flatMap((s) => s.values.map((v) => v ?? 0))));
  const n = Math.max(1, labels.length);
  const slot = plotW / n;
  const groupW = Math.min(slot * 0.78, 64);
  const gap = series.length > 1 ? 2 : 0;
  const barW = Math.max(1.5, (groupW - gap * (series.length - 1)) / series.length);
  const y = (v: number) => T + plotH - (Math.max(0, v) / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const labelEvery = Math.ceil(n / 12);

  return (
    <div className="relative w-full">
      {series.length > 1 && (
        <div className="flex flex-wrap gap-4 mb-2 text-[12px] text-[#334155]">
          {series.map((s, i) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-[3px]" style={{ background: SERIES_COLORS[i] }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      {/* Below ~560px the chart scrolls inside its own box instead of shrinking axis text to illegibility; the page itself never overflows. */}
      <div className="overflow-x-auto scroll">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px] h-auto" role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e9eef7" strokeWidth={1} />
            <text x={L - 8} y={y(t) + 3.5} fontSize={10.5} textAnchor="end" fill="#64748b">
              {axisFormat(t)}
            </text>
          </g>
        ))}
        {labels.map((lab, i) => {
          const gx = L + i * slot + (slot - groupW) / 2;
          return (
            <g key={i}>
              <rect x={L + i * slot} y={T} width={slot} height={plotH} fill={hover === i ? '#f1f5fb' : 'transparent'} onMouseEnter={() => setHover(i)} />
              {series.map((s, si) => {
                const v = s.values[i];
                if (v === null || v === undefined) return null;
                const top = y(v);
                const h = T + plotH - top;
                if (h <= 0) return null;
                const x = gx + si * (barW + gap);
                const r = Math.min(4, barW / 2, h);
                return (
                  <path
                    key={s.key}
                    d={`M${x},${T + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${T + plotH} Z`}
                    fill={SERIES_COLORS[si]}
                    pointerEvents="none"
                  />
                );
              })}
              {i % labelEvery === 0 && (
                <text x={L + i * slot + slot / 2} y={H - 12} fontSize={10.5} textAnchor="middle" fill="#64748b">
                  {lab}
                </text>
              )}
            </g>
          );
        })}
        <line x1={L} x2={W - R} y1={T + plotH} y2={T + plotH} stroke="#cbd5e1" strokeWidth={1} />
      </svg>
      </div>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-8 z-10 rounded-lg border border-[#dce5f0] bg-white px-3 py-2 text-[12px] shadow-md"
          style={{ left: `${Math.min(78, Math.max(2, ((L + hover * slot) / W) * 100))}%` }}
        >
          <div className="font-bold text-[#092f63] mb-1">{labels[hover]}</div>
          {series.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2 text-[#334155]">
              <span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: SERIES_COLORS[i] }} />
              <span>{s.label}:</span>
              <span className="font-semibold text-[#092f63]">{s.format(s.values[hover] ?? null)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Horizontal distribution bars with the exact value printed beside each bar. */
export function HBarList({ rows, ariaLabel }: { rows: Array<{ key: string; label: string; value: number; display: string }>; ariaLabel: string }) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-2" aria-label={ariaLabel}>
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(80px,30%)_1fr_auto] items-center gap-3 text-[12.5px]">
          <span className="truncate font-semibold text-[#092f63]" title={r.label}>
            {r.label}
          </span>
          <span className="h-3 rounded bg-[#eef3fa] overflow-hidden" title={r.display}>
            <span className="block h-full rounded" style={{ width: max > 0 ? `${(r.value / max) * 100}%` : '0%', background: SERIES_COLORS[0], minWidth: r.value > 0 ? 3 : 0 }} />
          </span>
          <span className="num font-bold text-[#092f63] text-right min-w-[64px]">{r.display}</span>
        </li>
      ))}
    </ul>
  );
}
