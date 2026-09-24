'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import { useApp } from '@/lib/store';
import { DICTIONARY, toBanglaNumeral } from '@/lib/i18n';

interface PublishStatusData {
  exam: {
    id: string;
    title: string;
    banglaTitle?: string | null;
    status: string;
  };
  totalSubjects: number;
  totalStudents: number;
  totalPossibleResults: number;
  totalEnteredResults: number;
  missingResultsCount: number;
  isComplete: boolean;
  canPublish: boolean;
  issues: string[];
  subjectsStatus: Array<{
    examSubjectId: string;
    subjectName: string;
    subjectCode?: string | null;
    enteredCount: number;
    totalStudents: number;
    isComplete: boolean;
  }>;
}

export default function ExamPublishPage() {
  const params = useParams();
  const router = useRouter();
  const examId = params?.examId as string;
  const { lang, showToast } = useApp();
  const dict = DICTIONARY[lang];

  const [data, setData] = useState<PublishStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allowIncomplete, setAllowIncomplete] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!examId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/exams/${examId}/publish-status`);
      if (!res.ok) throw new Error('Failed to check publication readiness');
      const json = await res.json();
      if (json.success) {
        setData(json);
      } else {
        throw new Error(json.error || 'Failed to check publish status');
      }
    } catch (err: any) {
      setError(err?.message || 'Error checking publish status');
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handlePublish = async () => {
    if (!data) return;
    if (!data.isComplete && !allowIncomplete) {
      showToast(
        lang === 'bn'
          ? 'সব নম্বর এন্ট্রি সম্পন্ন হয়নি। প্রকাশ করতে অনুগ্রহ করে অনুমতি নিশ্চিত করুন।'
          : 'Incomplete marks detected. Please explicitly check the confirmation box.'
      );
      return;
    }

    setPublishing(true);
    try {
      const res = await fetch(`/api/exams/${examId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowIncomplete }),
      });

      const resJson = await res.json();
      if (resJson.success) {
        showToast(
          lang === 'bn'
            ? 'পরীক্ষার ফলাফল সফলভাবে প্রকাশিত হয়েছে!'
            : 'Exam results published successfully!'
        );
        router.push(`/exams/${examId}`);
      } else {
        showToast(resJson.error || 'Failed to publish results');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to publish results');
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-[800px] mx-auto py-16 text-center text-[#64748b]">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
        <p className="mt-3 text-[14px] font-medium">
          {lang === 'bn' ? 'ফলাফল প্রকাশের প্রস্তুতি যাচাই করা হচ্ছে…' : 'Checking publication readiness…'}
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-[700px] mx-auto py-12 text-center">
        <div className="p-8 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col items-center">
          <Icon name="alert" size={32} className="text-rose-500 mb-3" />
          <h2 className="text-xl font-bold text-[#092f63]">
            {lang === 'bn' ? 'যাচাইকরণ ব্যর্থ' : 'Readiness Check Failed'}
          </h2>
          <p className="text-[13.5px] text-[#64748b] mt-1 mb-5">{error}</p>
          <Link
            href={`/exams/${examId}`}
            className="inline-flex items-center gap-2 rounded-xl bg-[#063b78] px-5 py-2.5 text-[13.5px] font-semibold text-white"
          >
            <Icon name="chevronleft" size={15} />
            <span>{lang === 'bn' ? 'পরীক্ষায় ফিরে যান' : 'Back to Exam'}</span>
          </Link>
        </div>
      </div>
    );
  }

  const completionPct =
    data.totalPossibleResults > 0
      ? Math.round((data.totalEnteredResults / data.totalPossibleResults) * 100)
      : 0;

  return (
    <div className="max-w-[800px] mx-auto flex flex-col gap-6 pb-16">
      {/* Top Navigation */}
      <Link
        href={`/exams/${examId}`}
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#063b78] hover:underline"
      >
        <Icon name="chevronleft" size={15} />
        <span>{lang === 'bn' ? 'পরীক্ষার বিবরণে ফিরে যান' : 'Back to Exam Details'}</span>
      </Link>

      {/* Main Readiness Card */}
      <div className="card p-6 sm:p-8 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-6">
        <div className="flex items-center justify-between border-b border-[#edf2f7] pb-4">
          <div>
            <span className="text-[11.5px] font-bold uppercase tracking-wider text-[#64748b] block mb-1">
              {lang === 'bn' ? 'চূড়ান্ত ফলাফল প্রকাশ' : 'Final Result Publication'}
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-[#092f63]">
              {data.exam.title}
            </h1>
          </div>
          <StatusBadge status={data.exam.status} dictKey="examStatus" />
        </div>

        {/* Readiness Checklist / Status */}
        <div
          className={`p-4 rounded-xl border flex items-start gap-3.5 ${
            data.isComplete
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <Icon
            name={data.isComplete ? 'check' : 'alert'}
            size={22}
            className={data.isComplete ? 'text-emerald-600 shrink-0 mt-0.5' : 'text-amber-600 shrink-0 mt-0.5'}
          />
          <div>
            <h3 className="font-bold text-[14px]">
              {data.isComplete
                ? lang === 'bn'
                  ? 'সকল নম্বর এন্ট্রি সম্পন্ন — ফলাফল প্রকাশের জন্য প্রস্তুত'
                  : 'All Marks Entered — Ready for Full Publication'
                : lang === 'bn'
                ? `কিছু বিষয়ের নম্বর এন্ট্রি এখনও বাকি রয়েছে (${toBanglaNumeral(data.missingResultsCount)}টি বাকি)`
                : `Incomplete Marks Detected (${data.missingResultsCount} marks pending)`}
            </h3>
            <p className="text-[12.5px] mt-1 opacity-90">
              {data.isComplete
                ? lang === 'bn'
                  ? 'প্রকাশের পর শিক্ষার্থী ও অভিভাবকগণ তাদের ফলাফল দেখতে পাবেন।'
                  : 'Once published, results become instantly accessible to enrolled students and guardians.'
                : lang === 'bn'
                ? 'অনুপস্থিত বা অপূর্ণ নম্বর সহ প্রকাশ করতে নিচের নিশ্চয়তা প্রদান করতে হবে।'
                : 'Publishing with incomplete marks requires explicit administrative authorization.'}
            </p>
          </div>
        </div>

        {/* Summary Metric Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-[#f8fafc] border border-[#dce5f0] text-center">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748b] block">
              {lang === 'bn' ? 'মোট বিষয়' : 'Subjects'}
            </span>
            <span className="text-xl font-bold text-[#092f63]">
              {toBanglaNumeral(data.totalSubjects)}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[#f8fafc] border border-[#dce5f0] text-center">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748b] block">
              {lang === 'bn' ? 'মোট শিক্ষার্থী' : 'Students'}
            </span>
            <span className="text-xl font-bold text-[#063b78]">
              {toBanglaNumeral(data.totalStudents)}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[#f8fafc] border border-[#dce5f0] text-center">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748b] block">
              {lang === 'bn' ? 'নম্বর এন্ট্রি' : 'Marks Entered'}
            </span>
            <span className="text-xl font-bold text-emerald-700">
              {toBanglaNumeral(data.totalEnteredResults)} / {toBanglaNumeral(data.totalPossibleResults)}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[#f8fafc] border border-[#dce5f0] text-center">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748b] block">
              {lang === 'bn' ? 'অগ্রগতি' : 'Progress'}
            </span>
            <span className="text-xl font-bold text-[#092f63]">
              {toBanglaNumeral(completionPct)}%
            </span>
          </div>
        </div>

        {/* Subject-wise breakdown list */}
        <div>
          <h3 className="text-[13.5px] font-bold text-[#092f63] mb-3">
            {lang === 'bn' ? 'বিষয়ভিত্তিক নম্বর এন্ট্রি রিপোর্ট' : 'Subject-wise Scoring Status'}
          </h3>
          <div className="border border-[#dce5f0] rounded-xl overflow-hidden divide-y divide-[#edf2f7]">
            {data.subjectsStatus.map((s) => (
              <div key={s.examSubjectId} className="px-4 py-3 flex items-center justify-between text-[13px]">
                <div>
                  <span className="font-bold text-[#092f63]">{s.subjectName}</span>
                  {s.subjectCode && <span className="text-[11px] text-[#64748b] font-mono ml-2">({s.subjectCode})</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[12px] text-[#64748b]">
                    {toBanglaNumeral(s.enteredCount)} / {toBanglaNumeral(s.totalStudents)}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      s.isComplete
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {s.isComplete
                      ? lang === 'bn'
                        ? 'সম্পূর্ণ'
                        : 'Complete'
                      : lang === 'bn'
                      ? 'অপূর্ণ'
                      : 'Pending'}
                  </span>
                  {!s.isComplete && (
                    <Link
                      href={`/exams/${examId}/subjects/${s.examSubjectId}/marks`}
                      className="text-[11.5px] font-bold text-[#063b78] hover:underline"
                    >
                      {lang === 'bn' ? 'নম্বর দিন' : 'Enter'}
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Incomplete warning checkbox if incomplete */}
        {!data.isComplete && (
          <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-300 flex items-start gap-3">
            <input
              type="checkbox"
              id="confirmIncomplete"
              checked={allowIncomplete}
              onChange={(e) => setAllowIncomplete(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-[#063b78] focus:ring-[#063b78] mt-0.5"
            />
            <label htmlFor="confirmIncomplete" className="text-[12.5px] text-amber-900 font-semibold cursor-pointer">
              {lang === 'bn'
                ? 'আমি স্বীকার করছি যে কিছু বিষয়ের নম্বর অপূর্ণ রয়েছে এবং আমি এই অবস্থাতেই ফলাফল প্রকাশ করতে ইচ্ছুক।'
                : 'I acknowledge that some subject marks remain incomplete and authorize publication in this state.'}
            </label>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-between pt-4 border-t border-[#edf2f7]">
          <Link
            href={`/exams/${examId}`}
            className="inline-flex items-center gap-2 rounded-xl border border-[#dce5f0] px-5 py-2.5 text-[13.5px] font-semibold text-[#092f63] hover:bg-[#f8fafc] transition-colors"
          >
            <Icon name="chevronleft" size={16} />
            <span>{lang === 'bn' ? 'ফিরে যান' : 'Go Back'}</span>
          </Link>

          <button
            type="button"
            onClick={handlePublish}
            disabled={publishing || (!data.isComplete && !allowIncomplete)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-[14px] font-bold text-white hover:bg-emerald-700 transition-colors shadow-xs disabled:opacity-50"
          >
            {publishing ? (
              <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-r-transparent" />
            ) : (
              <Icon name="award" size={18} />
            )}
            <span>
              {publishing
                ? lang === 'bn'
                  ? 'প্রকাশিত হচ্ছে…'
                  : 'Publishing…'
                : lang === 'bn'
                ? 'ফলাফল চূড়ান্তভাবে প্রকাশ করুন'
                : 'Confirm & Publish Results'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
