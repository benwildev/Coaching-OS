'use client';
import { useMemo, useState } from 'react';
import Icon from '@/components/Icon';
import ChartCard from '@/components/ChartCard';
import Chip from '@/components/Chip';
import { ROSTER, DATA, PROGRAM_LABEL, clsName } from '@/lib/data';
import { grp } from '@/lib/format';
import { useApp } from '@/lib/store';

const PAGE_SIZE = 12;

export default function StudentsPage() {
  const { cls, showToast } = useApp();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('all');
  const [status, setStatus] = useState<'all' | 'due' | 'ok'>('all');
  const [sort, setSort] = useState<'id' | 'name' | 'score' | 'att'>('id');
  const [page, setPage] = useState(0);
  const [profile, setProfile] = useState<any>(null);

  const filtered = useMemo(() => {
    let list = ROSTER.students.filter((s: any) => cls === 'all' || s.cls === cls);
    if (group !== 'all') list = list.filter((s: any) => s.program === group);
    if (status === 'due') list = list.filter((s: any) => s.dueMonths.length > 0);
    if (status === 'ok') list = list.filter((s: any) => s.dueMonths.length === 0);
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      list = list.filter((s: any) => s.name.toLowerCase().includes(t) || s.id.toLowerCase().includes(t) || s.guardian.toLowerCase().includes(t) || s.phone.includes(t));
    }
    const sorted = [...list].sort((a: any, z: any) => {
      if (sort === 'name') return a.name.localeCompare(z.name);
      if (sort === 'score') return z.score - a.score;
      if (sort === 'att') return z.att - a.att;
      return a.id.localeCompare(z.id);
    });
    return sorted;
  }, [cls, group, status, q, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const stats = [
    { label: 'Total students', value: grp(filtered.length) },
    { label: 'With dues', value: grp(filtered.filter((s: any) => s.dueMonths.length > 0).length) },
    { label: 'Average score', value: (filtered.reduce((s: number, x: any) => s + x.score, 0) / (filtered.length || 1)).toFixed(1) },
    { label: 'Average attendance', value: (filtered.reduce((s: number, x: any) => s + x.att, 0) / (filtered.length || 1)).toFixed(0) + '%' },
  ];

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="card p-4">
            <div className="text-[12px] font-semibold text-[#55637a] mb-1">{s.label}</div>
            <div className="dsp text-xl font-extrabold text-[#00296b]">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="card p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 tb grow max-w-md">
            <Icon name="search" size={16} className="text-[#55637a]" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search name, ID, guardian, phone…" className="bg-transparent outline-none w-full text-[13.5px]" />
          </div>
          <button className="primary" onClick={() => showToast('Admit-a-student form (demo)')}>
            <Icon name="userplus" size={16} /> Admit a student
          </button>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {DATA.programs.map((p: any) => (
            <Chip key={p.id} active={group === p.id} onClick={() => { setGroup(p.id); setPage(0); }}>{p.label}</Chip>
          ))}
          <span className="w-px h-5 bg-[#d8e1ee] mx-1" />
          <Chip active={status === 'all'} onClick={() => { setStatus('all'); setPage(0); }}>All</Chip>
          <Chip active={status === 'due'} onClick={() => { setStatus('due'); setPage(0); }}>Fees due</Chip>
          <Chip active={status === 'ok'} onClick={() => { setStatus('ok'); setPage(0); }}>Paid up</Chip>
          <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="tb ml-auto">
            <option value="id">Sort: Student ID</option>
            <option value="name">Sort: Name</option>
            <option value="score">Sort: Score (high–low)</option>
            <option value="att">Sort: Attendance (high–low)</option>
          </select>
        </div>
      </div>

      <ChartCard title={`Roster · ${grp(filtered.length)} students`} subtitle={cls === 'all' ? 'All classes' : clsName(cls)}>
        <div className="overflow-x-auto scroll">
          <table className="tbl">
            <thead>
              <tr><th>Student</th><th>Batch</th><th>Guardian</th><th>Attendance</th><th>Score</th><th>Fee status</th></tr>
            </thead>
            <tbody>
              {pageItems.map((s: any) => (
                <tr key={s.id} className="trow cursor-pointer" onClick={() => setProfile(s)}>
                  <td className="text-left">
                    <div className="font-bold text-[#00296b]">{s.name}</div>
                    <div className="text-[11px] text-[#8795ab]">{s.id}</div>
                  </td>
                  <td className="text-left">{s.batchName}</td>
                  <td className="text-left">{s.guardian}<div className="text-[11px] text-[#8795ab]">{s.phone}</div></td>
                  <td>{s.att}%</td>
                  <td>{s.score.toFixed(1)}</td>
                  <td>
                    {s.dueMonths.length ? (
                      <span className="text-xs font-bold text-[#7a5200] bg-[#fff6cc] px-2 py-1 rounded-full">{s.dueMonths.length} mo due</span>
                    ) : (
                      <span className="text-xs font-bold text-[#0a6f5c] bg-[#e6f6f2] px-2 py-1 rounded-full">Paid up</span>
                    )}
                  </td>
                </tr>
              ))}
              {pageItems.length === 0 && (
                <tr><td colSpan={6} className="text-center text-[#55637a] py-8">No students match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between mt-3 text-[12.5px] text-[#55637a]">
          <span>Page {page + 1} of {totalPages}</span>
          <div className="flex gap-2">
            <button className="tb" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}><Icon name="chevleft" size={14} /></button>
            <button className="tb" disabled={page >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}><Icon name="chevright" size={14} /></button>
          </div>
        </div>
      </ChartCard>

      {profile && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button aria-label="Close" className="absolute inset-0 bg-black/40" onClick={() => setProfile(null)} />
          <div className="relative w-full max-w-md h-full bg-white shadow-2xl p-5 overflow-y-auto scroll">
            <button className="ibtn absolute top-3 right-3" onClick={() => setProfile(null)}><Icon name="x" size={18} /></button>
            <div className="dsp text-lg font-bold text-[#00296b] mt-2">{profile.name}</div>
            <div className="text-[12.5px] text-[#55637a] mb-4">{profile.id} · {profile.batchName}</div>
            <dl className="grid grid-cols-2 gap-3 text-[13px]">
              <Field label="Guardian" value={`${profile.guardian} (${profile.relation})`} />
              <Field label="Phone" value={profile.phone} />
              <Field label="Attendance" value={`${profile.att}%`} />
              <Field label="Latest score" value={profile.score.toFixed(1)} />
              <Field label="Monthly fee" value={'৳' + profile.fee.toLocaleString('en-IN')} />
              <Field label="Admitted" value={profile.admitted} />
              <Field label="Months due" value={profile.dueMonths.length ? profile.dueMonths.join(', ') : 'None'} />
              <Field label="Program" value={PROGRAM_LABEL[profile.program]} />
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-bold text-[#55637a] uppercase tracking-wide">{label}</dt>
      <dd className="text-[#00296b] font-semibold">{value}</dd>
    </div>
  );
}
