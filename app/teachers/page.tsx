'use client';
import { useMemo, useState } from 'react';
import Icon from '@/components/Icon';
import ChartCard from '@/components/ChartCard';
import { DATA, clsName } from '@/lib/data';
import { useApp } from '@/lib/store';

export default function TeachersPage() {
  const { cls } = useApp();
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [sort, setSort] = useState<'name' | 'classes' | 'score'>('classes');
  const [active, setActive] = useState<any>(null);

  const list = useMemo(() => {
    let l = DATA.teachers.filter((t: any) => cls === 'all' || t.teaches.includes(cls));
    if (type !== 'all') l = l.filter((t: any) => t.type === type);
    if (q.trim()) l = l.filter((t: any) => t.name.toLowerCase().includes(q.toLowerCase()) || t.subject.toLowerCase().includes(q.toLowerCase()));
    return [...l].sort((a: any, z: any) => (sort === 'name' ? a.name.localeCompare(z.name) : sort === 'score' ? z.avgScore - a.avgScore : z.classes - a.classes));
  }, [cls, q, type, sort]);

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-4">
      <div className="card p-4 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 tb grow max-w-sm">
          <Icon name="search" size={16} className="text-[#55637a]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search teacher or subject…" className="bg-transparent outline-none w-full text-[13.5px]" />
        </div>
        <select value={type} onChange={(e) => setType(e.target.value)} className="tb">
          <option value="all">All types</option>
          <option value="Full-time">Full-time</option>
          <option value="Part-time">Part-time</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="tb">
          <option value="classes">Sort: Classes taught</option>
          <option value="name">Sort: Name</option>
          <option value="score">Sort: Average score</option>
        </select>
      </div>

      <ChartCard title={`Teachers · ${list.length}`} subtitle={`Weekly classes vs a 20-class target · ${clsName(cls)}`}>
        <div className="overflow-x-auto scroll">
          <table className="tbl">
            <thead><tr><th>Teacher</th><th>Subject</th><th>Type</th><th>Classes/week</th><th>Students</th><th>Avg score</th></tr></thead>
            <tbody>
              {list.map((t: any) => (
                <tr key={t.id} className="trow cursor-pointer" onClick={() => setActive(t)}>
                  <td className="text-left font-bold text-[#00296b]">{t.name}</td>
                  <td className="text-left">{t.subject}</td>
                  <td className="text-left">{t.type}</td>
                  <td>
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-20 h-2 rounded-full bg-[#e9eef7] overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (t.classes / 20) * 100)}%`, background: t.classes > 20 ? '#7a5200' : '#00296b' }} />
                      </div>
                      <span className="font-bold text-[#00296b] w-6">{t.classes}</span>
                    </div>
                  </td>
                  <td>{t.students}</td>
                  <td>{t.avgScore.toFixed(1)}</td>
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
            <div className="dsp text-lg font-bold text-[#00296b] mt-2">{active.name}</div>
            <div className="text-[12.5px] text-[#55637a] mb-4">{active.subject} · {active.type} · joined {active.joined}</div>
            <dl className="grid grid-cols-2 gap-3 text-[13px]">
              <div><dt className="text-[11px] font-bold text-[#55637a] uppercase">Phone</dt><dd className="font-semibold text-[#00296b]">{active.phone}</dd></div>
              <div><dt className="text-[11px] font-bold text-[#55637a] uppercase">Classes/week</dt><dd className="font-semibold text-[#00296b]">{active.classes}</dd></div>
              <div><dt className="text-[11px] font-bold text-[#55637a] uppercase">Students</dt><dd className="font-semibold text-[#00296b]">{active.students}</dd></div>
              <div><dt className="text-[11px] font-bold text-[#55637a] uppercase">Avg score</dt><dd className="font-semibold text-[#00296b]">{active.avgScore.toFixed(1)}</dd></div>
              <div><dt className="text-[11px] font-bold text-[#55637a] uppercase">On-time submission</dt><dd className="font-semibold text-[#00296b]">{active.onTime}%</dd></div>
            </dl>
            <div className="text-[12px] font-bold text-[#55637a] uppercase tracking-wide mt-4 mb-2">Batches</div>
            <div className="flex flex-wrap gap-1.5">
              {active.batches.map((bid: string) => {
                const b = DATA.batches.find((x: any) => x.id === bid);
                return b ? <span key={bid} className="text-xs font-semibold text-[#00296b] bg-[#eef2f8] px-2 py-1 rounded-full">{b.name}</span> : null;
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
