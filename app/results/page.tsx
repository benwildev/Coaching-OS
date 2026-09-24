'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate, toBanglaNumeral } from '@/lib/i18n';

interface ResultRow {
  id: string;
  marksObtained: number | null;
  status: string;
  grade: string | null;
  gpa: number | null;
  isPassed: boolean | null;
  rank: number | null;
  highestMarks: number | null;
  remarks: string | null;
  student: {
    id: string;
    studentIdCode: string;
    name: string;
    banglaName?: string | null;
    enrollments?: Array<{ rollNumber?: string | null }>;
  };
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
      academicSession?: { name: string };
      academicClass?: { name: string };
      batch?: { name: string };
    };
  };
}

function ResultsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang } = useApp();
  const dict = DICTIONARY[lang];

  // URL Query state
  const initialExamId = searchParams.get('examId') || '';
  const initialStudentId = searchParams.get('studentId') || '';
  const initialBatchId = searchParams.get('batchId') || '';
  const initialClassId = searchParams.get('academicClassId') || '';
  const initialSessionId = searchParams.get('academicSessionId') || '';
  const initialPage = Number(searchParams.get('page')) || 1;

  const [examId, setExamId] = useState(initialExamId);
  const [studentId, setStudentId] = useState(initialStudentId);
  const [batchId, setBatchId] = useState(initialBatchId);
  const [academicClassId, setAcademicClassId] = useState(initialClassId);
  const [academicSessionId, setAcademicSessionId] = useState(initialSessionId);
  const [page, setPage] = useState(initialPage);
  const [pageSize] = useState(25);

  const [results, setResults] = useState<ResultRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);

  // Form options
  const [options, setOptions] = useState<{
    sessions: any[];
    programs: any[];
    batches: any[];
  }>({ sessions: [], programs: [], batches: [] });
  const [examList, setExamList] = useState<any[]>([]);

  // Load filter options
  useEffect(() => {
    async function loadOptions() {
      try {
        const [optRes, examRes] = await Promise.all([
          fetch('/api/batches/options'),
          fetch('/api/exams?pageSize=100'),
        ]);
        if (optRes.ok) {
          const optData = await optRes.json();
          if (optData.success) {
            setOptions({
              sessions: optData.sessions || [],
              programs: optData.programs || [],
              batches: optData.batches || [],
            });
          }
        }
        if (examRes.ok) {
          const examData = await examRes.json();
          if (examData.success) {
            setExamList(examData.exams || []);
          }
        }
      } catch (err) {
        console.error('Failed to load options', err);
      }
    }
    loadOptions();
  }, []);

  // Fetch results based on current filters
  const loadResults = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (examId) q.set('examId', examId);
      if (studentId) q.set('studentId', studentId);
      if (batchId) q.set('batchId', batchId);
      if (academicClassId) q.set('academicClassId', academicClassId);
      if (academicSessionId) q.set('academicSessionId', academicSessionId);
      q.set('page', String(page));
      q.set('pageSize', String(pageSize));

      const res = await fetch(`/api/results?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setResults(data.results || []);
          setPagination(data.pagination || { page: 1, pageSize: 25, total: 0, totalPages: 1 });
        }
      }
    } catch (err) {
      console.error('Failed to load results', err);
    } finally {
      setLoading(false);
    }
  }, [examId, studentId, batchId, academicClassId, academicSessionId, page, pageSize]);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  // Handle filter changes
  const applyFilters = () => {
    setPage(1);
    const q = new URLSearchParams();
    if (examId) q.set('examId', examId);
    if (batchId) q.set('batchId', batchId);
    if (academicClassId) q.set('academicClassId', academicClassId);
    if (academicSessionId) q.set('academicSessionId', academicSessionId);
    router.push(`/results?${q.toString()}`);
  };

  const clearFilters = () => {
    setExamId('');
    setBatchId('');
    setAcademicClassId('');
    setAcademicSessionId('');
    setPage(1);
    router.push('/results');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-6 pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <Icon name="award" size={24} className="text-[#063b78]" />
            <h1 className="text-xl sm:text-2xl font-bold text-[#092f63]">
              {lang === 'bn' ? 'ফলাফল ও টেবুলেশন বিবরণী' : 'Results & Tabulation Sheet'}
            </h1>
          </div>
          <p className="text-[13px] text-[#64748b] mt-1">
            {lang === 'bn'
              ? 'সকল পরীক্ষার ফলাফল অন্বেষণ, গ্রেড বিশ্লেষণ ও প্রিন্টযোগ্য বিবরণী'
              : 'Explore verified examination results, grade distributions and print transcripts'}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-xl bg-white border border-[#dce5f0] px-4 py-2 text-[13px] font-bold text-[#063b78] hover:bg-[#f8fafc] transition-colors shadow-2xs"
          >
            <Icon name="printer" size={16} />
            <span>{lang === 'bn' ? 'প্রিন্ট বিবরণী' : 'Print Sheet'}</span>
          </button>
          <Link
            href="/exams"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#063b78] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#084b96] transition-colors shadow-2xs"
          >
            <Icon name="award" size={15} />
            <span>{lang === 'bn' ? 'পরীক্ষাসমূহ' : 'All Exams'}</span>
          </Link>
        </div>
      </div>

      {/* Filter Bar (Hidden in Print) */}
      <div className="card p-4 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-3 print:hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-[#64748b] mb-1">
              {lang === 'bn' ? 'পরীক্ষা নির্বাচন' : 'Filter by Exam'}
            </label>
            <select
              value={examId}
              onChange={(e) => setExamId(e.target.value)}
              className="w-full rounded-xl border border-[#dce5f0] px-3 py-1.5 text-[12.5px] text-[#092f63] focus:border-[#063b78] focus:outline-none bg-white font-medium"
            >
              <option value="">{lang === 'bn' ? 'সকল পরীক্ষা' : 'All Exams'}</option>
              {examList.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.title} ({ex.status})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#64748b] mb-1">
              {lang === 'bn' ? 'শিক্ষাবর্ষ' : 'Academic Session'}
            </label>
            <select
              value={academicSessionId}
              onChange={(e) => setAcademicSessionId(e.target.value)}
              className="w-full rounded-xl border border-[#dce5f0] px-3 py-1.5 text-[12.5px] text-[#092f63] focus:border-[#063b78] focus:outline-none bg-white"
            >
              <option value="">{lang === 'bn' ? 'সকল শিক্ষাবর্ষ' : 'All Sessions'}</option>
              {options.sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#64748b] mb-1">
              {lang === 'bn' ? 'ব্যাচ' : 'Batch'}
            </label>
            <select
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              className="w-full rounded-xl border border-[#dce5f0] px-3 py-1.5 text-[12.5px] text-[#092f63] focus:border-[#063b78] focus:outline-none bg-white"
            >
              <option value="">{lang === 'bn' ? 'সকল ব্যাচ' : 'All Batches'}</option>
              {options.batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={applyFilters}
              className="flex-1 rounded-xl bg-[#063b78] px-3.5 py-1.5 text-[12.5px] font-bold text-white hover:bg-[#084b96] transition-colors"
            >
              {lang === 'bn' ? 'ফিল্টার করুন' : 'Apply'}
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-xl border border-[#dce5f0] px-3 py-1.5 text-[12.5px] font-semibold text-[#64748b] hover:bg-[#f8fafc] transition-colors"
            >
              {lang === 'bn' ? 'মুছুন' : 'Reset'}
            </button>
          </div>
        </div>
      </div>

      {/* Print-Only Header */}
      <div className="hidden print:block border-b-2 border-[#063b78] pb-4 mb-4 text-center">
        <h1 className="text-2xl font-bold text-[#092f63]">Coaching Operating System</h1>
        <h2 className="text-lg font-semibold text-[#063b78]">
          {lang === 'bn' ? 'একাডেমিক ফলাফল টেবুলেশন বিবরণী' : 'Academic Result Tabulation Sheet'}
        </h2>
        <p className="text-[12px] text-[#64748b]">
          {examId && examList.find((e) => e.id === examId)
            ? `Exam: ${examList.find((e) => e.id === examId).title}`
            : 'Consolidated Performance Report'}{' '}
          • Printed on: {formatDhakaDate(new Date())}
        </p>
      </div>

      {/* Results Table Card */}
      <div className="card rounded-2xl bg-white border border-[#dce5f0] shadow-2xs overflow-hidden print:border-none print:shadow-none">
        <div className="p-4 border-b border-[#dce5f0] flex items-center justify-between bg-[#f8fafc] print:hidden">
          <span className="text-[13px] font-bold text-[#092f63]">
            {lang === 'bn'
              ? `মোট ফলাফল রেকর্ড: ${toBanglaNumeral(pagination.total)}টি`
              : `Total Result Records: ${pagination.total}`}
          </span>
          {pagination.totalPages > 1 && (
            <span className="text-[12px] text-[#64748b]">
              {lang === 'bn'
                ? `পৃষ্ঠা ${toBanglaNumeral(pagination.page)} / ${toBanglaNumeral(pagination.totalPages)}`
                : `Page ${pagination.page} of ${pagination.totalPages}`}
            </span>
          )}
        </div>

        {loading ? (
          <div className="py-16 text-center text-[#64748b]">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
            <p className="mt-3 text-[14px] font-medium">
              {lang === 'bn' ? 'ফলাফল লোড হচ্ছে…' : 'Loading results…'}
            </p>
          </div>
        ) : results.length === 0 ? (
          <div className="py-16 text-center">
            <Icon name="award" size={36} className="text-[#64748b] mx-auto mb-2 opacity-50" />
            <h3 className="text-base font-bold text-[#092f63]">
              {lang === 'bn' ? 'কোনো ফলাফল পাওয়া যায়নি' : 'No Published Results Found'}
            </h3>
            <p className="text-[13px] text-[#64748b] mt-1 max-w-[400px] mx-auto">
              {lang === 'bn'
                ? 'নির্বাচিত ফিল্টারের অধীনে কোনো প্রকাশিত পরীক্ষার ফলাফল নেই।'
                : 'No published examination results match the specified criteria.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px] print:text-[11px]">
              <thead className="bg-[#f8fafc] border-b border-[#dce5f0] text-[#64748b] text-[11px] font-bold uppercase tracking-wider print:bg-gray-100">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">{lang === 'bn' ? 'শিক্ষার্থী' : 'Student'}</th>
                  <th className="px-4 py-3">{lang === 'bn' ? 'আইডি' : 'Student ID'}</th>
                  <th className="px-4 py-3">{lang === 'bn' ? 'রোল' : 'Roll'}</th>
                  <th className="px-4 py-3">{lang === 'bn' ? 'পরীক্ষা' : 'Exam'}</th>
                  <th className="px-4 py-3">{lang === 'bn' ? 'বিষয়' : 'Subject'}</th>
                  <th className="px-4 py-3 text-right">{lang === 'bn' ? 'প্রাপ্ত / পূর্ণমান' : 'Marks / Total'}</th>
                  <th className="px-4 py-3 text-center">{lang === 'bn' ? 'শতাংশ' : '%'}</th>
                  <th className="px-4 py-3 text-center">{lang === 'bn' ? 'গ্রেড' : 'Grade'}</th>
                  <th className="px-4 py-3 text-center">{lang === 'bn' ? 'জিপিএ' : 'GPA'}</th>
                  <th className="px-4 py-3 text-center">{lang === 'bn' ? 'পাস / ফেল' : 'Status'}</th>
                  <th className="px-4 py-3 text-center">{lang === 'bn' ? 'মেধাক্রম' : 'Rank'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf2f7]">
                {results.map((r, index) => {
                  const roll = r.student.enrollments?.[0]?.rollNumber;
                  const totalMarks = r.examSubject.totalMarks;
                  const marks = r.marksObtained;
                  const pct = marks !== null && totalMarks > 0 ? ((marks / totalMarks) * 100).toFixed(1) : '—';

                  return (
                    <tr key={r.id} className="hover:bg-[#f8fafc] transition-colors">
                      <td className="px-4 py-3 text-[#64748b] font-mono">
                        {(pagination.page - 1) * pagination.pageSize + index + 1}
                      </td>
                      <td className="px-4 py-3 font-bold text-[#092f63]">
                        <Link
                          href={`/students/${r.student.id}`}
                          className="hover:text-[#063b78] hover:underline print:no-underline"
                        >
                          {lang === 'bn' && r.student.banglaName ? r.student.banglaName : r.student.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-mono text-[#063b78]">{r.student.studentIdCode}</td>
                      <td className="px-4 py-3 font-semibold text-[#092f63]">{roll || '—'}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/exams/${r.examSubject.exam.id}`}
                          className="font-medium text-[#092f63] hover:text-[#063b78] hover:underline print:no-underline"
                        >
                          {r.examSubject.exam.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#092f63]">
                        {lang === 'bn' && r.examSubject.subject.banglaName
                          ? r.examSubject.subject.banglaName
                          : r.examSubject.subject.name}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.status === 'ABSENT' ? (
                          <span className="text-rose-600 font-bold">{lang === 'bn' ? 'অনুপস্থিত' : 'Absent'}</span>
                        ) : r.status === 'EXCUSED' ? (
                          <span className="text-amber-600 font-bold">{lang === 'bn' ? 'ছুটি' : 'Excused'}</span>
                        ) : (
                          <span className="font-bold text-[#092f63]">
                            {marks !== null ? toBanglaNumeral(marks) : '—'}{' '}
                            <span className="text-[10.5px] font-normal text-[#64748b]">/ {totalMarks}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-[#64748b]">
                        {pct !== '—' ? `${pct}%` : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`font-extrabold ${
                            r.grade === 'F' ? 'text-rose-600' : 'text-[#063b78]'
                          }`}
                        >
                          {r.grade || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-[#092f63]">
                        {r.gpa !== null && r.gpa !== undefined ? r.gpa.toFixed(2) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.isPassed !== null && r.isPassed !== undefined ? (
                          <span
                            className={`px-2 py-0.5 rounded text-[10.5px] font-bold ${
                              r.isPassed
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {r.isPassed ? (lang === 'bn' ? 'পাস' : 'PASS') : (lang === 'bn' ? 'ফেল' : 'FAIL')}
                          </span>
                        ) : (
                          <span className="text-[#64748b]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-blue-800">
                        {r.rank ? toBanglaNumeral(r.rank) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Server-Side Pagination Bar */}
        {!loading && pagination.totalPages > 1 && (
          <div className="p-4 border-t border-[#dce5f0] flex items-center justify-between bg-white print:hidden">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#dce5f0] px-3.5 py-1.5 text-[12.5px] font-semibold text-[#092f63] hover:bg-[#f8fafc] disabled:opacity-40"
            >
              <Icon name="chevronleft" size={14} />
              <span>{lang === 'bn' ? 'পূর্ববর্তী' : 'Previous'}</span>
            </button>

            <span className="text-[12.5px] font-bold text-[#64748b]">
              {toBanglaNumeral(page)} / {toBanglaNumeral(pagination.totalPages)}
            </span>

            <button
              type="button"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#dce5f0] px-3.5 py-1.5 text-[12.5px] font-semibold text-[#092f63] hover:bg-[#f8fafc] disabled:opacity-40"
            >
              <span>{lang === 'bn' ? 'পরবর্তী' : 'Next'}</span>
              <Icon name="chevronright" size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Print Signature Footer */}
      <div className="hidden print:grid grid-cols-3 gap-8 pt-16 text-center text-[12px] text-[#092f63]">
        <div className="border-t border-gray-400 pt-1 font-semibold">Prepared By</div>
        <div className="border-t border-gray-400 pt-1 font-semibold">Teacher-in-Charge</div>
        <div className="border-t border-gray-400 pt-1 font-semibold">Principal / Center Head</div>
      </div>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-[1200px] mx-auto py-16 text-center text-[#64748b]">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent" />
        </div>
      }
    >
      <ResultsContent />
    </Suspense>
  );
}
