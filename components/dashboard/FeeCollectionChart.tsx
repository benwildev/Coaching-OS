'use client';

import { useState } from 'react';
import { niceMax, tkCompact } from '@/lib/format';

type Month = { label: string; billed: number; collected: number; current: boolean };

export default function FeeCollectionChart({ months, range }: { months: Month[]; range: number }) {
  const [mode, setMode] = useState<'amount' | 'rate'>('amount');
  const [hover, setHover] = useState<number | null>(null);

  const hasData = months.some((m) => m.billed > 0 || m.collected > 0);
  const rates = months.map((m) => (m.billed > 0 ? Math.min(150, (m.collected / m.billed) * 100) : null));
  const max = mode === 'amount' ? niceMax(Math.max(1, ...months.map((m) => Math.max(m.billed, m.collected)))) : 100;
  const ticks = [1, 0.75, 0.5, 0.25, 0];
  const inRange = (i: number) => i >= months.length - range;
  const tickLabel = (v: number) => (mode === 'rate' ? `${Math.round(v)}%` : v === 0 ? '0' : tkCompact(v).replace('৳', ''));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex flex-wrap items-center gap-3 text-[11.5px] text-[#55637a]">
          {mode === 'amount' ? (
            <>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#063b78]" /> Collected
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#8fb3de]" /> Billed
              </span>
            </>
          ) : (
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#063b78]" /> Collected ÷ billed
            </span>
          )}
          <span className="text-[#94a3b8]">Faded months are outside the selected range</span>
        </div>
        <div className="flex gap-1.5">
          <button type="button" className="chip" aria-pressed={mode === 'amount'} onClick={() => setMode('amount')}>
            Amount
          </button>
          <button type="button" className="chip" aria-pressed={mode === 'rate'} onClick={() => setMode('rate')}>
            Collection rate
          </button>
        </div>
      </div>

      {!hasData ? (
        <div className="h-[220px] flex items-center justify-center text-sm text-[#64748b] rounded-xl bg-[#f8fafc] border border-dashed border-[#dce5f0]">
          No invoices or payments recorded yet.
        </div>
      ) : (
        <div className="flex gap-2">
          <div className="flex flex-col justify-between h-[220px] pb-6 text-[10.5px] text-[#94a3b8] num text-right w-10 shrink-0">
            {ticks.map((t) => (
              <span key={t} className="-translate-y-1.5">
                {tickLabel(t * max)}
              </span>
            ))}
          </div>
          <div className="relative grow min-w-0">
            <div className="absolute inset-x-0 top-0 h-[196px] flex flex-col justify-between pointer-events-none">
              {ticks.map((t) => (
                <div key={t} className="border-t border-[#edf1f7]" />
              ))}
            </div>
            <div className="relative flex items-end h-[196px] gap-1">
              {months.map((m, i) => {
                const faded = !inRange(i);
                const r = rates[i];
                return (
                  <div
                    key={m.label + i}
                    className="relative flex-1 h-full flex items-end justify-center gap-[3px] cursor-default"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    style={{ opacity: faded ? 0.45 : 1 }}
                  >
                    {mode === 'amount' ? (
                      <>
                        <div
                          className="w-[34%] max-w-[26px] rounded-t-[5px] bg-[#8fb3de] transition-[height] duration-300"
                          style={{ height: `${(m.billed / max) * 100}%` }}
                        />
                        <div
                          className="w-[34%] max-w-[26px] rounded-t-[5px] bg-[#063b78] transition-[height] duration-300"
                          style={{ height: `${(m.collected / max) * 100}%` }}
                        />
                      </>
                    ) : (
                      <div
                        className="w-[46%] max-w-[36px] rounded-t-[5px] transition-[height] duration-300"
                        style={{ height: `${Math.min(100, r ?? 0)}%`, background: r != null && r < 80 ? '#f59e0b' : '#063b78' }}
                      />
                    )}
                    {hover === i && (
                      <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap rounded-lg bg-[#00296b] text-white text-[11px] px-2.5 py-1.5 shadow-lg">
                        <div className="font-bold mb-0.5">
                          {m.label}
                          {m.current ? ' (to date)' : ''}
                        </div>
                        <div>Billed {tkCompact(m.billed)}</div>
                        <div>Collected {tkCompact(m.collected)}</div>
                        <div>Rate {r != null ? `${Math.round(r)}%` : '—'}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-1 h-6 items-end">
              {months.map((m, i) => (
                <div key={m.label + i} className={`flex-1 text-center text-[11px] ${inRange(i) ? 'text-[#092f63] font-semibold' : 'text-[#94a3b8]'}`}>
                  {m.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
