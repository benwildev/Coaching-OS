'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Download,
  Bell,
  Clock,
  CheckCircle2,
  Calendar as CalendarIcon,
  ChevronRight,
  TrendingUp,
  FileText,
  X,
  Printer,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
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
  const { lang, setLang, portalUser } = usePortal();
  const t = DICTIONARY[lang];

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [admitModalOpen, setAdmitModalOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  useEffect(() => {
    fetch('/api/portal/student/dashboard')
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setData(res);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Compute student name and initials
  const studentName = portalUser?.name || data?.student?.name || 'Tanvir Ahmed';
  const firstName = studentName.split(' ')[0] || 'Tanvir';
  const initials = studentName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

  // Weekly classes schedule matching mockup
  const weeklyClasses = [
    { day: 'Sat', date: '19 Sep', subject: 'Physics', status: 'Attended', statusType: 'past' },
    { day: 'Sun', date: '20 Sep', subject: 'Chemistry', status: 'Attended', statusType: 'past' },
    { day: 'Mon', date: '21 Sep', subject: 'Higher Math', status: 'Today · attended', statusType: 'today' },
    { day: 'Tue', date: '22 Sep', subject: 'Biology', status: 'Tomorrow', statusType: 'tomorrow' },
    { day: 'Wed', date: '23 Sep', subject: 'English', status: 'Upcoming', statusType: 'upcoming' },
    { day: 'Thu', date: '24 Sep', subject: 'ICT', status: 'Upcoming', statusType: 'upcoming' },
  ];

  // Subject scores with batch average comparison
  const subjectScores = [
    { subject: 'Higher Math', score: 98, batchAvg: 82 },
    { subject: 'ICT', score: 98, batchAvg: 85 },
    { subject: 'Physics', score: 96, batchAvg: 80 },
    { subject: 'Biology', score: 95, batchAvg: 78 },
    { subject: 'Chemistry', score: 92, batchAvg: 75 },
    { subject: 'English', score: 90, batchAvg: 74 },
  ];

  // Recent test results matching mockup
  const recentTests = [
    {
      title: 'HSC Model Test 01 · Chemistry 1st paper',
      date: '10 Sep · 100 marks',
      score: '91/100',
      grade: 'A+',
    },
    {
      title: 'Weekly Test 11 · Higher Math',
      date: '2 Sep · 50 marks',
      score: '48/50',
      grade: 'A+',
    },
    {
      title: 'Weekly Test 10 · Physics',
      date: '27 Aug · 50 marks',
      score: '47/50',
      grade: 'A+',
    },
    {
      title: 'Weekly Test 12 · Chemistry',
      date: '21 Sep · marking in progress',
      score: '—',
      grade: '...',
    },
  ];

  // September attendance calendar data (Sat to Fri)
  // September 2026 starts on Tuesday (1st)
  // Calendar row structure matching mockup
  const calendarDays = [
    { d: null, status: 'empty' },
    { d: null, status: 'empty' },
    { d: null, status: 'empty' },
    { d: 1, status: 'past' },
    { d: 2, status: 'past' },
    { d: 3, status: 'past' },
    { d: 4, status: 'off' }, // Fri
    { d: 5, status: 'past' },
    { d: 6, status: 'past' },
    { d: 7, status: 'past' },
    { d: 8, status: 'present-bold' }, // highlighted navy
    { d: 9, status: 'past' },
    { d: 10, status: 'past' },
    { d: 11, status: 'off' }, // Fri
    { d: 12, status: 'past' },
    { d: 13, status: 'past' },
    { d: 14, status: 'past' },
    { d: 15, status: 'late-box' }, // yellow border
    { d: 16, status: 'past' },
    { d: 17, status: 'past' },
    { d: 18, status: 'off' }, // Fri
    { d: 19, status: 'past' },
    { d: 20, status: 'past' },
    { d: 21, status: 'today' }, // Mon 21 Sep
    { d: 22, status: 'upcoming' },
    { d: 23, status: 'upcoming' },
    { d: 24, status: 'upcoming' },
    { d: 25, status: 'off' }, // Fri
    { d: 26, status: 'exam' }, // Sat 26 Sep Model Test
    { d: 27, status: 'upcoming' },
    { d: 28, status: 'upcoming' },
    { d: 29, status: 'upcoming' },
    { d: 30, status: 'upcoming' },
  ];

  // Last 12 classes status array for mobile view (1 absent, 1 late, 10 present)
  const last12Classes = [
    'absent',
    'present',
    'present',
    'present',
    'present',
    'late',
    'present',
    'present',
    'present',
    'present',
    'present',
    'present',
  ];

  return (
    <div className="w-full">
      {/* ========================================================= */}
      {/* DESKTOP VIEW (Visible on md and larger screens)            */}
      {/* Matches "Student · desktop" Figma mockup pixel-for-pixel  */}
      {/* ========================================================= */}
      <div className="hidden md:block max-w-[1240px] mx-auto space-y-6">
        {/* Top Header Bar */}
        <div className="flex items-start justify-between gap-4 pt-1">
          <div>
            <div className="text-xs font-semibold text-slate-500 tracking-tight">
              {lang === 'bn' ? 'সোমবার, ২১ সেপ্টেম্বর ২০২৬' : 'Monday, 21 September 2026'}
            </div>
            <h1 className="text-3xl font-black text-[#063b78] tracking-tight mt-0.5">
              {lang === 'bn' ? `শুভ অপরাহ্ন, ${firstName}` : `Good afternoon, ${firstName}`}
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Class 12 Science · A · Roll AL-12-014 · HSC candidate 2027
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Language Switcher */}
            <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setLang('bn')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  lang === 'bn' ? 'bg-[#063b78] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                বাংলা
              </button>
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  lang === 'en' ? 'bg-[#063b78] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                EN
              </button>
            </div>

            {/* Notification Bell Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="w-10 h-10 rounded-xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-center text-slate-600 hover:text-[#063b78] hover:border-slate-300 transition-all cursor-pointer relative"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4" />
                <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-[#ffd200] border-2 border-white" />
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl border border-slate-200 shadow-xl p-4 z-50 animate-in fade-in zoom-in-95">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <span className="font-bold text-xs text-slate-900">Notifications</span>
                    <button
                      type="button"
                      onClick={() => setNotificationsOpen(false)}
                      className="text-slate-400 hover:text-slate-600 text-xs"
                    >
                      Close
                    </button>
                  </div>
                  <div className="py-2 space-y-2.5 text-xs">
                    <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/60">
                      <div className="font-bold text-amber-900">Admit cards for Model Test 02 are ready</div>
                      <div className="text-[11px] text-amber-700 mt-0.5">Please download or collect your card before Saturday.</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="font-bold text-slate-800">Weekly Test 12 result is being marked</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Estimated publishing: Tomorrow 4:00 PM.</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Primary Action Button: Admit card · Model Test 02 */}
            <button
              type="button"
              onClick={() => setAdmitModalOpen(true)}
              className="bg-[#ffd200] hover:bg-[#ffdb29] text-[#063b78] font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer active:scale-[0.99]"
            >
              <Download className="w-4 h-4" />
              <span>{lang === 'bn' ? 'এডমিট কার্ড · মডেল টেস্ট ০২' : 'Admit card · Model Test 02'}</span>
            </button>
          </div>
        </div>

        {/* 4 KPI / Stat Cards Row */}
        <div className="grid grid-cols-4 gap-4">
          {/* Card 1: Attendance · September */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
            <span className="text-xs font-semibold text-slate-500 tracking-tight">
              {lang === 'bn' ? 'উপস্থিতি · সেপ্টেম্বর' : 'Attendance · September'}
            </span>
            <div className="my-2">
              <span className="text-3xl font-black text-[#063b78] tracking-tight">94%</span>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              {lang === 'bn' ? '১৮ ক্লাসের ১৭টিতে উপস্থিত · ১ বিলম্বে' : '17 of 18 classes · 1 late'}
            </span>
          </div>

          {/* Card 2: Average score */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
            <span className="text-xs font-semibold text-slate-500 tracking-tight">
              {lang === 'bn' ? 'গড় নম্বর' : 'Average score'}
            </span>
            <div className="my-2">
              <span className="text-3xl font-black text-[#063b78] tracking-tight">94.8</span>
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-emerald-600">
              <span>▲</span>
              <span>{lang === 'bn' ? 'আগস্ট থেকে ২.৪ পয়েন্ট বৃদ্ধি' : '2.4 points since August'}</span>
            </div>
          </div>

          {/* Card 3: Rank in batch */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
            <span className="text-xs font-semibold text-slate-500 tracking-tight">
              {lang === 'bn' ? 'ব্যাচ র‍্যাঙ্ক' : 'Rank in batch'}
            </span>
            <div className="my-2 flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-[#063b78] tracking-tight">2nd</span>
              <span className="text-sm font-medium text-slate-400">
                {lang === 'bn' ? '৪২ জনের মধ্যে' : 'of 42'}
              </span>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              {lang === 'bn' ? 'দ্বাদশ শ্রেণির শীর্ষ ৫%' : 'Top 5% of Class 12'}
            </span>
          </div>

          {/* Card 4: Tuition fees (Deep Navy Card) */}
          <div className="bg-[#062b66] text-white rounded-2xl p-5 shadow-xs flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-xl pointer-events-none" />
            <span className="text-xs font-bold text-blue-200/80 tracking-tight">
              {lang === 'bn' ? 'টিউশন ফি' : 'Tuition fees'}
            </span>
            <div className="my-2">
              <span className="text-lg font-black text-white leading-tight block">
                {lang === 'bn' ? 'সেপ্টেম্বর পর্যন্ত পরিশোধিত' : 'Paid through September'}
              </span>
            </div>
            <span className="text-xs text-blue-200/90 font-medium">
              {lang === 'bn' ? 'পরবর্তী প্রদেয় ১০ অক্টোবর · ৳২,৫০০' : 'Next due 10 Oct · ৳2,500'}
            </span>
          </div>
        </div>

        {/* Middle Section: Two Columns (2/3 and 1/3) */}
        <div className="grid grid-cols-3 gap-5">
          {/* Left: This week's classes (Wide Card) */}
          <div className="col-span-2 bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-extrabold text-[#063b78] text-base tracking-tight">
                  {lang === 'bn' ? 'চলতি সপ্তাহের ক্লাসসমূহ' : "This week's classes"}
                </h2>
                <span className="text-xs text-slate-400 font-medium">
                  8:00 am daily · Room 1 · Abdullah Al Mamun
                </span>
              </div>

              <div className="space-y-1.5">
                {weeklyClasses.map((item, idx) => {
                  const isToday = item.statusType === 'today';
                  const isTomorrow = item.statusType === 'tomorrow';

                  return (
                    <div
                      key={idx}
                      className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-colors ${
                        isToday
                          ? 'bg-blue-50/70 border border-blue-100 font-bold'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-6 w-48">
                        <span className="text-xs font-bold text-slate-800 w-8">{item.day}</span>
                        <span className="text-xs text-slate-400 font-medium">{item.date}</span>
                      </div>

                      <div className="flex-1 font-bold text-slate-800 text-sm">
                        {item.subject}
                      </div>

                      <div>
                        {isToday ? (
                          <span className="inline-block text-xs font-bold px-3 py-1 rounded-full bg-blue-100 text-[#063b78]">
                            {lang === 'bn' ? 'আজ · উপস্থিত' : 'Today · attended'}
                          </span>
                        ) : isTomorrow ? (
                          <span className="inline-block text-xs font-bold px-3 py-1 rounded-full bg-[#ffd200] text-[#063b78] shadow-2xs">
                            {lang === 'bn' ? 'আগামীকাল' : 'Tomorrow'}
                          </span>
                        ) : item.statusType === 'past' ? (
                          <span className="text-xs font-semibold text-slate-500">
                            {lang === 'bn' ? 'উপস্থিত' : 'Attended'}
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-slate-400">
                            {lang === 'bn' ? 'আসন্ন' : 'Upcoming'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: Coming up Card */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <h2 className="font-extrabold text-[#063b78] text-base tracking-tight mb-3.5">
                {lang === 'bn' ? 'আসন্ন বিষয়সমূহ' : 'Coming up'}
              </h2>

              {/* Yellow Exam Alert Card */}
              <div className="bg-[#fffbeb] border border-amber-200/90 rounded-2xl p-4 flex gap-3.5 items-start shadow-2xs">
                <div className="w-13 h-14 rounded-xl bg-[#ffd200] text-[#063b78] flex flex-col items-center justify-center font-black shrink-0 shadow-2xs">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider leading-none">SAT</span>
                  <span className="text-xl font-black leading-tight my-0.5">26</span>
                  <span className="text-[10px] font-bold leading-none">Sep</span>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold text-amber-800 tracking-wider uppercase block">
                    IN 5 DAYS · MODEL TEST
                  </span>
                  <div className="font-extrabold text-slate-900 text-sm leading-snug mt-0.5">
                    HSC Model Test 02 · Physics 1st paper
                  </div>
                  <div className="text-xs text-slate-500 font-medium mt-1">
                    9:00 am · 100 marks · 2 hours
                  </div>
                </div>
              </div>

              {/* Weekly Test 12 item */}
              <div className="mt-4 p-3 rounded-xl bg-slate-50/80 border border-slate-100 flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-bold text-slate-800">
                    Weekly Test 12 · Chemistry
                  </div>
                  <div className="text-[11.5px] text-slate-500 mt-0.5 leading-relaxed">
                    Held this morning. Results usually publish within 2 days.
                  </div>
                </div>
              </div>
            </div>

            {/* Note at bottom */}
            <div className="border-t border-slate-100 pt-3.5 mt-4">
              <span className="text-[10px] font-extrabold text-slate-400 tracking-wider uppercase block">
                BRING TO MODEL TESTS
              </span>
              <p className="text-xs text-slate-600 mt-0.5 font-medium leading-relaxed">
                Admit card, scientific calculator, arrive by 8:45 am.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Section: Three Columns (1:1:1) */}
        <div className="grid grid-cols-3 gap-5">
          {/* Column 1: Scores by subject */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <h3 className="font-extrabold text-[#063b78] text-sm tracking-tight">
                {lang === 'bn' ? 'বিষয়ভিত্তিক নম্বর' : 'Scores by subject'}
              </h3>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                {lang === 'bn'
                  ? 'সেপ্টেম্বরের পরীক্ষার গড় · দাগ = ব্যাচ গড়'
                  : 'Average of September tests · marker = batch average'}
              </p>

              <div className="space-y-3.5 mt-5">
                {subjectScores.map((item, idx) => (
                  <div key={idx}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-bold text-slate-800">{item.subject}</span>
                      <span className="font-extrabold text-[#063b78]">{item.score}</span>
                    </div>
                    {/* Horizontal Bar with Yellow Marker */}
                    <div className="h-2 w-full bg-slate-100 rounded-full relative overflow-visible">
                      <div
                        className="h-2 bg-[#063b78] rounded-full transition-all duration-300"
                        style={{ width: `${item.score}%` }}
                      />
                      {/* Vertical Yellow Batch Average Marker */}
                      <div
                        className="absolute top-[-3px] bottom-[-3px] w-1 bg-[#ffd200] rounded-full z-10 shadow-2xs"
                        style={{ left: `${item.batchAvg}%` }}
                        title={`Batch average: ${item.batchAvg}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Column 2: Recent tests */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <h3 className="font-extrabold text-[#063b78] text-sm tracking-tight mb-3">
                {lang === 'bn' ? 'সাম্প্রতিক পরীক্ষাসমূহ' : 'Recent tests'}
              </h3>

              <div className="space-y-3">
                {recentTests.map((t, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between pb-2.5 border-b border-slate-100 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-bold text-slate-800 text-xs truncate">
                        {t.title}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{t.date}</div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-slate-800">{t.score}</span>
                      <span
                        className={`text-xs font-extrabold px-2 py-0.5 rounded-md ${
                          t.grade === 'A+'
                            ? 'bg-[#063b78] text-white'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {t.grade}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 mt-2">
              <Link
                href="/portal/student/results"
                className="text-xs font-bold text-[#063b78] hover:underline flex items-center gap-1"
              >
                <span>{lang === 'bn' ? 'সকল ফলাফল ও উত্তরপত্র দেখুন' : 'All results and answer scripts'}</span>
                <span>→</span>
              </Link>
            </div>
          </div>

          {/* Column 3: September Attendance Calendar */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-extrabold text-[#063b78] text-sm tracking-tight">
                  {lang === 'bn' ? 'সেপ্টেম্বর' : 'September'}
                </h3>
                <span className="text-[11px] text-slate-400 font-medium">
                  {lang === 'bn' ? 'শুক্রবার বন্ধ' : 'Fridays off'}
                </span>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1 text-center text-[10.5px] font-semibold text-slate-400 mb-2">
                <span>Sat</span>
                <span>Sun</span>
                <span>Mon</span>
                <span>Tue</span>
                <span>Wed</span>
                <span>Thu</span>
                <span>Fri</span>
              </div>

              {/* Calendar Days Grid */}
              <div className="grid grid-cols-7 gap-1 text-center text-xs">
                {calendarDays.map((item, idx) => {
                  if (!item.d) return <div key={idx} className="h-7 w-7" />;

                  const isPresentBold = item.status === 'present-bold'; // Day 8
                  const isLateBox = item.status === 'late-box'; // Day 15
                  const isToday = item.status === 'today'; // Day 21
                  const isOff = item.status === 'off'; // Fridays

                  return (
                    <div
                      key={idx}
                      className={`h-7 w-7 rounded-lg flex items-center justify-center font-semibold mx-auto transition-all ${
                        isPresentBold
                          ? 'bg-[#063b78] text-white font-bold shadow-2xs'
                          : isLateBox
                          ? 'border-2 border-[#ffd200] text-slate-900 font-bold'
                          : isToday
                          ? 'bg-blue-100 text-[#063b78] font-bold'
                          : isOff
                          ? 'text-slate-300 font-normal'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {item.d}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Legend at bottom */}
            <div className="flex items-center justify-center gap-4 pt-3 border-t border-slate-100 mt-2 text-[10.5px] text-slate-500 font-medium">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#063b78]" />
                {lang === 'bn' ? 'উপস্থিত' : 'Present'}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm border border-[#ffd200]" />
                {lang === 'bn' ? 'বিলম্বিত' : 'Late'}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-xs bg-slate-300" />
                {lang === 'bn' ? 'অনুপস্থিত' : 'Absent'}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Notices Banner */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-extrabold text-[#063b78] text-sm tracking-tight">
              {lang === 'bn' ? 'নোটিশ বোর্ড' : 'Notices'}
            </h3>
            <Link
              href="/portal/student/notices"
              className="text-xs font-bold text-[#063b78] hover:underline"
            >
              {lang === 'bn' ? 'সকল নোটিশ →' : 'View all →'}
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-start gap-2.5">
              <div className="w-2 h-2 rounded-full bg-[#ffd200] mt-1.5 shrink-0" />
              <div>
                <span className="text-[11px] text-slate-400 font-semibold">21 Sep · Exams office</span>
                <div className="font-bold text-slate-900 mt-0.5">Admit cards for Model Test 02 are ready</div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-start gap-2.5">
              <div className="w-2 h-2 rounded-full bg-slate-300 mt-1.5 shrink-0" />
              <div>
                <span className="text-[11px] text-slate-400 font-semibold">18 Sep · Centre manager</span>
                <div className="font-bold text-slate-900 mt-0.5">Saturday 26 Sep starts at 9:00 am</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* MOBILE VIEW (Visible on screens smaller than md)           */}
      {/* Matches "Student · mobile" Figma mockup pixel-for-pixel    */}
      {/* ========================================================= */}
      <div className="md:hidden space-y-4 pb-24">
        {/* Top Dark Blue Header Card */}
        <div className="bg-gradient-to-b from-[#041e46] via-[#062b66] to-[#041e46] text-white p-5 rounded-b-3xl -mx-4 -mt-4 shadow-md relative overflow-hidden">
          {/* Subtle watermark circle */}
          <div className="absolute -top-12 -right-12 w-44 h-44 rounded-full border-[20px] border-blue-400/10 pointer-events-none" />

          {/* Top Row: Avatar & Notifications */}
          <div className="flex items-center justify-between mb-4 relative z-10">
            <div className="w-10 h-10 rounded-full bg-blue-400/20 border border-white/25 flex items-center justify-center text-white font-extrabold text-xs shadow-inner">
              {initials}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLang(lang === 'en' ? 'bn' : 'en')}
                className="px-2.5 py-1 rounded-full bg-white/10 text-white text-[11px] font-bold border border-white/15"
              >
                {lang === 'en' ? 'বাংলা' : 'EN'}
              </button>
              <button
                type="button"
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-white relative"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4" />
                <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#ffd200]" />
              </button>
            </div>
          </div>

          {/* Date & Greeting */}
          <div className="relative z-10">
            <div className="text-xs text-blue-200/80 font-medium">
              {lang === 'bn' ? 'সোমবার, ২১ সেপ্টেম্বর' : 'Monday, 21 September'}
            </div>
            <h1 className="text-2xl font-black text-white mt-0.5 tracking-tight">
              {lang === 'bn' ? `হাই, ${firstName}` : `Hi, ${firstName}`}
            </h1>
            <div className="text-xs text-blue-200/70 font-medium mt-1">
              Class 12 Science · A · Roll AL-12-014
            </div>
          </div>
        </div>

        {/* Floating Card: NEXT CLASS · TOMORROW */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-sm relative z-20">
          <span className="text-[10px] font-extrabold text-slate-400 tracking-wider uppercase block mb-2">
            {lang === 'bn' ? 'পরবর্তী ক্লাস · আগামীকাল' : 'NEXT CLASS · TOMORROW'}
          </span>

          <div className="flex items-center gap-3.5">
            <div className="w-14 h-12 rounded-xl bg-[#ffd200] text-[#063b78] flex flex-col items-center justify-center font-black shrink-0 shadow-2xs">
              <span className="text-xs leading-none">8:00</span>
              <span className="text-[9px] uppercase tracking-wider mt-0.5">AM</span>
            </div>
            <div className="min-w-0">
              <div className="font-extrabold text-slate-900 text-base leading-tight">
                Biology
              </div>
              <div className="text-xs text-slate-500 font-medium mt-0.5">
                Room 1 · Abdullah Al Mamun
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-100 text-xs text-slate-600 font-medium">
            {lang === 'bn'
              ? 'আজকের হায়ার ম্যাথ ক্লাস: সম্পন্ন হয়েছে।'
              : "Today's Higher Math class: attended."}
          </div>
        </div>

        {/* 2x2 Grid of Stat Cards */}
        <div className="grid grid-cols-2 gap-3">
          {/* Card 1: Attendance */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500 block">
              {lang === 'bn' ? 'উপস্থিতি' : 'Attendance'}
            </span>
            <div className="text-2xl font-black text-[#063b78] tracking-tight my-1">
              94%
            </div>
            <span className="text-[11px] text-slate-400 font-medium">
              17 of 18 in Sep
            </span>
          </div>

          {/* Card 2: Average score */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500 block">
              {lang === 'bn' ? 'গড় নম্বর' : 'Average score'}
            </span>
            <div className="text-2xl font-black text-[#063b78] tracking-tight my-1">
              94.8
            </div>
            <div className="text-[11px] font-bold text-emerald-600 flex items-center gap-0.5">
              <span>▲</span>
              <span>2.4 since Aug</span>
            </div>
          </div>

          {/* Card 3: Rank in batch */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500 block">
              {lang === 'bn' ? 'ব্যাচ র‍্যাঙ্ক' : 'Rank in batch'}
            </span>
            <div className="text-2xl font-black text-[#063b78] tracking-tight my-1">
              2nd
            </div>
            <span className="text-[11px] text-slate-400 font-medium">
              of 42 students
            </span>
          </div>

          {/* Card 4: Fees */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500 block">
              {lang === 'bn' ? 'ফি বিবরণ' : 'Fees'}
            </span>
            <div className="text-xl font-black text-slate-900 tracking-tight my-1">
              Paid up
            </div>
            <span className="text-[11px] text-slate-400 font-medium">
              Next due 10 Oct
            </span>
          </div>
        </div>

        {/* Yellow Exam Alert Banner */}
        <div className="bg-[#fffbeb] border border-amber-200/90 rounded-2xl p-4 shadow-2xs space-y-3">
          <span className="text-[10px] font-extrabold text-amber-800 tracking-wider uppercase block">
            EXAM IN 5 DAYS
          </span>
          <div>
            <div className="font-extrabold text-slate-900 text-sm leading-snug">
              HSC Model Test 02 · Physics 1st paper
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Sat 26 Sep · 9:00 am · 100 marks
            </div>
          </div>

          <button
            type="button"
            onClick={() => setAdmitModalOpen(true)}
            className="w-full py-3 px-4 rounded-xl bg-[#062b66] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer active:scale-[0.99]"
          >
            <Download className="w-4 h-4 text-[#ffd200]" />
            <span>{lang === 'bn' ? 'এডমিট কার্ড ডাউনলোড করুন' : 'Download admit card'}</span>
          </button>
        </div>

        {/* Recent Results Card */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-extrabold text-[#063b78] text-sm tracking-tight">
              {lang === 'bn' ? 'সাম্প্রতিক ফলাফল' : 'Recent results'}
            </h3>
            <Link
              href="/portal/student/results"
              className="text-xs font-bold text-[#063b78] hover:underline"
            >
              See all
            </Link>
          </div>

          <div className="space-y-3 divide-y divide-slate-100">
            {recentTests.map((t, idx) => (
              <div key={idx} className={`flex items-center justify-between ${idx > 0 ? 'pt-2.5' : ''}`}>
                <div className="min-w-0 pr-2">
                  <div className="font-bold text-slate-900 text-xs truncate">
                    {t.title}
                  </div>
                  <div className="text-[10.5px] text-slate-400 mt-0.5">{t.date}</div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-bold text-slate-800">{t.score}</span>
                  <span
                    className={`text-xs font-extrabold px-2 py-0.5 rounded-md ${
                      t.grade === 'A+'
                        ? 'bg-[#063b78] text-white'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {t.grade}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Last 12 Classes Card */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-extrabold text-[#063b78] text-sm tracking-tight">
              {lang === 'bn' ? 'সর্বশেষ ১২টি ক্লাস' : 'Last 12 classes'}
            </h3>
            <span className="text-[11px] text-slate-400 font-medium">
              oldest → today
            </span>
          </div>

          {/* Row of 12 classes status squares */}
          <div className="flex items-center gap-1.5 justify-between py-1">
            {last12Classes.map((st, idx) => (
              <div
                key={idx}
                className={`w-6 h-6 rounded-md transition-all ${
                  st === 'absent'
                    ? 'bg-[#063b78]'
                    : st === 'late'
                    ? 'border-2 border-[#ffd200] bg-white'
                    : 'bg-blue-100/90'
                }`}
                title={`Class ${idx + 1}`}
              />
            ))}
          </div>

          <div className="flex items-center justify-center gap-4 pt-3 border-t border-slate-100 mt-3 text-[10.5px] text-slate-500 font-medium">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-blue-100/90" />
              {lang === 'bn' ? 'উপস্থিত' : 'Present'}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs border-2 border-[#ffd200] bg-white" />
              {lang === 'bn' ? 'বিলম্বিত' : 'Late'}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#063b78]" />
              {lang === 'bn' ? 'অনুপস্থিত' : 'Absent'}
            </span>
          </div>
        </div>

        {/* Notices Card */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs">
          <h3 className="font-extrabold text-[#063b78] text-sm tracking-tight mb-3">
            {lang === 'bn' ? 'নোটিশ' : 'Notices'}
          </h3>

          <div className="space-y-3 divide-y divide-slate-100">
            <div>
              <div className="text-[11px] text-slate-400 font-semibold">21 Sep · Exams office</div>
              <div className="font-bold text-slate-900 text-xs mt-0.5">
                Admit cards for Model Test 02 are ready
              </div>
            </div>

            <div className="pt-2.5">
              <div className="text-[11px] text-slate-400 font-semibold">18 Sep · Centre manager</div>
              <div className="font-bold text-slate-900 text-xs mt-0.5">
                Saturday 26 Sep starts at 9:00 am
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* INTERACTIVE ADMIT CARD MODAL                              */}
      {/* ========================================================= */}
      {admitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-[#063374] to-[#021738] text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#ffd200] text-[#063b78] flex items-center justify-center font-black text-xs">
                  A
                </div>
                <div>
                  <h3 className="font-extrabold text-sm tracking-tight text-white leading-tight">
                    {lang === 'bn' ? 'অফিসিয়াল এডমিট কার্ড' : 'Official Admit Card'}
                  </h3>
                  <p className="text-[11px] text-blue-200/80">Alokito Coaching Centre · Examination Board</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setAdmitModalOpen(false)}
                className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Document Preview */}
            <div className="p-6 space-y-5">
              {/* Exam Title Badge */}
              <div className="text-center pb-4 border-b border-slate-100">
                <span className="text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-900 border border-amber-200 px-3 py-1 rounded-full">
                  HSC Model Test Series 2026–27
                </span>
                <h4 className="text-lg font-black text-slate-900 mt-2">
                  Model Test 02: Physics 1st Paper
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Saturday, 26 September 2026 · 9:00 AM – 11:00 AM (2 Hours)
                </p>
              </div>

              {/* Student Details Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div>
                  <span className="text-slate-400 block text-[11px]">Candidate Name</span>
                  <span className="font-bold text-slate-900">{studentName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Roll Code</span>
                  <span className="font-bold text-slate-900">AL-12-014</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Class & Batch</span>
                  <span className="font-bold text-slate-900">Class 12 Science (Batch A)</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Allocated Room</span>
                  <span className="font-bold text-[#063b78]">Room 1 · Seat 14</span>
                </div>
              </div>

              {/* Instructions */}
              <div className="text-xs text-slate-600 space-y-1.5 bg-amber-50/50 p-3.5 rounded-xl border border-amber-200/60">
                <span className="font-bold text-amber-900 text-[11px] block uppercase tracking-wide">
                  Exam Hall Instructions:
                </span>
                <p>1. Candidate must bring this printed admit card and student ID badge.</p>
                <p>2. Arrive at the exam hall no later than 8:45 AM (15 minutes before exam).</p>
                <p>3. Non-programmable scientific calculators are permitted for Physics.</p>
                <p>4. Mobile phones and digital watches are strictly prohibited.</p>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    window.print();
                  }}
                  className="flex-1 py-3 px-4 rounded-xl bg-[#ffd200] hover:bg-[#ffdb29] text-[#063b78] font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer shadow-xs active:scale-[0.99]"
                >
                  <Printer className="w-4 h-4" />
                  <span>{lang === 'bn' ? 'প্রিন্ট / সেভ করুন' : 'Print / Save PDF'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAdmitModalOpen(false)}
                  className="py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm cursor-pointer"
                >
                  {lang === 'bn' ? 'বন্ধ করুন' : 'Close'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
