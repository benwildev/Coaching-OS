import Link from 'next/link';
import KpiCard, { type Kpi } from '@/components/KpiCard';
import { Panel } from '@/components/dashboard/Sections';
import { ic } from '@/lib/icons';
import { grp } from '@/lib/format';
import type { TeacherDashboardData } from '@/lib/services/teacher.service';

/**
 * Phase 10.5: a real, teacher-scoped dashboard — assigned classes, pending
 * attendance, pending marks entry, own students and notices. No financial
 * figures anywhere on this page (there is nothing here for it to hide).
 * Every number comes from `getTeacherDashboardData`, which resolves the
 * Teacher record from the authenticated User and scopes every query to
 * that teacher's own ACTIVE batch/subject assignments.
 */
export default function TeacherDashboard({
  data,
  greeting,
  firstName,
  dateLine,
  lang,
}: {
  data: Extract<TeacherDashboardData, { linked: true }>;
  greeting: string;
  firstName: string;
  dateLine: string;
  lang: 'en' | 'bn';
}) {
  const kpis: Kpi[] = [
    {
      id: 'classes-today', label: lang === 'bn' ? 'আজকের ক্লাস' : "Today's classes", tone: 'teal', icon: ic('calcheck'),
      value: grp(data.todaysClasses.length), num: data.todaysClasses.length, delta: '', sub: lang === 'bn' ? 'নির্ধারিত' : 'scheduled', neutral: true,
    },
    {
      id: 'pending-attendance', label: lang === 'bn' ? 'উপস্থিতি বাকি' : 'Pending attendance', tone: 'gold', icon: ic('alert'),
      value: grp(data.pendingAttendanceCount), num: data.pendingAttendanceCount, delta: '', sub: lang === 'bn' ? 'আজকের জন্য' : 'for today',
      neutral: data.pendingAttendanceCount === 0, good: data.pendingAttendanceCount === 0,
    },
    {
      id: 'batches', label: lang === 'bn' ? 'নির্ধারিত ব্যাচ' : 'Assigned batches', tone: 'cyan', icon: ic('layers'),
      value: grp(new Set(data.assignments.map((a) => a.batchId)).size), num: data.assignments.length, delta: '', sub: lang === 'bn' ? 'বিষয়সহ' : 'with subjects', neutral: true,
    },
    {
      id: 'students', label: lang === 'bn' ? 'মোট শিক্ষার্থী' : 'Your students', tone: 'teal', icon: ic('users'),
      value: grp(data.studentCount), num: data.studentCount, delta: '', sub: lang === 'bn' ? 'সকল ব্যাচে' : 'across your batches', neutral: true,
    },
  ];

  return (
    <div className="max-w-[1480px] mx-auto flex flex-col gap-5">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="dsp text-2xl sm:text-[28px] text-[#063b78] tracking-tight">
            {greeting}, {firstName}
          </h1>
          <p className="text-[12.5px] text-[#55637a] mt-1">{dateLine}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.id} kpi={kpi} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-7 flex flex-col gap-5 min-w-0">
          <Panel title={lang === 'bn' ? "আজকের ক্লাস" : "Today's classes"} subtitle={lang === 'bn' ? 'আপনার নির্ধারিত ক্লাসসমূহ' : 'Your scheduled classes today'}>
            {data.todaysClasses.length === 0 ? (
              <p className="text-[13px] text-[#8795ab] py-4 text-center">
                {lang === 'bn' ? 'আজ কোনো ক্লাস নির্ধারিত নেই' : 'No classes scheduled today'}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {data.todaysClasses.map((c) => (
                  <div key={c.scheduleId} className="flex items-center justify-between gap-3 rounded-xl border border-[#e5ebf3] px-3.5 py-2.5">
                    <div className="min-w-0">
                      <div className="font-bold text-[#092f63] text-[13.5px]">{c.time} · {c.subjectName}</div>
                      <div className="text-[12px] text-[#8795ab]">{c.batchName}{c.roomName ? ` · ${c.roomName}` : ''} · {c.studentCount} {lang === 'bn' ? 'শিক্ষার্থী' : 'students'}</div>
                    </div>
                    {c.sessionId ? (
                      c.sessionStatus === 'COMPLETED' ? (
                        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 rounded-full px-2.5 py-1 shrink-0">
                          {lang === 'bn' ? 'সম্পন্ন' : 'Done'}
                        </span>
                      ) : (
                        <Link href={`/attendance/${c.sessionId}`} className="text-[11px] font-bold text-white bg-[#063b78] rounded-full px-3 py-1 shrink-0 hover:bg-[#0a4a95]">
                          {lang === 'bn' ? 'চালিয়ে যান' : 'Continue'}
                        </Link>
                      )
                    ) : (
                      <Link href="/attendance" className="text-[11px] font-bold text-[#063b78] border border-[#c9d7ea] rounded-full px-3 py-1 shrink-0 hover:bg-[#f4f7fb]">
                        {lang === 'bn' ? 'উপস্থিতি নিন' : 'Take attendance'}
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title={lang === 'bn' ? 'নম্বর এন্ট্রি বাকি' : 'Pending marks entry'} subtitle={lang === 'bn' ? 'চলমান পরীক্ষার নম্বর' : 'Ongoing exams needing marks'}>
            {data.pendingMarksEntry.length === 0 ? (
              <p className="text-[13px] text-[#8795ab] py-4 text-center">
                {lang === 'bn' ? 'নম্বর এন্ট্রির জন্য কিছু বাকি নেই' : 'Nothing pending — all caught up'}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {data.pendingMarksEntry.map((m) => (
                  <div key={m.examSubjectId} className="flex items-center justify-between gap-3 rounded-xl border border-[#e5ebf3] px-3.5 py-2.5">
                    <div className="min-w-0">
                      <div className="font-bold text-[#092f63] text-[13.5px]">{m.examTitle} · {m.subjectName}</div>
                      <div className="text-[12px] text-[#8795ab]">{m.batchName ?? ''} · {m.enteredCount}/{m.totalCount} {lang === 'bn' ? 'এন্ট্রি হয়েছে' : 'entered'}</div>
                    </div>
                    <Link href={`/exams/${m.examId}/subjects/${m.examSubjectId}/marks`} className="text-[11px] font-bold text-white bg-[#063b78] rounded-full px-3 py-1 shrink-0 hover:bg-[#0a4a95]">
                      {lang === 'bn' ? 'নম্বর দিন' : 'Enter marks'}
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="lg:col-span-5 flex flex-col gap-5 min-w-0">
          <Panel title={lang === 'bn' ? 'আপনার নির্ধারণ' : 'Your assignments'} subtitle={lang === 'bn' ? 'ব্যাচ ও বিষয়' : 'Batches and subjects'}>
            {data.assignments.length === 0 ? (
              <p className="text-[13px] text-[#8795ab] py-4 text-center">
                {lang === 'bn' ? 'কোনো ব্যাচ নির্ধারিত নেই' : 'No batches assigned yet'}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {data.assignments.map((a) => (
                  <div key={`${a.batchId}-${a.subjectId}`} className="flex items-center justify-between gap-3 rounded-xl border border-[#e5ebf3] px-3.5 py-2.5">
                    <div className="font-bold text-[#092f63] text-[13px]">{a.batchName} · {a.subjectName}</div>
                    <div className="text-[12px] text-[#8795ab] shrink-0">{a.studentCount} {lang === 'bn' ? 'জন' : 'students'}</div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title={lang === 'bn' ? 'নোটিশ' : 'Notices'} subtitle={lang === 'bn' ? 'সাম্প্রতিক ঘোষণা' : 'Recent announcements'}>
            {data.recentNotices.length === 0 ? (
              <p className="text-[13px] text-[#8795ab] py-4 text-center">
                {lang === 'bn' ? 'কোনো নোটিশ নেই' : 'No notices yet'}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {data.recentNotices.map((n) => (
                  <Link key={n.id} href={`/notices/${n.id}`} className="block rounded-xl border border-[#e5ebf3] px-3.5 py-2.5 hover:bg-[#f8fafc]">
                    <div className="font-bold text-[#092f63] text-[13px]">{lang === 'bn' && n.banglaTitle ? n.banglaTitle : n.title}</div>
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
