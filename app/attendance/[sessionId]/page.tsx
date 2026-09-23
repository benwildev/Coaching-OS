'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import StatusBadge, { STATUS_BG_COLOR } from '@/components/StatusBadge';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate, toBanglaNumeral } from '@/lib/i18n';
import { formatTimeRange } from '@/lib/schedule';
import { ATTENDANCE_STATUSES } from '@/lib/validations/attendance';

type AttStatus = (typeof ATTENDANCE_STATUSES)[number];

interface StudentRow {
  student: { id: string; studentIdCode: string; name: string; banglaName?: string | null };
  attendance: { id: string; status: AttStatus; remarks?: string | null } | null;
}

const STATUS_BUTTON_LABEL: Record<AttStatus, string> = { PRESENT: 'P', ABSENT: 'A', LATE: 'L', EXCUSED: 'E' };

export default function TakeAttendancePage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { lang, showToast, currentUser } = useApp();
  const dict = DICTIONARY[lang];
  const canReopen = currentUser?.role === 'OWNER' || currentUser?.role === 'ADMIN';

  const [session, setSession] = useState<any>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [counts, setCounts] = useState({ total: 0, present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 });
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [confirmIncomplete, setConfirmIncomplete] = useState<number | null>(null);
  const [reopenModal, setReopenModal] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopening, setReopening] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/attendance/sessions/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setSession(data.session);
          setStudents(data.students);
          setCounts(data.counts);
        }
      } else {
        showToast(lang === 'bn' ? 'সেশন খুঁজে পাওয়া যায়নি' : 'Attendance session not found');
      }
    } catch (err) {
      console.error('Failed to load session', err);
    } finally {
      setLoading(false);
    }
  }, [sessionId, lang, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const isOpen = session?.status === 'OPEN';

  const setStatus = async (studentId: string, status: AttStatus) => {
    if (!isOpen) return;
    setSavingId(studentId);
    // optimistic update
    setStudents((prev) =>
      prev.map((r) => (r.student.id === studentId ? { ...r, attendance: { id: r.attendance?.id || '', status, remarks: r.attendance?.remarks || null } } : r))
    );
    try {
      const res = await fetch(`/api/attendance/sessions/${sessionId}/students/${studentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!data.success) {
        showToast(data.error || 'Failed to save');
        load();
      } else {
        setCounts((c) => {
          const wasUnmarked = !students.find((r) => r.student.id === studentId)?.attendance;
          const prevStatus = students.find((r) => r.student.id === studentId)?.attendance?.status;
          const next = { ...c };
          if (wasUnmarked) next.unmarked = Math.max(0, next.unmarked - 1);
          else if (prevStatus) (next as any)[prevStatus.toLowerCase()] = Math.max(0, (next as any)[prevStatus.toLowerCase()] - 1);
          (next as any)[status.toLowerCase()] = ((next as any)[status.toLowerCase()] || 0) + 1;
          return next;
        });
      }
    } finally {
      setSavingId(null);
    }
  };

  const markAllPresent = async () => {
    if (!confirm(dict.attendance.confirmMarkAllPresent)) return;
    setMarkingAll(true);
    try {
      const res = await fetch(`/api/attendance/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marks: [], markAllPresent: true }),
      });
      const data = await res.json();
      if (data.success) {
        setStudents(data.students);
        setCounts(data.counts);
        showToast(lang === 'bn' ? 'সবাইকে উপস্থিত হিসেবে চিহ্নিত করা হয়েছে' : 'All students marked present');
      } else {
        showToast(data.error || 'Failed to mark all present');
      }
    } finally {
      setMarkingAll(false);
    }
  };

  const completeSession = async (allowIncomplete = false) => {
    setCompleting(true);
    try {
      const res = await fetch(`/api/attendance/sessions/${sessionId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowIncomplete }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(lang === 'bn' ? 'উপস্থিতি সম্পন্ন হয়েছে' : 'Attendance completed');
        setConfirmIncomplete(null);
        load();
      } else if (data.code === 'UNMARKED_STUDENTS') {
        setConfirmIncomplete(data.unmarkedCount);
      } else {
        showToast(data.error || 'Failed to complete attendance');
      }
    } finally {
      setCompleting(false);
    }
  };

  const reopen = async () => {
    if (reopenReason.trim().length < 3) {
      showToast(lang === 'bn' ? 'একটি কারণ লিখুন' : 'Please provide a reason');
      return;
    }
    setReopening(true);
    try {
      const res = await fetch(`/api/attendance/sessions/${sessionId}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reopenReason }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(lang === 'bn' ? 'উপস্থিতি পুনরায় খোলা হয়েছে' : 'Attendance reopened');
        setReopenModal(false);
        setReopenReason('');
        load();
      } else {
        showToast(data.error || 'Failed to reopen attendance');
      }
    } finally {
      setReopening(false);
    }
  };

  if (loading || !session) {
    return (
      <div className="max-w-[900px] mx-auto flex items-center justify-center min-h-[300px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#063b78] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-[900px] mx-auto flex flex-col gap-5 pb-20">
      <Link href="/attendance" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#063b78] hover:underline">
        <Icon name="chevleft" size={16} />
        <span>{dict.attendance.backToAttendance}</span>
      </Link>

      {/* Header */}
      <div className="card p-5 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-extrabold text-[#063b78]">
              {lang === 'bn' && session.subject?.banglaName ? session.subject.banglaName : session.subject?.name || '—'}
            </h1>
            <div className="text-[13.5px] text-[#64748b] mt-0.5">{session.batch.name}</div>
          </div>
          <StatusBadge status={session.status} dictKey="sessionStatus" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-[12.5px]">
          <div>
            <div className="text-[10.5px] font-bold text-[#8795ab] uppercase">{dict.attendance.teacher}</div>
            <div className="font-semibold text-[#092f63]">{session.teacher ? (lang === 'bn' && session.teacher.banglaName ? session.teacher.banglaName : session.teacher.name) : '—'}</div>
          </div>
          <div>
            <div className="text-[10.5px] font-bold text-[#8795ab] uppercase">{dict.attendance.room}</div>
            <div className="font-semibold text-[#092f63]">{session.room?.name || '—'}</div>
          </div>
          <div>
            <div className="text-[10.5px] font-bold text-[#8795ab] uppercase">{dict.attendance.date}</div>
            <div className="font-semibold text-[#092f63]">{formatDhakaDate(session.date)}</div>
          </div>
          <div>
            <div className="text-[10.5px] font-bold text-[#8795ab] uppercase">{dict.attendance.time}</div>
            <div className="font-semibold text-[#092f63]">{session.startTime ? formatTimeRange(session.startTime, session.endTime, lang) : '—'}</div>
          </div>
        </div>

        {session.status === 'COMPLETED' && (
          <div className="mt-4 pt-4 border-t border-[#f1f5f9] flex items-center justify-between flex-wrap gap-2 text-[12px] text-[#64748b]">
            <span>
              {dict.attendance.completedBy}: {session.completedBy?.name || '—'}
              {session.isIncomplete && <span className="ml-2 text-amber-600 font-bold">({dict.attendance.incompleteBadge})</span>}
            </span>
            {canReopen && (
              <button type="button" onClick={() => setReopenModal(true)} className="tb text-xs">
                {dict.attendance.reopenSession}
              </button>
            )}
          </div>
        )}
        {session.status === 'OPEN' && session.reopenedAt && (
          <div className="mt-3 p-2.5 rounded-lg bg-amber-50 text-amber-700 text-[12px]">
            {dict.attendance.reopenedBy}: {session.reopenedBy?.name} — {session.reopenReason}
          </div>
        )}
      </div>

      {/* Summary bar */}
      <div className="card p-4 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs grid grid-cols-3 sm:grid-cols-6 gap-3 text-center">
        {[
          { label: dict.attendance.totalStudents, value: counts.total, key: 'total' },
          { label: dict.attendance.present, value: counts.present, key: 'PRESENT' },
          { label: dict.attendance.absent, value: counts.absent, key: 'ABSENT' },
          { label: dict.attendance.late, value: counts.late, key: 'LATE' },
          { label: dict.attendance.excused, value: counts.excused, key: 'EXCUSED' },
          { label: dict.attendance.unmarked, value: counts.unmarked, key: 'unmarked' },
        ].map((c) => (
          <div key={c.key}>
            <div className="text-[10.5px] font-bold text-[#8795ab] uppercase">{c.label}</div>
            <div className="text-lg font-extrabold text-[#063b78]">{lang === 'bn' ? toBanglaNumeral(c.value) : c.value}</div>
          </div>
        ))}
      </div>

      {isOpen && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <button
            type="button"
            onClick={markAllPresent}
            disabled={markingAll}
            className="inline-flex items-center gap-2 rounded-xl bg-[#eef3fa] px-4 py-2.5 text-[13px] font-bold text-[#063b78] hover:bg-[#dce5f0] disabled:opacity-60"
          >
            <Icon name="check2" size={16} />
            {markingAll ? '…' : dict.attendance.markAllPresent}
          </button>
        </div>
      )}

      {/* Student list */}
      <div className="card rounded-2xl bg-white border border-[#dce5f0] shadow-2xs overflow-hidden">
        {students.length === 0 ? (
          <p className="p-8 text-center text-[13px] text-[#94a3b8] italic">{dict.attendance.eligibleStudents}: 0</p>
        ) : (
          <div className="divide-y divide-[#edf2f7]">
            {students.map((row) => (
              <div key={row.student.id} className="flex items-center justify-between gap-3 px-4 py-3.5 sm:py-3">
                <div className="min-w-0">
                  <div className="font-bold text-[#092f63] text-[14px] sm:text-[13.5px] truncate">{row.student.name}</div>
                  <div className="font-mono text-[11.5px] text-[#8795ab]">{row.student.studentIdCode}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {ATTENDANCE_STATUSES.map((s) => {
                    const active = row.attendance?.status === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={!isOpen || savingId === row.student.id}
                        onClick={() => setStatus(row.student.id, s)}
                        title={(dict.attendanceStatus as any)[s]}
                        className={`h-10 w-10 sm:h-8 sm:w-8 rounded-xl sm:rounded-lg border font-extrabold text-[14px] sm:text-[12px] transition-colors disabled:opacity-50 ${
                          active ? STATUS_BG_COLOR[s] + ' border-current' : 'border-[#dce5f0] text-[#94a3b8] hover:bg-[#f8fafc]'
                        }`}
                      >
                        {STATUS_BUTTON_LABEL[s]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isOpen && students.length > 0 && (
        <div className="sticky bottom-4 flex justify-end">
          <button
            type="button"
            onClick={() => completeSession(false)}
            disabled={completing}
            className="primary shadow-lg"
          >
            {completing ? '…' : dict.attendance.complete}
          </button>
        </div>
      )}

      {/* Incomplete confirmation */}
      {confirmIncomplete !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card p-6 bg-white max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-amber-600">
              <Icon name="alert" size={20} />
              <h3 className="font-extrabold text-base">{dict.attendance.unmarked}</h3>
            </div>
            <p className="text-[13.5px] text-[#475569]">
              {lang === 'bn' ? toBanglaNumeral(confirmIncomplete) : confirmIncomplete} {dict.attendance.completeConfirm}
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmIncomplete(null)} className="tb">
                {lang === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button type="button" onClick={() => completeSession(true)} disabled={completing} className="primary">
                {completing ? '…' : dict.attendance.completeWithUnmarked}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reopen modal */}
      {reopenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card p-6 bg-white max-w-sm w-full shadow-2xl space-y-4">
            <h3 className="font-extrabold text-base text-[#063b78]">{dict.attendance.reopenSession}</h3>
            <div className="fld">
              <label>{dict.attendance.reopenReason} *</label>
              <textarea rows={3} value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} placeholder={dict.attendance.reopenReasonPlaceholder} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setReopenModal(false)} className="tb">
                {lang === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button type="button" onClick={reopen} disabled={reopening} className="primary">
                {reopening ? '…' : dict.attendance.reopen}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
