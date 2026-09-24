import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { isSetupCompleted } from '@/lib/services/tenant.service';
import { DASHBOARD_RANGES, getDashboardData, type DashboardRange } from '@/lib/services/dashboard.service';
import KpiCard, { type Kpi } from '@/components/KpiCard';
import DashboardFilters from '@/components/dashboard/DashboardFilters';
import FeeCollectionChart from '@/components/dashboard/FeeCollectionChart';
import BatchPerformance from '@/components/dashboard/BatchPerformance';
import {
  Panel,
  OutstandingFees,
  AttendanceHeatmap,
  RecentActivity,
  TodaySchedule,
  TopPerformers,
  TeacherWorkload,
  NeedsAttention,
  BatchOccupancy,
} from '@/components/dashboard/Sections';
import { grp, sparkPath, tkCompact } from '@/lib/format';
import { ic } from '@/lib/icons';

export const dynamic = 'force-dynamic';

const RANGE_TEXT: Record<number, string> = { 1: 'this month', 3: 'last 3 months', 6: 'last 6 months', 12: 'last 12 months' };

function spark(values: number[]) {
  const arr = values.length >= 2 ? values : [values[0] ?? 0, values[0] ?? 0];
  const d = sparkPath(arr);
  return { sparkD: d, sparkArea: d + ' L100 30 L0 30 Z' };
}

