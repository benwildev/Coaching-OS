'use client';
import { useState } from 'react';
import { donutChart, Scope } from '@/lib/charts';

export default function DonutChart({ sc, mode }: { sc: Scope; mode: 'amount' | 'txns' }) {
  const [focus, setFocus] = useState<string | null>(null);
  const d = donutChart(sc, mode, focus);
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <svg viewBox="0 0 200 200" width={168} height={168} role="img" aria-label="Payment channel split">
        {d.segs.map((s: any) => (
          <path key={s.id} d={s.d} fill="none" stroke={s.color} strokeWidth={s.sw} opacity={s.op} strokeLinecap="round" onClick={() => setFocus(focus === s.id ? null : s.id)} className="cursor-pointer" />
        ))}
        <text x={100} y={96} textAnchor="middle" fontSize={20} fontWeight={800} fill="#00296b" className="dsp">{d.center}</text>
        <text x={100} y={116} textAnchor="middle" fontSize={10} fill="#55637a">{d.centerLabel}</text>
      </svg>
      <div className="flex flex-col gap-1.5 min-w-0">
        {d.segs.map((s: any) => (
          <button key={s.id} onClick={() => setFocus(focus === s.id ? null : s.id)} aria-pressed={s.pressed} className={`flex items-center gap-2 text-[12.5px] text-left rounded-lg px-1.5 py-1 ${focus === s.id ? 'bg-[#eef3fa]' : ''}`}>
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
            <span className="font-semibold text-[#00296b] w-24 truncate">{s.label}</span>
            <span className="text-[#55637a]">{s.val}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
