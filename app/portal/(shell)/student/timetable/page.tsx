'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock, MapPin, User, Calendar as CalendarIcon } from 'lucide-react';
import { usePortal } from '@/components/portal/PortalProvider';
import { DAY_LABELS, WEEK_ORDER, formatTimeRange } from '@/lib/schedule';

interface TimetableEntry {
  id: string;
  dayOfWeek: (typeof WEEK_ORDER)[number];
  startTime: string;
  endTime: string;
  subjectName: string;
  subjectBanglaName: string | null;
  batchName: string;
  teacherName: string | null;
  roomName: string | null;
}

/**
 * Phase 10.5: real timetable, built server-side from the student's own
 * active batch's ClassSchedule rows (GET /api/portal/student/timetable) —
 * no hardcoded schedule, no hardcoded class/section line.
 */
export default function StudentTimetablePage() {
  const { lang } = usePortal();
  const [entries, setEntries] = useState<TimetableEntry[] | null>(null);
  const [batchName, setBatchName] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/portal/student/timetable')
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setEntries(res.timetable);
          setBatchName(res.timetable[0]?.batchName ?? null);
        }
      })
      .catch(() => setEntries([]));
  }, []);

  const grouped = WEEK_ORDER.map((day) => ({
    day,
    items: (entries ?? []).filter((e) => e.dayOfWeek === day),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/portal/student"
            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-[#063b78] shadow-2xs transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-[#063b78] tracking-tight">
              {lang === 'bn' ? 'ক্লাস রুটিন ও সময়সূচি' : 'Class Timetable & Routine'}
            </h1>
            {batchName && <p className="text-xs text-slate-500 mt-0.5">{batchName}</p>}
          </div>
        </div>
      </div>

      {entries === null ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#063b78] border-t-transparent" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-10 text-center text-slate-500 text-sm">
          {lang === 'bn' ? 'কোনো নির্ধারিত ক্লাস নেই' : 'No scheduled classes'}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs divide-y divide-slate-100 overflow-hidden">
          {grouped.map((g) => (
            <div key={g.day}>
              <div className="px-4 sm:px-5 pt-4 pb-1 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                {lang === 'bn' ? DAY_LABELS[g.day].bn : DAY_LABELS[g.day].en}
              </div>
              {g.items.map((item) => (
                <div key={item.id} className="p-4 sm:p-5 pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl flex flex-col items-center justify-center font-bold shrink-0 bg-slate-100 text-slate-700">
                      <CalendarIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="font-bold text-[#063b78] text-sm sm:text-base">
                        {lang === 'bn' && item.subjectBanglaName ? item.subjectBanglaName : item.subjectName}
                      </span>
                      <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-slate-500 mt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {formatTimeRange(item.startTime, item.endTime, lang)}
                        </span>
                        {item.roomName && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            {item.roomName}
                          </span>
                        )}
                        {item.teacherName && (
                          <span className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            {item.teacherName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
