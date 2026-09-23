'use client';
import { useMemo, useState } from 'react';
import ChartCard from '@/components/ChartCard';
import Heatmap from '@/components/charts/Heatmap';
import { DATA, ROSTER, ATT_TODAY, clsName } from '@/lib/data';
import { scopeOf } from '@/lib/charts';
import { useApp } from '@/lib/store';

export default function AttendancePage() {
  const { cls, showToast } = useApp();
  const sc = useMemo(() => scopeOf(cls), [cls]);
  const batches = DATA.batches.filter((b: any) => cls === 'all' || b.cls === cls);
  const [openBatch, setOpenBatch] = useState<string | null>(null);

  const below75 = ROSTER.students.filter((s: any) => (cls === 'all' || s.cls === cls) && s.att < 75);

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-4">
      <ChartCard title="Attendance heatmap" subtitle={`Percent present by batch-week · ${clsName(cls)}`}>
        <Heatmap sc={sc} />
      </ChartCard>

      <ChartCard title="Today's register" subtitle="Batches that have already met today (before 4:15 PM) are marked">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {batches.map((b: any) => {
            const reg = ATT_TODAY[b.id];
            const marked = !!reg;
            const counts = marked
              ? Object.values(reg.marks as Record<string, string>).reduce((acc: any, v: string) => { acc[v] = (acc[v] || 0) + 1; return acc; }, {})
              : null;
            return (
              <button key={b.id} onClick={() => setOpenBatch(b.id)} className="text-left border border-[#edf1f7] rounded-xl p-3.5 hover:border-[#00509d]">
                <div className="font-bold text-[#00296b] text-[13.5px]">{b.name}</div>
                <div className="text-[11.5px] text-[#55637a] mt-0.5">{b.teacher} · {b.time}</div>
                {marked ? (
                  <div className="flex gap-3 mt-2 text-[12px] font-bold">
                    <span className="text-[#0a6f5c]">{counts.P || 0} P</span>
                    <span className="text-[#7a5200]">{counts.L || 0} L</span>
                    <span className="text-[#a4144f]">{counts.A || 0} A</span>
                  </div>
                ) : (
                  <div className="text-[12px] text-[#8795ab] mt-2">Not yet marked</div>
                )}
              </button>
            );
          })}
        </div>
      </ChartCard>

      <ChartCard title="Below 75% attendance" subtitle={`${below75.length} students need follow-up`}>
        <div className="overflow-x-auto scroll">
          <table className="tbl">
            <thead><tr><th>Student</th><th>Batch</th><th>Attendance</th><th></th></tr></thead>
            <tbody>
              {below75.slice(0, 30).map((s: any) => (
                <tr key={s.id} className="trow">
                  <td className="text-left font-bold text-[#00296b]">{s.name}</td>
                  <td className="text-left">{s.batchName}</td>
                  <td>{s.att}%</td>
                  <td><button className="tb" onClick={() => showToast('Guardian call logged (demo)')}>Call guardian</button></td>
                </tr>
              ))}
              {below75.length === 0 && <tr><td colSpan={4} className="text-center text-[#55637a] py-8">No students below 75% attendance.</td></tr>}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {openBatch && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button aria-label="Close" className="absolute inset-0 bg-black/40" onClick={() => setOpenBatch(null)} />
          <div className="relative w-full max-w-md h-full bg-white shadow-2xl p-5 overflow-y-auto scroll">
            <button className="ibtn absolute top-3 right-3" onClick={() => setOpenBatch(null)}>×</button>
            {(() => {
              const b = DATA.batches.find((x: any) => x.id === openBatch)!;
              const reg = ATT_TODAY[b.id];
              const students = ROSTER.students.filter((s: any) => s.batch === b.id);
              return (
                <>
                  <div className="dsp text-lg font-bold text-[#00296b] mt-2">{b.name}</div>
                  <div className="text-[12.5px] text-[#55637a] mb-4">{reg ? `Marked by ${reg.by} at ${reg.at}` : 'Not yet marked today'}</div>
                  <div className="flex flex-col gap-1">
                    {students.map((s: any) => {
                      const mark = reg?.marks[s.id];
                      return (
                        <div key={s.id} className="flex items-center justify-between py-1.5 border-b border-[#edf1f7] last:border-0 text-[13px]">
                          <span className="text-[#00296b] font-semibold">{s.name}</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${mark === 'P' ? 'bg-[#e6f6f2] text-[#0a6f5c]' : mark === 'L' ? 'bg-[#fff6cc] text-[#7a5200]' : mark === 'A' ? 'bg-[#fbe7ef] text-[#a4144f]' : 'bg-[#eef2f8] text-[#55637a]'}`}>
                            {mark || '—'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
