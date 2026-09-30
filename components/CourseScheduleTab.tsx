'use client';

import { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';

interface ScheduleRow {
  id: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  status: string;
  batchName: string;
  batchCode: string;
  subjectName: string;
  subjectBanglaName?: string | null;
  subjectCode: string;
  teacherName: string;
  roomName: string;
  branchName: string;
}

const DAY_LABELS: Record<string, { en: string; bn: string }> = {
  SATURDAY: { en: 'Saturday', bn: 'শনিবার' },
  SUNDAY: { en: 'Sunday', bn: 'রবিবার' },
  MONDAY: { en: 'Monday', bn: 'সোমবার' },
  TUESDAY: { en: 'Tuesday', bn: 'মঙ্গলবার' },
  WEDNESDAY: { en: 'Wednesday', bn: 'বুধবার' },
  THURSDAY: { en: 'Thursday', bn: 'বৃহস্পতিবার' },
  FRIDAY: { en: 'Friday', bn: 'শুক্রবার' },
};

export default function CourseScheduleTab({ courseId }: { courseId: string }) {
  const { lang } = useApp();
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/courses/${courseId}/schedules`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to load course schedules');
      }
      setSchedules(data.schedules || []);
    } catch (err: any) {
      setError(err?.message || 'Error loading schedules');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  if (loading) {
    return (
      <div className="card p-8 rounded-2xl bg-white border border-[#dce5f0] text-center text-[#64748b]">
        <div className="inline-block animate-spin w-6 h-6 border-2 border-[#063b78] border-t-transparent rounded-full mb-2" />
        <p className="text-[13px]">{lang === 'bn' ? 'রুটিন লোড হচ্ছে...' : 'Loading schedules...'}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-6 rounded-2xl bg-white border border-rose-200 text-center text-rose-600">
        <p className="text-[13px] font-semibold">{error}</p>
        <button
          type="button"
          onClick={fetchSchedules}
          className="mt-3 px-3 py-1.5 rounded-lg bg-rose-50 text-[12px] font-bold text-rose-700 hover:bg-rose-100"
        >
          {lang === 'bn' ? 'পুনরায় চেষ্টা করুন' : 'Retry'}
        </button>
      </div>
    );
  }

  if (schedules.length === 0) {
    return (
      <div className="card p-10 rounded-2xl bg-white border border-[#dce5f0] text-center">
        <div className="w-12 h-12 mx-auto rounded-full bg-[#f1f5f9] flex items-center justify-center text-[#64748b] mb-3">
          <Icon name="calendar" size={24} />
        </div>
        <h3 className="text-base font-bold text-[#092f63] mb-1">
          {lang === 'bn' ? 'এই কোর্সের জন্য কোনো ক্লাস রুটিন পাওয়া যায়নি' : 'No schedules found for this course'}
        </h3>
        <p className="text-[13px] text-[#64748b] max-w-md mx-auto">
          {lang === 'bn'
            ? 'কোর্সের আওতাধীন ব্যাচগুলোতে ক্লাস রুটিন যোগ করা হলে তা এখানে তালিকাভুক্ত হবে।'
            : 'Class schedules assigned to batches under this course will appear here.'}
        </p>
      </div>
    );
  }

  return (
    <div className="card rounded-2xl bg-white border border-[#dce5f0] shadow-2xs overflow-hidden">
      <div className="p-4 border-b border-[#dce5f0] flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[#063b78]">
            {lang === 'bn' ? 'কোর্সের ক্লাস রুটিন' : 'Course Class Schedule'}
          </h2>
          <p className="text-[12.5px] text-[#64748b]">
            {lang === 'bn'
              ? `মোট ${schedules.length}টি ক্লাস শিডিউল উপলব্ধ`
              : `Total ${schedules.length} scheduled class${schedules.length === 1 ? '' : 'es'}`}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-[13px]">
          <thead>
            <tr className="bg-[#f8fafc] text-[#64748b] border-b border-[#dce5f0] font-semibold">
              <th className="py-3 px-4">{lang === 'bn' ? 'ব্যাচ' : 'Batch'}</th>
              <th className="py-3 px-4">{lang === 'bn' ? 'বিষয়' : 'Subject'}</th>
              <th className="py-3 px-4">{lang === 'bn' ? 'শিক্ষক' : 'Teacher'}</th>
              <th className="py-3 px-4">{lang === 'bn' ? 'রুম' : 'Room'}</th>
              <th className="py-3 px-4">{lang === 'bn' ? 'দিন' : 'Day'}</th>
              <th className="py-3 px-4">{lang === 'bn' ? 'সময়' : 'Time'}</th>
              <th className="py-3 px-4">{lang === 'bn' ? 'স্ট্যাটাস' : 'Status'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf2f7]">
            {schedules.map((s) => {
              const dayLabel = DAY_LABELS[s.dayOfWeek]?.[lang] || s.dayOfWeek;
              return (
                <tr key={s.id} className="hover:bg-[#f8fafc] transition-colors">
                  <td className="py-3 px-4">
                    <span className="font-semibold text-[#092f63]">{s.batchName}</span>
                    <span className="block text-[11px] text-[#94a3b8] font-mono">{s.batchCode}</span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-[#1e293b]">{s.subjectName}</div>
                    {s.subjectBanglaName && (
                      <div className="text-[11.5px] text-[#64748b] font-bangla">{s.subjectBanglaName}</div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-[#475569]">{s.teacherName}</td>
                  <td className="py-3 px-4 text-[#475569]">{s.roomName}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded-md bg-[#edf2f9] text-[#063b78] text-[12px] font-medium">
                      {dayLabel}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono font-medium text-[#092f63]">
                    {s.startTime} - {s.endTime}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        s.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {s.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
