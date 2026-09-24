'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Icon from './Icon';
import StatusBadge from './StatusBadge';
import { useApp } from '@/lib/store';
import { formatDhakaDate, toBanglaNumeral } from '@/lib/i18n';

interface BatchPerformanceData {
  batchId: string;
  batchName: string;
  totalStudents: number;
  examsTaken: number;
  totalScheduledExams: number;
  averagePercentage: number;
  highestMark: number;
  passRate: number;
  subjectAverages: Array<{
    name: string;
    averagePercentage: number;
    count: number;
  }>;
  examsBreakdown: Array<{
    id: string;
    title: string;
    banglaTitle?: string | null;
    examType: string;
    status: string;
    startDate?: string | null;
    isCompletedOrPublished: boolean;
    subjectsCount: number;
    resultsEntered: number;
  }>;
}

export default function BatchPerformanceTab({ batchId }: { batchId: string }) {
  const { lang } = useApp();

  const [data, setData] = useState<BatchPerformanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(`/api/results/batch/${batchId}`)
      .then((res) => res.json())
      .then((resData) => {
        if (!cancelled && resData.success) {
          setData(resData.performance);
        }
      })
      .catch((err) => console.error('Failed to load batch performance', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [batchId]);

  if (loading) {
    return (
      <div className="card p-12 rounded-2xl bg-white border border-[#dce5f0] text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
        <p className="mt-3 text-[13.5px] text-[#64748b]">
          {lang === 'bn' ? 'ব্যাচের ফলাফল বিশ্লেষণ লোড হচ্ছে…' : 'Loading batch performance analytics…'}
        </p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex flex-col gap-6">
      {/* 5 Real Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-4 rounded-xl bg-white border border-[#dce5f0] shadow-2xs text-center">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748b] block">
            {lang === 'bn' ? 'সক্রিয় শিক্ষার্থী' : 'Enrolled Students'}
          </span>
          <span className="text-2xl font-bold text-[#092f63] mt-1 block">
            {toBanglaNumeral(data.totalStudents)}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white border border-[#dce5f0] shadow-2xs text-center">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748b] block">
            {lang === 'bn' ? 'সম্পন্ন পরীক্ষা' : 'Exams Completed'}
          </span>
          <span className="text-2xl font-bold text-[#063b78] mt-1 block">
            {toBanglaNumeral(data.examsTaken)}
            <span className="text-[12px] text-[#64748b] font-normal ml-1">
              / {toBanglaNumeral(data.totalScheduledExams)}
            </span>
          </span>
        </div>

        <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 shadow-2xs text-center">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#063b78] block">
            {lang === 'bn' ? 'গড় নম্বর' : 'Batch Average'}
          </span>
          <span className="text-2xl font-extrabold text-[#063b78] mt-1 block">
            {toBanglaNumeral(data.averagePercentage)}%
          </span>
        </div>

        <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 shadow-2xs text-center">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 block">
            {lang === 'bn' ? 'পাসের হার' : 'Pass Rate'}
          </span>
          <span className="text-2xl font-extrabold text-emerald-700 mt-1 block">
            {toBanglaNumeral(data.passRate)}%
          </span>
        </div>

        <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200 shadow-2xs text-center col-span-2 sm:col-span-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 block">
            {lang === 'bn' ? 'সর্বোচ্চ নম্বর' : 'Highest Mark'}
          </span>
          <span className="text-2xl font-extrabold text-amber-700 mt-1 block">
            {toBanglaNumeral(data.highestMark)}
          </span>
        </div>
      </div>

      {/* Subject-Wise Performance Breakdown */}
      <div className="card p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
        <div className="flex items-center gap-2 border-b border-[#edf2f7] pb-3 mb-4 text-[#063b78]">
          <Icon name="book" size={19} />
          <h2 className="text-base font-bold text-[#063b78]">
            {lang === 'bn' ? 'বিষয়ভিত্তিক গড় ফলাফল' : 'Subject-Wise Average Performance'}
          </h2>
        </div>

        {data.subjectAverages.length === 0 ? (
          <p className="text-[13px] text-[#64748b] italic py-3">
            {lang === 'bn'
              ? 'এখনও কোনো বিষয়ের ফলাফল সম্পন্ন হয়নি।'
              : 'No completed exam results recorded yet for subject breakdown.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {data.subjectAverages.map((sub, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl border border-[#dce5f0] bg-[#f8fafc] flex items-center justify-between"
              >
                <div>
                  <span className="font-bold text-[13.5px] text-[#092f63] block">{sub.name}</span>
                  <span className="text-[11px] text-[#64748b]">
                    {toBanglaNumeral(sub.count)} {lang === 'bn' ? 'টি এন্ট্রি' : 'results evaluated'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold text-[#063b78] block">
                    {toBanglaNumeral(sub.averagePercentage)}%
                  </span>
                  <span className="text-[10px] uppercase font-bold text-[#64748b]">
                    {lang === 'bn' ? 'গড়' : 'Average'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Exams Status Breakdown (Completed vs Incomplete/Scheduled) */}
      <div className="card p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
        <div className="flex items-center justify-between border-b border-[#edf2f7] pb-3 mb-4 text-[#063b78]">
          <div className="flex items-center gap-2">
            <Icon name="award" size={19} />
            <h2 className="text-base font-bold text-[#063b78]">
              {lang === 'bn' ? 'ব্যাচের পরীক্ষাসমূহ ও অবস্থা' : 'Batch Examination Records & Evaluation Status'}
            </h2>
          </div>
          <Link
            href={`/results?batchId=${batchId}`}
            className="text-[12.5px] font-bold text-[#063b78] hover:underline"
          >
            {lang === 'bn' ? 'ব্যাচের ফলাফল বিবরণী' : 'View Tabulation Sheet'}
          </Link>
        </div>

        {data.examsBreakdown.length === 0 ? (
          <p className="text-[13px] text-[#64748b] italic py-3">
            {lang === 'bn' ? 'এই ব্যাচের অধীনে কোনো পরীক্ষা নির্ধারিত নেই।' : 'No examinations assigned to this batch.'}
          </p>
        ) : (
          <div className="border border-[#dce5f0] rounded-xl overflow-hidden divide-y divide-[#edf2f7]">
            {data.examsBreakdown.map((ex) => (
              <div
                key={ex.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#f8fafc] transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/exams/${ex.id}`}
                      className="font-bold text-[14px] text-[#092f63] hover:text-[#063b78] hover:underline"
                    >
                      {lang === 'bn' && ex.banglaTitle ? ex.banglaTitle : ex.title}
                    </Link>
                    <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-[#063b78]">
                      {ex.examType}
                    </span>
                  </div>
                  <div className="text-[11.5px] text-[#64748b] mt-0.5">
                    {ex.startDate ? formatDhakaDate(ex.startDate) : '—'} • {toBanglaNumeral(ex.subjectsCount)}{' '}
                    {lang === 'bn' ? 'টি বিষয়' : 'subjects'}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`px-2.5 py-0.5 rounded text-[11.5px] font-bold ${
                      ex.isCompletedOrPublished
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {ex.isCompletedOrPublished
                      ? lang === 'bn'
                        ? 'মূল্যায়িত (গড়ে অন্তর্ভুক্ত)'
                        : 'Evaluated (In Averages)'
                      : lang === 'bn'
                      ? 'অপূর্ণ / চলমান (গড়ে অন্তর্ভুক্ত নয়)'
                      : 'Pending / Ongoing (Excluded from Avg)'}
                  </span>

                  <StatusBadge status={ex.status} dictKey="examStatus" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
