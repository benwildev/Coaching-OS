'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCircle2, TrendingUp, FileText, AlertCircle } from 'lucide-react';
import { usePortal } from '@/components/portal/PortalProvider';
import { formatDhakaDate, formatBDT } from '@/lib/i18n';

interface DashboardData {
  student: {
    name: string;
    banglaName: string | null;
    studentIdCode: string;
    branch: { name: string } | null;
    enrollments: Array<{ academicProgram: { name: string; banglaName: string | null } }>;
    studentBatches: Array<{ batch: { name: string; banglaName: string | null } }>;
  };
  attendance: {
    percentage: number;
    present: number;
    late: number;
    absent: number;
    excused: number;
    total: number;
    recent: Array<{ id: string; status: string; date: string; batchName: string; subjectName: string | null }>;
  };
  fees: { totalBilled: number; totalPaid: number; totalDue: number } | null;
  nextDue: { dueDate: string | null; dueAmount: number; invoiceNumber: string } | null;
  upcomingExams: Array<{ id: string; title: string; banglaTitle: string | null; startDate: string | null; status: string }>;
  recentResults: Array<{
    examId: string;
    title: string;
    banglaTitle: string | null;
    rank: number | null;
    overall: { overallGrade: string; overallGpa: number; overallPercentage: number };
  }>;
  notices: Array<{ id: string; title: string; banglaTitle: string | null; publishedAt: string | null }>;
  unreadNotificationCount: number;
}

/**
 * Phase 10.5: every figure on this page comes from the authenticated
 * student's own data (GET /api/portal/student/dashboard, which resolves
 * the student from the portal session — never a client-supplied
 * studentId). No hardcoded attendance %, fee dates, timetable, rank, or
 * branding. A section with no underlying data shows an honest empty state
 * instead of a placeholder number.
 */
