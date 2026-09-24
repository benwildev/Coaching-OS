'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Icon from './Icon';
import { useApp } from '@/lib/store';
import { formatDhakaDate, toBanglaNumeral } from '@/lib/i18n';

interface StudentExamResult {
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
      startDate?: string | null;
      publishedAt?: string | null;
    };
  };
}

interface StudentExamGroup {
  examId: string;
  examTitle: string;
  banglaTitle?: string | null;
  examType: string;
  examDate?: string | null;
  totalMarks: number;
  obtainedMarks: number;
  percentage: number;
  isPassed: boolean;
  subjectsCount: number;
  subjects: Array<{
    subjectName: string;
    marksObtained: number | null;
    totalMarks: number;
    grade: string | null;
    gpa: number | null;
    isPassed: boolean | null;
    status: string;
  }>;
}

export default function StudentAcademicPerformance({ studentId }: { studentId: string }) {
  const { lang } = useApp();

  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<StudentExamResult[]>([]);
  const [examGroups, setExamGroups] = useState<StudentExamGroup[]>([]);
  const [stats, setStats] = useState({
    totalExams: 0,
    passedCount: 0,
    failedCount: 0,
    avgPercentage: 0,
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(`/api/results/student/${studentId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data.success) return;
        const resList: StudentExamResult[] = data.results || [];
        setResults(resList);

        // Group by exam
        const map = new Map<string, StudentExamGroup>();
        let overallObtained = 0;
        let overallTotal = 0;

        resList.forEach((r) => {
          const ex = r.examSubject.exam;
          const eId = ex.id;
          if (!map.has(eId)) {
            map.set(eId, {
              examId: eId,
              examTitle: ex.title,
              banglaTitle: ex.banglaTitle,
              examType: ex.examType,
              examDate: ex.startDate,
              totalMarks: 0,
              obtainedMarks: 0,
              percentage: 0,
              isPassed: true,
              subjectsCount: 0,
              subjects: [],
            });
          }

          const group = map.get(eId)!;
          group.totalMarks += r.examSubject.totalMarks;
          if (r.marksObtained !== null && r.status === 'PRESENT') {
            group.obtainedMarks += Number(r.marksObtained);
            overallObtained += Number(r.marksObtained);
            overallTotal += r.examSubject.totalMarks;
          }
          if (r.isPassed === false || r.status === 'ABSENT') {
            group.isPassed = false;
          }
          group.subjectsCount += 1;
          group.subjects.push({
            subjectName:
              lang === 'bn' && r.examSubject.subject.banglaName
                ? r.examSubject.subject.banglaName
                : r.examSubject.subject.name,
            marksObtained: r.marksObtained,
            totalMarks: r.examSubject.totalMarks,
            grade: r.grade,
            gpa: r.gpa,
            isPassed: r.isPassed,
            status: r.status,
          });
        });

        // Compute percentages
        map.forEach((g) => {
          g.percentage = g.totalMarks > 0 ? Math.round((g.obtainedMarks / g.totalMarks) * 100) : 0;
        });

        const groups = Array.from(map.values());
        setExamGroups(groups);

        const totalEx = groups.length;
        const passedEx = groups.filter((g) => g.isPassed).length;
        const failedEx = totalEx - passedEx;
        const avgPct = overallTotal > 0 ? Math.round((overallObtained / overallTotal) * 100) : 0;

        setStats({
          totalExams: totalEx,
          passedCount: passedEx,
          failedCount: failedEx,
          avgPercentage: avgPct,
        });
      })
      .catch((err) => console.error('Failed to load student exam results', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [studentId, lang]);

  return (
    <div className="card p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-5">
      <div className="flex items-center justify-between border-b border-[#edf2f7] pb-3 text-[#063b78]">
        <div className="flex items-center gap-2">
          <Icon name="award" size={20} />
          <h2 className="text-lg font-bold text-[#063b78]">
            {lang === 'bn' ? 'একাডেমিক ফলাফল ও পারফরম্যান্স' : 'Academic Results & Performance'}
          </h2>
        </div>
        <Link
          href={`/results?studentId=${studentId}`}
          className="text-[12.5px] font-bold text-[#063b78] hover:underline flex items-center gap-1"
        >
          <span>{lang === 'bn' ? 'পূর্ণাঙ্গ বিবরণী' : 'Full Tabulation'}</span>
          <Icon name="chevronright" size={14} />
        </Link>
      </div>

      {loading ? (
        <div className="py-8 text-center text-[#64748b]">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-[#063b78] border-r-transparent" />
          <p className="mt-2 text-[12.5px]">
            {lang === 'bn' ? 'পরীক্ষার ফলাফল লোড হচ্ছে…' : 'Loading performance records…'}
          </p>
        </div>
      ) : results.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-[13px] text-[#64748b] italic">
            {lang === 'bn'
              ? 'এই শিক্ষার্থীর কোনো প্রকাশিত পরীক্ষার ফলাফল এখনও নেই।'
              : 'No published examination results recorded for this student.'}
          </p>
        </div>
      ) : (
        <>
          {/* Factual Performance Stat Tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-[#f8fafc] border border-[#dce5f0] text-center">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#64748b] block">
                {lang === 'bn' ? 'অংশগ্রহণকৃত পরীক্ষা' : 'Exams Taken'}
              </span>
              <span className="text-xl font-bold text-[#092f63]">
                {toBanglaNumeral(stats.totalExams)}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#eef3fa] border border-blue-200 text-center">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#063b78] block">
                {lang === 'bn' ? 'গড় শতকরা নম্বর' : 'Average Score'}
              </span>
              <span className="text-xl font-extrabold text-[#063b78]">
                {toBanglaNumeral(stats.avgPercentage)}%
              </span>
            </div>

            <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200 text-center">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-800 block">
                {lang === 'bn' ? 'পাসকৃত পরীক্ষা' : 'Exams Passed'}
              </span>
              <span className="text-xl font-bold text-emerald-700">
                {toBanglaNumeral(stats.passedCount)}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-rose-50/60 border border-rose-200 text-center">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-rose-800 block">
                {lang === 'bn' ? 'ফেল' : 'Exams Failed'}
              </span>
              <span className="text-xl font-bold text-rose-600">
                {toBanglaNumeral(stats.failedCount)}
              </span>
            </div>
          </div>

          {/* Exam Results Breakdown */}
          <div className="flex flex-col gap-4">
            <h3 className="text-[13px] font-bold text-[#092f63]">
              {lang === 'bn' ? 'সাম্প্রতিক পরীক্ষার ফলাফল' : 'Recent Examination Results'}
            </h3>

            <div className="border border-[#dce5f0] rounded-xl overflow-hidden divide-y divide-[#edf2f7]">
              {examGroups.map((grp) => (
                <div key={grp.examId} className="p-4 bg-white hover:bg-[#f8fafc]/50 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/exams/${grp.examId}`}
                          className="font-bold text-[14px] text-[#092f63] hover:text-[#063b78] hover:underline"
                        >
                          {lang === 'bn' && grp.banglaTitle ? grp.banglaTitle : grp.examTitle}
                        </Link>
                        <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-[#063b78]">
                          {grp.examType}
                        </span>
                      </div>
                      <div className="text-[11.5px] text-[#64748b]">
                        {grp.examDate ? formatDhakaDate(grp.examDate) : '—'}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-[13.5px] font-bold text-[#092f63]">
                          {toBanglaNumeral(grp.obtainedMarks)} / {toBanglaNumeral(grp.totalMarks)}
                        </div>
                        <div className="text-[11px] text-[#64748b]">{grp.percentage}%</div>
                      </div>

                      <span
                        className={`px-2.5 py-0.5 rounded text-[11px] font-bold ${
                          grp.isPassed
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {grp.isPassed ? (lang === 'bn' ? 'পাস' : 'PASSED') : (lang === 'bn' ? 'ফেল' : 'FAILED')}
                      </span>
                    </div>
                  </div>

                  {/* Subject wise breakdown inside exam */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 mt-2 pt-2 border-t border-[#edf2f7]">
                    {grp.subjects.map((sub, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded-lg bg-[#f8fafc] border border-[#edf2f7] flex items-center justify-between text-[11.5px]"
                      >
                        <span className="font-semibold text-[#092f63]">{sub.subjectName}</span>
                        <div className="flex items-center gap-1.5">
                          {sub.status === 'ABSENT' ? (
                            <span className="text-rose-600 font-bold text-[10.5px]">
                              {lang === 'bn' ? 'অনুপস্থিত' : 'Absent'}
                            </span>
                          ) : (
                            <>
                              <span className="font-bold text-[#092f63]">
                                {sub.marksObtained !== null ? toBanglaNumeral(sub.marksObtained) : '—'}/{sub.totalMarks}
                              </span>
                              {sub.grade && (
                                <span
                                  className={`font-extrabold px-1 rounded text-[10.5px] ${
                                    sub.grade === 'F' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-[#063b78]'
                                  }`}
                                >
                                  {sub.grade}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
