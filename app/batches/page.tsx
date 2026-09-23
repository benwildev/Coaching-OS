'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import { useApp } from '@/lib/store';
import { DICTIONARY, toBanglaNumeral } from '@/lib/i18n';
import { BATCH_STATUSES } from '@/lib/validations/batch';
import { DAY_LABELS, formatTimeRange } from '@/lib/schedule';
import type { DayOfWeek } from '@prisma/client';

interface HierarchyProgram {
  id: string;
  name: string;
  banglaName?: string | null;
  classes: Array<{
    id: string;
    name: string;
    banglaName?: string | null;
    groups: Array<{ id: string; name: string; banglaName?: string | null }>;
  }>;
}

interface BatchItem {
  id: string;
  name: string;
  banglaName?: string | null;
  code: string;
  capacity: number;
  status: string;
  branch: { id: string; name: string };
  course?: { id: string; name: string; banglaName?: string | null } | null;
  academicProgram: { id: string; name: string; banglaName?: string | null };
  academicClass: { id: string; name: string; banglaName?: string | null };
  academicGroup?: { id: string; name: string; banglaName?: string | null } | null;
  batchTeacherAssignments: Array<{ teacher: { id: string; name: string; banglaName?: string | null }; subject: { id: string; name: string } }>;
  classSchedules: Array<{ dayOfWeek: DayOfWeek; startTime: string; endTime: string }>;
  _count: { studentBatches: number };
}

