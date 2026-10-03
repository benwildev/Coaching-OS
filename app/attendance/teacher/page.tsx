'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import { useApp } from '@/lib/store';
import { DICTIONARY, toBanglaNumeral, formatDhakaDate } from '@/lib/i18n';
import { ATTENDANCE_STATUSES } from '@/lib/validations/attendance';

interface TeacherItem {
  id: string;
  name: string;
  banglaName?: string | null;
  teacherCode: string;
  phone?: string | null;
  designation?: string | null;
  branchId?: string | null;
  branch?: { id: string; name: string; banglaName?: string | null; code: string } | null;
}

interface TeacherRosterItem {
  teacher: TeacherItem;
  attendance: {
    id?: string;
    status: 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED';
    inTime?: string | null;
    outTime?: string | null;
    remarks?: string | null;
  } | null;
}

interface DailyAttendanceState {
  status: 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED' | 'UNMARKED';
  inTime: string;
  outTime: string;
  remarks: string;
}

export default function TeacherAttendancePage() {
  const { lang, showToast, can, currentUser } = useApp();
  const dict = DICTIONARY[lang];
  const canManage = can('teacher_attendance.create') && currentUser?.role !== 'TEACHER';

  // Current date in YYYY-MM-DD
  const todayDhaka = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(todayDhaka);
  const [branchFilter, setBranchFilter] = useState('all');
  const [branches, setBranches] = useState<Array<{ id: string; name: string; banglaName?: string | null }>>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roster, setRoster] = useState<TeacherRosterItem[]>([]);
  const [items, setItems] = useState<Record<string, DailyAttendanceState>>({});

  // Summary counts
  const [counts, setCounts] = useState({
    total: 0,
    present: 0,
    late: 0,
    absent: 0,
    excused: 0,
    unmarked: 0,
  });

  const loadBranches = useCallback(async () => {
    try {
      const res = await fetch('/api/batches/options');
      if (res.ok) {
        const data = await res.json();
        setBranches(data.branches || []);
      }
    } catch (err) {
      console.error('Failed to load branches', err);
    }
  }, []);

  const loadAttendance = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      q.set('date', date);
      if (branchFilter !== 'all') q.set('branch', branchFilter);

      const res = await fetch(`/api/attendance/teacher?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const list: TeacherRosterItem[] = data.roster || [];
          setRoster(list);

          const initialItems: Record<string, DailyAttendanceState> = {};
          let p = 0, l = 0, a = 0, e = 0, u = 0;

          list.forEach((r) => {
            if (r.attendance) {
              initialItems[r.teacher.id] = {
                status: r.attendance.status,
                inTime: r.attendance.inTime || '',
                outTime: r.attendance.outTime || '',
                remarks: r.attendance.remarks || '',
              };
              if (r.attendance.status === 'PRESENT') p++;
              else if (r.attendance.status === 'LATE') l++;
              else if (r.attendance.status === 'ABSENT') a++;
              else if (r.attendance.status === 'EXCUSED') e++;
            } else {
              initialItems[r.teacher.id] = {
                status: 'UNMARKED',
                inTime: '',
                outTime: '',
                remarks: '',
              };
              u++;
            }
          });

          setItems(initialItems);
          setCounts({
            total: list.length,
            present: p,
            late: l,
            absent: a,
            excused: e,
            unmarked: u,
          });
        }
      }
    } catch (err) {
      console.error('Failed to load daily teacher attendance', err);
      showToast(lang === 'bn' ? 'তথ্য লোড করতে সমস্যা হয়েছে' : 'Failed to load teacher attendance');
    } finally {
      setLoading(false);
    }
  }, [date, branchFilter, lang, showToast]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  // Recalculate summary counts whenever items change
  const updateSummary = (nextItems: Record<string, DailyAttendanceState>) => {
    let p = 0, l = 0, a = 0, e = 0, u = 0;
    Object.values(nextItems).forEach((it) => {
      if (it.status === 'PRESENT') p++;
      else if (it.status === 'LATE') l++;
      else if (it.status === 'ABSENT') a++;
      else if (it.status === 'EXCUSED') e++;
      else u++;
    });
    setCounts({
      total: roster.length,
      present: p,
      late: l,
      absent: a,
      excused: e,
      unmarked: u,
    });
  };

  const setTeacherStatus = (teacherId: string, status: DailyAttendanceState['status']) => {
    setItems((prev) => {
      const next = {
        ...prev,
        [teacherId]: {
          ...(prev[teacherId] || { inTime: '', outTime: '', remarks: '' }),
          status,
        },
      };
      updateSummary(next);
      return next;
    });
  };

  const setTeacherField = (teacherId: string, field: 'inTime' | 'outTime' | 'remarks', value: string) => {
    setItems((prev) => ({
      ...prev,
      [teacherId]: {
        ...(prev[teacherId] || { status: 'UNMARKED', inTime: '', outTime: '', remarks: '' }),
        [field]: value,
      },
    }));
  };

  const markAllPresent = () => {
    const next = { ...items };
    roster.forEach((r) => {
      // If unmarked or absent, mark present
      next[r.teacher.id] = {
        ...(next[r.teacher.id] || { inTime: '', outTime: '', remarks: '' }),
        status: 'PRESENT',
      };
    });
    setItems(next);
    updateSummary(next);
  };

  const saveAttendance = async () => {
    // Collect marked records
    const recordsToSave = [];
    for (const r of roster) {
      const state = items[r.teacher.id];
      if (state && state.status !== 'UNMARKED') {
        recordsToSave.push({
          teacherId: r.teacher.id,
          status: state.status,
          inTime: state.inTime || undefined,
          outTime: state.outTime || undefined,
          remarks: state.remarks || undefined,
        });
      }
    }

    if (recordsToSave.length === 0) {
      showToast(lang === 'bn' ? 'সংরক্ষণ করার মতো কোনো উপস্থিতি চিহ্নিত করা হয়নি' : 'No marked attendance records to save');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/attendance/teacher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          branchId: branchFilter !== 'all' ? branchFilter : undefined,
          records: recordsToSave,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(lang === 'bn' ? 'শিক্ষকদের উপস্থিতি সফলভাবে সংরক্ষিত হয়েছে' : 'Teacher attendance saved successfully');
        loadAttendance();
      } else {
        showToast(data.error || 'Failed to save attendance');
      }
    } catch {
      showToast(lang === 'bn' ? 'সংরক্ষণ করতে সমস্যা হয়েছে' : 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/attendance" className="text-[13px] font-semibold text-[#063b78] hover:underline flex items-center gap-1">
              <Icon name="chevleft" size={15} />
              <span>{dict.attendance.backToAttendance}</span>
            </Link>
            {can('teachers.read') && (
              <>
                <span className="text-[#94a3b8]">·</span>
                <Link href="/teachers" className="text-[13px] font-semibold text-[#64748b] hover:underline">
                  {dict.teachers.title}
                </Link>
              </>
            )}
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#063b78] tracking-tight">
            {dict.teachers.teacherAttendanceTitle}
          </h1>
          <p className="text-[13.5px] text-[#64748b] mt-0.5 font-medium">
            {dict.teachers.teacherAttendanceSubtitle}
          </p>
        </div>

        {canManage && (
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={markAllPresent}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#063b78] text-[#063b78] bg-white px-4 py-2.5 text-[13px] font-semibold shadow-2xs hover:bg-blue-50 transition-colors"
            >
              <Icon name="check" size={15} />
              <span>{dict.teachers.markAllPresent}</span>
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={saveAttendance}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#063b78] text-white px-5 py-2.5 text-[13px] font-semibold shadow-sm hover:bg-[#052e5e] transition-colors disabled:opacity-50"
            >
              {saving ? '…' : dict.teachers.saveAttendance}
            </button>
          </div>
        )}
      </div>

      {/* Date & Branch Controls Card */}
      <div className="card p-4 md:p-5 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
          <div className="flex items-center gap-2 bg-[#f8fafc] border border-[#dce5f0] rounded-xl px-3 py-2">
            <Icon name="calendar" size={16} className="text-[#64748b]" />
            <input
              type="date"
              max={todayDhaka}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent text-[13px] font-bold text-[#092f63] outline-none"
            />
          </div>

          {currentUser?.role !== 'TEACHER' && (
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78]"
            >
              <option value="all">{dict.teachers.filterBranch}: {dict.teachers.all}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {lang === 'bn' && b.banglaName ? b.banglaName : b.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="text-[12.5px] text-[#64748b] font-medium w-full sm:w-auto text-left sm:text-right">
          {formatDhakaDate(date)}
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs text-center">
          <span className="text-[11px] font-bold text-[#64748b] uppercase tracking-wider">{dict.teachers.title}</span>
          <div className="text-2xl font-extrabold text-[#063b78] mt-1">
            {lang === 'bn' ? toBanglaNumeral(counts.total) : counts.total}
          </div>
        </div>
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-100 shadow-2xs text-center">
          <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">{dict.attendance.present}</span>
          <div className="text-2xl font-extrabold text-emerald-700 mt-1">
            {lang === 'bn' ? toBanglaNumeral(counts.present) : counts.present}
          </div>
        </div>
        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-100 shadow-2xs text-center">
          <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">{dict.attendance.late}</span>
          <div className="text-2xl font-extrabold text-amber-700 mt-1">
            {lang === 'bn' ? toBanglaNumeral(counts.late) : counts.late}
          </div>
        </div>
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-100 shadow-2xs text-center">
          <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wider">{dict.attendance.absent}</span>
          <div className="text-2xl font-extrabold text-rose-700 mt-1">
            {lang === 'bn' ? toBanglaNumeral(counts.absent) : counts.absent}
          </div>
        </div>
        <div className="p-3.5 rounded-2xl bg-purple-50 border border-purple-100 shadow-2xs text-center">
          <span className="text-[11px] font-bold text-purple-800 uppercase tracking-wider">{dict.attendance.excused}</span>
          <div className="text-2xl font-extrabold text-purple-700 mt-1">
            {lang === 'bn' ? toBanglaNumeral(counts.excused) : counts.excused}
          </div>
        </div>
        <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200 shadow-2xs text-center">
          <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">{dict.teachers.unmarked}</span>
          <div className="text-2xl font-extrabold text-gray-700 mt-1">
            {lang === 'bn' ? toBanglaNumeral(counts.unmarked) : counts.unmarked}
          </div>
        </div>
      </div>

      {/* Roster List / Table */}
      {loading ? (
        <div className="card p-12 rounded-2xl bg-white border border-[#dce5f0] text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent" />
        </div>
      ) : roster.length === 0 ? (
        <div className="card p-12 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs text-center">
          <p className="text-[14px] text-[#64748b]">{dict.teachers.emptyTitle}</p>
        </div>
      ) : (
        <div className="card rounded-2xl bg-white border border-[#dce5f0] shadow-2xs overflow-hidden">
          <div className="p-4 bg-[#f8fafc] border-b border-[#e2e8f0] flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#063b78] uppercase tracking-wider">{dict.teachers.dailyRoster}</h2>
            <span className="text-[12px] text-[#64748b]">
              {lang === 'bn' ? toBanglaNumeral(roster.length) : roster.length} {dict.teachers.title}
            </span>
          </div>

          <div className="divide-y divide-[#edf2f7]">
            {roster.map(({ teacher }) => {
              const state = items[teacher.id] || { status: 'UNMARKED', inTime: '', outTime: '', remarks: '' };

              return (
                <div key={teacher.id} className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 hover:bg-[#f8fafc]/50 transition-colors">
                  {/* Teacher info */}
                  <div className="flex items-center gap-3 min-w-[240px]">
                    <div className="h-10 w-10 rounded-full bg-[#063b78]/10 text-[#063b78] font-bold flex items-center justify-center text-sm shrink-0">
                      {teacher.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <Link href={`/teachers/${teacher.id}`} className="font-bold text-[#092f63] text-[14px] hover:underline">
                        {teacher.name}
                      </Link>
                      {teacher.banglaName && <div className="text-[11.5px] text-[#64748b]">{teacher.banglaName}</div>}
                      <div className="text-[11px] text-[#8795ab] font-mono mt-0.5">
                        {teacher.teacherCode}
                        {teacher.branch ? ` · ${teacher.branch.name}` : ''}
                      </div>
                    </div>
                  </div>

                  {/* Status Toggle Pills */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      disabled={!canManage}
                      onClick={() => setTeacherStatus(teacher.id, 'PRESENT')}
                      className={`px-3 py-1.5 rounded-xl text-[12px] font-bold border transition-all ${
                        state.status === 'PRESENT'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                          : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                      }`}
                    >
                      {dict.attendance.present}
                    </button>
                    <button
                      type="button"
                      disabled={!canManage}
                      onClick={() => setTeacherStatus(teacher.id, 'LATE')}
                      className={`px-3 py-1.5 rounded-xl text-[12px] font-bold border transition-all ${
                        state.status === 'LATE'
                          ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                          : 'bg-white text-amber-700 border-amber-200 hover:bg-amber-50'
                      }`}
                    >
                      {dict.attendance.late}
                    </button>
                    <button
                      type="button"
                      disabled={!canManage}
                      onClick={() => setTeacherStatus(teacher.id, 'ABSENT')}
                      className={`px-3 py-1.5 rounded-xl text-[12px] font-bold border transition-all ${
                        state.status === 'ABSENT'
                          ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                          : 'bg-white text-rose-700 border-rose-200 hover:bg-rose-50'
                      }`}
                    >
                      {dict.attendance.absent}
                    </button>
                    <button
                      type="button"
                      disabled={!canManage}
                      onClick={() => setTeacherStatus(teacher.id, 'EXCUSED')}
                      className={`px-3 py-1.5 rounded-xl text-[12px] font-bold border transition-all ${
                        state.status === 'EXCUSED'
                          ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                          : 'bg-white text-purple-700 border-purple-200 hover:bg-purple-50'
                      }`}
                    >
                      {dict.attendance.excused}
                    </button>
                  </div>

                  {/* Time & Notes Fields */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-[#64748b]">{dict.attendance.checkIn}:</span>
                      <input
                        type="time"
                        disabled={!canManage}
                        value={state.inTime}
                        onChange={(e) => setTeacherField(teacher.id, 'inTime', e.target.value)}
                        className="rounded-lg border border-[#dce5f0] bg-white px-2 py-1 text-[12px] text-[#092f63] outline-none disabled:bg-gray-100"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-[#64748b]">{dict.attendance.checkOut}:</span>
                      <input
                        type="time"
                        disabled={!canManage}
                        value={state.outTime}
                        onChange={(e) => setTeacherField(teacher.id, 'outTime', e.target.value)}
                        className="rounded-lg border border-[#dce5f0] bg-white px-2 py-1 text-[12px] text-[#092f63] outline-none disabled:bg-gray-100"
                      />
                    </div>
                    <input
                      type="text"
                      disabled={!canManage}
                      placeholder={dict.attendance.notes}
                      value={state.remarks}
                      onChange={(e) => setTeacherField(teacher.id, 'remarks', e.target.value)}
                      className="rounded-lg border border-[#dce5f0] bg-white px-2.5 py-1 text-[12px] text-[#092f63] outline-none w-32 sm:w-40 disabled:bg-gray-100"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
