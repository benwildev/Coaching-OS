'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate, toBanglaNumeral } from '@/lib/i18n';

interface PortalResult {
  id: string;
  marksObtained: number | null;
  status: string;
  grade: string | null;
  gpa: number | null;
  isPassed: boolean | null;
  rank: number | null;
  highestMarks: number | null;
  remarks: string | null;
  examSubject: {
    id: string;
    totalMarks: number;
    passMarks: number;
    subject: {
      id: string;
      name: string;
      banglaName?: string | null;
      code?: string | null;
    };
    exam: {
      id: string;
      title: string;
      banglaTitle?: string | null;
      examType: string;
      status: string;
      startDate?: string | null;
      publishedAt?: string | null;
      academicSession?: { name: string };
      academicClass?: { name: string };
      batch?: { name: string };
    };
  };
}

interface ExamGroup {
  examId: string;
  title: string;
  banglaTitle?: string | null;
  examType: string;
  date?: string | null;
  publishedAt?: string | null;
  sessionName?: string;
  className?: string;
  batchName?: string;
  totalMarks: number;
  obtainedMarks: number;
  percentage: number;
  isPassed: boolean;
  subjects: Array<{
    subjectName: string;
    marksObtained: number | null;
    totalMarks: number;
    passMarks: number;
    highestMarks: number | null;
    grade: string | null;
    gpa: number | null;
    isPassed: boolean | null;
    status: string;
    remarks?: string | null;
  }>;
}

