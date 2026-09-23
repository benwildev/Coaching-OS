'use client';

import { useState, useEffect, useCallback, useTransition, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import { useApp } from '@/lib/store';
import { DICTIONARY, toBanglaNumeral, formatDhakaDate } from '@/lib/i18n';
import { formatBdPhoneDisplay } from '@/lib/validations/student';

interface StudentItem {
  id: string;
  studentIdCode: string;
  name: string;
  banglaName?: string | null;
  gender?: string | null;
  phone?: string | null;
  status: string;
  createdAt: string;
  branch?: { id: string; name: string; code: string } | null;
  educationBoard?: { id: string; name: string; banglaName?: string | null } | null;
  studentGuardians?: Array<{
    isPrimary: boolean;
    relationship: string;
    guardian: {
      id: string;
      name: string;
      banglaName?: string | null;
      phone: string;
      relationship: string;
    };
  }>;
  enrollments?: Array<{
    id: string;
    admissionDate: string;
    status: string;
    academicSession?: { id: string; name: string };
    academicProgram?: { id: string; name: string; banglaName?: string | null };
    academicClass?: { id: string; name: string; banglaName?: string | null };
    academicGroup?: { id: string; name: string; banglaName?: string | null };
    course?: { id: string; name: string; banglaName?: string | null };
    branch?: { id: string; name: string };
  }>;
  studentBatches?: Array<{
    status: string;
    batch: { id: string; name: string; code: string };
  }>;
}

interface StatsData {
  total: number;
  active: number;
  inactive: number;
  newAdmissions: number;
}

function StudentsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang } = useApp();
  const dict = DICTIONARY[lang];
  const [, startTransition] = useTransition();

  // Search & Filters from URL or default
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [sessionFilter, setSessionFilter] = useState(searchParams.get('session') || 'all');
  const [branchFilter, setBranchFilter] = useState(searchParams.get('branch') || 'all');
  const [programFilter, setProgramFilter] = useState(searchParams.get('program') || 'all');
  const [classFilter, setClassFilter] = useState(searchParams.get('class') || 'all');
  const [groupFilter, setGroupFilter] = useState(searchParams.get('group') || 'all');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1', 10));

  // Server data
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState<StatsData>({
    total: 0,
    active: 0,
    inactive: 0,
    newAdmissions: 0,
  });
  const [loading, setLoading] = useState(true);

  // Hierarchy options for filters
  const [options, setOptions] = useState<{
    sessions: Array<{ id: string; name: string; banglaName?: string | null; isCurrent: boolean }>;
    branches: Array<{ id: string; name: string; banglaName?: string | null; isMain: boolean }>;
    programs: Array<{
      id: string;
      name: string;
      banglaName?: string | null;
      classes: Array<{
        id: string;
        name: string;
        banglaName?: string | null;
        groups: Array<{ id: string; name: string; banglaName?: string | null }>;
      }>;
    }>;
  }>({ sessions: [], branches: [], programs: [] });

  // Load filter options once
  useEffect(() => {
    async function loadOptions() {
      try {
        const res = await fetch('/api/academic/options');
        if (res.ok) {
          const data = await res.json();
          setOptions({
            sessions: data.sessions || [],
            branches: data.branches || [],
            programs: data.programs || [],
          });
        }
      } catch (err) {
        console.error('Failed to load academic options', err);
      }
    }
    loadOptions();
  }, []);

  // Update URL search parameters
  const updateUrl = useCallback(
    (params: Record<string, string | number>) => {
      const sp = new URLSearchParams(searchParams.toString());
      Object.entries(params).forEach(([k, v]) => {
        if (!v || v === 'all' || v === 1) {
          sp.delete(k);
        } else {
          sp.set(k, String(v));
        }
      });
      startTransition(() => {
        router.replace(`/students?${sp.toString()}`, { scroll: false });
      });
    },
    [router, searchParams]
  );

  // Fetch student roster
  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set('search', search.trim());
      if (sessionFilter !== 'all') q.set('session', sessionFilter);
      if (branchFilter !== 'all') q.set('branch', branchFilter);
      if (programFilter !== 'all') q.set('program', programFilter);
      if (classFilter !== 'all') q.set('class', classFilter);
      if (groupFilter !== 'all') q.set('group', groupFilter);
      if (statusFilter !== 'all') q.set('status', statusFilter);
      q.set('page', String(page));
      q.set('pageSize', '15');

      const res = await fetch(`/api/students?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setStudents(data.students || []);
        setTotalStudents(data.total || 0);
        setTotalPages(data.totalPages || 1);
        if (data.stats) {
          setStats(data.stats);
        }
      }
    } catch (err) {
      console.error('Failed to load students roster', err);
    } finally {
      setLoading(false);
    }
  }, [search, sessionFilter, branchFilter, programFilter, classFilter, groupFilter, statusFilter, page]);

  // Debounced search / filter trigger
  useEffect(() => {
    const handler = setTimeout(() => {
      fetchStudents();
    }, 250);
    return () => clearTimeout(handler);
  }, [fetchStudents]);

  // Reset page when filters change
  const handleFilterChange = (setter: (v: string) => void, paramName: string, val: string) => {
    setter(val);
    setPage(1);
    updateUrl({ [paramName]: val, page: 1 });
  };

  const handleResetFilters = () => {
    setSearch('');
    setSessionFilter('all');
    setBranchFilter('all');
    setProgramFilter('all');
    setClassFilter('all');
    setGroupFilter('all');
    setStatusFilter('all');
    setPage(1);
    router.replace('/students');
  };

  // Derive child classes based on selected program
  const selectedProgramObj = options.programs.find((p) => p.id === programFilter);
  const availableClasses = selectedProgramObj ? selectedProgramObj.classes : [];
  const selectedClassObj = availableClasses.find((c) => c.id === classFilter);
  const availableGroups = selectedClassObj ? selectedClassObj.groups : [];

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#063b78] tracking-tight">
            {dict.students.title}
          </h1>
          <p className="text-[13.5px] text-[#64748b] mt-0.5 font-medium">
            {dict.students.subtitle}
          </p>
        </div>
        <Link
          href="/students/new"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#063b78] px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm hover:bg-[#052e5e] transition-colors"
        >
          <Icon name="userplus" size={17} />
          <span>{dict.students.admitBtn}</span>
        </Link>
      </div>

      {/* Real Database KPI Metrics (Zero Fabricated Metrics) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-[#64748b] uppercase tracking-wider">
              {dict.students.totalStudents}
            </span>
            <div className="p-2 rounded-xl bg-blue-50 text-[#063b78]">
              <Icon name="user" size={18} />
            </div>
          </div>
          <div className="mt-2 text-2xl md:text-3xl font-extrabold text-[#063b78]">
            {lang === 'bn' ? toBanglaNumeral(stats.total) : stats.total}
          </div>
          <p className="text-[11px] text-[#8795ab] mt-1 font-medium">
            {lang === 'bn' ? 'নিবন্ধিত সর্বমোট শিক্ষার্থী' : 'All registered student profiles'}
          </p>
        </div>

        <div className="card p-4 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-[#64748b] uppercase tracking-wider">
              {dict.students.activeStudents}
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <Icon name="check" size={18} />
            </div>
          </div>
          <div className="mt-2 text-2xl md:text-3xl font-extrabold text-emerald-600">
            {lang === 'bn' ? toBanglaNumeral(stats.active) : stats.active}
          </div>
          <p className="text-[11px] text-[#8795ab] mt-1 font-medium">
            {lang === 'bn' ? 'বর্তমানে ক্লাস/কোর্সে সক্রিয়' : 'Actively enrolled & attending'}
          </p>
        </div>

        <div className="card p-4 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-[#64748b] uppercase tracking-wider">
              {dict.students.inactiveStudents}
            </span>
            <div className="p-2 rounded-xl bg-slate-50 text-slate-500">
              <Icon name="layers" size={18} />
            </div>
          </div>
          <div className="mt-2 text-2xl md:text-3xl font-extrabold text-slate-600">
            {lang === 'bn' ? toBanglaNumeral(stats.inactive) : stats.inactive}
          </div>
          <p className="text-[11px] text-[#8795ab] mt-1 font-medium">
            {lang === 'bn' ? 'স্থগিত বা কোর্স সমাপ্ত শিক্ষার্থী' : 'Completed, transferred, or paused'}
          </p>
        </div>

        <div className="card p-4 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-[#64748b] uppercase tracking-wider">
              {dict.students.newAdmissions}
            </span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <Icon name="plus" size={18} />
            </div>
          </div>
          <div className="mt-2 text-2xl md:text-3xl font-extrabold text-amber-600">
            {lang === 'bn' ? toBanglaNumeral(stats.newAdmissions) : stats.newAdmissions}
          </div>
          <p className="text-[11px] text-[#8795ab] mt-1 font-medium">
            {lang === 'bn' ? 'গত ৩০ দিনে নতুন ভর্তি' : 'Admitted in last 30 days'}
          </p>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="card p-4 md:p-5 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-3.5">
        {/* Search Input Bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2.5 rounded-xl border border-[#dce5f0] px-3.5 py-2.5 bg-[#f8fafc] grow max-w-lg focus-within:border-[#063b78] focus-within:bg-white transition-colors">
            <Icon name="search" size={17} className="text-[#64748b]" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
                updateUrl({ search: e.target.value, page: 1 });
              }}
              placeholder={dict.students.searchPlaceholder}
              className="bg-transparent outline-none w-full text-[13.5px] text-[#092f63] placeholder:text-[#94a3b8]"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setPage(1);
                  updateUrl({ search: '', page: 1 });
                }}
                className="text-[#94a3b8] hover:text-[#092f63]"
              >
                <Icon name="x" size={15} />
              </button>
            )}
          </div>

          {(search || sessionFilter !== 'all' || branchFilter !== 'all' || programFilter !== 'all' || classFilter !== 'all' || groupFilter !== 'all' || statusFilter !== 'all') && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#dce5f0] bg-white px-3.5 py-2 text-[12.5px] font-semibold text-[#64748b] hover:bg-[#f8fafc] transition-colors"
            >
              <Icon name="x" size={14} />
              <span>{lang === 'bn' ? 'ফিল্টার রিসেট' : 'Reset Filters'}</span>
            </button>
          )}
        </div>

        {/* Filter Dropdowns Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-1">
          {/* Session */}
          <select
            value={sessionFilter}
            onChange={(e) => handleFilterChange(setSessionFilter, 'session', e.target.value)}
            className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78]"
          >
            <option value="all">{dict.students.filterSession}: {dict.students.all}</option>
            {options.sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {lang === 'bn' && s.banglaName ? s.banglaName : s.name} {s.isCurrent ? (lang === 'bn' ? '(বর্তমান)' : '(Current)') : ''}
              </option>
            ))}
          </select>

          {/* Branch */}
          <select
            value={branchFilter}
            onChange={(e) => handleFilterChange(setBranchFilter, 'branch', e.target.value)}
            className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78]"
          >
            <option value="all">{dict.students.filterBranch}: {dict.students.all}</option>
            {options.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {lang === 'bn' && b.banglaName ? b.banglaName : b.name} {b.isMain ? (lang === 'bn' ? '(প্রধান)' : '(Main)') : ''}
              </option>
            ))}
          </select>

          {/* Program */}
          <select
            value={programFilter}
            onChange={(e) => {
              handleFilterChange(setProgramFilter, 'program', e.target.value);
              setClassFilter('all');
              setGroupFilter('all');
            }}
            className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78]"
          >
            <option value="all">{dict.students.filterProgram}: {dict.students.all}</option>
            {options.programs.map((p) => (
              <option key={p.id} value={p.id}>
                {lang === 'bn' && p.banglaName ? p.banglaName : p.name}
              </option>
            ))}
          </select>

          {/* Class */}
          <select
            value={classFilter}
            disabled={programFilter === 'all'}
            onChange={(e) => {
              handleFilterChange(setClassFilter, 'class', e.target.value);
              setGroupFilter('all');
            }}
            className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78] disabled:opacity-50"
          >
            <option value="all">{dict.students.filterClass}: {dict.students.all}</option>
            {availableClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {lang === 'bn' && c.banglaName ? c.banglaName : c.name}
              </option>
            ))}
          </select>

          {/* Group */}
          <select
            value={groupFilter}
            disabled={classFilter === 'all' || availableGroups.length === 0}
            onChange={(e) => handleFilterChange(setGroupFilter, 'group', e.target.value)}
            className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78] disabled:opacity-50"
          >
            <option value="all">{dict.students.filterGroup}: {dict.students.all}</option>
            {availableGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {lang === 'bn' && g.banglaName ? g.banglaName : g.name}
              </option>
            ))}
          </select>

          {/* Status */}
          <select
            value={statusFilter}
            onChange={(e) => handleFilterChange(setStatusFilter, 'status', e.target.value)}
            className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78]"
          >
            <option value="all">{dict.students.filterStatus}: {dict.students.all}</option>
            <option value="ACTIVE">{dict.studentStatus.ACTIVE}</option>
            <option value="INACTIVE">{dict.studentStatus.INACTIVE}</option>
            <option value="TRANSFERRED">{dict.studentStatus.TRANSFERRED}</option>
            <option value="COMPLETED">{dict.studentStatus.COMPLETED}</option>
            <option value="DROPPED_OUT">{dict.studentStatus.DROPPED_OUT}</option>
          </select>
        </div>
      </div>

      {/* Student List View */}
      {loading ? (
        <div className="card p-12 rounded-2xl bg-white border border-[#dce5f0] text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
          <p className="mt-3 text-[14px] text-[#64748b] font-medium">
            {lang === 'bn' ? 'শিক্ষার্থীদের তথ্য লোড হচ্ছে…' : 'Loading student records…'}
          </p>
        </div>
      ) : students.length === 0 ? (
        /* Meaningful Empty State */
        <div className="card p-12 md:p-16 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs text-center flex flex-col items-center">
          <div className="h-16 w-16 rounded-2xl bg-blue-50 text-[#063b78] flex items-center justify-center mb-4">
            <Icon name="user" size={32} />
          </div>
          <h2 className="text-xl font-bold text-[#063b78]">{dict.students.emptyTitle}</h2>
          <p className="text-[14px] text-[#64748b] max-w-md mt-1.5 font-normal">
            {dict.students.emptyDesc}
          </p>
          <Link
            href="/students/new"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#063b78] px-6 py-2.5 text-[14px] font-semibold text-white shadow-sm hover:bg-[#052e5e] transition-colors"
          >
            <Icon name="userplus" size={17} />
            <span>{dict.students.emptyAction}</span>
          </Link>
        </div>
      ) : (
        <>
          {/* Desktop & Tablet Table (Hidden on Mobile) */}
          <div className="hidden md:block card rounded-2xl bg-white border border-[#dce5f0] shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#e2e8f0] bg-[#f8fafc] text-[12px] font-bold text-[#64748b] uppercase tracking-wider">
                    <th className="py-3.5 px-4">{dict.students.colId}</th>
                    <th className="py-3.5 px-4">{dict.students.colName}</th>
                    <th className="py-3.5 px-4">{dict.students.colProgram}</th>
                    <th className="py-3.5 px-4 hidden lg:table-cell">{dict.students.colCourse}</th>
                    <th className="py-3.5 px-4 hidden xl:table-cell">{dict.students.colBatch}</th>
                    <th className="py-3.5 px-4">{dict.students.colGuardian}</th>
                    <th className="py-3.5 px-4">{dict.students.colStatus}</th>
                    <th className="py-3.5 px-4 hidden lg:table-cell">{dict.students.colEnrolled}</th>
                    <th className="py-3.5 px-4 text-right">{dict.students.colActions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf2f7] text-[13.5px]">
                  {students.map((student) => {
                    const latestEnrollment = student.enrollments?.[0];
                    const activeBatch = student.studentBatches?.[0]?.batch;
                    const primaryGuardian = student.studentGuardians?.[0]?.guardian;
                    const relationCode = student.studentGuardians?.[0]?.relationship as keyof typeof dict.relations;

                    return (
                      <tr
                        key={student.id}
                        className="hover:bg-[#f8fafc]/80 transition-colors group"
                      >
                        {/* Student ID */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <Link
                            href={`/students/${student.id}`}
                            className="font-mono text-[12.5px] font-bold text-[#063b78] hover:underline"
                          >
                            {student.studentIdCode}
                          </Link>
                          {student.branch && (
                            <div className="text-[11px] text-[#8795ab] font-medium">
                              {student.branch.code}
                            </div>
                          )}
                        </td>

                        {/* Student Name */}
                        <td className="py-3.5 px-4">
                          <Link
                            href={`/students/${student.id}`}
                            className="flex items-center gap-3 group-hover:text-[#063b78]"
                          >
                            <div className="h-9 w-9 rounded-full bg-[#063b78]/10 text-[#063b78] font-bold flex items-center justify-center text-sm shrink-0">
                              {student.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-[#092f63] leading-tight">
                                {student.name}
                              </div>
                              {student.banglaName && (
                                <div className="text-[12px] text-[#64748b] font-medium">
                                  {student.banglaName}
                                </div>
                              )}
                            </div>
                          </Link>
                        </td>

                        {/* Program & Class */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {latestEnrollment ? (
                            <div>
                              <div className="font-semibold text-[#092f63]">
                                {lang === 'bn' && latestEnrollment.academicProgram?.banglaName
                                  ? latestEnrollment.academicProgram.banglaName
                                  : latestEnrollment.academicProgram?.name || '—'}
                              </div>
                              <div className="text-[11.5px] text-[#64748b]">
                                {lang === 'bn' && latestEnrollment.academicClass?.banglaName
                                  ? latestEnrollment.academicClass.banglaName
                                  : latestEnrollment.academicClass?.name || ''}
                                {latestEnrollment.academicGroup && (
                                  <span>
                                    {' '}
                                    ·{' '}
                                    {lang === 'bn' && latestEnrollment.academicGroup.banglaName
                                      ? latestEnrollment.academicGroup.banglaName
                                      : latestEnrollment.academicGroup.name}
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[#94a3b8]">—</span>
                          )}
                        </td>

                        {/* Course (LG screens) */}
                        <td className="py-3.5 px-4 hidden lg:table-cell whitespace-nowrap">
                          {latestEnrollment?.course ? (
                            <span className="text-[13px] font-medium text-[#334155]">
                              {lang === 'bn' && latestEnrollment.course.banglaName
                                ? latestEnrollment.course.banglaName
                                : latestEnrollment.course.name}
                            </span>
                          ) : (
                            <span className="text-[#94a3b8] text-[12px]">—</span>
                          )}
                        </td>

                        {/* Batch (XL screens) */}
                        <td className="py-3.5 px-4 hidden xl:table-cell whitespace-nowrap">
                          {activeBatch ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2.5 py-1 text-[12px] font-semibold text-[#063b78]">
                              {activeBatch.name}
                            </span>
                          ) : (
                            <span className="text-[#94a3b8] text-[12px] italic">
                              {lang === 'bn' ? 'অনির্ধারিত' : 'Unassigned'}
                            </span>
                          )}
                        </td>

                        {/* Guardian Contact */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {primaryGuardian ? (
                            <div>
                              <div className="font-semibold text-[#092f63] flex items-center gap-1.5">
                                <span>{primaryGuardian.name}</span>
                                {relationCode && dict.relations[relationCode] && (
                                  <span className="text-[10px] font-medium rounded bg-slate-100 px-1.5 py-0.2 text-[#475569]">
                                    {dict.relations[relationCode]}
                                  </span>
                                )}
                              </div>
                              <div className="font-mono text-[11.5px] text-[#64748b] mt-0.5">
                                {formatBdPhoneDisplay(primaryGuardian.phone)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[#94a3b8]">—</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <StatusBadge status={student.status} size="sm" />
                        </td>

                        {/* Enrolled Date (LG screens) */}
                        <td className="py-3.5 px-4 hidden lg:table-cell whitespace-nowrap text-[12.5px] text-[#64748b]">
                          {latestEnrollment?.admissionDate
                            ? formatDhakaDate(latestEnrollment.admissionDate)
                            : formatDhakaDate(student.createdAt)}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 whitespace-nowrap text-right">
                          <div className="inline-flex items-center gap-1">
                            <Link
                              href={`/students/${student.id}`}
                              className="p-1.5 rounded-lg text-[#64748b] hover:text-[#063b78] hover:bg-blue-50 transition-colors"
                              title={dict.students.viewProfile}
                            >
                              <Icon name="user" size={16} />
                            </Link>
                            <Link
                              href={`/students/${student.id}/edit`}
                              className="p-1.5 rounded-lg text-[#64748b] hover:text-[#063b78] hover:bg-blue-50 transition-colors"
                              title={dict.students.editStudent}
                            >
                              <Icon name="sliders" size={16} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card List View (Strictly Responsive: No Horizontal Overflow) */}
          <div className="block md:hidden flex flex-col gap-3">
            {students.map((student) => {
              const latestEnrollment = student.enrollments?.[0];
              const primaryGuardian = student.studentGuardians?.[0]?.guardian;

              return (
                <div
                  key={student.id}
                  className="card p-4 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-[#063b78]/10 text-[#063b78] font-bold flex items-center justify-center text-sm shrink-0">
                        {student.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <Link
                          href={`/students/${student.id}`}
                          className="font-bold text-[#092f63] text-[15px] hover:underline"
                        >
                          {student.name}
                        </Link>
                        {student.banglaName && (
                          <div className="text-[12px] text-[#64748b] font-medium">
                            {student.banglaName}
                          </div>
                        )}
                        <div className="font-mono text-[11.5px] font-bold text-[#063b78] mt-0.5">
                          {student.studentIdCode}
                        </div>
                      </div>
                    </div>
                    <StatusBadge status={student.status} size="sm" />
                  </div>

                  {/* Academic & Batch Pills */}
                  {latestEnrollment && (
                    <div className="flex items-center gap-1.5 flex-wrap text-[11.5px]">
                      <span className="rounded-md bg-blue-50 px-2 py-0.5 font-semibold text-[#063b78]">
                        {lang === 'bn' && latestEnrollment.academicProgram?.banglaName
                          ? latestEnrollment.academicProgram.banglaName
                          : latestEnrollment.academicProgram?.name}
                      </span>
                      {latestEnrollment.academicClass && (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-[#475569]">
                          {lang === 'bn' && latestEnrollment.academicClass.banglaName
                            ? latestEnrollment.academicClass.banglaName
                            : latestEnrollment.academicClass.name}
                        </span>
                      )}
                      {latestEnrollment.academicGroup && (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-[#475569]">
                          {lang === 'bn' && latestEnrollment.academicGroup.banglaName
                            ? latestEnrollment.academicGroup.banglaName
                            : latestEnrollment.academicGroup.name}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Guardian info */}
                  {primaryGuardian && (
                    <div className="flex items-center justify-between text-[12px] pt-1 border-t border-[#f1f5f9]">
                      <span className="text-[#64748b] font-medium">
                        {primaryGuardian.name} ({primaryGuardian.relationship})
                      </span>
                      <a
                        href={`tel:${primaryGuardian.phone}`}
                        className="font-mono font-semibold text-[#063b78] hover:underline"
                      >
                        {formatBdPhoneDisplay(primaryGuardian.phone)}
                      </a>
                    </div>
                  )}

                  {/* Action link */}
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#f1f5f9]">
                    <Link
                      href={`/students/${student.id}`}
                      className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#063b78] hover:underline"
                    >
                      <span>{dict.students.viewProfile}</span>
                      <Icon name="chevronright" size={14} />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="card p-3 md:p-4 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex items-center justify-between flex-wrap gap-3">
              <span className="text-[13px] text-[#64748b] font-medium">
                {lang === 'bn'
                  ? `মোট ${toBanglaNumeral(totalStudents)} জন শিক্ষার্থীর মধ্যে পৃষ্ঠা ${toBanglaNumeral(page)} / ${toBanglaNumeral(totalPages)}`
                  : `Showing page ${page} of ${totalPages} (${totalStudents} students total)`}
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => {
                    const prev = Math.max(1, page - 1);
                    setPage(prev);
                    updateUrl({ page: prev });
                  }}
                  className="rounded-lg border border-[#dce5f0] px-3 py-1.5 text-[12.5px] font-semibold text-[#092f63] hover:bg-[#f8fafc] disabled:opacity-40 transition-colors"
                >
                  {lang === 'bn' ? 'পূর্ববর্তী' : 'Previous'}
                </button>

                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => {
                    const next = Math.min(totalPages, page + 1);
                    setPage(next);
                    updateUrl({ page: next });
                  }}
                  className="rounded-lg border border-[#dce5f0] px-3 py-1.5 text-[12.5px] font-semibold text-[#092f63] hover:bg-[#f8fafc] disabled:opacity-40 transition-colors"
                >
                  {lang === 'bn' ? 'পরবর্তী' : 'Next'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function StudentsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[400px] items-center justify-center p-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#063B78] border-t-transparent" />
        </div>
      }
    >
      <StudentsPageContent />
    </Suspense>
  );
}

