'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import { useApp } from '@/lib/store';
import { DICTIONARY, toBanglaNumeral } from '@/lib/i18n';

interface StudentMarkRow {
  studentId: string;
  studentIdCode: string;
  name: string;
  banglaName?: string | null;
  rollNumber?: string | null;
  status: 'PRESENT' | 'ABSENT' | 'EXCUSED';
  marksObtained: number | '' | null;
  remarks: string;
  grade?: string | null;
  gpa?: number | null;
  isPassed?: boolean | null;
}

interface ExamSubjectMeta {
  id: string;
  examId: string;
  totalMarks: number;
  passMarks: number;
  examDate?: string | null;
  startTime?: string | null;
  duration?: number | null;
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
    status: string;
    batch?: { id: string; name: string } | null;
  };
}

// Client helper for real-time grade preview as user types
function previewGrade(marks: number | '' | null, totalMarks: number, passMarks: number) {
  if (marks === '' || marks === null || isNaN(marks)) {
    return { grade: '—', gpa: '—', isPassed: null };
  }
  const pct = (marks / totalMarks) * 100;
  let grade = 'F';
  let gpa = 0.0;

  if (pct >= 80) {
    grade = 'A+';
    gpa = 5.0;
  } else if (pct >= 70) {
    grade = 'A';
    gpa = 4.0;
  } else if (pct >= 60) {
    grade = 'A-';
    gpa = 3.5;
  } else if (pct >= 50) {
    grade = 'B';
    gpa = 3.0;
  } else if (pct >= 40) {
    grade = 'C';
    gpa = 2.0;
  } else if (pct >= 33) {
    grade = 'D';
    gpa = 1.0;
  } else {
    grade = 'F';
    gpa = 0.0;
  }

  const isPassed = marks >= passMarks;
  return { grade, gpa: gpa.toFixed(2), isPassed };
}

