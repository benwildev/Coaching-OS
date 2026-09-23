'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate } from '@/lib/i18n';
import { formatTimeRange } from '@/lib/schedule';

export default function AttendanceHistoryPage() {
  const { lang } = useApp();
  const dict = DICTIONARY[lang];

  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    branch: 'all',
    session: 'all',
    program: 'all',
    class: 'all',
    group: 'all',
    batch: 'all',
    subject: 'all',
    teacher: 'all',
    status: 'all',
  });

  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const [branches, setBranches] = useState<any[]>([]);
  const [academicSessions, setAcademicSessions] = useState<any[]>([]);
  const [programs, setPrograms] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/batches/options');
      if (res.ok) {
        const data = await res.json();
        setBranches(data.branches || []);
        setAcademicSessions(data.sessions || []);
        setPrograms(data.programs || []);
        setBatches(data.batches || []);
        setTeachers(data.teachers || []);
      }
    })();
  }, []);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v && v !== 'all') q.set(k, v);
      });
      q.set('pageSize', '30');
      const res = await fetch(`/api/attendance/history?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setSessions(data.sessions);
          setTotal(data.total);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const t = setTimeout(fetchHistory, 200);
    return () => clearTimeout(t);
  }, [fetchHistory]);

  const selectedProgram = programs.find((p) => p.id === filters.program);
  const availableClasses = selectedProgram?.classes || [];
  const selectedClass = availableClasses.find((c: any) => c.id === filters.class);
  const availableGroups = selectedClass?.groups || [];
  const availableSubjects = selectedClass?.subjects || [];

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-6">
      <div>
        <Link href="/attendance" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#063b78] hover:underline mb-2">
          <Icon name="chevleft" size={16} />
          <span>{dict.attendance.backToAttendance}</span>
        </Link>
        <h1 className="text-2xl md:text-3xl font-extrabold text-[#063b78] tracking-tight">{dict.attendance.history}</h1>
      </div>

      <div className="card p-4 md:p-5 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          <div className="fld !gap-1">
            <label className="text-[11px]">{dict.attendance.dateFrom}</label>
            <input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} />
          </div>
          <div className="fld !gap-1">
            <label className="text-[11px]">{dict.attendance.dateTo}</label>
            <input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} />
          </div>
          <select value={filters.branch} onChange={(e) => setFilters({ ...filters, branch: e.target.value })} className="rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] self-end h-[42px]">
            <option value="all">{dict.attendance.allBranches}</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={filters.session} onChange={(e) => setFilters({ ...filters, session: e.target.value })} className="rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] self-end h-[42px]">
            <option value="all">{lang === 'bn' ? 'শিক্ষাবর্ষ' : 'Academic Session'}</option>
            {academicSessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={filters.program} onChange={(e) => setFilters({ ...filters, program: e.target.value, class: 'all', group: 'all', subject: 'all' })} className="rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] self-end h-[42px]">
            <option value="all">{lang === 'bn' ? 'প্রোগ্রাম' : 'Program'}</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={filters.class} disabled={filters.program === 'all'} onChange={(e) => setFilters({ ...filters, class: e.target.value, group: 'all', subject: 'all' })} className="rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] disabled:opacity-50">
            <option value="all">{lang === 'bn' ? 'শ্রেণি' : 'Class'}</option>
            {availableClasses.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filters.group} disabled={!availableGroups.length} onChange={(e) => setFilters({ ...filters, group: e.target.value })} className="rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] disabled:opacity-50">
            <option value="all">{lang === 'bn' ? 'বিভাগ' : 'Group'}</option>
            {availableGroups.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <select value={filters.batch} onChange={(e) => setFilters({ ...filters, batch: e.target.value })} className="rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px]">
            <option value="all">{dict.attendance.batch}</option>
            {batches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={filters.subject} disabled={!availableSubjects.length} onChange={(e) => setFilters({ ...filters, subject: e.target.value })} className="rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] disabled:opacity-50">
            <option value="all">{dict.attendance.subject}</option>
            {availableSubjects.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={filters.teacher} onChange={(e) => setFilters({ ...filters, teacher: e.target.value })} className="rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px]">
            <option value="all">{dict.attendance.teacher}</option>
            {teachers.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px]">
            <option value="all">{dict.attendance.title}: {lang === 'bn' ? 'সকল' : 'All'}</option>
            <option value="OPEN">{dict.sessionStatus.OPEN}</option>
            <option value="COMPLETED">{dict.sessionStatus.COMPLETED}</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="card p-12 rounded-2xl bg-white border border-[#dce5f0] text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="card p-12 rounded-2xl bg-white border border-[#dce5f0] text-center text-[14px] text-[#64748b]">
          {dict.attendance.emptyHistory}
        </div>
      ) : (
        <div className="card rounded-2xl bg-white border border-[#dce5f0] shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#e2e8f0] bg-[#f8fafc] text-[12px] font-bold text-[#64748b] uppercase tracking-wider">
                  <th className="py-3 px-4">{dict.attendance.date}</th>
                  <th className="py-3 px-4">{dict.attendance.subject}</th>
                  <th className="py-3 px-4">{dict.attendance.batch}</th>
                  <th className="py-3 px-4">{dict.attendance.teacher}</th>
                  <th className="py-3 px-4">{dict.attendance.present}/{dict.attendance.absent}/{dict.attendance.late}/{dict.attendance.excused}</th>
                  <th className="py-3 px-4">{dict.attendance.title}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf2f7] text-[13px]">
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-[#f8fafc]/80">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <Link href={`/attendance/${s.id}`} className="font-semibold text-[#063b78] hover:underline">
                        {formatDhakaDate(s.date)}
                      </Link>
                      {s.startTime && <div className="text-[11px] text-[#8795ab]">{formatTimeRange(s.startTime, s.endTime, lang)}</div>}
                    </td>
                    <td className="py-3 px-4">{s.subject?.name || '—'}</td>
                    <td className="py-3 px-4">{s.batch.name}</td>
                    <td className="py-3 px-4">{s.teacher?.name || '—'}</td>
                    <td className="py-3 px-4 font-mono text-[12px]">
                      <span className="text-emerald-600 font-bold">{s.counts.present}</span>/
                      <span className="text-rose-600 font-bold">{s.counts.absent}</span>/
                      <span className="text-amber-600 font-bold">{s.counts.late}</span>/
                      <span className="text-indigo-600 font-bold">{s.counts.excused}</span>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={s.isIncomplete ? 'COMPLETED' : s.status} size="sm" dictKey="sessionStatus" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 text-[12px] text-[#64748b] border-t border-[#edf2f7]">
            {lang === 'bn' ? `মোট ${total} টি সেশন` : `${total} sessions total`}
          </div>
        </div>
      )}
    </div>
  );
}
