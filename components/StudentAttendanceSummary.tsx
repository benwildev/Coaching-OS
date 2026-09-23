'use client';

import { useEffect, useState } from 'react';
import Icon from './Icon';
import StatusBadge from './StatusBadge';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate, toBanglaNumeral } from '@/lib/i18n';

interface AttendanceSummary {
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  percentage: number;
  recent: Array<{ id: string; status: string; date: string; batchName: string; subjectName?: string | null }>;
}

export default function StudentAttendanceSummary({ studentId }: { studentId: string }) {
  const { lang } = useApp();
  const dict = DICTIONARY[lang];
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/attendance/student/${studentId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.success) setSummary(data.summary);
      })
      .catch((err) => console.error('Failed to load student attendance', err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  return (
    <div className="card p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
      <div className="flex items-center gap-2 border-b border-[#edf2f7] pb-3 mb-4 text-[#063b78]">
        <Icon name="calcheck" size={19} />
        <h2 className="text-lg font-bold text-[#063b78]">{dict.attendance.title}</h2>
      </div>

      {loading ? (
        <div className="py-6 text-center">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-[#063b78] border-r-transparent" />
        </div>
      ) : !summary || summary.total === 0 ? (
        <p className="text-[13px] text-[#64748b] italic">{dict.attendance.noRecentAttendance}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            <div className="p-3 rounded-xl bg-[#eef3fa] text-center">
              <div className="text-[10.5px] font-bold text-[#063b78] uppercase">{dict.attendance.attendancePercentage}</div>
              <div className={`text-xl font-extrabold ${summary.percentage < 75 ? 'text-rose-600' : 'text-[#063b78]'}`}>{summary.percentage}%</div>
            </div>
            <div className="p-3 rounded-xl bg-[#f8fafc] text-center">
              <div className="text-[10.5px] font-bold text-[#64748b] uppercase">{dict.attendance.classesCount}</div>
              <div className="text-xl font-extrabold text-[#092f63]">{lang === 'bn' ? toBanglaNumeral(summary.total) : summary.total}</div>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 text-center">
              <div className="text-[10.5px] font-bold text-emerald-700 uppercase">{dict.attendance.present}</div>
              <div className="text-xl font-extrabold text-emerald-600">{summary.present}</div>
            </div>
            <div className="p-3 rounded-xl bg-rose-50 text-center">
              <div className="text-[10.5px] font-bold text-rose-700 uppercase">{dict.attendance.absent}</div>
              <div className="text-xl font-extrabold text-rose-600">{summary.absent}</div>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 text-center">
              <div className="text-[10.5px] font-bold text-amber-700 uppercase">{dict.attendance.late}</div>
              <div className="text-xl font-extrabold text-amber-600">{summary.late}</div>
            </div>
          </div>
          <p className="text-[11px] text-[#94a3b8] mb-4">{dict.attendance.calculationNote}</p>

          <div className="text-[12px] font-bold text-[#55637a] uppercase tracking-wide mb-2">{dict.attendance.recentAttendance}</div>
          <div className="flex flex-col gap-1.5">
            {summary.recent.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-[13px] py-1.5 border-b border-[#edf1f7] last:border-0">
                <div>
                  <span className="text-[#092f63] font-semibold">{formatDhakaDate(r.date)}</span>
                  <span className="text-[#64748b] ml-2">{r.subjectName} · {r.batchName}</span>
                </div>
                <StatusBadge status={r.status} size="sm" dictKey="attendanceStatus" />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
