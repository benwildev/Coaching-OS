'use client';

import { useEffect, useState } from 'react';
import { usePortal } from '@/components/portal/PortalProvider';
import { DICTIONARY, formatDhakaDate, pickLocalized } from '@/lib/i18n';

interface ExamItem {
  id: string;
  title: string;
  banglaTitle: string | null;
  examType: string;
  status: string;
  startDate: string | null;
  subjects: Array<{ subject: { name: string; banglaName: string | null } }>;
}

const STATUS_STYLE: Record<string, string> = {
  SCHEDULED: 'bg-blue-50 text-blue-700',
  ONGOING: 'bg-amber-50 text-amber-700',
  COMPLETED: 'bg-slate-100 text-slate-600',
  PUBLISHED: 'bg-emerald-50 text-emerald-700',
  CANCELLED: 'bg-rose-50 text-rose-700',
};

export default function StudentPortalExamsPage() {
  const { lang } = usePortal();
  const t = DICTIONARY[lang];
  const e = t.portalExams;

  const [exams, setExams] = useState<ExamItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/portal/student/exams')
      .then((r) => r.json())
      .then((res) => res.success && setExams(res.exams))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-[900px] mx-auto flex flex-col gap-5">
      <h1 className="text-lg font-bold text-[#092f63]">{e.title}</h1>

      <div className="card rounded-2xl bg-white border border-[#dce5f0] overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-[13px] text-[#64748b]">{t.common.loading}</div>
        ) : exams.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-[#64748b]">{e.empty}</div>
        ) : (
          <ul className="divide-y divide-[#edf1f7]">
            {exams.map((ex) => (
              <li key={ex.id} className="flex flex-col gap-1.5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-[#092f63] text-[13.5px]">{pickLocalized(lang, ex.title, ex.banglaTitle)}</span>
                  <span className={`shrink-0 px-2.5 py-1 rounded-full text-[10.5px] font-bold ${STATUS_STYLE[ex.status] || 'bg-slate-100 text-slate-600'}`}>
                    {(t.examStatus as Record<string, string>)?.[ex.status] || ex.status}
                  </span>
                </div>
                <div className="text-[12px] text-[#64748b]">
                  {ex.startDate ? formatDhakaDate(ex.startDate) : '—'} · {ex.examType}
                </div>
                {ex.subjects.length > 0 && (
                  <div className="text-[11.5px] text-[#64748b]">
                    {e.subjects}: {ex.subjects.map((s) => pickLocalized(lang, s.subject.name, s.subject.banglaName)).join(', ')}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
