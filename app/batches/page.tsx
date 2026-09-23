'use client';
import { useMemo, useState } from 'react';
import Icon from '@/components/Icon';
import ChartCard from '@/components/ChartCard';
import Chip from '@/components/Chip';
import { DATA, clsName } from '@/lib/data';
import { useApp } from '@/lib/store';

export default function BatchesPage() {
  const { cls, showToast } = useApp();
  const [group, setGroup] = useState('all');
  const [q, setQ] = useState('');
  const [active, setActive] = useState<any>(null);

  const list = useMemo(() => {
    return DATA.batches.filter((b: any) => (cls === 'all' || b.cls === cls) && (group === 'all' || b.program === group) && (!q || b.name.toLowerCase().includes(q.toLowerCase()) || b.teacher.toLowerCase().includes(q.toLowerCase())));
  }, [cls, group, q]);

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-4">
      <div className="card p-4 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 tb grow max-w-sm">
          <Icon name="search" size={16} className="text-[#55637a]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search batch or teacher…" className="bg-transparent outline-none w-full text-[13.5px]" />
        </div>
        {DATA.programs.map((p: any) => <Chip key={p.id} active={group === p.id} onClick={() => setGroup(p.id)}>{p.label}</Chip>)}
        <button className="primary ml-auto" onClick={() => showToast('Create batch (demo)')}><Icon name="plus" size={16} /> Create batch</button>
      </div>

      <ChartCard title={`Batches · ${list.length}`} subtitle={clsName(cls)}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {list.map((b: any) => (
            <button key={b.id} onClick={() => setActive(b)} className="text-left border border-[#edf1f7] rounded-xl p-3.5 hover:border-[#00509d] lift">
              <div className="flex items-start justify-between gap-2">
                <div className="font-bold text-[#00296b] text-[13.5px]">{b.name}</div>
                <span className="text-[11px] font-bold text-[#55637a] bg-[#eef2f8] px-1.5 py-0.5 rounded-full shrink-0">{b.score.toFixed(1)} avg</span>
              </div>
              <div className="text-[11.5px] text-[#55637a] mt-1">{b.teacher} · {b.time}</div>
              <div className="h-2 rounded-full bg-[#e9eef7] overflow-hidden mt-2.5">
                <div className="h-full rounded-full bg-[#00509d]" style={{ width: `${(b.enrolled / b.capacity) * 100}%` }} />
              </div>
              <div className="text-[11px] text-[#55637a] mt-1">{b.enrolled}/{b.capacity} seats · {b.att}% attendance</div>
            </button>
          ))}
        </div>
      </ChartCard>

      {active && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button aria-label="Close" className="absolute inset-0 bg-black/40" onClick={() => setActive(null)} />
          <div className="relative w-full max-w-md h-full bg-white shadow-2xl p-5 overflow-y-auto scroll">
            <button className="ibtn absolute top-3 right-3" onClick={() => setActive(null)}><Icon name="x" size={18} /></button>
            <div className="dsp text-lg font-bold text-[#00296b] mt-2">{active.name}</div>
            <div className="text-[12.5px] text-[#55637a] mb-4">{active.teacher} · Room {active.room}</div>
            <div className="text-[12px] font-bold text-[#55637a] uppercase tracking-wide mb-2">Weekly timetable</div>
            <div className="flex flex-col gap-1 mb-4">
              {active.timetable.map((t: any, i: number) => (
                <div key={i} className="flex justify-between text-[13px] py-1.5 border-b border-[#edf1f7] last:border-0">
                  <span className="text-[#55637a]">{t.day}</span><span className="font-semibold text-[#00296b]">{t.subject}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 text-[13px]">
              <div><div className="text-[11px] font-bold text-[#55637a] uppercase">Seats</div><div className="font-semibold text-[#00296b]">{active.enrolled}/{active.capacity}</div></div>
              <div><div className="text-[11px] font-bold text-[#55637a] uppercase">Avg score</div><div className="font-semibold text-[#00296b]">{active.score.toFixed(1)}</div></div>
              <div><div className="text-[11px] font-bold text-[#55637a] uppercase">Attendance</div><div className="font-semibold text-[#00296b]">{active.att}%</div></div>
              <div><div className="text-[11px] font-bold text-[#55637a] uppercase">Monthly fee</div><div className="font-semibold text-[#00296b]">{'৳' + active.fee}</div></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
