'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate, toBanglaNumeral } from '@/lib/i18n';

interface SubjectItem {
  id: string;
  examDate?: string | null;
  startTime?: string | null;
  duration?: number | null;
  totalMarks: number;
  passMarks: number;
  subject: {
    id: string;
    name: string;
    banglaName?: string | null;
    code?: string | null;
  };
  results: Array<{
    id: string;
    marksObtained?: number | null;
    status: string;
    grade?: string | null;
    isPassed?: boolean | null;
    studentId: string;
  }>;
}

interface StudentItem {
  id: string;
  studentId: string;
  student: {
    id: string;
    studentIdCode: string;
    name: string;
    banglaName?: string | null;
    phone?: string | null;
    enrollments?: Array<{ rollNumber?: string | null }>;
  };
}

interface ExamDetail {
  id: string;
  title: string;
  banglaTitle?: string | null;
  examType: string;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  totalMarks?: number | null;
  passMarks?: number | null;
  publishedAt?: string | null;
  createdAt: string;
  branch?: { id: string; name: string; code: string } | null;
  academicSession: { id: string; name: string };
  academicProgram: { id: string; name: string };
  academicClass: { id: string; name: string };
  academicGroup?: { id: string; name: string } | null;
  batch?: { id: string; name: string; code: string } | null;
  examSubjects: SubjectItem[];
  examStudents: StudentItem[];
  _count?: {
    examSubjects: number;
    examStudents: number;
  };
}