export default function ExamSubjectMarksPage() {
  const params = useParams();
  const router = useRouter();
  const examId = params?.examId as string;
  const examSubjectId = params?.examSubjectId as string;
  const { lang, showToast } = useApp();
  const dict = DICTIONARY[lang];

  const [meta, setMeta] = useState<ExamSubjectMeta | null>(null);
  const [rows, setRows] = useState<StudentMarkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  // References to mark inputs for smooth Tab / Enter navigation
  const inputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const loadData = useCallback(async () => {
    if (!examId || !examSubjectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/exams/${examId}/subjects/${examSubjectId}/results`);
      if (!res.ok) {
        if (res.status === 403) throw new Error('You are not authorized to grade this subject.');
        throw new Error('Failed to load marks entry sheet');
      }
      const data = await res.json();
      if (data.success) {
        setMeta(data.examSubject);
        const mappedRows: StudentMarkRow[] = (data.students || []).map((s: any) => ({
          studentId: s.studentId,
          studentIdCode: s.studentIdCode,
          name: s.name,
          banglaName: s.banglaName,
          rollNumber: s.rollNumber,
          status: s.status || 'PRESENT',
          marksObtained: s.marksObtained !== null && s.marksObtained !== undefined ? Number(s.marksObtained) : '',
          remarks: s.remarks || '',
          grade: s.grade,
          gpa: s.gpa,
          isPassed: s.isPassed,
        }));
        setRows(mappedRows);
        setHasChanges(false);
      } else {
        throw new Error(data.error || 'Failed to load marks');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load marks');
    } finally {
      setLoading(false);
    }
  }, [examId, examSubjectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Update a single student row
  const updateRow = (index: number, field: keyof StudentMarkRow, value: any) => {
    setRows((prev) => {
      const copy = [...prev];
      const row = { ...copy[index] };

      if (field === 'status') {
        row.status = value;
        if (value === 'ABSENT' || value === 'EXCUSED') {
          row.marksObtained = '';
        }
      } else if (field === 'marksObtained') {
        const num = value === '' ? '' : Number(value);
        row.marksObtained = num;
        if (num !== '' && !isNaN(num) && row.status !== 'PRESENT') {
          row.status = 'PRESENT';
        }
      } else {
        (row as any)[field] = value;
      }

      copy[index] = row;
      return copy;
    });
    setHasChanges(true);
  };

  // Keyboard navigation on Marks input: Enter goes down to next student
  const handleKeyDown = (e: React.KeyboardEvent, currentIndex: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const nextRow = rows[currentIndex + 1];
      if (nextRow && inputRefs.current[nextRow.studentId]) {
        inputRefs.current[nextRow.studentId]?.focus();
        inputRefs.current[nextRow.studentId]?.select();
      }
    }
  };

  // Save all marks
  const handleSave = async () => {
    if (!meta) return;

    // Validate marks before sending
    for (const r of rows) {
      if (r.status === 'PRESENT' && r.marksObtained !== '' && r.marksObtained !== null) {
        if (Number(r.marksObtained) < 0) {
          showToast(
            lang === 'bn'
              ? `${r.name}-এর নম্বর ঋণাত্মক হতে পারে না`
              : `Marks for ${r.name} cannot be negative`
          );
          return;
        }
        if (Number(r.marksObtained) > meta.totalMarks) {
          showToast(
            lang === 'bn'
              ? `${r.name}-এর নম্বর পূর্ণমান ${meta.totalMarks}-এর চেয়ে বেশি হতে পারে না`
              : `Marks for ${r.name} cannot exceed total marks (${meta.totalMarks})`
          );
          return;
        }
      }
    }

    setSaving(true);
    try {
      const payload = {
        results: rows.map((r) => ({
          studentId: r.studentId,
          status: r.status,
          marksObtained: r.status === 'PRESENT' && r.marksObtained !== '' ? Number(r.marksObtained) : null,
          remarks: r.remarks.trim() || undefined,
        })),
      };

      const res = await fetch(`/api/exams/${examId}/subjects/${examSubjectId}/results`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        showToast(
          lang === 'bn'
            ? `নম্বর সফলভাবে সংরক্ষিত হয়েছে (সর্বোচ্চ নম্বর: ${data.highestMarks ?? '—'})`
            : `Marks saved successfully (Highest: ${data.highestMarks ?? '—'})`
        );
        setHasChanges(false);
        loadData();
      } else {
        showToast(data.error || 'Failed to save marks');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to save marks');
    } finally {
      setSaving(false);
    }
  };

  // Mark all unentered as Present
  const handleMarkAllPresent = () => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        status: 'PRESENT',
      }))
    );
    setHasChanges(true);
    showToast(lang === 'bn' ? 'সকলকে উপস্থিত হিসেবে চিহ্নিত করা হয়েছে' : 'All marked as Present');
  };

  if (loading) {
    return (
      <div className="max-w-[1100px] mx-auto py-16 text-center text-[#64748b]">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
        <p className="mt-3 text-[14px] font-medium">
          {lang === 'bn' ? 'নম্বর তালিকা লোড হচ্ছে…' : 'Loading marks entry sheet…'}
        </p>
      </div>
    );
  }

  if (error || !meta) {
    return (
      <div className="max-w-[700px] mx-auto py-12 text-center">
        <div className="p-8 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col items-center">
          <Icon name="alert" size={32} className="text-rose-500 mb-3" />
          <h2 className="text-xl font-bold text-[#092f63]">
            {lang === 'bn' ? 'প্রবেশাধিকার নেই বা বিষয় পাওয়া যায়নি' : 'Access Restricted or Subject Not Found'}
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

  const subjectName = lang === 'bn' && meta.subject.banglaName ? meta.subject.banglaName : meta.subject.name;

  // Filter rows by search
  const filteredRows = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      (r.banglaName && r.banglaName.includes(q)) ||
      r.studentIdCode.toLowerCase().includes(q) ||
      (r.rollNumber && r.rollNumber.toLowerCase().includes(q))
    );
  });

  // Calculate live summary
  const total = rows.length;
  const presentCount = rows.filter((r) => r.status === 'PRESENT').length;
  const absentCount = rows.filter((r) => r.status === 'ABSENT').length;
  const scoredCount = rows.filter((r) => r.status === 'PRESENT' && r.marksObtained !== '' && r.marksObtained !== null).length;

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-6 pb-20">
      {/* Top Breadcrumb & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href={`/exams/${examId}`}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#063b78] hover:underline mb-1"
          >
            <Icon name="chevronleft" size={15} />
            <span>{lang === 'bn' ? 'পরীক্ষার বিবরণে ফিরে যান' : 'Back to Exam Details'}</span>
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-[#092f63]">
              {subjectName} {lang === 'bn' ? 'নম্বর এন্ট্রি' : 'Marks Entry'}
            </h1>
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11.5px] font-bold text-[#063b78]">
              {meta.exam.title}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#64748b] mt-1">
            <span>
              {lang === 'bn' ? 'পূর্ণমান:' : 'Total Marks:'}{' '}
              <strong className="text-[#092f63]">{toBanglaNumeral(meta.totalMarks)}</strong>
            </span>
            <span>•</span>
            <span>
              {lang === 'bn' ? 'পাস নম্বর:' : 'Pass Marks:'}{' '}
              <strong className="text-emerald-700">{toBanglaNumeral(meta.passMarks)}</strong>
            </span>
            {meta.exam.batch && (
              <>
                <span>•</span>
                <span>
                  {lang === 'bn' ? 'ব্যাচ:' : 'Batch:'} <strong>{meta.exam.batch.name}</strong>
                </span>
              </>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleMarkAllPresent}
            className="px-3 py-2 rounded-xl border border-[#dce5f0] text-[12px] font-bold text-[#063b78] hover:bg-[#f8fafc] transition-colors"
          >
            {lang === 'bn' ? 'সবাইকে উপস্থিত করুন' : 'Mark All Present'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={`inline-flex items-center gap-2 rounded-xl px-5 py-2 text-[13.5px] font-bold text-white transition-all shadow-xs ${
              hasChanges ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-[#063b78] hover:bg-[#084b96]'
            } disabled:opacity-50`}
          >
            {saving ? (
              <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-r-transparent" />
            ) : (
              <Icon name="check" size={16} />
            )}
            <span>
              {saving
                ? lang === 'bn'
                  ? 'সংরক্ষণ হচ্ছে…'
                  : 'Saving…'
                : hasChanges
                ? lang === 'bn'
                  ? 'পরিবর্তন সংরক্ষণ করুন *'
                  : 'Save Changes *'
                : lang === 'bn'
                ? 'নম্বর সংরক্ষণ করুন'
                : 'Save Marks'}
            </span>
          </button>
        </div>
      </div>

      {/* Quick Summary Pill Bar */}
      <div className="card p-3 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-[12.5px]">
          <div>
            <span className="text-[#64748b]">{lang === 'bn' ? 'মোট পরীক্ষার্থী:' : 'Total Students:'} </span>
            <strong className="text-[#092f63] font-bold">{toBanglaNumeral(total)}</strong>
          </div>
          <div>
            <span className="text-[#64748b]">{lang === 'bn' ? 'উপস্থিত:' : 'Present:'} </span>
            <strong className="text-blue-700 font-bold">{toBanglaNumeral(presentCount)}</strong>
          </div>
          <div>
            <span className="text-[#64748b]">{lang === 'bn' ? 'অনুপস্থিত:' : 'Absent:'} </span>
            <strong className="text-rose-600 font-bold">{toBanglaNumeral(absentCount)}</strong>
          </div>
          <div>
            <span className="text-[#64748b]">{lang === 'bn' ? 'নম্বর এন্ট্রি হয়েছে:' : 'Scored:'} </span>
            <strong className="text-emerald-700 font-bold">
              {toBanglaNumeral(scoredCount)} / {toBanglaNumeral(total)}
            </strong>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-[240px]">
          <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={lang === 'bn' ? 'রোল বা নাম খুঁজুন…' : 'Search roll or name…'}
            className="w-full rounded-xl border border-[#dce5f0] pl-8 pr-3 py-1.5 text-[12px] text-[#092f63] focus:border-[#063b78] focus:outline-none"
          />
        </div>
      </div>

      {/* Marks Entry Table */}
      <div className="card rounded-2xl bg-white border border-[#dce5f0] shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-[#f8fafc] border-b border-[#dce5f0] text-[#64748b] text-[11.5px] font-bold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 w-12">#</th>
                <th className="px-4 py-3 w-20">{lang === 'bn' ? 'রোল' : 'Roll'}</th>
                <th className="px-4 py-3 min-w-[180px]">{lang === 'bn' ? 'শিক্ষার্থী' : 'Student'}</th>
                <th className="px-4 py-3 w-32">{lang === 'bn' ? 'উপস্থিতি' : 'Attendance'}</th>
                <th className="px-4 py-3 w-36">{lang === 'bn' ? 'প্রাপ্ত নম্বর' : 'Marks'}</th>
                <th className="px-4 py-3 w-24 text-center">{lang === 'bn' ? 'গ্রেড / জিপিএ' : 'Grade / GPA'}</th>
                <th className="px-4 py-3 w-24 text-center">{lang === 'bn' ? 'পাস / ফেল' : 'Result'}</th>
                <th className="px-4 py-3 min-w-[140px]">{lang === 'bn' ? 'মন্তব্য' : 'Remarks'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f7]">
              {filteredRows.map((row, index) => {
                const preview = previewGrade(row.marksObtained, meta.totalMarks, meta.passMarks);
                const isAbsent = row.status === 'ABSENT' || row.status === 'EXCUSED';

                return (
                  <tr
                    key={row.studentId}
                    className={`hover:bg-[#f8fafc] transition-colors ${
                      isAbsent ? 'bg-gray-50/70 text-gray-400' : ''
                    }`}
                  >
                    <td className="px-4 py-3 text-[#64748b] font-mono text-[12px]">{index + 1}</td>
                    <td className="px-4 py-3 font-semibold text-[#092f63]">
                      {row.rollNumber ? toBanglaNumeral(row.rollNumber) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-[#092f63]">
                        {lang === 'bn' && row.banglaName ? row.banglaName : row.name}
                      </div>
                      <div className="text-[11px] font-mono text-[#64748b]">{row.studentIdCode}</div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={row.status}
                        onChange={(e) => updateRow(index, 'status', e.target.value)}
                        className={`w-full rounded-lg border px-2.5 py-1.5 text-[12px] font-bold focus:outline-none ${
                          row.status === 'PRESENT'
                            ? 'bg-blue-50 border-blue-200 text-[#063b78]'
                            : row.status === 'ABSENT'
                            ? 'bg-rose-50 border-rose-200 text-rose-700'
                            : 'bg-amber-50 border-amber-200 text-amber-700'
                        }`}
                      >
                        <option value="PRESENT">{lang === 'bn' ? 'উপস্থিত' : 'Present'}</option>
                        <option value="ABSENT">{lang === 'bn' ? 'অনুপস্থিত' : 'Absent'}</option>
                        <option value="EXCUSED">{lang === 'bn' ? 'ছুটিপ্রাপ্ত' : 'Excused'}</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative">
                        <input
                          ref={(el) => {
                            inputRefs.current[row.studentId] = el;
                          }}
                          type="number"
                          step="0.5"
                          min="0"
                          max={meta.totalMarks}
                          disabled={isAbsent}
                          value={row.marksObtained !== null && row.marksObtained !== undefined ? row.marksObtained : ''}
                          onChange={(e) => updateRow(index, 'marksObtained', e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, index)}
                          placeholder={isAbsent ? (lang === 'bn' ? 'অনুপস্থিত' : 'Absent') : `0 - ${meta.totalMarks}`}
                          className={`w-full rounded-xl border px-3 py-1.5 text-[14px] font-bold text-[#092f63] focus:border-[#063b78] focus:outline-none transition-all ${
                            isAbsent
                              ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                              : row.marksObtained !== '' && Number(row.marksObtained) > meta.totalMarks
                              ? 'border-rose-400 bg-rose-50 text-rose-700'
                              : 'border-[#dce5f0] bg-white'
                          }`}
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10.5px] font-bold text-[#64748b]">
                          / {meta.totalMarks}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {!isAbsent && preview.grade !== '—' ? (
                        <div className="inline-flex flex-col items-center">
                          <span
                            className={`font-extrabold text-[13px] ${
                              preview.grade === 'F' ? 'text-rose-600' : 'text-[#063b78]'
                            }`}
                          >
                            {preview.grade}
                          </span>
                          <span className="text-[10px] text-[#64748b]">GPA: {preview.gpa}</span>
                        </div>
                      ) : (
                        <span className="text-[#64748b] text-[12px]">{isAbsent ? '—' : '—'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {!isAbsent && preview.isPassed !== null ? (
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            preview.isPassed
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {preview.isPassed ? (lang === 'bn' ? 'পাস' : 'PASS') : (lang === 'bn' ? 'ফেল' : 'FAIL')}
                        </span>
                      ) : (
                        <span className="text-[#64748b] text-[12px]">{isAbsent ? '—' : '—'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={row.remarks}
                        onChange={(e) => updateRow(index, 'remarks', e.target.value)}
                        placeholder={lang === 'bn' ? 'মন্তব্য (ঐচ্ছিক)' : 'Optional notes'}
                        className="w-full rounded-lg border border-[#dce5f0] px-2 py-1 text-[12px] text-[#092f63] focus:border-[#063b78] focus:outline-none"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating Bottom Bar if changes pending */}
      {hasChanges && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-[#092f63] text-white px-6 py-3 rounded-2xl shadow-xl border border-blue-900 flex items-center gap-4">
          <span className="text-[13px] font-semibold">
            {lang === 'bn' ? 'অসংরক্ষিত পরিবর্তন রয়েছে' : 'Unsaved marks changes detected'}
          </span>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-1.5 rounded-xl text-[12.5px] font-bold transition-colors disabled:opacity-50"
          >
            {saving ? (lang === 'bn' ? 'সংরক্ষণ হচ্ছে…' : 'Saving…') : (lang === 'bn' ? 'এখনই সংরক্ষণ করুন' : 'Save Now')}
          </button>
        </div>
      )}
    </div>
  );
}
