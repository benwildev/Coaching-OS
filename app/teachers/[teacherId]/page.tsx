'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate, toBanglaNumeral } from '@/lib/i18n';
import { DAY_LABELS, formatTimeRange } from '@/lib/schedule';

type Tab = 'overview' | 'subjects' | 'batches' | 'routine' | 'today' | 'attendance' | 'employment';

export default function TeacherDetailPage() {
  const params = useParams();
  const router = useRouter();
  const teacherId = params.teacherId as string;
  const { lang, showToast, currentUser } = useApp();
  const dict = DICTIONARY[lang];
  const canManageAttendance = currentUser?.role === 'OWNER' || currentUser?.role === 'ADMIN' || currentUser?.role === 'STAFF';

  const [teacher, setTeacher] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [redacted, setRedacted] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');

  const [attForm, setAttForm] = useState({ date: new Date().toISOString().slice(0, 10), status: 'PRESENT', inTime: '', outTime: '', remarks: '' });
  const [savingAtt, setSavingAtt] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const openAttendance = async (classScheduleId: string) => {
    setOpeningId(classScheduleId);
    try {
      const res = await fetch('/api/attendance/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classScheduleId, date: new Date().toISOString().slice(0, 10) }),
      });
      const data = await res.json();
      if (data.success) {
        router.push(`/attendance/${data.session.id}`);
      } else {
        showToast(data.error || 'Failed to open attendance');
      }
    } finally {
      setOpeningId(null);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/teachers/${teacherId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setTeacher(data.teacher);
          setRedacted(!!data.redacted);
        }
      }
    } catch (err) {
      console.error('Failed to load teacher', err);
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => {
    load();
  }, [load]);

  const saveTeacherAttendance = async () => {
    setSavingAtt(true);
    try {
      const res = await fetch(`/api/attendance/teacher/${teacherId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attForm),
      });
      const data = await res.json();
      if (data.success) {
        showToast(lang === 'bn' ? 'শিক্ষকের উপস্থিতি সংরক্ষিত হয়েছে' : 'Teacher attendance saved');
        load();
      } else {
        showToast(data.error || 'Failed to save attendance');
      }
    } finally {
      setSavingAtt(false);
    }
  };

  if (loading || !teacher) {
    return (
      <div className="max-w-[1000px] mx-auto flex items-center justify-center min-h-[300px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#063b78] border-t-transparent" />
      </div>
    );
  }

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: dict.teachers.tabOverview },
    { id: 'subjects', label: dict.teachers.tabSubjects },
    { id: 'batches', label: dict.teachers.tabBatches },
    { id: 'routine', label: dict.teachers.tabRoutine },
    { id: 'today', label: dict.teachers.tabToday },
    ...(redacted ? [] : ([{ id: 'attendance', label: dict.teachers.tabAttendance }, { id: 'employment', label: dict.teachers.tabEmployment }] as const)),
  ];

  return (
    <div className="max-w-[1000px] mx-auto flex flex-col gap-5">
      <div>
        <Link href="/teachers" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#063b78] hover:underline mb-2">
          <Icon name="chevleft" size={16} />
          <span>{dict.teachers.back}</span>
        </Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-extrabold text-[#063b78] tracking-tight">{teacher.name}</h1>
            {teacher.banglaName && <div className="text-[13px] text-[#64748b]">{teacher.banglaName}</div>}
            <div className="flex items-center gap-2 mt-1 text-[12.5px] text-[#64748b] font-mono">
              <span>{teacher.teacherCode}</span>
              {teacher.branch && (
                <>
                  <span>·</span>
                  <span>{teacher.branch.name}</span>
                </>
              )}
            </div>
          </div>
          <StatusBadge status={teacher.status} dictKey="teacherStatus" />
        </div>
      </div>

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

      {tab === 'overview' && (
        <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-[13px]">
            <div>
              <div className="text-[11px] font-bold text-[#8795ab] uppercase">{dict.teachers.todaysClasses}</div>
              <div className="font-bold text-[#063b78] text-lg mt-0.5">
                {lang === 'bn' ? toBanglaNumeral(teacher.todaysClasses.length) : teacher.todaysClasses.length}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-bold text-[#8795ab] uppercase">{dict.teachers.weeklyClasses}</div>
              <div className="font-bold text-[#063b78] text-lg mt-0.5">
                {lang === 'bn' ? toBanglaNumeral(teacher.weeklyClassCount) : teacher.weeklyClassCount}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-bold text-[#8795ab] uppercase">{dict.teachers.assignedBatches}</div>
              <div className="font-bold text-[#063b78] text-lg mt-0.5">
                {new Set(teacher.batchTeacherAssignments.filter((a: any) => a.status === 'ACTIVE').map((a: any) => a.batch.id)).size}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-bold text-[#8795ab] uppercase">{dict.teachers.subjects}</div>
              <div className="font-bold text-[#063b78] text-lg mt-0.5">{teacher.teacherSubjects.length}</div>
            </div>
          </div>
          {!redacted && (
            <div className="grid sm:grid-cols-2 gap-4 mt-5 pt-5 border-t border-[#f1f5f9] text-[13px]">
              <div>
                <div className="text-[11px] font-bold text-[#8795ab] uppercase">{dict.teachers.phone}</div>
                <div className="font-semibold text-[#092f63] mt-0.5">{teacher.phone}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-[#8795ab] uppercase">{dict.teachers.email}</div>
                <div className="font-semibold text-[#092f63] mt-0.5">{teacher.email || '—'}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-[#8795ab] uppercase">{dict.teachers.qualification}</div>
                <div className="font-semibold text-[#092f63] mt-0.5">{teacher.qualification || '—'}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-[#8795ab] uppercase">{dict.teachers.designation}</div>
                <div className="font-semibold text-[#092f63] mt-0.5">{teacher.designation || '—'}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'subjects' && (
        <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
          <h2 className="text-lg font-bold text-[#063b78] mb-4">{dict.teachers.tabSubjects}</h2>
          {teacher.teacherSubjects.length === 0 ? (
            <p className="text-[13px] text-[#94a3b8] italic">{dict.teachers.noSubjects}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {teacher.teacherSubjects.map((ts: any) => (
                <span key={ts.id} className="px-3 py-1.5 rounded-lg border border-[#dce5f0] bg-[#f8fafc] text-[12.5px] font-semibold text-[#092f63]">
                  {lang === 'bn' && ts.subject.banglaName ? ts.subject.banglaName : ts.subject.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'batches' && (
        <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
          <h2 className="text-lg font-bold text-[#063b78] mb-4">{dict.teachers.tabBatches}</h2>
          {teacher.batchTeacherAssignments.filter((a: any) => a.status === 'ACTIVE').length === 0 ? (
            <p className="text-[13px] text-[#94a3b8] italic">{dict.teachers.noBatches}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {teacher.batchTeacherAssignments
                .filter((a: any) => a.status === 'ACTIVE')
                .map((a: any) => (
                  <Link key={a.id} href={`/batches/${a.batch.id}`} className="p-3 rounded-xl border border-[#dce5f0] bg-[#f8fafc] flex items-center justify-between hover:border-[#063b78]">
                    <div>
                      <div className="font-bold text-[#092f63] text-[13.5px]">{a.batch.name}</div>
                      <div className="text-[11.5px] text-[#64748b]">{lang === 'bn' && a.subject.banglaName ? a.subject.banglaName : a.subject.name}</div>
                    </div>
                    <span className="font-mono text-[11px] text-[#8795ab]">{a.batch.code}</span>
                  </Link>
                ))}
            </div>
          )}
        </div>
      )}

      {tab === 'routine' && (
        <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
          <h2 className="text-lg font-bold text-[#063b78] mb-4">{dict.teachers.tabRoutine}</h2>
          {teacher.classSchedules.length === 0 ? (
            <p className="text-[13px] text-[#94a3b8] italic">{dict.teachers.noClasses}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {teacher.classSchedules.map((cs: any) => (
                <div key={cs.id} className="p-3 rounded-xl border border-[#dce5f0] bg-[#f8fafc] flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="font-bold text-[#092f63] text-[13.5px]">
                      {lang === 'bn' && cs.subject.banglaName ? cs.subject.banglaName : cs.subject.name} · {cs.batch.name}
                    </div>
                    <div className="text-[11.5px] text-[#64748b]">
                      {lang === 'bn' ? DAY_LABELS[cs.dayOfWeek as keyof typeof DAY_LABELS].bn : DAY_LABELS[cs.dayOfWeek as keyof typeof DAY_LABELS].en}
                      {' · '}
                      {formatTimeRange(cs.startTime, cs.endTime, lang)}
                      {cs.room ? ` · ${cs.room.name}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'today' && (
        <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
          <h2 className="text-lg font-bold text-[#063b78] mb-4">{dict.teachers.tabToday}</h2>
          {teacher.todaysClasses.length === 0 ? (
            <p className="text-[13px] text-[#94a3b8] italic">{dict.attendance.noClassesToday}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {teacher.todaysClasses.map((cs: any) => (
                <button
                  key={cs.id}
                  type="button"
                  disabled={openingId === cs.id}
                  onClick={() => openAttendance(cs.id)}
                  className="p-3 rounded-xl border border-[#dce5f0] bg-[#f8fafc] flex items-center justify-between hover:border-[#063b78] text-left disabled:opacity-60"
                >
                  <div>
                    <div className="font-bold text-[#092f63] text-[13.5px]">
                      {lang === 'bn' && cs.subject.banglaName ? cs.subject.banglaName : cs.subject.name} · {cs.batch.name}
                    </div>
                    <div className="text-[11.5px] text-[#64748b]">{formatTimeRange(cs.startTime, cs.endTime, lang)}</div>
                  </div>
                  {openingId === cs.id ? (
                    <span className="text-[11px] font-bold text-[#063b78]">…</span>
                  ) : (
                    <Icon name="chevright" size={16} className="text-[#8795ab]" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'attendance' && !redacted && (
        <div className="flex flex-col gap-5">
          {canManageAttendance && (
            <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
              <h2 className="text-lg font-bold text-[#063b78] mb-4">{dict.attendance.markTeacherAttendance}</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="fld">
                  <label>{dict.attendance.date}</label>
                  <input type="date" value={attForm.date} onChange={(e) => setAttForm({ ...attForm, date: e.target.value })} />
                </div>
                <div className="fld">
                  <label>{dict.attendance.title}</label>
                  <select value={attForm.status} onChange={(e) => setAttForm({ ...attForm, status: e.target.value })}>
                    {(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const).map((s) => (
                      <option key={s} value={s}>{(dict.attendanceStatus as any)[s]}</option>
                    ))}
                  </select>
                </div>
                <div className="fld">
                  <label>{dict.attendance.checkIn}</label>
                  <input type="time" value={attForm.inTime} onChange={(e) => setAttForm({ ...attForm, inTime: e.target.value })} />
                </div>
                <div className="fld">
                  <label>{dict.attendance.checkOut}</label>
                  <input type="time" value={attForm.outTime} onChange={(e) => setAttForm({ ...attForm, outTime: e.target.value })} />
                </div>
                <div className="fld sm:col-span-2">
                  <label>{dict.attendance.notes}</label>
                  <input value={attForm.remarks} onChange={(e) => setAttForm({ ...attForm, remarks: e.target.value })} />
                </div>
              </div>
              <div className="pt-3">
                <button type="button" onClick={saveTeacherAttendance} disabled={savingAtt} className="primary">
                  {savingAtt ? '…' : dict.attendance.save}
                </button>
              </div>
            </div>
          )}

          <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
            <h2 className="text-lg font-bold text-[#063b78] mb-4">{dict.attendance.recentAttendance}</h2>
            {teacher.attendances.length === 0 ? (
              <p className="text-[13px] text-[#94a3b8] italic">{dict.attendance.noRecentAttendance}</p>
            ) : (
              <div className="divide-y divide-[#edf1f7]">
                {teacher.attendances.map((a: any) => (
                  <div key={a.id} className="py-2.5 flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <span className="font-semibold text-[#092f63] text-[13px]">{formatDhakaDate(a.date)}</span>
                      {(a.inTime || a.outTime) && (
                        <span className="text-[11.5px] text-[#64748b] ml-2">
                          {a.inTime || '—'} – {a.outTime || '—'}
                        </span>
                      )}
                    </div>
                    <StatusBadge status={a.status} size="sm" dictKey="attendanceStatus" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'employment' && !redacted && (
        <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
          <h2 className="text-lg font-bold text-[#063b78] mb-4">{dict.teachers.tabEmployment}</h2>
          <div className="grid sm:grid-cols-2 gap-4 text-[13px]">
            <div>
              <div className="text-[11px] font-bold text-[#8795ab] uppercase">{dict.teachers.joiningDate}</div>
              <div className="font-semibold text-[#092f63] mt-0.5">{teacher.joiningDate ? formatDhakaDate(teacher.joiningDate) : '—'}</div>
            </div>
            <div>
              <div className="text-[11px] font-bold text-[#8795ab] uppercase">{dict.teachers.status}</div>
              <div className="mt-0.5"><StatusBadge status={teacher.status} size="sm" dictKey="teacherStatus" /></div>
            </div>
            {teacher.bio && (
              <div className="sm:col-span-2">
                <div className="text-[11px] font-bold text-[#8795ab] uppercase">{dict.teachers.bio}</div>
                <div className="font-medium text-[#092f63] mt-0.5">{teacher.bio}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
