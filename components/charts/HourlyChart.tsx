'use client';
import { useState } from 'react';
import { hourlyChart, Scope } from '@/lib/charts';

export default function HourlyChart({ sc }: { sc: Scope }) {
  const W = 360;
  const [tipI, setTipI] = useState<number | null>(null);
  const c = hourlyChart(sc, W, tipI);
  return (
    <div className="relative w-full">
      <svg viewBox={c.vb} className="w-full h-auto" role="img" aria-label="Hourly check-ins today">
        <line x1={0} x2={W} y1={c.base} y2={c.base} stroke="#e9eef7" strokeWidth={1} />
        <line x1={c.nowX} x2={c.nowX} y1={0} y2={c.base} stroke="#fdc500" strokeWidth={2} strokeDasharray="3 3" />
        {c.bars.map((b, i) => (
          <g key={b.key}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={2.5} fill={b.done ? '#00296b' : '#c7d4e6'} />
            <rect x={b.hx} y={0} width={b.hw} height={c.H} fill="transparent" onMouseEnter={() => setTipI(i)} onMouseLeave={() => setTipI(null)} />
            <text x={b.lx} y={c.H - 6} fontSize={9} textAnchor="middle" fill="#8795ab">{b.label}</text>
          </g>
        ))}
      </svg>
      {c.tip.show && (
        <div className="absolute z-20 pointer-events-none bg-[#001d4d] text-white rounded-lg px-2.5 py-2 text-xs min-w-[130px] shadow-xl" style={{ left: c.tip.left, top: c.tip.top }}>
          <div className="font-bold mb-1">{c.tip.title}</div>
          {c.tip.rows.map((r, i) => (
            <div key={i} className="flex justify-between gap-3"><span className="text-[#c7d4e6]">{r.k}</span><span className="font-semibold">{r.v}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}
