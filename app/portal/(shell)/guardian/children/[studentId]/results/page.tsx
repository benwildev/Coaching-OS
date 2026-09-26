'use client';

import { use, useEffect, useState } from 'react';
import { usePortal } from '@/components/portal/PortalProvider';
import { DICTIONARY, formatDhakaDate, pickLocalized } from '@/lib/i18n';

interface ResultSubject {
  subjectName: string;
  subjectBanglaName: string | null;
  marksObtained: number | null;
  totalMarks: number;
  grade: string | null;
  gpa: number | null;
  status: string;
}
interface ExamResult {
  examId: string;
  title: string;
  banglaTitle: string | null;
  startDate: string | null;
  batch: string | null;
  subjects: ResultSubject[];
  overall: { overallGrade: string; overallGpa: number; isPassed: boolean };
}

export default function GuardianChildResultsPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = use(params);
  const { lang } = usePortal();
  const t = DICTIONARY[lang];
  const r = t.portalResults;

  const [results, setResults] = useState<ExamResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/portal/guardian/children/${studentId}/results`)
      .then((res) => res.json())
      .then((data) => (data.success ? setResults(data.history) : setError(data.error === 'STUDENT_NOT_LINKED' ? t.portalChildren.accessDenied : data.message || t.common.loadFailed)))
      .finally(() => setLoading(false));
  }, [studentId, t.common.loadFailed]);

  if (loading) return <div className="py-16 text-center text-[13px] text-[#64748b]">{t.common.loading}</div>;
  if (error) return <div className="py-16 text-center text-[13px] text-rose-600">{error}</div>;

  return (
    <div className="max-w-[900px] mx-auto flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-bold text-[#092f63]">{r.title}</h1>
        <p className="text-[12.5px] text-[#64748b]">{r.subtitle}</p>
      </div>

      {results.length === 0 ? (
        <div className="card p-12 rounded-2xl bg-white border border-[#dce5f0] text-center text-[13px] text-[#64748b]">{r.empty}</div>
      ) : (
        <div className="flex flex-col gap-5">
          {results.map((group) => (
            <div key={group.examId} className="card rounded-2xl bg-white border border-[#dce5f0] overflow-hidden">
              <div className="p-4 border-b border-[#edf2f7] bg-[#f8fafc] flex items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-[#092f63] text-[14px]">{pickLocalized(lang, group.title, group.banglaTitle)}</div>
                  <div className="text-[11.5px] text-[#64748b]">
                    {group.startDate && formatDhakaDate(group.startDate)}
                    {group.batch && ` · ${group.batch}`}
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${group.overall.isPassed ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                  {group.overall.isPassed ? r.passed : r.failed}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[12.5px]">
                  <thead className="text-[#64748b] text-[10.5px] font-bold uppercase">
                    <tr>
                      <th className="px-4 py-2.5">{r.subject}</th>
                      <th className="px-4 py-2.5 text-right">{r.total}</th>
                      <th className="px-4 py-2.5 text-right">{r.marks}</th>
                      <th className="px-4 py-2.5 text-center">{r.grade}</th>
                      <th className="px-4 py-2.5 text-center">{r.gpa}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf2f7]">
                    {group.subjects.map((s, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-2.5 font-semibold text-[#092f63]">{pickLocalized(lang, s.subjectName, s.subjectBanglaName)}</td>
                        <td className="px-4 py-2.5 text-right text-[#64748b]">{s.totalMarks}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-[#092f63]">
                          {s.status === 'ABSENT' ? (t.attendanceStatus as Record<string, string>).ABSENT : s.marksObtained ?? '—'}
                        </td>
                        <td className="px-4 py-2.5 text-center font-extrabold text-[#063b78]">{s.grade || '—'}</td>
                        <td className="px-4 py-2.5 text-center font-semibold text-[#092f63]">{s.gpa != null ? s.gpa.toFixed(2) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-3 text-right text-[12px] font-bold text-[#092f63] bg-[#f8fafc] border-t border-[#edf2f7]">
                {r.gpa}: {group.overall.overallGpa.toFixed(2)} · {r.grade}: {group.overall.overallGrade}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
