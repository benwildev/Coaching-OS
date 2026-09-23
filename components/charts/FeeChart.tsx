'use client';
import { useState } from 'react';
import { feeChart, Scope } from '@/lib/charts';

export default function FeeChart({ sc, range, mode }: { sc: Scope; range: { n: number }; mode: 'amount' | 'rate' }) {
  const W = 640;
  const [tipI, setTipI] = useState<number | null>(null);
  const c = feeChart(sc, range, mode, W, tipI);

  return (
    <div className="relative w-full">
      <svg viewBox={c.vb} className="w-full h-auto" role="img" aria-label="Fees billed vs collected by month">
        {c.grid.map((g, i) => (
          <g key={i}>
            <line x1={c.L} x2={c.R} y1={g.y} y2={g.y} stroke="#e9eef7" strokeWidth={1} />
            <text x={c.L - 8} y={+g.y + 3} fontSize={10.5} textAnchor="end" fill="#8795ab">{g.label}</text>
          </g>
        ))}
        {c.amount &&
          c.groups.map((g) => (
            <g key={g.key} opacity={g.op} onMouseEnter={() => setTipI(c.groups.indexOf(g))} onMouseLeave={() => setTipI(null)}>
              <rect x={g.bx} y={g.by} width={g.bw} height={g.bh} rx={3} fill="#8fb3de" />
              <rect x={g.cx2} y={g.cy} width={g.bw} height={g.ch} rx={3} fill="#00296b" />
              <rect x={g.hx} y={0} width={g.hw} height={c.H} fill="transparent" onMouseEnter={() => setTipI(c.groups.indexOf(g))} />
              <text x={g.lx} y={c.H - 8} fontSize={10.5} textAnchor="middle" fill="#55637a">{g.label}</text>
            </g>
          ))}
        {c.rate && (
          <>
            <line x1={c.L} x2={c.R} y1={c.targetY} y2={c.targetY} stroke="#b38f00" strokeDasharray="4 4" strokeWidth={1} />
            <path d={c.lineD} fill="none" stroke="#00509d" strokeWidth={2.5} />
            {c.groups.map((g) => (
              <g key={g.key}>
                <circle cx={g.px} cy={g.py} r={3.5} fill="#00509d" />
                <rect x={g.hx} y={0} width={g.hw} height={c.H} fill="transparent" onMouseEnter={() => setTipI(c.groups.indexOf(g))} onMouseLeave={() => setTipI(null)} />
                <text x={g.lx} y={c.H - 8} fontSize={10.5} textAnchor="middle" fill="#55637a">{g.label}</text>
              </g>
            ))}
          </>
        )}
      </svg>
      {c.tip.show && (
        <div className="tip absolute z-20 pointer-events-none bg-[#001d4d] text-white rounded-lg px-2.5 py-2 text-xs min-w-[160px] shadow-xl" style={{ left: c.tip.left, top: c.tip.top }}>
          <div className="font-bold mb-1">{c.tip.title}</div>
          {c.tip.rows.map((r, i) => (
            <div key={i} className="flex justify-between gap-3"><span className="text-[#c7d4e6]">{r.k}</span><span className="font-semibold">{r.v}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}
