'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import { useApp } from '@/lib/store';
import { formatDhakaDate, toBanglaNumeral } from '@/lib/i18n';

interface ExamItem {
  id: string;
  title: string;
  banglaTitle?: string | null;
  examType: string;
  status: string;
  startDate: string;
  endDate?: string | null;
  totalMarks: number;
  passMarks: number;
  academicSession: { id: string; name: string };
  academicProgram: { id: string; name: string; banglaName?: string | null };
  academicClass: { id: string; name: string; banglaName?: string | null };
  academicGroup?: { id: string; name: string; banglaName?: string | null } | null;
  batch?: { id: string; name: string; banglaName?: string | null; code: string } | null;
  branch?: { id: string; name: string; code: string } | null;
  _count: {
    examSubjects: number;
    examStudents: number;
  };
}

interface StatsData {
  total: number;
  published: number;
  ongoing: number;
  scheduled: number;
  completed: number;
}

export default function ExamsPage() {
  const { lang, showToast } = useApp();
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StatsData>({
    total: 0,
    published: 0,
    ongoing: 0,
    scheduled: 0,
    completed: 0,
  });

  // Filters state
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Academic hierarchy options
  const [sessions, setSessions] = useState<any[]>([]);
  const [programs, setPrograms] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [selectedProgram, setSelectedProgram] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedBatch, setSelectedBatch] = useState('');

  // Load hierarchy options
  useEffect(() => {
    async function loadOptions() {
      try {
        const res = await fetch('/api/academic/options');
        if (res.ok) {
          const data = await res.json();
          setSessions(data.sessions || []);
          setPrograms(data.programs || []);
          setBatches(data.batches || []);
        }
      } catch (err) {
        console.error('Failed to load academic options:', err);
      }
    }
    loadOptions();
  }, []);

  // Update classes when program changes
  useEffect(() => {
    if (selectedProgram) {
      const prog = programs.find((p) => p.id === selectedProgram);
      setClasses(prog?.classes || []);
    } else {
      setClasses([]);
    }
    setSelectedClass('');
  }, [selectedProgram, programs]);

  // Fetch exams
  const fetchExams = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      sp.set('page', page.toString());
      sp.set('pageSize', '12');
      if (statusFilter !== 'all') sp.set('status', statusFilter);
      if (typeFilter !== 'all') sp.set('type', typeFilter);
      if (search.trim()) sp.set('search', search.trim());
      if (selectedSession) sp.set('session', selectedSession);
      if (selectedProgram) sp.set('program', selectedProgram);
      if (selectedClass) sp.set('class', selectedClass);
      if (selectedBatch) sp.set('batch', selectedBatch);

      const res = await fetch(`/api/exams?${sp.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setExams(data.exams || []);
        setStats(data.stats || { total: 0, published: 0, ongoing: 0, scheduled: 0, completed: 0 });
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalCount(data.pagination?.total || 0);
      } else {
        showToast('Failed to load examinations list');
      }
    } catch (err) {
      console.error('Error fetching exams:', err);
      showToast('Network error while loading exams');
    } finally {
      setLoading(false);
    }
  }, [
    page,
    statusFilter,
    typeFilter,
    search,
    selectedSession,
    selectedProgram,
    selectedClass,
    selectedBatch,
    showToast,
  ]);

  useEffect(() => {
    fetchExams();
  }, [fetchExams]);

  const examTypeLabels: Record<string, { en: string; bn: string }> = {
    WEEKLY: { en: 'Weekly Test', bn: 'সাপ্তাহিক পরীক্ষা' },
    MONTHLY: { en: 'Monthly Test', bn: 'মাসিক পরীক্ষা' },
    MODEL_TEST: { en: 'Model Test', bn: 'মডেল টেস্ট' },
    TERM_FINAL: { en: 'Term Final', bn: 'টার্ম সমাপনী পরীক্ষা' },
    ADMISSION_MOCK: { en: 'Admission Mock', bn: 'ভর্তি মক টেস্ট' },
    CHAPTER_TEST: { en: 'Chapter Test', bn: 'অধ্যায়ভিত্তিক পরীক্ষা' },
  };

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-6">
      {/* 1. Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-[#dce5f0] shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-[#64748b]">
              {lang === 'bn' ? 'একাডেমিক মূল্যায়ন' : 'Academic Evaluation'}
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#063b78]" />
            <span className="text-xs font-bold text-[#063b78]">
              {lang === 'bn' ? 'ফেজ ৬: পরীক্ষা ও ফলাফল' : 'Phase 6: Exams & Results'}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-[#092f63] mt-1">
            {lang === 'bn' ? 'পরীক্ষা ও ফলাফল ব্যবস্থাপনা' : 'Examinations & Performance'}
          </h1>
          <p className="text-xs sm:text-[13px] text-[#64748b] mt-0.5">
            {lang === 'bn'
              ? 'পরীক্ষা সূচি, বিষয়ভিত্তিক মূল্যায়ন, দ্রুত নম্বর এন্ট্রি ও ফলাফল প্রকাশনা।'
              : 'Exam scheduling, subject setup, fast marks entry, ranking and result publication.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Link
            href="/results"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#dce5f0] text-[#063b78] hover:bg-[#f5f8fc] text-[13px] font-bold transition-colors shadow-2xs"
          >
            <Icon name="doc" size={16} />
            <span>{lang === 'bn' ? 'ট্যাবুলেশন ও ফলাফল শিট' : 'Results History'}</span>
          </Link>

          <Link
            href="/exams/new"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#063b78] hover:bg-[#00296b] text-white text-[13px] font-bold transition-all shadow-sm hover:shadow"
          >
            <Icon name="plus" size={16} />
            <span>{lang === 'bn' ? 'নতুন পরীক্ষা তৈরি করুন' : 'Schedule New Exam'}</span>
          </Link>
        </div>
      </div>

      {/* 2. Stat Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#dce5f0] shadow-xs">
          <div className="flex items-center justify-between text-[#64748b] mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">
              {lang === 'bn' ? 'মোট পরীক্ষা' : 'Total Exams'}
            </span>
            <div className="w-8 h-8 rounded-xl bg-[#063b78]/10 text-[#063b78] flex items-center justify-center">
              <Icon name="award" size={16} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-[#092f63]">
            {lang === 'bn' ? toBanglaNumeral(stats.total) : stats.total}
          </div>
          <div className="text-[11.5px] text-[#64748b] mt-1 font-medium">
            {lang === 'bn' ? 'চলতি শিক্ষাবর্ষের সকল পরীক্ষা' : 'All scheduled exams in center'}
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#dce5f0] shadow-xs">
          <div className="flex items-center justify-between text-emerald-700 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">
              {lang === 'bn' ? 'ফলাফল প্রকাশিত' : 'Published'}
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Icon name="check" size={16} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-700">
            {lang === 'bn' ? toBanglaNumeral(stats.published) : stats.published}
          </div>
          <div className="text-[11.5px] text-emerald-600 mt-1 font-medium">
            {lang === 'bn' ? 'শিক্ষার্থী ও অভিভাবকদের দৃশ্যমান' : 'Accessible in student portal'}
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#dce5f0] shadow-xs">
          <div className="flex items-center justify-between text-amber-700 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">
              {lang === 'bn' ? 'চলমান / নম্বর বাকি' : 'Ongoing / Entry'}
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Icon name="layers" size={16} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-700">
            {lang === 'bn' ? toBanglaNumeral(stats.ongoing) : stats.ongoing}
          </div>
          <div className="text-[11.5px] text-amber-600 mt-1 font-medium">
            {lang === 'bn' ? 'নম্বর এন্ট্রি চলমান' : 'Awaiting teacher marks entry'}
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#dce5f0] shadow-xs">
          <div className="flex items-center justify-between text-indigo-700 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">
              {lang === 'bn' ? 'আসন্ন পরীক্ষা' : 'Scheduled'}
            </span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Icon name="calendar" size={16} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-indigo-700">
            {lang === 'bn' ? toBanglaNumeral(stats.scheduled) : stats.scheduled}
          </div>
          <div className="text-[11.5px] text-indigo-600 mt-1 font-medium">
            {lang === 'bn' ? 'আসন্ন পরীক্ষার সূচি' : 'Planned future examinations'}
          </div>
        </div>
      </div>

      {/* 3. Filters & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-[#dce5f0] shadow-xs flex flex-col gap-3.5">
        {/* Status Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scroll">
          {[
            { id: 'all', label: lang === 'bn' ? 'সকল' : 'All' },
            { id: 'PUBLISHED', label: lang === 'bn' ? 'প্রকাশিত' : 'Published' },
            { id: 'ONGOING', label: lang === 'bn' ? 'চলমান' : 'Ongoing' },
            { id: 'SCHEDULED', label: lang === 'bn' ? 'নির্ধারিত' : 'Scheduled' },
            { id: 'COMPLETED', label: lang === 'bn' ? 'সম্পন্ন' : 'Completed' },
            { id: 'DRAFT', label: lang === 'bn' ? 'খসড়া' : 'Draft' },
            { id: 'CANCELLED', label: lang === 'bn' ? 'বাতিল' : 'Cancelled' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setStatusFilter(tab.id);
                setPage(1);
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                statusFilter === tab.id
                  ? 'bg-[#063b78] text-white shadow-xs'
                  : 'bg-[#f5f8fc] text-[#64748b] hover:bg-[#e9eef7] hover:text-[#092f63]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Dropdowns & Search */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
          <div className="relative">
            <input
              type="text"
              placeholder={lang === 'bn' ? 'পরীক্ষার নাম দিয়ে খুঁজুন...' : 'Search exams...'}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full bg-[#f8fafc] border border-[#dce5f0] rounded-xl px-3 py-2 pl-9 text-xs text-[#092f63] focus:outline-none focus:border-[#063b78]"
            />
            <div className="absolute left-3 top-2.5 text-[#94a3b8]">
              <Icon name="search" size={14} />
            </div>
          </div>

          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="bg-[#f8fafc] border border-[#dce5f0] rounded-xl px-3 py-2 text-xs text-[#092f63] focus:outline-none focus:border-[#063b78]"
          >
            <option value="all">{lang === 'bn' ? 'সকল পরীক্ষার ধরন' : 'All Exam Types'}</option>
            {Object.entries(examTypeLabels).map(([key, val]) => (
              <option key={key} value={key}>
                {lang === 'bn' ? val.bn : val.en}
              </option>
            ))}
          </select>

          <select
            value={selectedSession}
            onChange={(e) => {
              setSelectedSession(e.target.value);
              setPage(1);
            }}
            className="bg-[#f8fafc] border border-[#dce5f0] rounded-xl px-3 py-2 text-xs text-[#092f63] focus:outline-none focus:border-[#063b78]"
          >
            <option value="">{lang === 'bn' ? 'সকল শিক্ষাবর্ষ' : 'All Sessions'}</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.isCurrent ? (lang === 'bn' ? '(বর্তমান)' : '(Current)') : ''}
              </option>
            ))}
          </select>

          <select
            value={selectedProgram}
            onChange={(e) => {
              setSelectedProgram(e.target.value);
              setPage(1);
            }}
            className="bg-[#f8fafc] border border-[#dce5f0] rounded-xl px-3 py-2 text-xs text-[#092f63] focus:outline-none focus:border-[#063b78]"
          >
            <option value="">{lang === 'bn' ? 'সকল প্রোগ্রাম' : 'All Programs'}</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {(lang === 'bn' && p.banglaName) || p.name}
              </option>
            ))}
          </select>

          <select
            value={selectedBatch}
            onChange={(e) => {
              setSelectedBatch(e.target.value);
              setPage(1);
            }}
            className="bg-[#f8fafc] border border-[#dce5f0] rounded-xl px-3 py-2 text-xs text-[#092f63] focus:outline-none focus:border-[#063b78]"
          >
            <option value="">{lang === 'bn' ? 'সকল ব্যাচ' : 'All Batches'}</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.code})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 4. Table / List */}
      <div className="bg-white rounded-2xl border border-[#dce5f0] shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm font-semibold text-[#64748b]">
            <div className="inline-block animate-spin mb-2">
              <Icon name="layers" size={24} className="text-[#063b78]" />
            </div>
            <div>{lang === 'bn' ? 'পরীক্ষার তালিকা লোড হচ্ছে...' : 'Loading examinations...'}</div>
          </div>
        ) : exams.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#f5f8fc] border border-[#dce5f0] text-[#94a3b8] flex items-center justify-center mx-auto mb-3">
              <Icon name="award" size={24} />
            </div>
            <h3 className="text-base font-bold text-[#092f63]">
              {lang === 'bn' ? 'কোনো পরীক্ষা পাওয়া যায়নি' : 'No Examinations Found'}
            </h3>
            <p className="text-xs text-[#64748b] mt-1 max-w-sm mx-auto">
              {lang === 'bn'
                ? 'আপনার নির্বাচিত ফিল্টারের সাথে মিলে এমন কোনো পরীক্ষা নেই।'
                : 'No examinations match your current filters. Try changing filters or schedule a new exam.'}
            </p>
            <Link
              href="/exams/new"
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-xl bg-[#063b78] text-white text-xs font-bold shadow-xs hover:bg-[#00296b]"
            >
              <Icon name="plus" size={14} />
              <span>{lang === 'bn' ? 'নতুন পরীক্ষা সূচি তৈরি করুন' : 'Schedule New Exam'}</span>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto scroll">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#dce5f0] bg-[#f8fafc] text-[11px] font-black uppercase tracking-wider text-[#64748b]">
                  <th className="py-3 px-4">{lang === 'bn' ? 'পরীক্ষার নাম ও ধরন' : 'Exam & Type'}</th>
                  <th className="py-3 px-4">{lang === 'bn' ? 'একাডেমিক তথ্য' : 'Academic Context'}</th>
                  <th className="py-3 px-4">{lang === 'bn' ? 'তারিখ ও পূর্ণমান' : 'Date & Marks'}</th>
                  <th className="py-3 px-4">{lang === 'bn' ? 'বিষয় ও পরীক্ষার্থী' : 'Subjects & Students'}</th>
                  <th className="py-3 px-4">{lang === 'bn' ? 'অবস্থা' : 'Status'}</th>
                  <th className="py-3 px-4 text-right">{lang === 'bn' ? 'পদক্ষেপ' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf1f7] text-[12.5px]">
                {exams.map((exam) => {
                  const typeObj = examTypeLabels[exam.examType] || {
                    en: exam.examType,
                    bn: exam.examType,
                  };
                  return (
                    <tr key={exam.id} className="hover:bg-[#f8fafc]/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <Link
                          href={`/exams/${exam.id}`}
                          className="font-bold text-[#092f63] hover:text-[#063b78] hover:underline block"
                        >
                          {exam.title}
                        </Link>
                        {exam.banglaTitle && (
                          <div className="text-[11px] text-[#64748b]">{exam.banglaTitle}</div>
                        )}
                        <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-[#eef2f8] text-[#063b78] text-[10px] font-bold">
                          {lang === 'bn' ? typeObj.bn : typeObj.en}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[#092f63]">
                          {(lang === 'bn' && exam.academicClass.banglaName) || exam.academicClass.name}
                          {exam.academicGroup && (
                            <span className="text-[#64748b] font-normal">
                              {' '}
                              · {(lang === 'bn' && exam.academicGroup.banglaName) || exam.academicGroup.name}
                            </span>
                          )}
                        </div>
                        {exam.batch ? (
                          <div className="text-[11px] text-[#063b78] font-medium mt-0.5">
                            {exam.batch.name} ({exam.batch.code})
                          </div>
                        ) : (
                          <div className="text-[11px] text-[#64748b]">
                            {lang === 'bn' ? 'শ্রেণিভিত্তিক সার্বিক পরীক্ষা' : 'Class-wide evaluation'}
                          </div>
                        )}
                        <div className="text-[10px] text-[#94a3b8]">{exam.academicSession.name}</div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[#092f63]">
                          {formatDhakaDate(exam.startDate)}
                        </div>
                        <div className="text-[11px] text-[#64748b] mt-0.5">
                          {lang === 'bn' ? 'পূর্ণমান: ' : 'Total: '}
                          <span className="font-bold text-[#092f63]">
                            {lang === 'bn' ? toBanglaNumeral(exam.totalMarks) : exam.totalMarks}
                          </span>{' '}
                          · {lang === 'bn' ? 'পাস: ' : 'Pass: '}
                          {lang === 'bn' ? toBanglaNumeral(exam.passMarks) : exam.passMarks}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5 text-[#063b78] font-bold text-xs">
                            <Icon name="book" size={13} className="text-[#64748b]" />
                            <span>
                              {lang === 'bn'
                                ? `${toBanglaNumeral(exam._count.examSubjects)} টি বিষয়`
                                : `${exam._count.examSubjects} Subjects`}
                            </span>
                          </div>
                          <span className="text-[#cbd5e1]">•</span>
                          <div className="flex items-center gap-1.5 text-[#092f63] font-semibold text-xs">
                            <Icon name="user" size={13} className="text-[#64748b]" />
                            <span>
                              {lang === 'bn'
                                ? `${toBanglaNumeral(exam._count.examStudents)} পরীক্ষার্থী`
                                : `${exam._count.examStudents} Students`}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <StatusBadge status={exam.status} dictKey="examStatus" size="sm" />
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <Link
                          href={`/exams/${exam.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#dce5f0] text-[#063b78] hover:bg-[#f5f8fc] text-xs font-bold transition-colors"
                        >
                          <span>{lang === 'bn' ? 'ব্যবস্থাপনা' : 'Manage'}</span>
                          <Icon name="arrow-right" size={12} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && totalCount > 0 && (
          <div className="p-4 border-t border-[#dce5f0] bg-[#f8fafc] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#64748b]">
            <div>
              {lang === 'bn' ? (
                <>
                  মোট <span className="font-bold text-[#092f63]">{toBanglaNumeral(totalCount)}</span> টি পরীক্ষার মধ্যে{' '}
                  <span className="font-bold text-[#092f63]">
                    {toBanglaNumeral((page - 1) * 12 + 1)} - {toBanglaNumeral(Math.min(page * 12, totalCount))}
                  </span>{' '}
                  দেখানো হচ্ছে
                </>
              ) : (
                <>
                  Showing <span className="font-bold text-[#092f63]">{(page - 1) * 12 + 1}</span> to{' '}
                  <span className="font-bold text-[#092f63]">{Math.min(page * 12, totalCount)}</span> of{' '}
                  <span className="font-bold text-[#092f63]">{totalCount}</span> exams
                </>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-[#dce5f0] bg-white font-bold text-[#092f63] disabled:opacity-40 hover:bg-[#f5f8fc] transition-colors"
              >
                {lang === 'bn' ? 'পূর্ববর্তী' : 'Previous'}
              </button>
              <span className="px-2 font-bold text-[#092f63]">
                {lang === 'bn' ? toBanglaNumeral(page) : page} /{' '}
                {lang === 'bn' ? toBanglaNumeral(totalPages) : totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg border border-[#dce5f0] bg-white font-bold text-[#092f63] disabled:opacity-40 hover:bg-[#f5f8fc] transition-colors"
              >
                {lang === 'bn' ? 'পরবর্তী' : 'Next'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
