'use client';

import { use, useEffect, useState } from 'react';
import { usePortal } from '@/components/portal/PortalProvider';
import { DICTIONARY, formatDhakaDate, pickLocalized, localizeNumber } from '@/lib/i18n';

interface AttendanceRecord {
  id: string;
  status: string;
  date: string;
  batch: { name: string; banglaName: string | null } | null;
  subject: { name: string; banglaName: string | null } | null;
}

const STATUS_STYLE: Record<string, string> = {
  PRESENT: 'bg-emerald-50 text-emerald-700',
  LATE: 'bg-amber-50 text-amber-700',
  ABSENT: 'bg-rose-50 text-rose-700',
  EXCUSED: 'bg-slate-100 text-slate-600',
};

export default function GuardianChildAttendancePage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = use(params);
  const { lang } = usePortal();
  const t = DICTIONARY[lang];
  const a = t.portalAttendance;
  const num = (n: number) => localizeNumber(lang, n);

  const [summary, setSummary] = useState<{ percentage: number; present: number; late: number; absent: number; excused: number } | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (dateFrom) sp.set('dateFrom', dateFrom);
    if (dateTo) sp.set('dateTo', dateTo);
    fetch(`/api/portal/guardian/children/${studentId}/attendance?${sp}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setSummary(res.summary);
          setRecords(res.records);
        } else {
          setError(res.error === 'STUDENT_NOT_LINKED' ? t.portalChildren.accessDenied : res.message || t.common.loadFailed);
        }
      })
      .finally(() => setLoading(false));
  }, [studentId, dateFrom, dateTo, t.common.loadFailed]);

  if (error) return <div className="py-16 text-center text-[13px] text-rose-600">{error}</div>;

  return (
    <div className="max-w-[900px] mx-auto flex flex-col gap-5">
      <h1 className="text-lg font-bold text-[#092f63]">{a.title}</h1>

      {summary && (
        <div className="card p-5 rounded-2xl bg-white border border-[#dce5f0] grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
          <div>
            <div className="text-2xl font-black text-[#063b78]">{num(summary.percentage)}%</div>
            <div className="text-[11px] text-[#64748b]">{a.overall}</div>
          </div>
          <div>
            <div className="text-lg font-bold text-emerald-600">{num(summary.present)}</div>
            <div className="text-[11px] text-[#64748b]">{a.present}</div>
          </div>
          <div>
            <div className="text-lg font-bold text-amber-600">{num(summary.late)}</div>
            <div className="text-[11px] text-[#64748b]">{a.late}</div>
          </div>
          <div>
            <div className="text-lg font-bold text-rose-600">{num(summary.absent)}</div>
            <div className="text-[11px] text-[#64748b]">{a.absent}</div>
          </div>
          <div>
            <div className="text-lg font-bold text-slate-600">{num(summary.excused)}</div>
            <div className="text-[11px] text-[#64748b]">{a.excused}</div>
          </div>
        </div>
      )}

      <div className="card p-4 rounded-2xl bg-white border border-[#dce5f0] grid grid-cols-2 gap-3">
        <div className="fld">
          <label>{a.dateFrom}</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="fld">
          <label>{a.dateTo}</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      <div className="card rounded-2xl bg-white border border-[#dce5f0] overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-[13px] text-[#64748b]">{t.common.loading}</div>
        ) : records.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-[#64748b]">{a.empty}</div>
        ) : (
          <ul className="divide-y divide-[#edf1f7]">
            {records.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="font-semibold text-[#092f63] text-[13px]">{formatDhakaDate(r.date)}</div>
                  <div className="text-[12px] text-[#64748b] truncate">
                    {[r.batch && pickLocalized(lang, r.batch.name, r.batch.banglaName), r.subject && pickLocalized(lang, r.subject.name, r.subject.banglaName)].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <span className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold ${STATUS_STYLE[r.status] || 'bg-slate-100 text-slate-600'}`}>
                  {(t.attendanceStatus as Record<string, string>)?.[r.status] || r.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