export default function StudentPortalDashboard() {
  const { lang, setLang, portalUser } = usePortal();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  useEffect(() => {
    fetch('/api/portal/student/dashboard')
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setData(res);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const studentName = data?.student?.name || portalUser?.name || '';
  const firstName = studentName.split(' ')[0] || '';
  const initials = studentName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  const now = new Date();
  const dateLine = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Dhaka' }).format(now);
  const batchName = data?.student?.studentBatches?.[0]?.batch
    ? (lang === 'bn' && data.student.studentBatches[0].batch.banglaName ? data.student.studentBatches[0].batch.banglaName : data.student.studentBatches[0].batch.name)
    : null;
  const programName = data?.student?.enrollments?.[0]?.academicProgram
    ? (lang === 'bn' && data.student.enrollments[0].academicProgram.banglaName ? data.student.enrollments[0].academicProgram.banglaName : data.student.enrollments[0].academicProgram.name)
    : null;
  const identityLine = [programName, batchName, data?.student?.studentIdCode].filter(Boolean).join(' · ');

  // Average score and latest rank are both derived from real published
  // results — no invented "batch average" or "of N students" figure.
  const avgScore = data && data.recentResults.length > 0
    ? Math.round((data.recentResults.reduce((s, r) => s + r.overall.overallPercentage, 0) / data.recentResults.length) * 10) / 10
    : null;
  const latestRank = data?.recentResults.find((r) => r.rank != null)?.rank ?? null;

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#063b78] border-t-transparent" />
      </div>
    );
  }

  const kpis = [
    {
      key: 'attendance',
      label: lang === 'bn' ? 'উপস্থিতি' : 'Attendance',
      value: data && data.attendance.total > 0 ? `${data.attendance.percentage}%` : '—',
      sub: data && data.attendance.total > 0
        ? `${data.attendance.present + data.attendance.late}/${data.attendance.total} ${lang === 'bn' ? 'রেকর্ডকৃত ক্লাসে' : 'recorded classes'}`
        : lang === 'bn' ? 'এখনো কোনো উপস্থিতি রেকর্ড নেই' : 'No attendance records yet',
    },
    {
      key: 'score',
      label: lang === 'bn' ? 'গড় নম্বর' : 'Average score',
      value: avgScore != null ? `${avgScore}%` : '—',
      sub: avgScore != null ? `${lang === 'bn' ? 'সাম্প্রতিক' : 'across recent'} ${data!.recentResults.length} ${lang === 'bn' ? 'টি প্রকাশিত ফলাফল' : 'published result(s)'}` : lang === 'bn' ? 'এখনো কোনো ফলাফল প্রকাশিত হয়নি' : 'No published results yet',
    },
    {
      key: 'rank',
      label: lang === 'bn' ? 'সর্বশেষ র‍্যাঙ্ক' : 'Latest rank',
      value: latestRank != null ? `#${latestRank}` : '—',
      sub: latestRank != null ? (lang === 'bn' ? 'সর্বশেষ প্রকাশিত পরীক্ষায়' : 'in the latest published exam') : lang === 'bn' ? 'র‍্যাঙ্ক উপলব্ধ নেই' : 'Rank not available yet',
    },
    {
      key: 'fees',
      label: lang === 'bn' ? 'বকেয়া ফি' : 'Fees due',
      value: data?.fees ? formatBDT(data.fees.totalDue, lang) : '—',
      sub: !data?.fees
        ? lang === 'bn' ? 'কোনো ফি তথ্য উপলব্ধ নেই' : 'No fee information available'
        : data.nextDue
          ? `${lang === 'bn' ? 'পরবর্তী প্রদেয়' : 'Next due'}${data.nextDue.dueDate ? ' ' + formatDhakaDate(data.nextDue.dueDate) : ''}`
          : lang === 'bn' ? 'সম্পূর্ণ পরিশোধিত' : 'Fully paid',
    },
  ];

  return (
    <div className="w-full max-w-[1240px] mx-auto space-y-5 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 pt-1">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-500 tracking-tight">{dateLine}</div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#063b78] tracking-tight mt-0.5">
            {lang === 'bn' ? `স্বাগতম, ${firstName}` : `Welcome, ${firstName}`}
          </h1>
          {identityLine && <p className="text-xs text-slate-500 font-medium mt-1">{identityLine}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex items-center bg-white border border-slate-200 rounded-xl p-0.5 shadow-2xs">
            <button type="button" onClick={() => setLang('bn')} className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${lang === 'bn' ? 'bg-[#063b78] text-white shadow-xs' : 'text-slate-600'}`}>বাংলা</button>
            <button type="button" onClick={() => setLang('en')} className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${lang === 'en' ? 'bg-[#063b78] text-white shadow-xs' : 'text-slate-600'}`}>EN</button>
          </div>
          <div className="relative">
            <button type="button" onClick={() => setNotificationsOpen((v) => !v)} className="w-10 h-10 rounded-xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-center text-slate-600 hover:text-[#063b78] relative" aria-label="Notifications">
              <Bell className="w-4 h-4" />
              {!!data?.unreadNotificationCount && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#ffd200] border-2 border-white" />}
            </button>
            {notificationsOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl border border-slate-200 shadow-xl p-4 z-50">
                <div className="text-xs font-bold text-slate-900 mb-2">
                  {data?.unreadNotificationCount ? `${data.unreadNotificationCount} ${lang === 'bn' ? 'টি অপঠিত' : 'unread'}` : lang === 'bn' ? 'কোনো নতুন বিজ্ঞপ্তি নেই' : 'No new notifications'}
                </div>
                <Link href="/portal/student/notifications" className="text-xs font-bold text-[#063b78] hover:underline" onClick={() => setNotificationsOpen(false)}>
                  {lang === 'bn' ? 'সবগুলো দেখুন →' : 'View all →'}
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {kpis.map((k) => (
          <div key={k.key} className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex flex-col justify-between">
            <span className="text-xs font-semibold text-slate-500 tracking-tight">{k.label}</span>
            <div className="my-1.5 text-2xl sm:text-3xl font-black text-[#063b78] tracking-tight">{k.value}</div>
            <span className="text-[11px] sm:text-xs text-slate-500 font-medium">{k.sub}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        {/* Upcoming exam */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs">
          <h2 className="font-extrabold text-[#063b78] text-sm tracking-tight mb-3">{lang === 'bn' ? 'আসন্ন পরীক্ষা' : 'Upcoming exam'}</h2>
          {data && data.upcomingExams.length > 0 ? (
            <div className="space-y-2.5">
              {data.upcomingExams.slice(0, 3).map((e) => (
                <div key={e.id} className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/60">
                  <div className="font-bold text-slate-900 text-xs">{lang === 'bn' && e.banglaTitle ? e.banglaTitle : e.title}</div>
                  {e.startDate && <div className="text-[11px] text-amber-700 mt-0.5">{formatDhakaDate(e.startDate)}</div>}
                </div>
              ))}
            </div>
          ) : (
            <Empty icon={<AlertCircle className="w-5 h-5" />} text={lang === 'bn' ? 'কোনো আসন্ন পরীক্ষা নেই' : 'No upcoming exams'} />
          )}
        </div>

        {/* Recent results */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-extrabold text-[#063b78] text-sm tracking-tight">{lang === 'bn' ? 'সাম্প্রতিক ফলাফল' : 'Recent results'}</h2>
            <Link href="/portal/student/results" className="text-xs font-bold text-[#063b78] hover:underline">{lang === 'bn' ? 'সব দেখুন' : 'View all'}</Link>
          </div>
          {data && data.recentResults.length > 0 ? (
            <div className="space-y-2.5">
              {data.recentResults.slice(0, 4).map((r) => (
                <div key={r.examId} className="flex items-center justify-between pb-2.5 border-b border-slate-100 last:border-0 last:pb-0">
                  <div className="min-w-0 pr-2">
                    <div className="font-bold text-slate-800 text-xs truncate">{lang === 'bn' && r.banglaTitle ? r.banglaTitle : r.title}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">GPA {r.overall.overallGpa.toFixed(2)} · {r.overall.overallPercentage.toFixed(1)}%</div>
                  </div>
                  <span className="text-xs font-extrabold px-2 py-0.5 rounded-md bg-[#063b78] text-white shrink-0">{r.overall.overallGrade}</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty icon={<FileText className="w-5 h-5" />} text={lang === 'bn' ? 'এখনো কোনো ফলাফল প্রকাশিত হয়নি' : 'No published results yet'} />
          )}
        </div>

        {/* Recent attendance */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-extrabold text-[#063b78] text-sm tracking-tight">{lang === 'bn' ? 'সাম্প্রতিক উপস্থিতি' : 'Recent attendance'}</h2>
            <Link href="/portal/student/attendance" className="text-xs font-bold text-[#063b78] hover:underline">{lang === 'bn' ? 'সব দেখুন' : 'View all'}</Link>
          </div>
          {data && data.attendance.recent.length > 0 ? (
            <div className="space-y-2">
              {data.attendance.recent.slice(0, 5).map((a) => (
                <div key={a.id} className="flex items-center justify-between text-xs">
                  <div className="min-w-0 pr-2">
                    <div className="font-semibold text-slate-800 truncate">{a.subjectName || a.batchName}</div>
                    <div className="text-[11px] text-slate-400">{formatDhakaDate(a.date)}</div>
                  </div>
                  <AttendanceBadge status={a.status} lang={lang} />
                </div>
              ))}
            </div>
          ) : (
            <Empty icon={<CheckCircle2 className="w-5 h-5" />} text={lang === 'bn' ? 'এখনো কোনো উপস্থিতি রেকর্ড নেই' : 'No attendance records yet'} />
          )}
        </div>
      </div>

      {/* Notices */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-extrabold text-[#063b78] text-sm tracking-tight">{lang === 'bn' ? 'নোটিশ বোর্ড' : 'Notices'}</h3>
          <Link href="/portal/student/notices" className="text-xs font-bold text-[#063b78] hover:underline">{lang === 'bn' ? 'সব দেখুন →' : 'View all →'}</Link>
        </div>
        {data && data.notices.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.notices.slice(0, 4).map((n) => (
              <Link key={n.id} href={`/portal/student/notices`} className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-start gap-2.5 hover:bg-slate-100/70">
                <div className="w-2 h-2 rounded-full bg-[#ffd200] mt-1.5 shrink-0" />
                <div className="min-w-0">
                  {n.publishedAt && <span className="text-[11px] text-slate-400 font-semibold">{formatDhakaDate(n.publishedAt)}</span>}
                  <div className="font-bold text-slate-900 mt-0.5 text-xs">{lang === 'bn' && n.banglaTitle ? n.banglaTitle : n.title}</div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <Empty icon={<TrendingUp className="w-5 h-5" />} text={lang === 'bn' ? 'কোনো নোটিশ নেই' : 'No notices'} />
        )}
      </div>

      {!data && (
        <div className="text-center text-xs text-slate-400 py-6">
          {lang === 'bn' ? 'তথ্য লোড করা যায়নি। পরে আবার চেষ্টা করুন।' : 'Could not load your data. Please try again later.'}
        </div>
      )}
    </div>
  );
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-slate-400">
      {icon}
      <span className="text-xs font-medium">{text}</span>
    </div>
  );
}

function AttendanceBadge({ status, lang }: { status: string; lang: 'en' | 'bn' }) {
  const map: Record<string, { en: string; bn: string; cls: string }> = {
    PRESENT: { en: 'Present', bn: 'উপস্থিত', cls: 'bg-emerald-50 text-emerald-700' },
    LATE: { en: 'Late', bn: 'বিলম্বিত', cls: 'bg-amber-50 text-amber-700' },
    ABSENT: { en: 'Absent', bn: 'অনুপস্থিত', cls: 'bg-red-50 text-red-700' },
    EXCUSED: { en: 'Excused', bn: 'অব্যাহতিপ্রাপ্ত', cls: 'bg-slate-100 text-slate-600' },
  };
  const s = map[status] || { en: status, bn: status, cls: 'bg-slate-100 text-slate-600' };
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${s.cls}`}>{lang === 'bn' ? s.bn : s.en}</span>;
}
