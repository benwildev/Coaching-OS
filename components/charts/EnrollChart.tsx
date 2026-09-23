'use client';
import { useState } from 'react';
import { enrollChart, Scope } from '@/lib/charts';

export default function EnrollChart({ sc, range }: { sc: Scope; range: { n: number } }) {
  const W = 560;
  const [tipI, setTipI] = useState<number | null>(null);
  const c = enrollChart(sc, range, W, tipI);

  return (
    <div className="relative w-full">
      <svg viewBox={c.vb} className="w-full h-auto" role="img" aria-label="Active students over time">
        {c.grid.map((g, i) => (
          <g key={i}>
            <line x1={c.L} x2={c.R} y1={g.y} y2={g.y} stroke="#e9eef7" strokeWidth={1} />
            <text x={c.L - 8} y={+g.y + 3} fontSize={10.5} textAnchor="end" fill="#8795ab">{g.label}</text>
          </g>
        ))}
        {c.adm.map((a, i) => <rect key={i} x={a.x} y={a.y} width={10} height={a.h} rx={2} fill="#ffd500" opacity={0.85} />)}
        <path d={c.area} fill="#00509d1a" />
        <path d={c.line} fill="none" stroke="#00296b" strokeWidth={2.5} />
        {c.pts.map((p, i) => (
          <g key={p.key}>
            <circle cx={p.x} cy={p.y} r={3.5} fill="#00296b" />
            <rect x={p.hx} y={0} width={p.hw} height={c.H} fill="transparent" onMouseEnter={() => setTipI(i)} onMouseLeave={() => setTipI(null)} />
            <text x={p.x} y={c.H - 6} fontSize={10.5} textAnchor="middle" fill="#55637a">{p.label}</text>
          </g>
        ))}
      </svg>
      <div className="absolute top-0 right-0 text-[11.5px] font-bold text-[#00509d]">{c.growth} growth</div>
      {c.tip.show && (
        <div className="absolute z-20 pointer-events-none bg-[#001d4d] text-white rounded-lg px-2.5 py-2 text-xs min-w-[160px] shadow-xl" style={{ left: c.tip.left, top: c.tip.top }}>
          <div className="font-bold mb-1">{c.tip.title}</div>
          {c.tip.rows.map((r, i) => (
            <div key={i} className="flex justify-between gap-3"><span className="text-[#c7d4e6]">{r.k}</span><span className="font-semibold">{r.v}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}
