'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import BatchFinancialTab from '@/components/BatchFinancialTab';
import BatchPerformanceTab from '@/components/BatchPerformanceTab';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate, toBanglaNumeral } from '@/lib/i18n';
import { BATCH_STATUSES } from '@/lib/validations/batch';
import { DAY_LABELS, formatTimeRange } from '@/lib/schedule';

type Tab = 'overview' | 'students' | 'subjects' | 'teachers' | 'routine' | 'room' | 'attendance' | 'financial' | 'performance' | 'history';

export default function BatchDetailPage() {
  const params = useParams();
  const batchId = params.batchId as string;
  const { lang, showToast } = useApp();
  const dict = DICTIONARY[lang];

  const [batch, setBatch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [saving, setSaving] = useState(false);
  const [availableSubjects, setAvailableSubjects] = useState<Array<{ id: string; name: string; banglaName?: string | null }>>([]);
  const [teacherOptions, setTeacherOptions] = useState<Array<{ id: string; name: string; banglaName?: string | null }>>([]);

  const [overviewForm, setOverviewForm] = useState<any>(null);
  const [subjectSelection, setSubjectSelection] = useState<string[]>([]);

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [studentQuery, setStudentQuery] = useState('');
  const [studentResults, setStudentResults] = useState<any[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [overrideCapacity, setOverrideCapacity] = useState(false);

  const [teacherModalOpen, setTeacherModalOpen] = useState(false);
  const [teacherAssign, setTeacherAssign] = useState({ teacherId: '', subjectId: '' });

  const [attendanceSummary, setAttendanceSummary] = useState<any>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [batchRes, optionsRes] = await Promise.all([
        fetch(`/api/batches/${batchId}`),
        fetch('/api/batches/options'),
      ]);
      if (batchRes.ok) {
        const data = await batchRes.json();
        if (data.success) {
          const b = data.batch;
          setBatch(b);
          setOverviewForm({
            name: b.name,
            banglaName: b.banglaName || '',
            code: b.code,
            description: b.description || '',
            capacity: b.capacity,
            startDate: b.startDate ? b.startDate.slice(0, 10) : '',
            endDate: b.endDate ? b.endDate.slice(0, 10) : '',
            status: b.status,
          });
          setSubjectSelection(b.batchSubjects.map((bs: any) => bs.subject.id));

          if (optionsRes.ok) {
            const opt = await optionsRes.json();
            const program = (opt.programs || []).find((p: any) => p.id === b.academicProgram.id);
            const cls = program?.classes?.find((c: any) => c.id === b.academicClass.id);
            setAvailableSubjects(cls?.subjects || []);
            setTeacherOptions(
              (opt.teachers || []).filter((t: any) => !t.branchId || t.branchId === b.branch.id)
            );
          }
        }
      }
    } catch (err) {
      console.error('Failed to load batch', err);
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab !== 'attendance' || attendanceSummary) return;
    setAttendanceLoading(true);
    fetch(`/api/attendance/batch/${batchId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setAttendanceSummary(data);
      })
      .catch((err) => console.error('Failed to load batch attendance', err))
      .finally(() => setAttendanceLoading(false));
  }, [tab, attendanceSummary, batchId]);

  useEffect(() => {
    if (!assignModalOpen) return;
    const t = setTimeout(async () => {
      const q = new URLSearchParams();
      if (studentQuery.trim()) q.set('search', studentQuery.trim());
      q.set('pageSize', '8');
      const res = await fetch(`/api/students?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const activeIds = new Set((batch?.studentBatches || []).map((sb: any) => sb.student.id));
        setStudentResults((data.students || []).filter((s: any) => !activeIds.has(s.id)));
      }
    }, 250);
    return () => clearTimeout(t);
  }, [studentQuery, assignModalOpen, batch]);

  const saveOverview = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/batches/${batchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...overviewForm, capacity: Number(overviewForm.capacity) }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(lang === 'bn' ? 'ব্যাচ আপডেট হয়েছে' : 'Batch updated successfully');
        load();
      } else {
        showToast(data.error || 'Failed to update batch');
      }
    } finally {
      setSaving(false);
    }
  };

  const saveSubjects = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/batches/${batchId}/subjects`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectIds: subjectSelection }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(lang === 'bn' ? 'বিষয়সমূহ সংরক্ষিত হয়েছে' : 'Subjects saved successfully');
        load();
      } else {
        showToast(data.error || 'Failed to save subjects');
      }
    } finally {
      setSaving(false);
    }
  };

  const assignStudent = async () => {
    if (!selectedStudentId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/batches/${batchId}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: selectedStudentId, overrideCapacity }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(lang === 'bn' ? 'শিক্ষার্থী যুক্ত হয়েছে' : 'Student assigned successfully');
        setAssignModalOpen(false);
        setSelectedStudentId('');
        setStudentQuery('');
        setOverrideCapacity(false);
        load();
      } else {
        showToast(data.error === 'This batch is full. Enable override to exceed capacity.' ? dict.batches.batchFull : data.error);
      }
    } finally {
      setSaving(false);
    }
  };

  const removeStudent = async (studentBatchId: string) => {
    const res = await fetch(`/api/batches/${batchId}/students/${studentBatchId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'DROPPED', endDate: new Date().toISOString().slice(0, 10) }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(lang === 'bn' ? 'শিক্ষার্থী অপসারিত হয়েছে' : 'Student removed from batch');
      load();
    } else {
      showToast(data.error || 'Failed to remove student');
    }
  };

  const assignTeacher = async () => {
    if (!teacherAssign.teacherId || !teacherAssign.subjectId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/batches/${batchId}/teachers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(teacherAssign),
      });
      const data = await res.json();
      if (data.success) {
        showToast(lang === 'bn' ? 'শিক্ষক নিয়োগ হয়েছে' : 'Teacher assigned successfully');
        setTeacherModalOpen(false);
        setTeacherAssign({ teacherId: '', subjectId: '' });
        load();
      } else {
        showToast(data.error || 'Failed to assign teacher');
      }
    } finally {
      setSaving(false);
    }
  };

  const removeTeacher = async (assignmentId: string) => {
    const res = await fetch(`/api/batches/${batchId}/teachers/${assignmentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ENDED', endDate: new Date().toISOString().slice(0, 10) }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(lang === 'bn' ? 'শিক্ষক অপসারিত হয়েছে' : 'Teacher removed from batch');
      load();
    } else {
      showToast(data.error || 'Failed to remove teacher');
    }
  };

  if (loading || !batch) {
    return (
      <div className="max-w-[1100px] mx-auto flex items-center justify-center min-h-[300px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#063b78] border-t-transparent" />
      </div>
    );
  }

  const enrolled = batch.activeStudentCount ?? batch.studentBatches.length;
  const isFull = enrolled >= batch.capacity;
  const roomsUsed = Array.from(
    new Map(
      batch.classSchedules.filter((cs: any) => cs.room).map((cs: any) => [cs.room.id, cs.room])
    ).values()
  );

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: dict.batches.tabOverview },
    { id: 'students', label: dict.batches.tabStudents },
    { id: 'subjects', label: dict.batches.tabSubjects },
    { id: 'teachers', label: dict.batches.tabTeachers },
    { id: 'routine', label: dict.batches.tabRoutine },
    { id: 'room', label: dict.rooms.title },
    { id: 'attendance', label: dict.attendance.title },
    { id: 'financial', label: dict.fees.batchFinancial },
    { id: 'performance', label: lang === 'bn' ? 'একাডেমিক পারফরম্যান্স' : 'Performance' },
    { id: 'history', label: dict.batches.tabHistory },
  ];

  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-5">
      <div>
        <Link href="/batches" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#063b78] hover:underline mb-2">
          <Icon name="chevleft" size={16} />
          <span>{dict.batches.back}</span>
        </Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-extrabold text-[#063b78] tracking-tight">{batch.name}</h1>
            <div className="flex items-center gap-2 mt-1 text-[12.5px] text-[#64748b] font-mono">
              <span>{batch.code}</span>
              <span>·</span>
              <span>{batch.branch.name}</span>
            </div>
          </div>
          <StatusBadge status={batch.status} dictKey="batchStatus" />
        </div>
      </div>

      {/* Tab Bar */}
      <div className="card p-2 flex flex-row gap-1 overflow-x-auto hs">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-xl px-3.5 py-2 text-[12.5px] font-semibold whitespace-nowrap transition-colors ${
              tab === t.id ? 'bg-[#063b78] text-white' : 'text-[#092f63] hover:bg-[#eef3fa]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5 text-[13px]">
            <div>
              <div className="text-[11px] font-bold text-[#8795ab] uppercase">{dict.batches.program}</div>
              <div className="font-semibold text-[#092f63] mt-0.5">
                {lang === 'bn' && batch.academicProgram.banglaName ? batch.academicProgram.banglaName : batch.academicProgram.name}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-bold text-[#8795ab] uppercase">{dict.batches.class}</div>
              <div className="font-semibold text-[#092f63] mt-0.5">
                {lang === 'bn' && batch.academicClass.banglaName ? batch.academicClass.banglaName : batch.academicClass.name}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-bold text-[#8795ab] uppercase">{dict.batches.course}</div>
              <div className="font-semibold text-[#092f63] mt-0.5">
                {batch.course ? (lang === 'bn' && batch.course.banglaName ? batch.course.banglaName : batch.course.name) : '—'}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-bold text-[#8795ab] uppercase">{lang === 'bn' ? 'শিক্ষার্থী' : 'Students'}</div>
              <div className={`font-semibold mt-0.5 ${isFull ? 'text-rose-600' : 'text-emerald-600'}`}>
                {lang === 'bn' ? `${toBanglaNumeral(enrolled)}/${toBanglaNumeral(batch.capacity)}` : `${enrolled}/${batch.capacity}`}
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="fld">
              <label>{dict.batches.name}</label>
              <input value={overviewForm.name} onChange={(e) => setOverviewForm({ ...overviewForm, name: e.target.value })} />
            </div>
            <div className="fld">
              <label>{dict.batches.banglaName}</label>
              <input value={overviewForm.banglaName} onChange={(e) => setOverviewForm({ ...overviewForm, banglaName: e.target.value })} />
            </div>
            <div className="fld">
              <label>{dict.batches.code}</label>
              <input value={overviewForm.code} onChange={(e) => setOverviewForm({ ...overviewForm, code: e.target.value.toUpperCase() })} />
            </div>
            <div className="fld">
              <label>{dict.batches.capacity}</label>
              <input type="number" min={1} value={overviewForm.capacity} onChange={(e) => setOverviewForm({ ...overviewForm, capacity: e.target.value })} />
            </div>
            <div className="fld">
              <label>{dict.batches.startDate}</label>
              <input type="date" value={overviewForm.startDate} onChange={(e) => setOverviewForm({ ...overviewForm, startDate: e.target.value })} />
            </div>
            <div className="fld">
              <label>{dict.batches.endDate}</label>
              <input type="date" value={overviewForm.endDate} onChange={(e) => setOverviewForm({ ...overviewForm, endDate: e.target.value })} />
            </div>
            <div className="fld">
              <label>{dict.batches.status}</label>
              <select value={overviewForm.status} onChange={(e) => setOverviewForm({ ...overviewForm, status: e.target.value })}>
                {BATCH_STATUSES.map((s) => (
                  <option key={s} value={s}>{(dict.batchStatus as any)[s]}</option>
                ))}
              </select>
            </div>
            <div className="fld md:col-span-2">
              <label>{dict.batches.description}</label>
              <textarea rows={2} value={overviewForm.description} onChange={(e) => setOverviewForm({ ...overviewForm, description: e.target.value })} />
            </div>
          </div>
          <div className="pt-4">
            <button type="button" onClick={saveOverview} disabled={saving} className="primary">
              {saving ? '…' : dict.batches.save}
            </button>
          </div>
        </div>
      )}

      {/* Students */}
      {tab === 'students' && (
        <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[#063b78]">{dict.batches.tabStudents}</h2>
            <button type="button" onClick={() => setAssignModalOpen(true)} className="primary text-xs h-9 px-3">
              + {dict.batches.assignStudent}
            </button>
          </div>
          {batch.studentBatches.length === 0 ? (
            <p className="text-[13px] text-[#94a3b8] italic">{dict.batches.noStudents}</p>
          ) : (
            <div className="overflow-x-auto scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>{lang === 'bn' ? 'নাম' : 'Name'}</th>
                    <th>{lang === 'bn' ? 'যোগদান' : 'Joined'}</th>
                    <th>{lang === 'bn' ? 'রোল' : 'Roll'}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {batch.studentBatches.map((sb: any) => (
                    <tr key={sb.id} className="trow">
                      <td className="text-left font-mono text-xs text-[#063b78]">
                        <Link href={`/students/${sb.student.id}`} className="hover:underline">{sb.student.studentIdCode}</Link>
                      </td>
                      <td className="text-left font-semibold text-[#092f63]">
                        {sb.student.name} {sb.student.banglaName ? `(${sb.student.banglaName})` : ''}
                      </td>
                      <td className="text-left text-xs text-[#64748b]">{formatDhakaDate(sb.joinedAt)}</td>
                      <td className="text-left text-xs text-[#64748b]">{sb.rollCode || '—'}</td>
                      <td className="text-right">
                        <button onClick={() => removeStudent(sb.id)} className="text-xs text-rose-600 hover:underline font-semibold">
                          {dict.batches.removeStudent}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Subjects */}
      {tab === 'subjects' && (
        <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
          <h2 className="text-lg font-bold text-[#063b78] mb-4">{dict.batches.tabSubjects}</h2>
          {availableSubjects.length === 0 ? (
            <p className="text-[13px] text-[#94a3b8] italic">{dict.courses.noSubjects}</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {availableSubjects.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-[13px] text-[#092f63] p-2 rounded-lg border border-[#edf1f7]">
                  <input
                    type="checkbox"
                    checked={subjectSelection.includes(s.id)}
                    onChange={() =>
                      setSubjectSelection((prev) => (prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id]))
                    }
                  />
                  {lang === 'bn' && s.banglaName ? s.banglaName : s.name}
                </label>
              ))}
            </div>
          )}
          <div className="pt-4">
            <button type="button" onClick={saveSubjects} disabled={saving} className="primary">
              {saving ? '…' : dict.courses.saveSubjects}
            </button>
          </div>
        </div>
      )}

      {/* Teachers */}
      {tab === 'teachers' && (
        <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[#063b78]">{dict.batches.tabTeachers}</h2>
            <button type="button" onClick={() => setTeacherModalOpen(true)} className="primary text-xs h-9 px-3">
              + {dict.batches.assignTeacher}
            </button>
          </div>
          {batch.batchTeacherAssignments.filter((a: any) => a.status === 'ACTIVE').length === 0 ? (
            <p className="text-[13px] text-[#94a3b8] italic">{dict.batches.noTeachers}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {batch.batchTeacherAssignments
                .filter((a: any) => a.status === 'ACTIVE')
                .map((a: any) => (
                  <div key={a.id} className="p-3 rounded-xl border border-[#dce5f0] bg-[#f8fafc] flex items-center justify-between">
                    <div>
                      <div className="font-bold text-[#092f63] text-[13.5px]">
                        {lang === 'bn' && a.teacher.banglaName ? a.teacher.banglaName : a.teacher.name}
                      </div>
                      <div className="text-[11.5px] text-[#64748b]">
                        {lang === 'bn' && a.subject.banglaName ? a.subject.banglaName : a.subject.name}
                      </div>
                    </div>
                    <button onClick={() => removeTeacher(a.id)} className="text-xs text-rose-600 hover:underline font-semibold">
                      {dict.batches.removeTeacher}
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Routine */}
      {tab === 'routine' && (
        <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[#063b78]">{dict.batches.tabRoutine}</h2>
            <Link href={`/routine?batch=${batchId}`} className="text-xs font-semibold text-[#063b78] hover:underline">
              {dict.routine.addBtn} →
            </Link>
          </div>
          {batch.classSchedules.length === 0 ? (
            <p className="text-[13px] text-[#94a3b8] italic">{dict.batches.noRoutine}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {batch.classSchedules.map((cs: any) => (
                <div key={cs.id} className="p-3 rounded-xl border border-[#dce5f0] bg-[#f8fafc] flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="font-bold text-[#092f63] text-[13.5px]">
                      {lang === 'bn' && cs.subject.banglaName ? cs.subject.banglaName : cs.subject.name}
                    </div>
                    <div className="text-[11.5px] text-[#64748b]">
                      {lang === 'bn' ? DAY_LABELS[cs.dayOfWeek as keyof typeof DAY_LABELS].bn : DAY_LABELS[cs.dayOfWeek as keyof typeof DAY_LABELS].en}
                      {' · '}
                      {formatTimeRange(cs.startTime, cs.endTime, lang)}
                      {cs.room ? ` · ${cs.room.name}` : ''}
                      {cs.teacher ? ` · ${lang === 'bn' && cs.teacher.banglaName ? cs.teacher.banglaName : cs.teacher.name}` : ''}
                    </div>
                  </div>
                  <StatusBadge status={cs.status} size="sm" dictKey="scheduleStatus" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Room */}
      {tab === 'room' && (
        <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
          <h2 className="text-lg font-bold text-[#063b78] mb-4">{dict.rooms.title}</h2>
          {roomsUsed.length === 0 ? (
            <p className="text-[13px] text-[#94a3b8] italic">{dict.batches.noRoutine}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {roomsUsed.map((r: any) => (
                <span key={r.id} className="px-3 py-1.5 rounded-lg border border-[#dce5f0] bg-[#f8fafc] text-[12.5px] font-semibold text-[#092f63]">
                  {r.name} <span className="text-[#94a3b8] font-mono">({r.code})</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Attendance */}
      {tab === 'attendance' && (
        <div className="flex flex-col gap-5">
          {attendanceLoading || !attendanceSummary ? (
            <div className="card p-12 rounded-2xl bg-white border border-[#dce5f0] text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
            </div>
          ) : (
            <>
              <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
                <h2 className="text-lg font-bold text-[#063b78] mb-4">{dict.attendance.todaysClasses}</h2>
                {attendanceSummary.todaysSessions.length === 0 ? (
                  <p className="text-[13px] text-[#94a3b8] italic">{dict.attendance.emptyToday}</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {attendanceSummary.todaysSessions.map((s: any) => (
                      <Link key={s.id} href={`/attendance/${s.id}`} className="p-3 rounded-xl border border-[#dce5f0] bg-[#f8fafc] flex items-center justify-between hover:border-[#063b78]">
                        <span className="font-semibold text-[#092f63] text-[13.5px]">
                          {lang === 'bn' && s.subject?.banglaName ? s.subject.banglaName : s.subject?.name}
                        </span>
                        <StatusBadge status={s.status} size="sm" dictKey="sessionStatus" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
                <h2 className="text-lg font-bold text-[#063b78] mb-4">{lang === 'bn' ? 'শিক্ষার্থীদের উপস্থিতি সারসংক্ষেপ' : 'Student Attendance Summary'}</h2>
                {attendanceSummary.studentSummary.length === 0 ? (
                  <p className="text-[13px] text-[#94a3b8] italic">{dict.batches.noStudents}</p>
                ) : (
                  <div className="overflow-x-auto scroll">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>{lang === 'bn' ? 'শিক্ষার্থী' : 'Student'}</th>
                          <th>{dict.attendance.classesCount}</th>
                          <th>{dict.attendance.present}</th>
                          <th>{dict.attendance.absent}</th>
                          <th>{dict.attendance.attendancePercentage}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attendanceSummary.studentSummary.map((row: any) => (
                          <tr key={row.student.id} className="trow">
                            <td className="text-left font-semibold text-[#092f63]">
                              <Link href={`/students/${row.student.id}`} className="hover:underline">{row.student.name}</Link>
                            </td>
                            <td>{row.total}</td>
                            <td className="text-emerald-600 font-bold">{row.present}</td>
                            <td className="text-rose-600 font-bold">{row.absent}</td>
                            <td className={`font-extrabold ${row.percentage < 75 ? 'text-rose-600' : 'text-[#063b78]'}`}>{row.percentage}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
                <h2 className="text-lg font-bold text-[#063b78] mb-4">{dict.attendance.history}</h2>
                {attendanceSummary.history.length === 0 ? (
                  <p className="text-[13px] text-[#94a3b8] italic">{dict.attendance.emptyHistory}</p>
                ) : (
                  <div className="divide-y divide-[#edf1f7]">
                    {attendanceSummary.history.map((s: any) => (
                      <Link key={s.id} href={`/attendance/${s.id}`} className="py-2.5 flex items-center justify-between gap-2 flex-wrap hover:bg-[#f8fafc]/60 -mx-2 px-2 rounded-lg">
                        <div>
                          <span className="font-semibold text-[#092f63] text-[13px]">{formatDhakaDate(s.date)}</span>
                          <span className="text-[11.5px] text-[#64748b] ml-2">{lang === 'bn' && s.subject?.banglaName ? s.subject.banglaName : s.subject?.name}</span>
                        </div>
                        <span className="font-mono text-[11.5px]">
                          <span className="text-emerald-600 font-bold">{s.counts.present}P</span>{' '}
                          <span className="text-rose-600 font-bold">{s.counts.absent}A</span>{' '}
                          <span className="text-amber-600 font-bold">{s.counts.late}L</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* History */}
      {tab === 'history' && (
        <div className="flex flex-col gap-5">
          <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
            <h2 className="text-lg font-bold text-[#063b78] mb-4">{dict.batches.tabStudents} {dict.batches.tabHistory}</h2>
            {batch.studentBatchHistory.length === 0 ? (
              <p className="text-[13px] text-[#94a3b8] italic">{dict.batches.noStudents}</p>
            ) : (
              <div className="divide-y divide-[#edf1f7]">
                {batch.studentBatchHistory.map((sb: any) => (
                  <div key={sb.id} className="py-2.5 flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <span className="font-semibold text-[#092f63] text-[13px]">{sb.student.name}</span>
                      <span className="text-[11.5px] text-[#64748b] ml-2">
                        {formatDhakaDate(sb.joinedAt)}
                        {sb.endDate ? ` – ${formatDhakaDate(sb.endDate)}` : ''}
                      </span>
                    </div>
                    <StatusBadge status={sb.status} size="sm" dictKey="studentBatchStatus" />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
            <h2 className="text-lg font-bold text-[#063b78] mb-4">{dict.batches.tabTeachers} {dict.batches.tabHistory}</h2>
            {batch.batchTeacherAssignments.length === 0 ? (
              <p className="text-[13px] text-[#94a3b8] italic">{dict.batches.noTeachers}</p>
            ) : (
              <div className="divide-y divide-[#edf1f7]">
                {batch.batchTeacherAssignments.map((a: any) => (
                  <div key={a.id} className="py-2.5 flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <span className="font-semibold text-[#092f63] text-[13px]">{a.teacher.name}</span>
                      <span className="text-[11.5px] text-[#64748b] ml-2">
                        {a.subject.name} · {formatDhakaDate(a.startDate)}
                        {a.endDate ? ` – ${formatDhakaDate(a.endDate)}` : ''}
                      </span>
                    </div>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${a.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {a.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'financial' && <BatchFinancialTab batchId={batchId} />}
      {tab === 'performance' && <BatchPerformanceTab batchId={batchId} />}

      {/* Assign Student Modal */}
      {assignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card p-6 bg-white max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-base text-[#063b78]">{dict.batches.assignStudent}</h3>
              <button onClick={() => setAssignModalOpen(false)} className="text-[#64748b] hover:text-black">
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="fld">
              <label>{lang === 'bn' ? 'শিক্ষার্থী খুঁজুন' : 'Search Student'}</label>
              <input value={studentQuery} onChange={(e) => setStudentQuery(e.target.value)} placeholder={lang === 'bn' ? 'নাম বা আইডি' : 'Name or ID'} />
            </div>
            <div className="max-h-52 overflow-y-auto scroll flex flex-col gap-1">
              {studentResults.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedStudentId(s.id)}
                  className={`text-left p-2.5 rounded-lg border text-[13px] ${
                    selectedStudentId === s.id ? 'border-[#063b78] bg-blue-50' : 'border-[#edf1f7] hover:bg-[#f8fafc]'
                  }`}
                >
                  <span className="font-semibold text-[#092f63]">{s.name}</span>
                  <span className="text-[#64748b] font-mono ml-2 text-xs">{s.studentIdCode}</span>
                </button>
              ))}
            </div>
            {isFull && (
              <label className="flex items-center gap-2 text-[12.5px] text-[#64748b]">
                <input type="checkbox" checked={overrideCapacity} onChange={(e) => setOverrideCapacity(e.target.checked)} />
                {dict.batches.overrideCapacity}
              </label>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setAssignModalOpen(false)} className="tb">{lang === 'bn' ? 'বাতিল' : 'Cancel'}</button>
              <button type="button" onClick={assignStudent} disabled={!selectedStudentId || saving} className="primary">
                {saving ? '…' : dict.batches.assignStudent}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Teacher Modal */}
      {teacherModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card p-6 bg-white max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-base text-[#063b78]">{dict.batches.assignTeacher}</h3>
              <button onClick={() => setTeacherModalOpen(false)} className="text-[#64748b] hover:text-black">
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="fld">
              <label>{dict.routine.subject}</label>
              <select value={teacherAssign.subjectId} onChange={(e) => setTeacherAssign({ ...teacherAssign, subjectId: e.target.value })}>
                <option value="">—</option>
                {batch.batchSubjects.map((bs: any) => (
                  <option key={bs.subject.id} value={bs.subject.id}>
                    {lang === 'bn' && bs.subject.banglaName ? bs.subject.banglaName : bs.subject.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label>{dict.routine.teacher}</label>
              <select value={teacherAssign.teacherId} onChange={(e) => setTeacherAssign({ ...teacherAssign, teacherId: e.target.value })}>
                <option value="">—</option>
                {teacherOptions.map((t) => (
                  <option key={t.id} value={t.id}>{lang === 'bn' && t.banglaName ? t.banglaName : t.name}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setTeacherModalOpen(false)} className="tb">{lang === 'bn' ? 'বাতিল' : 'Cancel'}</button>
              <button type="button" onClick={assignTeacher} disabled={!teacherAssign.teacherId || !teacherAssign.subjectId || saving} className="primary">
                {saving ? '…' : dict.batches.assignTeacher}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
