'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { usePortal } from '@/components/portal/PortalProvider';
import { DICTIONARY, formatDhakaDate, pickLocalized } from '@/lib/i18n';

interface DashboardData {
  student: {
    name: string;
    banglaName: string | null;
    studentIdCode: string;
    branch: { name: string } | null;
    enrollments: Array<{ academicProgram: { name: string; banglaName: string | null } }>;
    studentBatches: Array<{ batch: { name: string; banglaName: string | null } }>;
  };
  attendance: { percentage: number; present: number; late: number; absent: number; excused: number; total: number };
  fees: { totalBilled: number; totalPaid: number; totalDue: number } | null;
  upcomingExams: Array<{ id: string; title: string; banglaTitle: string | null; startDate: string | null; status: string }>;
  recentResults: Array<{ examId: string; title: string; banglaTitle: string | null; overall: { overallGrade: string; overallGpa: number; overallPercentage: number } }>;
  notices: Array<{ id: string; title: string; banglaTitle: string | null; publishedAt: string | null }>;
  unreadNotificationCount: number;
}

export default function StudentPortalDashboard() {
  const { lang } = usePortal();
  const t = DICTIONARY[lang];
  const d = t.portalDashboard;

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/portal/student/dashboard')
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) throw new Error(res.message);
        setData(res);
      })
      .catch(() => setError(t.common.loadFailed))
      .finally(() => setLoading(false));
  }, [t.common.loadFailed]);

  if (loading) return <div className="py-16 text-center text-[13px] text-[#64748b]">{t.common.loading}</div>;
  if (error || !data) return <div className="py-16 text-center text-[13px] text-rose-600">{error || t.common.loadFailed}</div>;

  const batch = data.student.studentBatches[0]?.batch;
  const program = data.student.enrollments[0]?.academicProgram;

  return (
    <div className="max-w-[1000px] mx-auto flex flex-col gap-5">
      {/* Identity card */}
      <div className="card p-5 rounded-2xl bg-white border border-[#dce5f0]">
        <div className="flex items-center gap-3">
          <span className="w-12 h-12 rounded-xl bg-[#063b78] text-white flex items-center justify-center font-black text-lg shrink-0">
            {data.student.name.charAt(0)}
          </span>
          <div className="min-w-0">
            <div className="font-bold text-[#092f63] text-[15px] truncate">{pickLocalized(lang, data.student.name, data.student.banglaName)}</div>
            <div className="text-[12px] text-[#64748b]">{data.student.studentIdCode}</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-[12.5px]">
          {batch && (
            <div>
              <div className="text-[#64748b]">{d.batchLabel}</div>
              <div className="font-semibold text-[#092f63]">{pickLocalized(lang, batch.name, batch.banglaName)}</div>
            </div>
          )}
          {program && (
            <div>
              <div className="text-[#64748b]">{d.programLabel}</div>
              <div className="font-semibold text-[#092f63]">{pickLocalized(lang, program.name, program.banglaName)}</div>
            </div>
          )}
          {data.student.branch && (
            <div>
              <div className="text-[#64748b]">{d.branchLabel}</div>
              <div className="font-semibold text-[#092f63]">{data.student.branch.name}</div>
            </div>
          )}
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Link href="/portal/student/attendance" className="card p-4 rounded-2xl bg-white border border-[#dce5f0] hover:border-[#063b78]/30 transition-colors">
          <div className="text-[11.5px] text-[#64748b] font-semibold">{d.attendanceRate}</div>
          <div className="text-2xl font-black text-[#063b78] mt-1">{data.attendance.percentage}%</div>
        </Link>
        <Link href="/portal/student/fees" className="card p-4 rounded-2xl bg-white border border-[#dce5f0] hover:border-[#063b78]/30 transition-colors">
          <div className="text-[11.5px] text-[#64748b] font-semibold">{d.feesDue}</div>
          <div className="text-2xl font-black text-[#063b78] mt-1">৳{data.fees ? Number(data.fees.totalDue).toLocaleString('en-BD') : 0}</div>
        </Link>
        <Link href="/portal/student/notifications" className="card p-4 rounded-2xl bg-white border border-[#dce5f0] hover:border-[#063b78]/30 transition-colors col-span-2 sm:col-span-1">
          <div className="text-[11.5px] text-[#64748b] font-semibold">{d.unreadNotifications}</div>
          <div className="text-2xl font-black text-[#063b78] mt-1">{data.unreadNotificationCount}</div>
        </Link>
      </div>

      {/* Upcoming exams */}
      <section className="card p-5 rounded-2xl bg-white border border-[#dce5f0]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[#092f63] text-[14px]">{d.upcomingExams}</h2>
          <Link href="/portal/student/exams" className="text-[12px] font-bold text-[#063b78] hover:underline">{d.viewAll}</Link>
        </div>
        {data.upcomingExams.length === 0 ? (
          <p className="text-[13px] text-[#64748b] text-center py-4">{d.noUpcomingExams}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.upcomingExams.map((e) => (
              <li key={e.id} className="flex items-center justify-between text-[13px] border-b border-[#edf1f7] pb-2 last:border-0 last:pb-0">
                <span className="font-semibold text-[#092f63]">{pickLocalized(lang, e.title, e.banglaTitle)}</span>
                <span className="text-[#64748b]">{e.startDate ? formatDhakaDate(e.startDate) : '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recent results */}
      <section className="card p-5 rounded-2xl bg-white border border-[#dce5f0]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[#092f63] text-[14px]">{d.recentResults}</h2>
          <Link href="/portal/student/results" className="text-[12px] font-bold text-[#063b78] hover:underline">{d.viewAll}</Link>
        </div>
        {data.recentResults.length === 0 ? (
          <p className="text-[13px] text-[#64748b] text-center py-4">{d.noRecentResults}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.recentResults.map((r) => (
              <li key={r.examId} className="flex items-center justify-between text-[13px] border-b border-[#edf1f7] pb-2 last:border-0 last:pb-0">
                <span className="font-semibold text-[#092f63]">{pickLocalized(lang, r.title, r.banglaTitle)}</span>
                <span className="font-bold text-[#063b78]">{r.overall.overallGrade} · {r.overall.overallGpa.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recent notices */}
      <section className="card p-5 rounded-2xl bg-white border border-[#dce5f0]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[#092f63] text-[14px]">{d.recentNotices}</h2>
          <Link href="/portal/student/notices" className="text-[12px] font-bold text-[#063b78] hover:underline">{d.viewAll}</Link>
        </div>
        {data.notices.length === 0 ? (
          <p className="text-[13px] text-[#64748b] text-center py-4">{d.noNotices}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.notices.map((n) => (
              <li key={n.id} className="flex items-center gap-2 text-[13px] border-b border-[#edf1f7] pb-2 last:border-0 last:pb-0">
                <Icon name="pin" size={14} className="text-[#063b78] shrink-0" />
                <span className="font-semibold text-[#092f63] truncate">{pickLocalized(lang, n.title, n.banglaTitle)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