export default function BatchesPage() {
  const { lang } = useApp();
  const dict = DICTIONARY[lang];

  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [programFilter, setProgramFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [courseFilter, setCourseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [programs, setPrograms] = useState<HierarchyProgram[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string; banglaName?: string | null }>>([]);
  const [courses, setCourses] = useState<Array<{ id: string; name: string; banglaName?: string | null }>>([]);

  const loadOptions = useCallback(async () => {
    try {
      const res = await fetch('/api/batches/options');
      if (res.ok) {
        const data = await res.json();
        setPrograms(data.programs || []);
        setBranches(data.branches || []);
        setCourses(data.courses || []);
      }
    } catch (err) {
      console.error('Failed to load options', err);
    }
  }, []);

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set('search', search.trim());
      if (branchFilter !== 'all') q.set('branch', branchFilter);
      if (programFilter !== 'all') q.set('program', programFilter);
      if (classFilter !== 'all') q.set('class', classFilter);
      if (groupFilter !== 'all') q.set('group', groupFilter);
      if (courseFilter !== 'all') q.set('course', courseFilter);
      if (statusFilter !== 'all') q.set('status', statusFilter);
      q.set('pageSize', '100');

      const res = await fetch(`/api/batches?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setBatches(data.batches || []);
      }
    } catch (err) {
      console.error('Failed to load batches', err);
    } finally {
      setLoading(false);
    }
  }, [search, branchFilter, programFilter, classFilter, groupFilter, courseFilter, statusFilter]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    const t = setTimeout(fetchBatches, 250);
    return () => clearTimeout(t);
  }, [fetchBatches]);

  const filterProgram = programs.find((p) => p.id === programFilter);
  const filterClasses = filterProgram?.classes || [];
  const filterClassObj = filterClasses.find((c) => c.id === classFilter);
  const filterGroups = filterClassObj?.groups || [];

  function scheduleSummary(schedules: BatchItem['classSchedules']) {
    if (!schedules.length) return null;
    const days = Array.from(new Set(schedules.map((s) => s.dayOfWeek)));
    const dayLabels = days.map((d) => (lang === 'bn' ? DAY_LABELS[d].shortBn : DAY_LABELS[d].short)).join(' · ');
    const time = formatTimeRange(schedules[0].startTime, schedules[0].endTime, lang);
    return `${dayLabels} · ${time}`;
  }

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#063b78] tracking-tight">{dict.batches.title}</h1>
          <p className="text-[13.5px] text-[#64748b] mt-0.5 font-medium">{dict.batches.subtitle}</p>
        </div>
        <Link
          href="/batches/new"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#063b78] px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm hover:bg-[#052e5e] transition-colors"
        >
          <Icon name="plus" size={17} />
          <span>{dict.batches.createBtn}</span>
        </Link>
      </div>

      <div className="card p-4 md:p-5 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-3.5">
        <div className="flex items-center gap-2.5 rounded-xl border border-[#dce5f0] px-3.5 py-2.5 bg-[#f8fafc] max-w-lg focus-within:border-[#063b78] focus-within:bg-white transition-colors">
          <Icon name="search" size={17} className="text-[#64748b]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={dict.batches.searchPlaceholder}
            className="bg-transparent outline-none w-full text-[13.5px] text-[#092f63] placeholder:text-[#94a3b8]"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78]">
            <option value="all">{dict.batches.filterBranch}: {dict.batches.all}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{lang === 'bn' && b.banglaName ? b.banglaName : b.name}</option>
            ))}
          </select>
          <select
            value={programFilter}
            onChange={(e) => { setProgramFilter(e.target.value); setClassFilter('all'); setGroupFilter('all'); }}
            className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78]"
          >
            <option value="all">{dict.batches.filterProgram}: {dict.batches.all}</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>{lang === 'bn' && p.banglaName ? p.banglaName : p.name}</option>
            ))}
          </select>
          <select
            value={classFilter}
            disabled={programFilter === 'all'}
            onChange={(e) => { setClassFilter(e.target.value); setGroupFilter('all'); }}
            className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78] disabled:opacity-50"
          >
            <option value="all">{dict.batches.filterClass}: {dict.batches.all}</option>
            {filterClasses.map((c) => (
              <option key={c.id} value={c.id}>{lang === 'bn' && c.banglaName ? c.banglaName : c.name}</option>
            ))}
          </select>
          <select
            value={groupFilter}
            disabled={filterGroups.length === 0}
            onChange={(e) => setGroupFilter(e.target.value)}
            className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78] disabled:opacity-50"
          >
            <option value="all">{dict.batches.filterGroup}: {dict.batches.all}</option>
            {filterGroups.map((g) => (
              <option key={g.id} value={g.id}>{lang === 'bn' && g.banglaName ? g.banglaName : g.name}</option>
            ))}
          </select>
          <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78]">
            <option value="all">{dict.batches.filterCourse}: {dict.batches.all}</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{lang === 'bn' && c.banglaName ? c.banglaName : c.name}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78]">
            <option value="all">{dict.batches.filterStatus}: {dict.batches.all}</option>
            {BATCH_STATUSES.map((s) => (
              <option key={s} value={s}>{(dict.batchStatus as any)[s]}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="card p-12 rounded-2xl bg-white border border-[#dce5f0] text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
        </div>
      ) : batches.length === 0 ? (
        <div className="card p-12 md:p-16 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs text-center flex flex-col items-center">
          <div className="h-16 w-16 rounded-2xl bg-blue-50 text-[#063b78] flex items-center justify-center mb-4">
            <Icon name="layers" size={32} />
          </div>
          <h2 className="text-xl font-bold text-[#063b78]">{dict.batches.emptyTitle}</h2>
          <p className="text-[14px] text-[#64748b] max-w-md mt-1.5 font-normal">{dict.batches.emptyDesc}</p>
          <Link
            href="/batches/new"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#063b78] px-6 py-2.5 text-[14px] font-semibold text-white shadow-sm hover:bg-[#052e5e] transition-colors"
          >
            <Icon name="plus" size={17} />
            <span>{dict.batches.emptyAction}</span>
          </Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {batches.map((b) => {
            const enrolled = b._count.studentBatches;
            const isFull = enrolled >= b.capacity;
            const summary = scheduleSummary(b.classSchedules);
            const teacherNames = Array.from(
              new Set(b.batchTeacherAssignments.map((a) => (lang === 'bn' && a.teacher.banglaName ? a.teacher.banglaName : a.teacher.name)))
            );

            return (
              <Link
                key={b.id}
                href={`/batches/${b.id}`}
                className="card p-4 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs hover:border-[#063b78] transition-colors flex flex-col gap-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-[#092f63] text-[15px] leading-tight">{b.name}</div>
                    {b.banglaName && <div className="text-[12px] text-[#64748b] mt-0.5">{b.banglaName}</div>}
                  </div>
                  <StatusBadge status={b.status} size="sm" dictKey="batchStatus" />
                </div>

                {b.course && (
                  <div className="text-[12px] font-semibold text-[#063b78]">
                    {lang === 'bn' && b.course.banglaName ? b.course.banglaName : b.course.name}
                  </div>
                )}

                {teacherNames.length > 0 && (
                  <div className="text-[12px] text-[#64748b]">{teacherNames.join(', ')}</div>
                )}

                {summary && (
                  <div className="text-[12px] text-[#64748b] flex items-center gap-1.5">
                    <Icon name="calendar" size={13} />
                    <span>{summary}</span>
                  </div>
                )}

                <div className="pt-1.5 border-t border-[#f1f5f9]">
                  <div className="h-2 rounded-full bg-[#e9eef7] overflow-hidden mb-1">
                    <div
                      className={`h-full rounded-full ${isFull ? 'bg-rose-500' : 'bg-[#00509d]'}`}
                      style={{ width: `${Math.min(100, (enrolled / b.capacity) * 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11.5px] text-[#64748b]">
                    <span>
                      {lang === 'bn' ? `${toBanglaNumeral(enrolled)}/${toBanglaNumeral(b.capacity)} শিক্ষার্থী` : `${enrolled}/${b.capacity} ${dict.batches.seats}`}
                    </span>
                    <span className={isFull ? 'font-bold text-rose-600' : 'font-semibold text-emerald-600'}>
                      {isFull ? dict.batches.full : dict.batches.available}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
