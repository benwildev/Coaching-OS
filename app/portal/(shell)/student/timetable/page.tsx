'use client';

import Link from 'next/link';
import { ArrowLeft, Clock, MapPin, User, Calendar as CalendarIcon } from 'lucide-react';
import { usePortal } from '@/components/portal/PortalProvider';

export default function StudentTimetablePage() {
  const { lang } = usePortal();

  const schedule = [
    { day: 'Saturday', bnDay: 'শনিবার', time: '8:00 AM – 9:30 AM', subject: 'Physics (1st Paper)', room: 'Room 1', teacher: 'Dr. Abdullah Al Mamun', status: 'Completed' },
    { day: 'Sunday', bnDay: 'রবিবার', time: '8:00 AM – 9:30 AM', subject: 'Chemistry (1st Paper)', room: 'Room 1', teacher: 'Shahidul Islam', status: 'Completed' },
    { day: 'Monday', bnDay: 'সোমবার', time: '8:00 AM – 9:30 AM', subject: 'Higher Mathematics', room: 'Room 1', teacher: 'Enamul Haque', status: 'Today · Attended' },
    { day: 'Tuesday', bnDay: 'মঙ্গলবার', time: '8:00 AM – 9:30 AM', subject: 'Biology (1st Paper)', room: 'Room 1', teacher: 'Fariha Yasmin', status: 'Tomorrow' },
    { day: 'Wednesday', bnDay: 'বুধবার', time: '8:00 AM – 9:30 AM', subject: 'English (1st Paper)', room: 'Room 2', teacher: 'Mahmudul Hasan', status: 'Upcoming' },
    { day: 'Thursday', bnDay: 'বৃহস্পতিবার', time: '8:00 AM – 9:30 AM', subject: 'Information & Comm. Tech (ICT)', room: 'Computer Lab', teacher: 'Tanvir Hossain', status: 'Upcoming' },
  ];

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
            <p className="text-xs text-slate-500 mt-0.5">
              Class 12 Science · Section A · Daily 8:00 AM
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs divide-y divide-slate-100 overflow-hidden">
        {schedule.map((item, idx) => (
          <div
            key={idx}
            className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
              item.status.includes('Today') ? 'bg-blue-50/50' : 'hover:bg-slate-50/70'
            }`}
          >
            <div className="flex items-start gap-4">
              <div
                className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center font-bold shrink-0 ${
                  item.status === 'Tomorrow'
                    ? 'bg-[#ffd200] text-[#063b78]'
                    : item.status.includes('Today')
                    ? 'bg-[#063b78] text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                <CalendarIcon className="w-5 h-5" />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-slate-900 text-sm sm:text-base">
                    {lang === 'bn' ? item.bnDay : item.day}
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className="font-bold text-[#063b78] text-sm sm:text-base">
                    {item.subject}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-slate-500 mt-1">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    {item.time}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    {item.room}
                  </span>
                  <span className="flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    {item.teacher}
                  </span>
                </div>
              </div>
            </div>

            <div className="self-end sm:self-center">
              <span
                className={`text-xs font-bold px-3 py-1 rounded-full ${
                  item.status === 'Tomorrow'
                    ? 'bg-[#ffd200] text-[#063b78]'
                    : item.status.includes('Today')
                    ? 'bg-blue-100 text-[#063b78]'
                    : item.status === 'Completed'
                    ? 'bg-slate-100 text-slate-600'
                    : 'bg-slate-50 text-slate-400'
                }`}
              >
                {item.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
