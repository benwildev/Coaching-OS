'use client';
import { useMemo, useState } from 'react';
import ChartCard from '@/components/ChartCard';
import Chip from '@/components/Chip';
import Icon from '@/components/Icon';
import { EXAMS, gradeOf, clsName } from '@/lib/data';
import { useApp } from '@/lib/store';

const STATUS_LABEL: Record<string, string> = { published: 'Published', awaiting: 'Awaiting marks', today: 'Today', upcoming: 'Upcoming' };
const STATUS_STYLE: Record<string, string> = { published: 'bg-[#e6f6f2] text-[#0a6f5c]', awaiting: 'bg-[#fff6cc] text-[#7a5200]', today: 'bg-[#e6effa] text-[#00509d]', upcoming: 'bg-[#eef2f8] text-[#55637a]' };

export default function ExamsPage() {
  const { cls, showToast } = useApp();
  const [status, setStatus] = useState('all');
  const [active, setActive] = useState<any>(null);

  const list = useMemo(() => EXAMS.filter((e: any) => (cls === 'all' || e.cls === cls) && (status === 'all' || e.status === status)), [cls, status]);

  const gradeDist = useMemo(() => {
    const dist: Record<string, number> = { 'A+': 0, A: 0, 'A-': 0, B: 0, C: 0, D: 0, F: 0 };
    list.filter((e: any) => e.status === 'published').forEach((e: any) => {
      Object.values(e.marks || {}).forEach((m: any) => {
        if (m === 'AB') return;
        const pct = (m / e.fullMarks) * 100;
        const g = gradeOf(pct)[1];
        dist[g]++;
      });
    });
    return dist;
  }, [list]);
  const maxDist = Math.max(1, ...Object.values(gradeDist));

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-4">
      <div className="card p-4 flex items-center gap-2 flex-wrap">
        <Chip active={status === 'all'} onClick={() => setStatus('all')}>All</Chip>
        <Chip active={status === 'published'} onClick={() => setStatus('published')}>Published</Chip>
        <Chip active={status === 'awaiting'} onClick={() => setStatus('awaiting')}>Awaiting marks</Chip>
        <Chip active={status === 'today'} onClick={() => setStatus('today')}>Today</Chip>
        <Chip active={status === 'upcoming'} onClick={() => setStatus('upcoming')}>Upcoming</Chip>
        <button className="primary ml-auto" onClick={() => showToast('Schedule exam (demo)')}><Icon name="plus" size={16} /> Schedule exam</button>
      </div>

      <ChartCard title="Grade distribution" subtitle={`Published papers · ${clsName(cls)}`}>
        <div className="flex items-end gap-3 h-40">
          {Object.entries(gradeDist).map(([g, n]) => (
            <div key={g} className="flex flex-col items-center gap-1.5 grow">
              <div className="w-full rounded-t-lg bg-[#00509d]" style={{ height: `${(n / maxDist) * 100}%`, minHeight: n ? 4 : 0 }} />
              <span className="text-[11px] font-bold text-[#00296b]">{g}</span>
              <span className="text-[10.5px] text-[#55637a]">{n}</span>
            </div>
          ))}
        </div>
      </ChartCard>

      <ChartCard title={`Exams · ${list.length}`}>
        <div className="overflow-x-auto scroll">
          <table className="tbl">
            <thead><tr><th>Exam</th><th>Class</th><th>Date</th><th>Status</th></tr></thead>
            <tbody>
              {list.map((e: any) => (
                <tr key={e.id} className="trow cursor-pointer" onClick={() => setActive(e)}>
                  <td className="text-left font-bold text-[#00296b]">{e.title}<div className="text-[11px] text-[#8795ab] font-normal">{e.type}</div></td>
                  <td className="text-left">{clsName(e.cls)}</td>
                  <td>{e.date}{e.time ? ` · ${e.time}` : ''}</td>
                  <td><span className={`text-xs font-bold px-2 py-1 rounded-full ${STATUS_STYLE[e.status]}`}>{STATUS_LABEL[e.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {active && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button aria-label="Close" className="absolute inset-0 bg-black/40" onClick={() => setActive(null)} />
          <div className="relative w-full max-w-md h-full bg-white shadow-2xl p-5 overflow-y-auto scroll">
            <button className="ibtn absolute top-3 right-3" onClick={() => setActive(null)}><Icon name="x" size={18} /></button>
            <div className="dsp text-lg font-bold text-[#00296b] mt-2">{active.title}</div>
            <div className="text-[12.5px] text-[#55637a] mb-4">{clsName(active.cls)} · {active.date} · Full marks {active.fullMarks}</div>
            {active.status === 'published' ? (
              <div className="flex flex-col gap-1">
                {Object.entries(active.marks || {}).slice(0, 40).map(([sid, m]: any) => (
                  <div key={sid} className="flex justify-between text-[13px] py-1.5 border-b border-[#edf1f7] last:border-0">
                    <span className="text-[#55637a]">{sid}</span><span className="font-bold text-[#00296b]">{m === 'AB' ? 'Absent' : m}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[13px] text-[#55637a]">{active.note || 'Marks not yet entered.'}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