export default function ExamDetailPage() {
  const params = useParams();
  const router = useRouter();
  const examId = params?.examId as string;
  const { lang, showToast } = useApp();
  const dict = DICTIONARY[lang];

  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'subjects' | 'students'>('subjects');

  // Action states
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  const loadExam = useCallback(async () => {
    if (!examId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/exams/${examId}`);
      if (!res.ok) throw new Error('Exam not found');
      const data = await res.json();
      if (data.success && data.exam) {
        setExam(data.exam);
      } else {
        throw new Error(data.error || 'Failed to load exam details');
      }
    } catch (err: any) {
      setError(err?.message || 'Error loading exam');
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    loadExam();
  }, [loadExam]);

  // Handle status transitions
  const handleTransition = async (action: 'schedule' | 'start' | 'complete') => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/exams/${examId}/${action}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        showToast(
          action === 'schedule'
            ? lang === 'bn'
              ? 'পরীক্ষা নির্ধারিত হয়েছে'
              : 'Exam scheduled successfully'
            : action === 'start'
            ? lang === 'bn'
              ? 'পরীক্ষা শুরু হয়েছে'
              : 'Exam marked as ongoing'
            : lang === 'bn'
            ? 'পরীক্ষা সমাপ্ত হিসেবে চিহ্নিত হয়েছে'
            : 'Exam marked as completed'
        );
        loadExam();
      } else {
        showToast(data.error || `Failed to ${action} exam`);
      }
    } catch (err: any) {
      showToast(err?.message || `Failed to ${action} exam`);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle cancel
  const handleCancel = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/exams/${examId}/cancel`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        showToast(lang === 'bn' ? 'পরীক্ষা বাতিল করা হয়েছে' : 'Exam cancelled');
        setCancelModalOpen(false);
        loadExam();
      } else {
        showToast(data.error || 'Failed to cancel exam');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to cancel exam');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle reopen
  const handleReopen = async () => {
    if (!reopenReason.trim()) {
      showToast(lang === 'bn' ? 'পুনরায় খোলার কারণ লিখুন' : 'Please provide a reason for reopening');
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/exams/${examId}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reopenReason }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(lang === 'bn' ? 'নম্বর এন্ট্রি পুনরায় উন্মুক্ত করা হয়েছে' : 'Marks entry reopened successfully');
        setReopenModalOpen(false);
        setReopenReason('');
        loadExam();
      } else {
        showToast(data.error || 'Failed to reopen exam');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to reopen exam');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-[1100px] mx-auto py-16 text-center text-[#64748b]">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
        <p className="mt-3 text-[14px] font-medium">
          {lang === 'bn' ? 'পরীক্ষার বিবরণ লোড হচ্ছে…' : 'Loading exam details…'}
        </p>
      </div>
    );
  }

  if (error || !exam) {
    return (
      <div className="max-w-[700px] mx-auto py-12 text-center">
        <div className="p-8 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col items-center">
          <Icon name="alert" size={32} className="text-rose-500 mb-3" />
          <h2 className="text-xl font-bold text-[#092f63]">
            {lang === 'bn' ? 'পরীক্ষা পাওয়া যায়নি' : 'Exam Not Found'}
          </h2>
          <p className="text-[13.5px] text-[#64748b] mt-1 mb-5">
            {lang === 'bn'
              ? 'অনুরোধকৃত পরীক্ষাটি মুছে ফেলা হয়েছে অথবা আপনার প্রবেশাধিকার নেই।'
              : 'The requested exam does not exist or you do not have permission to view it.'}
          </p>
          <Link
            href="/exams"
            className="inline-flex items-center gap-2 rounded-xl bg-[#063b78] px-5 py-2.5 text-[13.5px] font-semibold text-white"
          >
            <Icon name="chevronleft" size={15} />
            <span>{lang === 'bn' ? 'পরীক্ষাসমূহে ফিরে যান' : 'Back to Exams'}</span>
          </Link>
        </div>
      </div>
    );
  }

  // Calculate metrics
  const totalStudents = exam.examStudents.length;
  const totalSubjects = exam.examSubjects.length;

  let totalMarksEntered = 0;
  const totalPossibleEntries = totalStudents * totalSubjects;

  exam.examSubjects.forEach((sub) => {
    totalMarksEntered += sub.results.length;
  });

  const marksPending = Math.max(0, totalPossibleEntries - totalMarksEntered);
  const completionPercent = totalPossibleEntries > 0 ? Math.round((totalMarksEntered / totalPossibleEntries) * 100) : 0;

  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-6 pb-16">
      {/* Top Breadcrumb & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link
          href="/exams"
          className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#063b78] hover:underline"
        >
          <Icon name="chevronleft" size={16} />
          <span>{lang === 'bn' ? 'পরীক্ষাসমূহে ফিরে যান' : 'Back to Exams'}</span>
        </Link>

        {/* Action Buttons Based on Status */}
        <div className="flex flex-wrap items-center gap-2">
          {exam.status === 'DRAFT' && (
            <>
              <button
                type="button"
                onClick={() => handleTransition('schedule')}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#063b78] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#084b96] transition-colors shadow-xs disabled:opacity-50"
              >
                <Icon name="calendar" size={15} />
                <span>{lang === 'bn' ? 'পরীক্ষা চূড়ান্ত করুন (Schedule)' : 'Schedule Exam'}</span>
              </button>
              <button
                type="button"
                onClick={() => setCancelModalOpen(true)}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-[13px] font-bold text-rose-700 hover:bg-rose-100 transition-colors"
              >
                <Icon name="x" size={15} />
                <span>{lang === 'bn' ? 'বাতিল' : 'Cancel'}</span>
              </button>
            </>
          )}

          {exam.status === 'SCHEDULED' && (
            <>
              <button
                type="button"
                onClick={() => handleTransition('start')}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-[13px] font-bold text-white hover:bg-amber-700 transition-colors shadow-xs disabled:opacity-50"
              >
                <Icon name="play" size={15} />
                <span>{lang === 'bn' ? 'পরীক্ষা শুরু করুন' : 'Start Exam'}</span>
              </button>
              <button
                type="button"
                onClick={() => setCancelModalOpen(true)}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-[13px] font-bold text-rose-700 hover:bg-rose-100 transition-colors"
              >
                <Icon name="x" size={15} />
                <span>{lang === 'bn' ? 'বাতিল' : 'Cancel'}</span>
              </button>
            </>
          )}

          {exam.status === 'ONGOING' && (
            <button
              type="button"
              onClick={() => handleTransition('complete')}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-700 px-4 py-2 text-[13px] font-bold text-white hover:bg-indigo-800 transition-colors shadow-xs disabled:opacity-50"
            >
              <Icon name="check" size={15} />
              <span>{lang === 'bn' ? 'পরীক্ষা সমাপ্ত করুন' : 'Complete Exam'}</span>
            </button>
          )}

          {exam.status === 'COMPLETED' && (
            <>
              <Link
                href={`/exams/${examId}/publish`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white hover:bg-emerald-700 transition-colors shadow-xs"
              >
                <Icon name="award" size={15} />
                <span>{lang === 'bn' ? 'ফলাফল প্রকাশ করুন' : 'Publish Results'}</span>
              </Link>
            </>
          )}

          {exam.status === 'PUBLISHED' && (
            <>
              <Link
                href={`/results?examId=${examId}`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#063b78] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#084b96] transition-colors shadow-xs"
              >
                <Icon name="doc" size={15} />
                <span>{lang === 'bn' ? 'ফলাফল ও টেবুলেশন শিট' : 'Tabulation Sheet'}</span>
              </Link>
              <button
                type="button"
                onClick={() => setReopenModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-[12.5px] font-bold text-amber-800 hover:bg-amber-100 transition-colors"
              >
                <Icon name="edit" size={14} />
                <span>{lang === 'bn' ? 'নম্বর সংশোধন (Reopen)' : 'Reopen Marks Entry'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Exam Header Card */}
      <div className="card p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#edf2f7] pb-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-bold text-[#092f63]">
                {lang === 'bn' && exam.banglaTitle ? exam.banglaTitle : exam.title}
              </h1>
              <StatusBadge status={exam.status} dictKey="examStatus" />
            </div>
            {exam.banglaTitle && lang !== 'bn' && (
              <p className="text-[13px] text-[#64748b] mt-0.5">{exam.banglaTitle}</p>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-2 text-[12.5px] text-[#64748b]">
              <span className="font-semibold text-[#063b78] bg-blue-50 px-2 py-0.5 rounded">
                {exam.examType}
              </span>
              <span>•</span>
              <span>{exam.academicSession.name}</span>
              <span>•</span>
              <span>{exam.academicProgram.name}</span>
              <span>•</span>
              <span>{exam.academicClass.name}</span>
              {exam.academicGroup && (
                <>
                  <span>•</span>
                  <span>{exam.academicGroup.name}</span>
                </>
              )}
              {exam.batch && (
                <>
                  <span>•</span>
                  <span className="font-semibold text-[#092f63]">{exam.batch.name}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 text-right">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748b] block">
                {lang === 'bn' ? 'তারিখ' : 'Exam Dates'}
              </span>
              <span className="text-[13.5px] font-semibold text-[#092f63]">
                {exam.startDate ? formatDhakaDate(exam.startDate) : '—'}
                {exam.endDate ? ` – ${formatDhakaDate(exam.endDate)}` : ''}
              </span>
            </div>
            {exam.publishedAt && (
              <div className="border-l border-[#dce5f0] pl-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 block">
                  {lang === 'bn' ? 'প্রকাশিত' : 'Published'}
                </span>
                <span className="text-[12.5px] font-semibold text-[#092f63]">
                  {formatDhakaDate(exam.publishedAt)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 4 Stat Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="p-3.5 rounded-xl bg-[#f8fafc] border border-[#dce5f0]">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748b] block">
              {lang === 'bn' ? 'মোট বিষয়' : 'Subjects'}
            </span>
            <span className="text-xl font-bold text-[#092f63]">
              {toBanglaNumeral(totalSubjects)}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#f8fafc] border border-[#dce5f0]">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748b] block">
              {lang === 'bn' ? 'মোট পরীক্ষার্থী' : 'Students Enrolled'}
            </span>
            <span className="text-xl font-bold text-[#063b78]">
              {toBanglaNumeral(totalStudents)}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50/50 border border-emerald-200">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 block">
              {lang === 'bn' ? 'নম্বর এন্ট্রি সম্পন্ন' : 'Marks Completed'}
            </span>
            <span className="text-xl font-bold text-emerald-700">
              {toBanglaNumeral(totalMarksEntered)}
              <span className="text-[12px] font-medium text-emerald-600 ml-1">
                ({completionPercent}%)
              </span>
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-50/50 border border-amber-200">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 block">
              {lang === 'bn' ? 'বাকি নম্বর' : 'Marks Pending'}
            </span>
            <span className="text-xl font-bold text-amber-700">
              {toBanglaNumeral(marksPending)}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs: Subjects vs Students */}
      <div className="flex items-center gap-2 border-b border-[#dce5f0]">
        <button
          type="button"
          onClick={() => setActiveTab('subjects')}
          className={`pb-3 px-4 text-[13.5px] font-bold transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'subjects'
              ? 'border-[#063b78] text-[#063b78]'
              : 'border-transparent text-[#64748b] hover:text-[#092f63]'
          }`}
        >
          <Icon name="book" size={16} />
          <span>{lang === 'bn' ? `পরীক্ষার বিষয়সমূহ (${toBanglaNumeral(totalSubjects)})` : `Subjects (${totalSubjects})`}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('students')}
          className={`pb-3 px-4 text-[13.5px] font-bold transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'students'
              ? 'border-[#063b78] text-[#063b78]'
              : 'border-transparent text-[#64748b] hover:text-[#092f63]'
          }`}
        >
          <Icon name="user" size={16} />
          <span>{lang === 'bn' ? `পরীক্ষার্থী তালিকা (${toBanglaNumeral(totalStudents)})` : `Enrolled Students (${totalStudents})`}</span>
        </button>
      </div>

      {/* Tab Content: Subjects */}
      {activeTab === 'subjects' && (
        <div className="card rounded-2xl bg-white border border-[#dce5f0] shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-[#dce5f0] flex items-center justify-between bg-[#f8fafc]">
            <h2 className="text-[14px] font-bold text-[#092f63]">
              {lang === 'bn' ? 'বিষয়ভিত্তিক নম্বর এন্ট্রি ও সময়সূচি' : 'Subject Schedule & Marks Progress'}
            </h2>
            <span className="text-[12px] text-[#64748b]">
              {lang === 'bn'
                ? 'নম্বর এন্ট্রি করতে বিষয়ের পাশে থাকা বোতামে ক্লিক করুন'
                : 'Click "Enter Marks" to input scores'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-[#f8fafc] border-b border-[#dce5f0] text-[#64748b] text-[11.5px] font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">#</th>
                  <th className="px-5 py-3">{lang === 'bn' ? 'বিষয়' : 'Subject'}</th>
                  <th className="px-5 py-3">{lang === 'bn' ? 'তারিখ ও সময়' : 'Date & Time'}</th>
                  <th className="px-5 py-3 text-right">{lang === 'bn' ? 'পূর্ণমান' : 'Total Marks'}</th>
                  <th className="px-5 py-3 text-right">{lang === 'bn' ? 'পাস' : 'Pass'}</th>
                  <th className="px-5 py-3 text-center">{lang === 'bn' ? 'নম্বর এন্ট্রি অগ্রগতি' : 'Progress'}</th>
                  <th className="px-5 py-3 text-right">{lang === 'bn' ? 'পদক্ষেপ' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf2f7]">
                {exam.examSubjects.map((sub, index) => {
                  const enteredCount = sub.results.length;
                  const pendingCount = Math.max(0, totalStudents - enteredCount);
                  const isComplete = totalStudents > 0 && enteredCount >= totalStudents;

                  return (
                    <tr key={sub.id} className="hover:bg-[#f8fafc] transition-colors">
                      <td className="px-5 py-3 text-[#64748b] font-mono">{index + 1}</td>
                      <td className="px-5 py-3">
                        <div className="font-bold text-[#092f63]">
                          {lang === 'bn' && sub.subject.banglaName ? sub.subject.banglaName : sub.subject.name}
                        </div>
                        {sub.subject.code && (
                          <div className="text-[11px] font-mono text-[#64748b]">{sub.subject.code}</div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-[#64748b]">
                        <div>{sub.examDate ? formatDhakaDate(sub.examDate) : '—'}</div>
                        <div className="text-[11.5px]">
                          {sub.startTime || ''} {sub.duration ? `(${sub.duration} min)` : ''}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-[#092f63]">
                        {toBanglaNumeral(sub.totalMarks)}
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-emerald-700">
                        {toBanglaNumeral(sub.passMarks)}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11.5px] font-bold ${
                              isComplete
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : enteredCount > 0
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {toBanglaNumeral(enteredCount)} / {toBanglaNumeral(totalStudents)}
                          </span>
                        </div>
                        {pendingCount > 0 && enteredCount > 0 && (
                          <div className="text-[11px] text-amber-600 mt-0.5">
                            {toBanglaNumeral(pendingCount)} {lang === 'bn' ? 'বাকি' : 'pending'}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/exams/${examId}/subjects/${sub.id}/marks`}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#063b78] px-3.5 py-1.5 text-[12px] font-bold text-white hover:bg-[#084b96] transition-colors"
                        >
                          <Icon name="edit" size={13} />
                          <span>{lang === 'bn' ? 'নম্বর এন্ট্রি' : 'Enter Marks'}</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Content: Enrolled Students */}
      {activeTab === 'students' && (
        <div className="card rounded-2xl bg-white border border-[#dce5f0] shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-[#dce5f0] flex items-center justify-between bg-[#f8fafc]">
            <h2 className="text-[14px] font-bold text-[#092f63]">
              {lang === 'bn' ? 'অন্তর্ভুক্ত পরীক্ষার্থীদের তালিকা' : 'Enrolled Students Roster'}
            </h2>
            <span className="text-[12px] text-[#64748b]">
              {lang === 'bn'
                ? `মোট: ${toBanglaNumeral(totalStudents)} জন শিক্ষার্থী`
                : `Total: ${totalStudents} students`}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-[#f8fafc] border-b border-[#dce5f0] text-[#64748b] text-[11.5px] font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">#</th>
                  <th className="px-5 py-3">{lang === 'bn' ? 'শিক্ষার্থী' : 'Student'}</th>
                  <th className="px-5 py-3">{lang === 'bn' ? 'আইডি' : 'Student ID'}</th>
                  <th className="px-5 py-3">{lang === 'bn' ? 'রোল' : 'Roll'}</th>
                  <th className="px-5 py-3">{lang === 'bn' ? 'ফোন' : 'Phone'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf2f7]">
                {exam.examStudents.map((es, index) => {
                  const roll = es.student.enrollments?.[0]?.rollNumber;
                  return (
                    <tr key={es.id} className="hover:bg-[#f8fafc] transition-colors">
                      <td className="px-5 py-3 text-[#64748b] font-mono">{index + 1}</td>
                      <td className="px-5 py-3">
                        <Link
                          href={`/students/${es.student.id}`}
                          className="font-bold text-[#092f63] hover:text-[#063b78] hover:underline"
                        >
                          {lang === 'bn' && es.student.banglaName
                            ? es.student.banglaName
                            : es.student.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3 font-mono text-[#063b78] font-semibold">
                        {es.student.studentIdCode}
                      </td>
                      <td className="px-5 py-3 font-semibold text-[#092f63]">
                        {roll ? toBanglaNumeral(roll) : '—'}
                      </td>
                      <td className="px-5 py-3 text-[#64748b] font-mono">
                        {es.student.phone || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="card p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-xl max-w-[440px] w-full flex flex-col gap-4">
            <div className="flex items-center gap-3 text-rose-600">
              <Icon name="alert" size={24} />
              <h3 className="text-lg font-bold text-[#092f63]">
                {lang === 'bn' ? 'পরীক্ষা বাতিল নিশ্চিতকরণ' : 'Confirm Exam Cancellation'}
              </h3>
            </div>
            <p className="text-[13px] text-[#64748b]">
              {lang === 'bn'
                ? 'আপনি কি নিশ্চিত যে এই পরীক্ষাটি বাতিল করতে চান? বাতিল পরীক্ষার ফলাফল প্রকাশ করা যাবে না।'
                : 'Are you sure you want to cancel this exam? Cancelled exams cannot be published.'}
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-[#edf2f7]">
              <button
                type="button"
                onClick={() => setCancelModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-[#dce5f0] text-[13px] font-semibold text-[#64748b] hover:bg-[#f8fafc]"
              >
                {lang === 'bn' ? 'ফিরে যান' : 'Go Back'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl bg-rose-600 text-[13px] font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {lang === 'bn' ? 'হ্যাঁ, বাতিল করুন' : 'Yes, Cancel Exam'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reopen Modal */}
      {reopenModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="card p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-xl max-w-[480px] w-full flex flex-col gap-4">
            <div className="flex items-center gap-3 text-amber-600">
              <Icon name="edit" size={22} />
              <h3 className="text-lg font-bold text-[#092f63]">
                {lang === 'bn' ? 'নম্বর এন্ট্রি পুনরায় উন্মুক্তকরণ' : 'Reopen Marks Entry'}
              </h3>
            </div>
            <p className="text-[13px] text-[#64748b]">
              {lang === 'bn'
                ? 'পরীক্ষাটি ইতিমধ্যে সমাপ্ত বা প্রকাশিত হয়েছে। নম্বর পরিবর্তন করতে সুস্পষ্ট কারণ প্রয়োজন। এই কার্যক্রম অডিট লগ-এ রেকর্ড করা হবে।'
                : 'This exam is completed or published. Reopening marks entry requires administrative justification and will be permanently recorded in the audit log.'}
            </p>
            <div>
              <label className="block text-[12px] font-bold text-[#092f63] mb-1">
                {lang === 'bn' ? 'পুনরায় খোলার কারণ *' : 'Reason for Reopening *'}
              </label>
              <textarea
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder={lang === 'bn' ? 'যেমন: খাতা পুনঃনিরীক্ষণ বা প্রিন্ট ত্রুটি সংশোধন' : 'e.g. Script re-evaluation requested or scoring clerical correction'}
                className="w-full rounded-xl border border-[#dce5f0] p-3 text-[13px] text-[#092f63] focus:border-[#063b78] focus:outline-none h-24"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-[#edf2f7]">
              <button
                type="button"
                onClick={() => setReopenModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-[#dce5f0] text-[13px] font-semibold text-[#64748b] hover:bg-[#f8fafc]"
              >
                {lang === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleReopen}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl bg-amber-600 text-[13px] font-bold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {lang === 'bn' ? 'উন্মুক্ত করুন' : 'Confirm Reopen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