function deltaText(delta: number | null) {
  if (delta == null) return '—';
  return (delta > 0 ? '+' : '') + delta.toFixed(1) + '%';
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (!(await isSetupCompleted())) redirect('/setup');
  const session = await getSession();
  if (!session) redirect('/login');

  const sp = await searchParams;
  const rawRange = Number(sp.range);
  const range = (DASHBOARD_RANGES as readonly number[]).includes(rawRange) ? (rawRange as DashboardRange) : 3;
  const classId = typeof sp.class === 'string' ? sp.class : 'all';

  const data = await getDashboardData(session.coachingCenterId, { classId, range });
  const k = data.kpis;
  const now = data.generatedAt;

  const dhakaHour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Dhaka' }).format(now));
  const greeting = dhakaHour < 12 ? 'Good morning' : dhakaHour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = session.name.replace(/^Md\.\s*/, '').split(' ')[0];
  const dateLine = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dhaka' }).format(now);
  const updatedAt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Dhaka' }).format(now);
  const className = data.filters.classes.find((c) => c.id === data.filters.classId)?.name || 'All classes';
  const cmp = range === 1 ? 'vs last month' : `vs previous ${range} months`;
  const collectedPct = k.collected.billed > 0 ? Math.round((k.collected.value / k.collected.billed) * 100) : null;
  const attDelta = k.attendance.value != null && k.attendance.avg30 != null ? Math.round((k.attendance.value - k.attendance.avg30) * 10) / 10 : null;

  const kpis: Kpi[] = [
    {
      id: 'students', label: 'Total students', tone: 'teal', icon: ic('users'),
      value: grp(k.students.value), num: k.students.value, delta: deltaText(k.students.delta),
      up: (k.students.delta ?? 0) >= 0, good: (k.students.delta ?? 0) >= 0, neutral: k.students.delta == null, sub: 'vs last month',
      ...spark(k.students.spark),
    },
    {
      id: 'admissions', label: 'New admissions', tone: 'gold', icon: ic('userplus'),
      value: grp(k.admissions.value), num: k.admissions.value, delta: deltaText(k.admissions.delta),
      up: (k.admissions.delta ?? 0) >= 0, good: (k.admissions.delta ?? 0) >= 0, neutral: k.admissions.delta == null, sub: cmp,
      ...spark(k.admissions.spark),
    },
    {
      id: 'batches', label: 'Active batches', tone: 'teal', icon: ic('layers'),
      value: grp(k.batches.value), num: k.batches.value, delta: `+${k.batches.opened}`,
      up: true, good: true, neutral: k.batches.opened === 0, sub: 'opened this month',
      ...spark(k.batches.spark),
    },
    {
      id: 'attendance', label: "Today's attendance", tone: 'cyan', icon: ic('calcheck'),
      value: k.attendance.value != null ? `${k.attendance.value.toFixed(1)}%` : '—', num: k.attendance.value ?? 0,
      delta: attDelta != null ? `${attDelta > 0 ? '+' : ''}${attDelta.toFixed(1)} pts` : 'Not marked',
      up: (attDelta ?? 0) >= 0, good: (attDelta ?? 0) >= 0, neutral: attDelta == null,
      sub: k.attendance.avg30 != null ? `vs ${k.attendance.avg30.toFixed(1)}% 30-day avg` : 'no 30-day history yet',
      ...spark(k.attendance.spark),
    },
    {
      id: 'fees', label: 'Fees collected', tone: 'cyan', icon: ic('wallet'),
      value: tkCompact(k.collected.value), num: k.collected.value, delta: deltaText(k.collected.delta),
      up: (k.collected.delta ?? 0) >= 0, good: (k.collected.delta ?? 0) >= 0, neutral: k.collected.delta == null, sub: cmp,
      progress: collectedPct ?? undefined,
      progressLabel: collectedPct != null ? `${collectedPct}% of ${tkCompact(k.collected.billed)} billed` : undefined,
      ...spark(k.collected.spark),
    },
    {
      id: 'outstanding', label: 'Outstanding fees', tone: 'pink', icon: ic('alert'),
      value: tkCompact(k.outstanding.value), num: k.outstanding.value, delta: `${k.outstanding.lateStudents} students`,
      up: true, good: false, neutral: k.outstanding.lateStudents === 0, sub: '30+ days late',
      ...spark(k.outstanding.spark),
    },
    {
      id: 'exams', label: 'Upcoming exams', tone: 'gold', icon: ic('grad'),
      value: grp(k.exams.value), num: k.exams.value, delta: `${k.exams.thisWeek} this week`,
      neutral: true, sub: 'next 14 days',
      ...spark(k.exams.spark),
    },
    {
      id: 'teachers', label: 'Active teachers', tone: 'teal', icon: ic('teacher'),
      value: grp(k.teachers.value), num: k.teachers.value, delta: `${k.teachers.classesToday} classes today`,
      neutral: true, sub: 'teaching this week',
      ...spark(k.teachers.spark),
    },
  ];

  return (
    <div className="max-w-[1480px] mx-auto flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="dsp text-2xl sm:text-[28px] text-[#063b78] tracking-tight">
            {greeting}, {firstName}
          </h1>
          <p className="text-[12.5px] text-[#55637a] mt-1">
            {dateLine}
            {data.center.branch ? ` · ${data.center.branch}` : ''} · {className} · figures for {RANGE_TEXT[range]}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <DashboardFilters classes={data.filters.classes} classId={data.filters.classId} range={range} />
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[#55637a]">
            <span className="w-2 h-2 rounded-full bg-[#16a34a]" /> Updated {updatedAt}
          </span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.id} kpi={kpi} />
        ))}
      </div>

      {/* Main two-column area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-8 flex flex-col gap-5 min-w-0">
          <Panel title="Fee collection" subtitle="Are we collecting what we bill each month?">
            <FeeCollectionChart months={data.feeChart} range={range} />
          </Panel>
          <AttendanceHeatmap weeks={data.heatmap} />
          <Panel title="Batch performance" subtitle="Which batches are thriving and which need support?">
            <BatchPerformance rows={data.batchPerformance} lowScore={data.lowScore} />
          </Panel>
        </div>
        <div className="lg:col-span-4 flex flex-col gap-5 min-w-0">
          <OutstandingFees data={data.outstanding} />
          <RecentActivity items={data.activity} now={now} />
          <TodaySchedule agenda={data.todaysAgenda} exams={data.upcomingExams} />
        </div>
      </div>

      {/* People */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-start">
        <TopPerformers rows={data.topPerformers} />
        <TeacherWorkload rows={data.teacherWorkload} target={data.weeklyTarget} />
        <NeedsAttention rows={data.needsAttention} threshold={data.attendanceThreshold} lowScore={data.lowScore} />
      </div>

      <BatchOccupancy rows={data.occupancy} />
    </div>
  );
}
