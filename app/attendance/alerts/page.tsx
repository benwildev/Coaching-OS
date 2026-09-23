'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';
import { formatBdPhoneDisplay } from '@/lib/validations/student';

interface LowAttendanceItem {
  student: { id: string; studentIdCode: string; name: string; banglaName?: string | null };
  batch: { id: string; name: string; code: string };
  totalSessions: number;
  percentage: number;
  guardian: { name: string; phone: string } | null;
}

export default function AttendanceAlertsPage() {
  const { lang, showToast, currentUser } = useApp();
  const dict = DICTIONARY[lang];
  const canEditThreshold = currentUser?.role === 'OWNER' || currentUser?.role === 'ADMIN';

  const [students, setStudents] = useState<LowAttendanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [thresholdInput, setThresholdInput] = useState('');
  const [savingThreshold, setSavingThreshold] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [alertsRes, thresholdRes] = await Promise.all([
        fetch('/api/attendance/alerts'),
        fetch('/api/attendance/threshold'),
      ]);
      if (alertsRes.ok) {
        const data = await alertsRes.json();
        if (data.success) setStudents(data.students);
      }
      if (thresholdRes.ok) {
        const data = await thresholdRes.json();
        if (data.success) {
          setThreshold(data.threshold);
          setThresholdInput(String(data.threshold));
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveThreshold = async () => {
    const value = Number(thresholdInput);
    if (!Number.isFinite(value) || value < 1 || value > 100) {
      showToast(lang === 'bn' ? 'সঠিক শতাংশ দিন (১-১০০)' : 'Enter a valid percentage (1-100)');
      return;
    }
    setSavingThreshold(true);
    try {
      const res = await fetch('/api/attendance/threshold', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: value }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(dict.attendance.thresholdSaved);
        setThreshold(value);
        load();
      } else {
        showToast(data.error || 'Failed to update threshold');
      }
    } finally {
      setSavingThreshold(false);
    }
  };

  const notAvailable = () => showToast(dict.attendance.comingSoon);

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-6">
      <div>
        <Link href="/attendance" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#063b78] hover:underline mb-2">
          <Icon name="chevleft" size={16} />
          <span>{dict.attendance.backToAttendance}</span>
        </Link>
        <h1 className="text-2xl md:text-3xl font-extrabold text-[#063b78] tracking-tight">{dict.attendance.alertsTitle}</h1>
        <p className="text-[13.5px] text-[#64748b] mt-0.5 font-medium">{dict.attendance.alertsSubtitle}</p>
      </div>

      <div className="card p-4 md:p-5 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex items-center gap-3 flex-wrap">
        <span className="text-[13px] font-semibold text-[#092f63]">{dict.attendance.thresholdLabel}:</span>
        {canEditThreshold ? (
          <>
            <input
              type="number"
              min={1}
              max={100}
              value={thresholdInput}
              onChange={(e) => setThresholdInput(e.target.value)}
              className="w-20 rounded-lg border border-[#dce5f0] px-2.5 py-1.5 text-[13px] font-bold text-[#063b78]"
            />
            <span className="text-[13px] text-[#64748b]">%</span>
            <button type="button" onClick={saveThreshold} disabled={savingThreshold} className="tb text-xs">
              {savingThreshold ? '…' : dict.actions?.save || 'Save'}
            </button>
          </>
        ) : (
          <span className="text-[13px] font-bold text-[#063b78]">{threshold ?? '—'}%</span>
        )}
      </div>

      {loading ? (
        <div className="card p-12 rounded-2xl bg-white border border-[#dce5f0] text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
        </div>
      ) : students.length === 0 ? (
        <div className="card p-12 rounded-2xl bg-white border border-[#dce5f0] text-center flex flex-col items-center">
          <div className="h-14 w-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
            <Icon name="check2" size={26} />
          </div>
          <p className="text-[14px] text-[#64748b]">{dict.attendance.emptyAlerts}</p>
        </div>
      ) : (
        <div className="card rounded-2xl bg-white border border-[#dce5f0] shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#e2e8f0] bg-[#f8fafc] text-[12px] font-bold text-[#64748b] uppercase tracking-wider">
                  <th className="py-3 px-4">{lang === 'bn' ? 'শিক্ষার্থী' : 'Student'}</th>
                  <th className="py-3 px-4">{dict.attendance.batch}</th>
                  <th className="py-3 px-4">{dict.attendance.attendancePercentage}</th>
                  <th className="py-3 px-4">{dict.attendance.guardian}</th>
                  <th className="py-3 px-4">{dict.attendance.guardianPhone}</th>
                  <th className="py-3 px-4 text-right">{lang === 'bn' ? 'পদক্ষেপ' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf2f7] text-[13px]">
                {students.map((s) => (
                  <tr key={`${s.student.id}-${s.batch.id}`} className="hover:bg-[#f8fafc]/80">
                    <td className="py-3 px-4">
                      <Link href={`/students/${s.student.id}`} className="font-semibold text-[#063b78] hover:underline">
                        {s.student.name}
                      </Link>
                      <div className="font-mono text-[11px] text-[#8795ab]">{s.student.studentIdCode}</div>
                    </td>
                    <td className="py-3 px-4">{s.batch.name}</td>
                    <td className="py-3 px-4">
                      <span className="font-extrabold text-rose-600">{s.percentage}%</span>
                      <span className="text-[11px] text-[#94a3b8] ml-1">({s.totalSessions} {dict.attendance.classesCount.toLowerCase()})</span>
                    </td>
                    <td className="py-3 px-4">{s.guardian?.name || '—'}</td>
                    <td className="py-3 px-4 font-mono">{s.guardian ? formatBdPhoneDisplay(s.guardian.phone) : '—'}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={notAvailable} title={dict.attendance.comingSoon} className="p-1.5 rounded-lg text-[#64748b] hover:bg-blue-50 hover:text-[#063b78]">
                          <Icon name="phone" size={15} />
                        </button>
                        <button onClick={notAvailable} title={dict.attendance.comingSoon} className="p-1.5 rounded-lg text-[#64748b] hover:bg-blue-50 hover:text-[#063b78]">
                          <Icon name="message" size={15} />
                        </button>
                        <button onClick={notAvailable} title={dict.attendance.comingSoon} className="p-1.5 rounded-lg text-[#64748b] hover:bg-blue-50 hover:text-[#063b78]">
                          <Icon name="whatsapp" size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
