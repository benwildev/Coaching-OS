'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY, toBanglaNumeral } from '@/lib/i18n';
import { formatTimeRange } from '@/lib/schedule';

interface TodaysClassItem {
  schedule: {
    id: string;
    startTime: string;
    endTime: string;
    batch: { id: string; name: string; banglaName?: string | null; code: string };
    subject: { id: string; name: string; banglaName?: string | null };
    teacher?: { id: string; name: string; banglaName?: string | null } | null;
    room?: { id: string; name: string; code: string } | null;
  };
  session: { id: string; status: string; isIncomplete: boolean } | null;
  eligibleStudentCount: number;
}

interface Kpis {
  todaysSessions: number;
  todaysPresent: number;
  todaysAbsent: number;
  todaysLate: number;
  todaysExcused: number;
  averageAttendance: number;
  hasAnyData: boolean;
}

export default function AttendancePage() {
  const router = useRouter();
  const { lang, showToast } = useApp();
  const dict = DICTIONARY[lang];

  const [classes, setClasses] = useState<TodaysClassItem[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/attendance');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setClasses(data.todaysClasses || []);
          setKpis(data.kpis || null);
        }
      }
    } catch (err) {
      console.error('Failed to load attendance overview', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openAttendance = async (item: TodaysClassItem) => {
    setOpeningId(item.schedule.id);
    try {
      const res = await fetch('/api/attendance/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classScheduleId: item.schedule.id, date: new Date().toISOString().slice(0, 10) }),
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

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#063b78] tracking-tight">{dict.attendance.title}</h1>
          <p className="text-[13.5px] text-[#64748b] mt-0.5 font-medium">{dict.attendance.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/attendance/alerts" className="inline-flex items-center gap-1.5 rounded-xl border border-[#dce5f0] bg-white px-3.5 py-2 text-[12.5px] font-semibold text-[#092f63] hover:bg-[#f8fafc]">
            <Icon name="alert" size={15} />
            {dict.attendance.lowAttendance}
          </Link>
          <Link href="/attendance/history" className="inline-flex items-center gap-1.5 rounded-xl border border-[#dce5f0] bg-white px-3.5 py-2 text-[12.5px] font-semibold text-[#092f63] hover:bg-[#f8fafc]">
            <Icon name="clock" size={15} />
            {dict.attendance.history}
          </Link>
        </div>
      </div>

      {/* Dashboard KPIs — real data only */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: dict.attendance.todaysSessions, value: kpis?.todaysSessions ?? 0, color: '#063b78', bg: 'bg-blue-50', icon: 'calendar' },
          { label: dict.attendance.present, value: kpis?.todaysPresent ?? 0, color: '#059669', bg: 'bg-emerald-50', icon: 'check' },
          { label: dict.attendance.absent, value: kpis?.todaysAbsent ?? 0, color: '#e11d48', bg: 'bg-rose-50', icon: 'x' },
          { label: dict.attendance.late, value: kpis?.todaysLate ?? 0, color: '#d97706', bg: 'bg-amber-50', icon: 'clock' },
          { label: dict.attendance.avgAttendance, value: `${kpis?.averageAttendance ?? 0}%`, color: '#063b78', bg: 'bg-blue-50', icon: 'chart' },
        ].map((k, i) => (
          <div key={i} className="card p-4 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-bold text-[#64748b] uppercase tracking-wider">{k.label}</span>
              <div className={`p-1.5 rounded-lg ${k.bg}`} style={{ color: k.color }}>
                <Icon name={k.icon} size={15} />
              </div>
            </div>
            <div className="mt-1.5 text-2xl font-extrabold" style={{ color: k.color }}>
              {typeof k.value === 'number' ? (lang === 'bn' ? toBanglaNumeral(k.value) : k.value) : k.value}
            </div>
          </div>
        ))}
      </div>

      {/* Today's Classes */}
      <div className="card p-4 md:p-5 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
        <h2 className="ttl mb-3">{dict.attendance.todaysClasses}</h2>

        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block h-7 w-7 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent" />
          </div>
        ) : classes.length === 0 ? (
          <div className="p-10 text-center flex flex-col items-center">
            <div className="h-14 w-14 rounded-2xl bg-blue-50 text-[#063b78] flex items-center justify-center mb-3">
              <Icon name="calendar" size={26} />
            </div>
            <p className="text-[14px] text-[#64748b]">{dict.attendance.emptyToday}</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {classes.map((item) => {
              const isCompleted = item.session?.status === 'COMPLETED';
              const isOpen = item.session?.status === 'OPEN';
              return (
                <div key={item.schedule.id} className="border border-[#dce5f0] rounded-xl p-3.5 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-bold text-[#063b78] text-[13.5px]">{formatTimeRange(item.schedule.startTime, item.schedule.endTime, lang)}</div>
                    {isCompleted && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${item.session?.isIncomplete ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
                        {item.session?.isIncomplete ? dict.attendance.incompleteBadge : dict.attendance.sessionCompleted}
                      </span>
                    )}
                    {isOpen && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700">{dict.attendance.marked}</span>}
                  </div>
                  <div className="font-semibold text-[#092f63] text-[14px]">
                    {lang === 'bn' && item.schedule.subject.banglaName ? item.schedule.subject.banglaName : item.schedule.subject.name}
                  </div>
                  <div className="text-[12.5px] text-[#64748b]">{item.schedule.batch.name}</div>
                  {item.schedule.teacher && (
                    <div className="text-[12px] text-[#64748b]">
                      {dict.attendance.teacher}: {lang === 'bn' && item.schedule.teacher.banglaName ? item.schedule.teacher.banglaName : item.schedule.teacher.name}
                    </div>
                  )}
                  {item.schedule.room && <div className="text-[12px] text-[#64748b]">{dict.attendance.room}: {item.schedule.room.name}</div>}
                  <div className="text-[12px] text-[#64748b]">{dict.attendance.students}: {lang === 'bn' ? toBanglaNumeral(item.eligibleStudentCount) : item.eligibleStudentCount}</div>

                  {item.session ? (
                    <Link
                      href={`/attendance/${item.session.id}`}
                      className={`mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-bold ${
                        isCompleted ? 'bg-[#eef3fa] text-[#063b78]' : 'bg-[#063b78] text-white'
                      }`}
                    >
                      {isCompleted ? dict.attendance.viewAttendance : dict.attendance.continueAttendance}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled={openingId === item.schedule.id}
                      onClick={() => openAttendance(item)}
                      className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#063b78] px-3 py-2 text-[12.5px] font-bold text-white hover:bg-[#052e5e] disabled:opacity-60"
                    >
                      {openingId === item.schedule.id ? '…' : dict.attendance.takeAttendance}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