function PortalResultsContent() {
  const searchParams = useSearchParams();
  const studentIdParam = searchParams.get('studentId') || '';
  const { lang, currentUser } = useApp();
  const dict = DICTIONARY[lang];

  // Resolve target student ID: query param or session user ID
  const targetStudentId = studentIdParam || currentUser?.userId || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [examGroups, setExamGroups] = useState<ExamGroup[]>([]);

  useEffect(() => {
    if (!targetStudentId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    // Call student results with portal=true (strictly published exams only)
    fetch(`/api/results/student/${targetStudentId}?portal=true`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load published results');
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (data.success) {
          const list: PortalResult[] = data.results || [];

          // Group by published exam
          const map = new Map<string, ExamGroup>();
          list.forEach((r) => {
            const ex = r.examSubject.exam;
            if (ex.status !== 'PUBLISHED') return; // Strict safeguard: published only

            if (!map.has(ex.id)) {
              map.set(ex.id, {
                examId: ex.id,
                title: ex.title,
                banglaTitle: ex.banglaTitle,
                examType: ex.examType,
                date: ex.startDate,
                publishedAt: ex.publishedAt,
                sessionName: ex.academicSession?.name,
                className: ex.academicClass?.name,
                batchName: ex.batch?.name,
                totalMarks: 0,
                obtainedMarks: 0,
                percentage: 0,
                isPassed: true,
                subjects: [],
              });
            }

            const grp = map.get(ex.id)!;
            grp.totalMarks += r.examSubject.totalMarks;
            if (r.marksObtained !== null && r.status === 'PRESENT') {
              grp.obtainedMarks += Number(r.marksObtained);
            }
            if (r.isPassed === false || r.status === 'ABSENT') {
              grp.isPassed = false;
            }

            grp.subjects.push({
              subjectName:
                lang === 'bn' && r.examSubject.subject.banglaName
                  ? r.examSubject.subject.banglaName
                  : r.examSubject.subject.name,
              marksObtained: r.marksObtained,
              totalMarks: r.examSubject.totalMarks,
              passMarks: r.examSubject.passMarks,
              highestMarks: r.highestMarks,
              grade: r.grade,
              gpa: r.gpa,
              isPassed: r.isPassed,
              status: r.status,
              remarks: r.remarks,
            });
          });

          // Calculate percentage per exam
          map.forEach((grp) => {
            grp.percentage =
              grp.totalMarks > 0 ? Math.round((grp.obtainedMarks / grp.totalMarks) * 100) : 0;
          });

          setExamGroups(Array.from(map.values()));
        } else {
          throw new Error(data.error || 'Failed to load results');
        }
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message || 'Error loading results');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [targetStudentId, lang]);

  return (
    <div className="max-w-[1000px] mx-auto flex flex-col gap-6 p-4 sm:p-6 pb-20">
      {/* Header */}
      <div className="card p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Icon name="award" size={24} className="text-[#063b78]" />
            <h1 className="text-xl sm:text-2xl font-bold text-[#092f63]">
              {lang === 'bn' ? 'আমার পরীক্ষার ফলাফল' : 'My Examination Results'}
            </h1>
          </div>
          <p className="text-[13px] text-[#64748b] mt-1">
            {lang === 'bn'
              ? 'এখানে শুধুমাত্র চূড়ান্তভাবে প্রকাশিত পরীক্ষার ফলাফল প্রদর্শিত হচ্ছে।'
              : 'Official view of officially published academic evaluations.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-xl bg-white border border-[#dce5f0] px-4 py-2 text-[13px] font-bold text-[#063b78] hover:bg-[#f8fafc] transition-colors shadow-2xs self-start sm:self-auto"
        >
          <Icon name="printer" size={16} />
          <span>{lang === 'bn' ? 'প্রিন্ট বিবরণী' : 'Print Transcript'}</span>
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-[#64748b]">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
          <p className="mt-3 text-[14px] font-medium">
            {lang === 'bn' ? 'ফলাফল লোড হচ্ছে…' : 'Loading results…'}
          </p>
        </div>
      ) : error ? (
        <div className="card p-8 rounded-2xl bg-white border border-[#dce5f0] text-center">
          <Icon name="alert" size={32} className="text-rose-500 mx-auto mb-2" />
          <h2 className="text-lg font-bold text-[#092f63]">{error}</h2>
        </div>
      ) : examGroups.length === 0 ? (
        <div className="card p-12 rounded-2xl bg-white border border-[#dce5f0] text-center">
          <Icon name="award" size={36} className="text-[#64748b] mx-auto mb-3 opacity-40" />
          <h2 className="text-lg font-bold text-[#092f63]">
            {lang === 'bn' ? 'কোনো প্রকাশিত ফলাফল নেই' : 'No Published Results Yet'}
          </h2>
          <p className="text-[13px] text-[#64748b] mt-1">
            {lang === 'bn'
              ? 'পরীক্ষা মূল্যায়ন সম্পন্ন এবং কর্তৃপক্ষের অনুমোদনক্রমে প্রকাশের পর এখানে প্রদর্শিত হবে।'
              : 'Examination results will appear here once officially published by the administration.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {examGroups.map((group) => (
            <div
              key={group.examId}
              className="card rounded-2xl bg-white border border-[#dce5f0] shadow-2xs overflow-hidden"
            >
              {/* Exam Card Header */}
              <div className="p-5 border-b border-[#edf2f7] bg-[#f8fafc] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-lg font-bold text-[#092f63]">
                      {lang === 'bn' && group.banglaTitle ? group.banglaTitle : group.title}
                    </h2>
                    <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-[#063b78]">
                      {group.examType}
                    </span>
                  </div>
                  <div className="text-[12px] text-[#64748b] mt-1 flex flex-wrap items-center gap-2">
                    {group.date && <span>{formatDhakaDate(group.date)}</span>}
                    {group.batchName && (
                      <>
                        <span>•</span>
                        <span>{group.batchName}</span>
                      </>
                    )}
                    {group.publishedAt && (
                      <>
                        <span>•</span>
                        <span className="text-emerald-700 font-medium">
                          {lang === 'bn' ? 'প্রকাশিত:' : 'Published:'} {formatDhakaDate(group.publishedAt)}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-base font-bold text-[#092f63]">
                      {toBanglaNumeral(group.obtainedMarks)} / {toBanglaNumeral(group.totalMarks)}
                    </div>
                    <div className="text-[11.5px] font-semibold text-[#64748b]">{group.percentage}%</div>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-[12px] font-bold ${
                      group.isPassed
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}
                  >
                    {group.isPassed ? (lang === 'bn' ? 'পাস' : 'PASSED') : (lang === 'bn' ? 'ফেল' : 'FAILED')}
                  </span>
                </div>
              </div>

              {/* Subject Breakdown Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead className="bg-white border-b border-[#edf2f7] text-[#64748b] text-[11.5px] font-bold uppercase tracking-wider">
                    <tr>
                      <th className="px-5 py-3">{lang === 'bn' ? 'বিষয়' : 'Subject'}</th>
                      <th className="px-5 py-3 text-right">{lang === 'bn' ? 'পূর্ণমান' : 'Total'}</th>
                      <th className="px-5 py-3 text-right">{lang === 'bn' ? 'পাস' : 'Pass'}</th>
                      <th className="px-5 py-3 text-right">{lang === 'bn' ? 'প্রাপ্ত নম্বর' : 'Marks'}</th>
                      <th className="px-5 py-3 text-center">{lang === 'bn' ? 'গ্রেড' : 'Grade'}</th>
                      <th className="px-5 py-3 text-center">{lang === 'bn' ? 'জিপিএ' : 'GPA'}</th>
                      <th className="px-5 py-3 text-center">{lang === 'bn' ? 'ফলাফল' : 'Result'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf2f7]">
                    {group.subjects.map((sub, idx) => (
                      <tr key={idx} className="hover:bg-[#f8fafc] transition-colors">
                        <td className="px-5 py-3 font-bold text-[#092f63]">{sub.subjectName}</td>
                        <td className="px-5 py-3 text-right text-[#64748b]">{toBanglaNumeral(sub.totalMarks)}</td>
                        <td className="px-5 py-3 text-right text-[#64748b]">{toBanglaNumeral(sub.passMarks)}</td>
                        <td className="px-5 py-3 text-right font-bold text-[#092f63]">
                          {sub.status === 'ABSENT' ? (
                            <span className="text-rose-600">{lang === 'bn' ? 'অনুপস্থিত' : 'Absent'}</span>
                          ) : sub.status === 'EXCUSED' ? (
                            <span className="text-amber-600">{lang === 'bn' ? 'ছুটি' : 'Excused'}</span>
                          ) : sub.marksObtained !== null ? (
                            toBanglaNumeral(sub.marksObtained)
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span
                            className={`font-extrabold ${
                              sub.grade === 'F' ? 'text-rose-600' : 'text-[#063b78]'
                            }`}
                          >
                            {sub.grade || '—'}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-center font-semibold text-[#092f63]">
                          {sub.gpa !== null && sub.gpa !== undefined ? sub.gpa.toFixed(2) : '—'}
                        </td>
                        <td className="px-5 py-3 text-center">
                          {sub.isPassed !== null && sub.isPassed !== undefined ? (
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                sub.isPassed
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {sub.isPassed ? (lang === 'bn' ? 'পাস' : 'PASS') : (lang === 'bn' ? 'ফেল' : 'FAIL')}
                            </span>
                          ) : (
                            <span className="text-[#64748b]">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StudentPortalResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-[1000px] mx-auto py-16 text-center text-[#64748b]">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent" />
        </div>
      }
    >
      <PortalResultsContent />
    </Suspense>
  );
}
