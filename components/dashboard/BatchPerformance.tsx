'use client';

import { useState } from 'react';
import Link from 'next/link';

type Row = { id: string; name: string; group: string; students: number; score: number | null; attendance: number | null };

export default function BatchPerformance({ rows, lowScore }: { rows: Row[]; lowScore: number }) {
  const groups = Array.from(new Set(rows.map((r) => r.group)));
  const [group, setGroup] = useState('all');
  const visible = group === 'all' ? rows : rows.filter((r) => r.group === group);

  if (rows.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-[#64748b]">
        No exam results or attendance recorded for active batches yet.
      </div>
    );
  }

  return (
    <div>
      {groups.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button type="button" className="chip" aria-pressed={group === 'all'} onClick={() => setGroup('all')}>
            All groups
          </button>
          {groups.map((g) => (
            <button key={g} type="button" className="chip" aria-pressed={group === g} onClick={() => setGroup(g)}>
              {g}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4 text-[11.5px] text-[#55637a] mb-3">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#063b78]" /> Average exam score
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rotate-45 border-2 border-[#063b78] bg-white" /> Attendance
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-[3px] h-3 bg-[#ffd200]" /> Below {lowScore}
        </span>
      </div>

      <div className="flex flex-col divide-y divide-[#f1f4f9]">
        {visible.map((r) => (
          <Link key={r.id} href={`/batches/${r.id}`} className="grid grid-cols-[minmax(0,160px)_1fr_auto] items-center gap-3 py-2.5 group">
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-[#092f63] truncate group-hover:text-[#063b78]">{r.name}</div>
              <div className="text-[11px] text-[#64748b] truncate">
                {r.students} students · {r.group}
              </div>
            </div>
            <div className="relative h-3 rounded-full bg-[#edf1f7]">
              {r.score != null && (
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${Math.min(100, r.score)}%`, background: r.score < lowScore ? '#f59e0b' : '#063b78' }}
                />
              )}
              <div className="absolute -top-0.5 -bottom-0.5 w-[3px] rounded bg-[#ffd200]" style={{ left: `${lowScore}%` }} />
              {r.attendance != null && (
                <div
                  className="absolute top-1/2 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-[#063b78] bg-white"
                  style={{ left: `${Math.min(100, r.attendance)}%` }}
                  title={`Attendance ${r.attendance}%`}
                />
              )}
            </div>
            <div className="text-right whitespace-nowrap min-w-[112px]">
              <span className="text-[13px] font-extrabold text-[#063b78] num">{r.score != null ? r.score.toFixed(1) : '—'}</span>
              <span className="text-[11px] text-[#64748b] ml-1.5">{r.attendance != null ? `${Math.round(r.attendance)}% present` : 'no attendance'}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
