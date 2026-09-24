'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY, toBanglaNumeral } from '@/lib/i18n';
import { EXAM_TYPES } from '@/lib/validations/exam';

interface SubjectOption {
  id: string;
  name: string;
  banglaName?: string | null;
  code?: string | null;
  academicClassId?: string | null;
  academicGroupId?: string | null;
}

interface EligibleStudent {
  id: string;
  studentIdCode: string;
  name: string;
  banglaName?: string | null;
  rollNumber?: string | null;
  batchName?: string | null;
}

interface SubjectEntry {
  subjectId: string;
  examDate?: string;
  startTime?: string;
  duration?: number;
  totalMarks: number;
  passMarks: number;
}

export default function NewExamPage() {
  const router = useRouter();
  const { lang, showToast } = useApp();
  const dict = DICTIONARY[lang];

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form options
  const [branches, setBranches] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [programs, setPrograms] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);

  // Step 1: Basic Information
  const [branchId, setBranchId] = useState('');
  const [title, setTitle] = useState('');
  const [banglaTitle, setBanglaTitle] = useState('');
  const [examType, setExamType] = useState('Weekly Test');
  const [customExamType, setCustomExamType] = useState('');
  const [academicSessionId, setAcademicSessionId] = useState('');
  const [academicProgramId, setAcademicProgramId] = useState('');
  const [academicClassId, setAcademicClassId] = useState('');
  const [academicGroupId, setAcademicGroupId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [totalMarks, setTotalMarks] = useState<number | ''>(100);
  const [passMarks, setPassMarks] = useState<number | ''>(40);

  // Cascading lists for Step 1
  const [selectedProgram, setSelectedProgram] = useState<any>(null);
  const [availableClasses, setAvailableClasses] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [availableGroups, setAvailableGroups] = useState<any[]>([]);
  const [availableBatches, setAvailableBatches] = useState<any[]>([]);

  // Step 2: Subjects
  const [availableSubjects, setAvailableSubjects] = useState<SubjectOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectEntry[]>([]);

  // Step 2: Subject creation modal & seeding state
  const [newSubjectModal, setNewSubjectModal] = useState(false);
  const [newSubjectForm, setNewSubjectForm] = useState({
    name: '',
    banglaName: '',
    code: '',
    academicGroupId: '',
  });
  const [creatingSubject, setCreatingSubject] = useState(false);
  const [seedingSubjects, setSeedingSubjects] = useState(false);

  // Step 3: Students
  const [eligibleStudents, setEligibleStudents] = useState<EligibleStudent[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [enrollAll, setEnrollAll] = useState(true);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentSearch, setStudentSearch] = useState('');

  // Load initial options
  useEffect(() => {
    async function loadOptions() {
      setLoadingOptions(true);
      try {
        const res = await fetch('/api/batches/options');
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setBranches(data.branches || []);
            setSessions(data.sessions || []);
            setPrograms(data.programs || []);
            setBatches(data.batches || []);

            // Set current session by default
            const currentSession = data.sessions?.find((s: any) => s.isCurrent) || data.sessions?.[0];
            if (currentSession) setAcademicSessionId(currentSession.id);

            // Set main branch if available
            const mainBranch = data.branches?.find((b: any) => b.isMain) || data.branches?.[0];
            if (mainBranch) setBranchId(mainBranch.id);
          }
        }
      } catch (err) {
        console.error('Failed to load batch options', err);
      } finally {
        setLoadingOptions(false);
      }
    }
    loadOptions();
  }, []);

  // Handle program change
  useEffect(() => {
    if (!academicProgramId) {
      setSelectedProgram(null);
      setAvailableClasses([]);
      setAcademicClassId('');
      return;
    }
    const prog = programs.find((p) => p.id === academicProgramId);
    setSelectedProgram(prog);
    setAvailableClasses(prog?.classes || []);
    setAcademicClassId('');
  }, [academicProgramId, programs]);

  // Handle class change
  useEffect(() => {
    if (!academicClassId) {
      setSelectedClass(null);
      setAvailableGroups([]);
      setAcademicGroupId('');
      setAvailableSubjects([]);
      return;
    }
    const cls = availableClasses.find((c) => c.id === academicClassId);
    setSelectedClass(cls);
    setAvailableGroups(cls?.groups || []);
    setAcademicGroupId('');

    // Pre-populate available subjects from academic class if present
    if (cls?.subjects && cls.subjects.length > 0) {
      setAvailableSubjects(cls.subjects);
    }

    // Always fetch latest subjects directly from /api/subjects for this class
    fetch(`/api/subjects?classId=${academicClassId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.subjects) && data.subjects.length > 0) {
          setAvailableSubjects(data.subjects);
        }
      })
      .catch((err) => console.error('Failed to fetch class subjects', err));
  }, [academicClassId, availableClasses]);

  // Refresh subjects for a specific class
  const refreshSubjectsForClass = async (classId: string) => {
    try {
      const res = await fetch(`/api/subjects?classId=${classId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.subjects)) {
          setAvailableSubjects(data.subjects);
          return data.subjects;
        }
      }
    } catch (e) {
      console.error('Failed to refresh subjects', e);
    }
    return [];
  };

  // Seed standard NCTB subjects for this class
  const handleSeedSubjects = async () => {
    if (!academicClassId) {
      showToast(lang === 'bn' ? 'অনুগ্রহ করে প্রথমে শ্রেণি নির্বাচন করুন' : 'Please select a class first');
      return;
    }
    setSeedingSubjects(true);
    try {
      const res = await fetch('/api/subjects/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId: academicClassId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(
          lang === 'bn'
            ? `${data.createdCount || 'স্ট্যান্ডার্ড'} টি বিষয় সফলভাবে লোড হয়েছে`
            : `Successfully loaded standard NCTB subjects!`
        );
        const fresh = await refreshSubjectsForClass(academicClassId);
        if (subjects.length === 0 && fresh.length > 0) {
          setSubjects([
            {
              subjectId: fresh[0].id,
              examDate: startDate || undefined,
              startTime: '10:00',
              duration: 90,
              totalMarks: Number(totalMarks) || 100,
              passMarks: Number(passMarks) || 40,
            },
          ]);
        }
      } else {
        showToast(data.error || (lang === 'bn' ? 'বিষয় লোড করতে ব্যর্থ হয়েছে' : 'Failed to seed subjects'));
      }
    } catch (err: any) {
      showToast(err.message || 'Error seeding subjects');
    } finally {
      setSeedingSubjects(false);
    }
  };

  // Create a brand new custom subject on the fly
  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!academicClassId) {
      showToast(lang === 'bn' ? 'অনুগ্রহ করে প্রথমে শ্রেণি নির্বাচন করুন' : 'Please select a class first');
      return;
    }
    if (!newSubjectForm.name.trim() || !newSubjectForm.code.trim()) {
      showToast(lang === 'bn' ? 'বিষয়ের নাম ও কোড আবশ্যক' : 'Subject name and code are required');
      return;
    }

    setCreatingSubject(true);
    try {
      const res = await fetch('/api/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          academicClassId,
          academicGroupId: newSubjectForm.academicGroupId || undefined,
          name: newSubjectForm.name.trim(),
          banglaName: newSubjectForm.banglaName.trim() || undefined,
          code: newSubjectForm.code.trim().toUpperCase(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.subject) {
        showToast(
          lang === 'bn'
            ? `"${data.subject.name}" বিষয় যুক্ত হয়েছে!`
            : `Subject "${data.subject.name}" created and added to exam!`
        );
        setAvailableSubjects((prev) => [...prev, data.subject]);
        setSubjects((prev) => [
          ...prev,
          {
            subjectId: data.subject.id,
            examDate: startDate || undefined,
            startTime: '10:00',
            duration: 90,
            totalMarks: Number(totalMarks) || 100,
            passMarks: Number(passMarks) || 40,
          },
        ]);
        setNewSubjectForm({ name: '', banglaName: '', code: '', academicGroupId: '' });
        setNewSubjectModal(false);
      } else {
        showToast(data.error || (lang === 'bn' ? 'বিষয় তৈরি ব্যর্থ হয়েছে' : 'Failed to create subject'));
      }
    } catch (err: any) {
      showToast(err.message || 'Error creating subject');
    } finally {
      setCreatingSubject(false);
    }
  };

  // Handle batch filtering based on selections
  useEffect(() => {
    let filtered = batches;
    if (branchId) filtered = filtered.filter((b) => !b.branchId || b.branchId === branchId);
    if (academicSessionId) filtered = filtered.filter((b) => b.academicSessionId === academicSessionId);
    if (academicProgramId) filtered = filtered.filter((b) => b.academicProgramId === academicProgramId);
    if (academicClassId) filtered = filtered.filter((b) => b.academicClassId === academicClassId);
    if (academicGroupId) filtered = filtered.filter((b) => !b.academicGroupId || b.academicGroupId === academicGroupId);
    setAvailableBatches(filtered);
  }, [batches, branchId, academicSessionId, academicProgramId, academicClassId, academicGroupId]);

  // Load eligible students when Step 3 is reached
  useEffect(() => {
    if (step !== 3) return;
    if (!academicSessionId || !academicProgramId || !academicClassId) return;

    async function loadStudents() {
      setLoadingStudents(true);
      try {
        const query = new URLSearchParams({
          academicSessionId,
          academicProgramId,
          academicClassId,
        });
        if (batchId) query.set('batchId', batchId);
        if (academicGroupId) query.set('academicGroupId', academicGroupId);

        const res = await fetch(`/api/exams/eligible-students?${query.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setEligibleStudents(data.students || []);
            // Default select all eligible students
            setSelectedStudentIds((data.students || []).map((s: any) => s.id));
          }
        }
      } catch (err) {
        console.error('Failed to load eligible students', err);
      } finally {
        setLoadingStudents(false);
      }
    }
    loadStudents();
  }, [step, academicSessionId, academicProgramId, academicClassId, academicGroupId, batchId]);

  // Add a subject row
  const addSubjectRow = (subjectId?: string) => {
    if (availableSubjects.length === 0) {
      setNewSubjectModal(true);
      showToast(
        lang === 'bn'
          ? 'এই শ্রেণিতে কোনো বিষয় নেই। নতুন বিষয় তৈরি করুন অথবা স্ট্যান্ডার্ড বিষয় লোড করুন।'
          : 'No subjects found for this class. Create a subject or load standard subjects.'
      );
      return;
    }
    const sid = subjectId || (availableSubjects.find((s) => !subjects.some((sub) => sub.subjectId === s.id))?.id || '');
    if (!sid) {
      showToast(lang === 'bn' ? 'সব বিষয় ইতিমধ্যে যুক্ত করা হয়েছে' : 'All available subjects already added');
      return;
    }
    setSubjects((prev) => [
      ...prev,
      {
        subjectId: sid,
        examDate: startDate || undefined,
        startTime: '10:00',
        duration: 90,
        totalMarks: Number(totalMarks) || 100,
        passMarks: Number(passMarks) || 40,
      },
    ]);
  };

  // Remove a subject row
  const removeSubjectRow = (index: number) => {
    setSubjects((prev) => prev.filter((_, i) => i !== index));
  };

  // Update a subject row
  const updateSubjectRow = (index: number, field: keyof SubjectEntry, value: any) => {
    setSubjects((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  // Step 1 Validation
  const validateStep1 = () => {
    if (!title.trim()) {
      showToast(lang === 'bn' ? 'অনুগ্রহ করে পরীক্ষার নাম দিন' : 'Please provide exam title');
      return false;
    }
    if (!academicSessionId) {
      showToast(lang === 'bn' ? 'শিক্ষাবর্ষ নির্বাচন করুন' : 'Please select academic session');
      return false;
    }
    if (!academicProgramId) {
      showToast(lang === 'bn' ? 'প্রোগ্রাম নির্বাচন করুন' : 'Please select academic program');
      return false;
    }
    if (!academicClassId) {
      showToast(lang === 'bn' ? 'শ্রেণি নির্বাচন করুন' : 'Please select class');
      return false;
    }
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      showToast(lang === 'bn' ? 'সমাপ্তির তারিখ শুরুর তারিখের পরে হতে হবে' : 'End date must be on or after start date');
      return false;
    }
    return true;
  };

  // Step 2 Validation
  const validateStep2 = () => {
    if (subjects.length === 0) {
      showToast(lang === 'bn' ? 'কমপক্ষে একটি বিষয় যুক্ত করুন' : 'Please add at least one subject');
      return false;
    }

    const seenIds = new Set<string>();
    for (const sub of subjects) {
      if (!sub.subjectId) {
        showToast(lang === 'bn' ? 'বিষয় নির্বাচন করুন' : 'Please select a subject');
        return false;
      }
      if (seenIds.has(sub.subjectId)) {
        showToast(lang === 'bn' ? 'একই বিষয় একাধিকবার নির্বাচন করা যাবে না' : 'Duplicate subject assignment is not allowed');
        return false;
      }
      seenIds.add(sub.subjectId);

      if (sub.totalMarks <= 0) {
        showToast(lang === 'bn' ? 'মোট নম্বর শূন্যের চেয়ে বেশি হতে হবে' : 'Total marks must be greater than 0');
        return false;
      }
      if (sub.passMarks < 0 || sub.passMarks > sub.totalMarks) {
        showToast(lang === 'bn' ? 'পাস নম্বর সঠিক নয়' : 'Pass marks must be between 0 and total marks');
        return false;
      }
    }
    return true;
  };

  // Step 3 Validation
  const validateStep3 = () => {
    if (!enrollAll && selectedStudentIds.length === 0) {
      showToast(lang === 'bn' ? 'কমপক্ষে একজন শিক্ষার্থী নির্বাচন করুন' : 'Please select at least one student');
      return false;
    }
    return true;
  };

  // Final Submit
  const handleFinalSubmit = async () => {
    setSubmitting(true);
    try {
      const finalExamType = examType === 'Other' ? (customExamType.trim() || 'Custom Exam') : examType;

      const payload = {
        title: title.trim(),
        banglaTitle: banglaTitle.trim() || undefined,
        examType: finalExamType,
        academicSessionId,
        academicProgramId,
        academicClassId,
        academicGroupId: academicGroupId || undefined,
        batchId: batchId || undefined,
        branchId: branchId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        totalMarks: totalMarks ? Number(totalMarks) : undefined,
        passMarks: passMarks ? Number(passMarks) : undefined,
        subjects: subjects.map((s) => ({
          subjectId: s.subjectId,
          examDate: s.examDate || undefined,
          startTime: s.startTime || undefined,
          duration: s.duration ? Number(s.duration) : undefined,
          totalMarks: Number(s.totalMarks),
          passMarks: Number(s.passMarks),
        })),
        studentIds: enrollAll ? [] : selectedStudentIds,
        enrollAllEligible: enrollAll,
      };

      const res = await fetch('/api/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success && data.exam) {
        showToast(lang === 'bn' ? 'পরীক্ষা সফলভাবে তৈরি হয়েছে' : 'Exam created successfully');
        router.push(`/exams/${data.exam.id}`);
      } else {
        showToast(data.error || 'Failed to create exam');
      }
    } catch (err: any) {
      console.error('Failed to create exam', err);
      showToast(err?.message || 'Failed to create exam');
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered students for Step 3
  const filteredStudents = eligibleStudents.filter((st) => {
    if (!studentSearch.trim()) return true;
    const q = studentSearch.toLowerCase();
    return (
      st.name.toLowerCase().includes(q) ||
      (st.banglaName && st.banglaName.includes(q)) ||
      st.studentIdCode.toLowerCase().includes(q) ||
      (st.rollNumber && st.rollNumber.toLowerCase().includes(q))
    );
  });

  return (
    <div className="max-w-[1000px] mx-auto flex flex-col gap-6 pb-16">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <Link
          href="/exams"
          className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#063b78] hover:underline"
        >
          <Icon name="chevronleft" size={16} />
          <span>{lang === 'bn' ? 'পরীক্ষাসমূহে ফিরে যান' : 'Back to Exams'}</span>
        </Link>
        <span className="text-[12px] font-bold text-[#64748b]">
          {lang === 'bn' ? `ধাপ ${toBanglaNumeral(step)} / ৪` : `Step ${step} of 4`}
        </span>
      </div>

      {/* Wizard Step Progress */}
      <div className="card p-4 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { num: 1, label: lang === 'bn' ? '১. প্রাথমিক তথ্য' : '1. Basic Info' },
            { num: 2, label: lang === 'bn' ? '২. বিষয়সমূহ' : '2. Subjects' },
            { num: 3, label: lang === 'bn' ? '৩. শিক্ষার্থী' : '3. Students' },
            { num: 4, label: lang === 'bn' ? '৪. পর্যালোচনা' : '4. Review' },
          ].map((st) => (
            <div
              key={st.num}
              className={`p-2.5 rounded-xl font-bold text-[12px] sm:text-[13px] transition-all flex items-center justify-center gap-2 ${
                step === st.num
                  ? 'bg-[#063b78] text-white shadow-xs'
                  : step > st.num
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-[#f8fafc] text-[#64748b]'
              }`}
            >
              {step > st.num && <Icon name="check" size={14} className="text-emerald-600" />}
              <span>{st.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* STEP 1: Basic Information */}
      {step === 1 && (
        <div className="card p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-6">
          <div className="border-b border-[#edf2f7] pb-3">
            <h2 className="text-lg font-bold text-[#063b78]">
              {lang === 'bn' ? 'পরীক্ষার প্রাথমিক তথ্য' : 'Exam Basic Information'}
            </h2>
            <p className="text-[12.5px] text-[#64748b]">
              {lang === 'bn'
                ? 'পরীক্ষার শিরোনাম, শিক্ষাবর্ষ, শ্রেণি ও ব্যাচ নির্বাচন করুন'
                : 'Define exam title, academic session, level and batch context'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-bold text-[#092f63] mb-1.5">
                {lang === 'bn' ? 'পরীক্ষার নাম (English) *' : 'Exam Title (English) *'}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. HSC Model Test 2026 - Paper 1"
                className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] focus:border-[#063b78] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[12px] font-bold text-[#092f63] mb-1.5">
                {lang === 'bn' ? 'পরীক্ষার নাম (বাংলা)' : 'Bangla Title (বাংলা)'}
              </label>
              <input
                type="text"
                value={banglaTitle}
                onChange={(e) => setBanglaTitle(e.target.value)}
                placeholder="যেমন: এইচএসসি মডেল টেস্ট ২০২৬"
                className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] focus:border-[#063b78] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[12px] font-bold text-[#092f63] mb-1.5">
                {lang === 'bn' ? 'পরীক্ষার ধরন *' : 'Exam Type *'}
              </label>
              <select
                value={examType}
                onChange={(e) => setExamType(e.target.value)}
                className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] focus:border-[#063b78] focus:outline-none bg-white"
              >
                {EXAM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                <option value="Other">{lang === 'bn' ? 'অন্যান্য / কাস্টম' : 'Other / Custom'}</option>
              </select>
            </div>

            {examType === 'Other' && (
              <div>
                <label className="block text-[12px] font-bold text-[#092f63] mb-1.5">
                  {lang === 'bn' ? 'কাস্টম পরীক্ষার ধরন *' : 'Custom Exam Type *'}
                </label>
                <input
                  type="text"
                  value={customExamType}
                  onChange={(e) => setCustomExamType(e.target.value)}
                  placeholder="e.g. Scholarship Assessment"
                  className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] focus:border-[#063b78] focus:outline-none"
                />
              </div>
            )}

            <div>
              <label className="block text-[12px] font-bold text-[#092f63] mb-1.5">
                {lang === 'bn' ? 'ক্যাম্পাস / শাখা' : 'Branch / Campus'}
              </label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] focus:border-[#063b78] focus:outline-none bg-white"
              >
                <option value="">{lang === 'bn' ? 'সকল শাখা / মূল ক্যাম্পাস' : 'All Branches / Main Campus'}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[12px] font-bold text-[#092f63] mb-1.5">
                {lang === 'bn' ? 'শিক্ষাবর্ষ *' : 'Academic Session *'}
              </label>
              <select
                value={academicSessionId}
                onChange={(e) => setAcademicSessionId(e.target.value)}
                className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] focus:border-[#063b78] focus:outline-none bg-white"
              >
                <option value="">{lang === 'bn' ? 'শিক্ষাবর্ষ নির্বাচন করুন' : 'Select Session'}</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.isCurrent ? (lang === 'bn' ? '(বর্তমান)' : '(Current)') : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[12px] font-bold text-[#092f63] mb-1.5">
                {lang === 'bn' ? 'একাডেমিক প্রোগ্রাম *' : 'Academic Program *'}
              </label>
              <select
                value={academicProgramId}
                onChange={(e) => setAcademicProgramId(e.target.value)}
                className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] focus:border-[#063b78] focus:outline-none bg-white"
              >
                <option value="">{lang === 'bn' ? 'প্রোগ্রাম নির্বাচন করুন' : 'Select Program'}</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[12px] font-bold text-[#092f63] mb-1.5">
                {lang === 'bn' ? 'শ্রেণি / লেভেল *' : 'Class / Level *'}
              </label>
              <select
                value={academicClassId}
                onChange={(e) => setAcademicClassId(e.target.value)}
                disabled={!academicProgramId}
                className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] focus:border-[#063b78] focus:outline-none bg-white disabled:bg-[#f1f5f9]"
              >
                <option value="">{lang === 'bn' ? 'শ্রেণি নির্বাচন করুন' : 'Select Class'}</option>
                {availableClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {availableGroups.length > 0 && (
              <div>
                <label className="block text-[12px] font-bold text-[#092f63] mb-1.5">
                  {lang === 'bn' ? 'বিভাগ / গ্রুপ (ঐচ্ছিক)' : 'Academic Group (Optional)'}
                </label>
                <select
                  value={academicGroupId}
                  onChange={(e) => setAcademicGroupId(e.target.value)}
                  className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] focus:border-[#063b78] focus:outline-none bg-white"
                >
                  <option value="">{lang === 'bn' ? 'সকল গ্রুপ' : 'All Groups'}</option>
                  {availableGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-[12px] font-bold text-[#092f63] mb-1.5">
                {lang === 'bn' ? 'নির্দিষ্ট ব্যাচ (ঐচ্ছিক)' : 'Specific Batch (Optional)'}
              </label>
              <select
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
                className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] focus:border-[#063b78] focus:outline-none bg-white"
              >
                <option value="">{lang === 'bn' ? 'পুরো শ্রেণির পরীক্ষা (সকল ব্যাচ)' : 'Class-wide Exam (All Batches)'}</option>
                {availableBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[12px] font-bold text-[#092f63] mb-1.5">
                {lang === 'bn' ? 'শুরুর তারিখ' : 'Start Date'}
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] focus:border-[#063b78] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[12px] font-bold text-[#092f63] mb-1.5">
                {lang === 'bn' ? 'সমাপ্তির তারিখ' : 'End Date'}
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] focus:border-[#063b78] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[12px] font-bold text-[#092f63] mb-1.5">
                {lang === 'bn' ? 'মোট পূর্ণমান (Default Total Marks)' : 'Default Total Marks'}
              </label>
              <input
                type="number"
                min="1"
                value={totalMarks}
                onChange={(e) => setTotalMarks(e.target.value ? Number(e.target.value) : '')}
                className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] focus:border-[#063b78] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[12px] font-bold text-[#092f63] mb-1.5">
                {lang === 'bn' ? 'পাস নম্বর (Default Pass Marks)' : 'Default Pass Marks'}
              </label>
              <input
                type="number"
                min="0"
                value={passMarks}
                onChange={(e) => setPassMarks(e.target.value ? Number(e.target.value) : '')}
                className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] focus:border-[#063b78] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-[#edf2f7]">
            <button
              type="button"
              onClick={() => {
                if (validateStep1()) setStep(2);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-[#063b78] px-6 py-2.5 text-[13.5px] font-semibold text-white hover:bg-[#084b96] transition-colors"
            >
              <span>{lang === 'bn' ? 'পরবর্তী: বিষয়সমূহ' : 'Next: Configure Subjects'}</span>
              <Icon name="chevronright" size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Subjects */}
      {step === 2 && (
        <div className="card p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#edf2f7] pb-3 gap-2">
            <div>
              <h2 className="text-lg font-bold text-[#063b78]">
                {lang === 'bn' ? 'পরীক্ষার বিষয়সমূহ' : 'Exam Subjects'}
              </h2>
              <p className="text-[12.5px] text-[#64748b]">
                {lang === 'bn'
                  ? 'প্রতিটি বিষয়ের পরীক্ষার তারিখ, সময়, পূর্ণমান ও পাস নম্বর নির্ধারণ করুন'
                  : 'Specify exam date, time, total marks and pass marks for each subject'}
              </p>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setNewSubjectModal(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[12.5px] font-bold text-[#063b78] hover:bg-[#f8fafc] transition-colors"
              >
                <Icon name="plus" size={14} />
                <span>{lang === 'bn' ? 'কাস্টম বিষয়' : 'Custom Subject'}</span>
              </button>
              <button
                type="button"
                onClick={() => addSubjectRow()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#063b78] px-4 py-2 text-[12.5px] font-bold text-white hover:bg-[#084b96] transition-colors"
              >
                <Icon name="plus" size={15} />
                <span>{lang === 'bn' ? 'বিষয় যুক্ত করুন' : 'Add Subject'}</span>
              </button>
            </div>
          </div>

          {subjects.length === 0 ? (
            <div className="py-12 px-4 text-center border-2 border-dashed border-[#dce5f0] rounded-2xl">
              <Icon name="book" size={32} className="text-[#64748b] mx-auto mb-2 opacity-50" />
              <p className="text-[14px] font-bold text-[#092f63]">
                {lang === 'bn' ? 'এখনও কোনো বিষয় যুক্ত করা হয়নি' : 'No subjects added yet'}
              </p>

              {availableSubjects.length === 0 ? (
                <div className="max-w-md mx-auto mt-2">
                  <p className="text-[12px] text-[#64748b] mb-4">
                    {lang === 'bn'
                      ? 'এই শ্রেণির জন্য কোনো বিষয় পাওয়া যায়নি। এক ক্লিকে স্ট্যান্ডার্ড এনসিটিবি বিষয়সমূহ লোড করুন অথবা নতুন বিষয় তৈরি করুন।'
                      : 'No catalog subjects found for this class. You can automatically populate standard NCTB subjects with 1 click or create custom subjects.'}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      disabled={seedingSubjects}
                      onClick={handleSeedSubjects}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#063b78] px-4 py-2.5 text-[12.5px] font-bold text-white hover:bg-[#084b96] transition-colors shadow-xs disabled:opacity-60"
                    >
                      {seedingSubjects ? (
                        <div className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-solid border-white border-r-transparent" />
                      ) : (
                        <Icon name="check" size={14} />
                      )}
                      <span>
                        {seedingSubjects
                          ? (lang === 'bn' ? 'লোড হচ্ছে…' : 'Loading…')
                          : (lang === 'bn' ? 'স্ট্যান্ডার্ড বিষয়সমূহ লোড করুন' : 'Load Standard NCTB Subjects')}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewSubjectModal(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#063b78] bg-white px-4 py-2.5 text-[12.5px] font-bold text-[#063b78] hover:bg-[#eef3fa] transition-colors"
                    >
                      <Icon name="plus" size={14} />
                      <span>{lang === 'bn' ? 'নতুন বিষয় তৈরি করুন' : 'Create Custom Subject'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-[12px] text-[#64748b] mt-1 mb-4">
                    {lang === 'bn'
                      ? 'নিচের বোতামে ক্লিক করে দ্রুত বিষয় যুক্ত করুন'
                      : 'Click any subject below to quickly add it to this exam'}
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 max-w-[650px] mx-auto">
                    {availableSubjects.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => addSubjectRow(s.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#dce5f0] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#092f63] hover:border-[#063b78] hover:text-[#063b78] transition-colors"
                      >
                        <Icon name="plus" size={13} />
                        <span>{lang === 'bn' && s.banglaName ? s.banglaName : s.name}</span>
                        {s.code && <span className="text-[10px] text-[#64748b] font-mono">({s.code})</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {subjects.map((sub, index) => {
                return (
                  <div
                    key={index}
                    className="p-4 rounded-xl border border-[#dce5f0] bg-[#f8fafc] flex flex-col md:flex-row gap-3 items-start md:items-center justify-between"
                  >
                    <div className="w-full md:w-[220px]">
                      <label className="block text-[11px] font-bold text-[#64748b] mb-1">
                        {lang === 'bn' ? 'বিষয় *' : 'Subject *'}
                      </label>
                      <select
                        value={sub.subjectId}
                        onChange={(e) => updateSubjectRow(index, 'subjectId', e.target.value)}
                        className="w-full rounded-lg border border-[#dce5f0] px-3 py-1.5 text-[13px] text-[#092f63] focus:border-[#063b78] focus:outline-none bg-white font-medium"
                      >
                        <option value="">{lang === 'bn' ? 'বিষয় বেছে নিন' : 'Select Subject'}</option>
                        {availableSubjects.map((s) => (
                          <option key={s.id} value={s.id}>
                            {lang === 'bn' && s.banglaName ? s.banglaName : s.name} {s.code ? `(${s.code})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 flex-1 w-full">
                      <div>
                        <label className="block text-[11px] font-bold text-[#64748b] mb-1">
                          {lang === 'bn' ? 'তারিখ' : 'Date'}
                        </label>
                        <input
                          type="date"
                          value={sub.examDate || ''}
                          onChange={(e) => updateSubjectRow(index, 'examDate', e.target.value)}
                          className="w-full rounded-lg border border-[#dce5f0] px-2.5 py-1.5 text-[12px] text-[#092f63] focus:border-[#063b78] focus:outline-none bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-[#64748b] mb-1">
                          {lang === 'bn' ? 'সময় (মিনিট)' : 'Duration (min)'}
                        </label>
                        <input
                          type="number"
                          min="5"
                          value={sub.duration || ''}
                          onChange={(e) => updateSubjectRow(index, 'duration', Number(e.target.value))}
                          placeholder="e.g. 90"
                          className="w-full rounded-lg border border-[#dce5f0] px-2.5 py-1.5 text-[12px] text-[#092f63] focus:border-[#063b78] focus:outline-none bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-[#64748b] mb-1">
                          {lang === 'bn' ? 'পূর্ণমান *' : 'Total Marks *'}
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={sub.totalMarks}
                          onChange={(e) => updateSubjectRow(index, 'totalMarks', Number(e.target.value))}
                          className="w-full rounded-lg border border-[#dce5f0] px-2.5 py-1.5 text-[12px] text-[#092f63] focus:border-[#063b78] focus:outline-none bg-white font-bold"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-[#64748b] mb-1">
                          {lang === 'bn' ? 'পাস নম্বর *' : 'Pass Marks *'}
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={sub.passMarks}
                          onChange={(e) => updateSubjectRow(index, 'passMarks', Number(e.target.value))}
                          className="w-full rounded-lg border border-[#dce5f0] px-2.5 py-1.5 text-[12px] text-[#092f63] focus:border-[#063b78] focus:outline-none bg-white font-bold"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeSubjectRow(index)}
                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 self-end md:self-center transition-colors"
                      title={lang === 'bn' ? 'মুছে ফেলুন' : 'Remove subject'}
                    >
                      <Icon name="x" size={18} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-between pt-4 border-t border-[#edf2f7]">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-2 rounded-xl border border-[#dce5f0] px-5 py-2.5 text-[13.5px] font-semibold text-[#092f63] hover:bg-[#f8fafc] transition-colors"
            >
              <Icon name="chevronleft" size={16} />
              <span>{lang === 'bn' ? 'পূর্ববর্তী' : 'Previous'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (validateStep2()) setStep(3);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-[#063b78] px-6 py-2.5 text-[13.5px] font-semibold text-white hover:bg-[#084b96] transition-colors"
            >
              <span>{lang === 'bn' ? 'পরবর্তী: শিক্ষার্থী নির্বাচন' : 'Next: Select Students'}</span>
              <Icon name="chevronright" size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Students Enrollment */}
      {step === 3 && (
        <div className="card p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-6">
          <div className="border-b border-[#edf2f7] pb-3">
            <h2 className="text-lg font-bold text-[#063b78]">
              {lang === 'bn' ? 'পরীক্ষার্থী নির্বাচন' : 'Student Enrollment'}
            </h2>
            <p className="text-[12.5px] text-[#64748b]">
              {lang === 'bn'
                ? 'নির্বাচিত শ্রেণি ও ব্যাচের প্রকৃত শিক্ষার্থীদের তালিকা থেকে অন্তর্ভুক্ত করুন'
                : 'Enroll students from active roster. Manual student ID typing is restricted.'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#f8fafc] border border-[#dce5f0]">
            <div>
              <span className="text-[13px] font-bold text-[#092f63] block">
                {lang === 'bn' ? 'অন্তর্ভুক্তির ধরন' : 'Enrollment Strategy'}
              </span>
              <span className="text-[12px] text-[#64748b]">
                {enrollAll
                  ? lang === 'bn'
                    ? 'সকল যোগ্য শিক্ষার্থীকে সরাসরি পরীক্ষায় অন্তর্ভুক্ত করা হবে'
                    : 'All eligible students in this academic context will be enrolled'
                  : lang === 'bn'
                  ? 'নিচের তালিকা থেকে বাছাইকৃত শিক্ষার্থীদের অন্তর্ভুক্ত করা হবে'
                  : 'Only specifically checked students below will be enrolled'}
              </span>
            </div>

            <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-[#dce5f0]">
              <button
                type="button"
                onClick={() => {
                  setEnrollAll(true);
                  setSelectedStudentIds(eligibleStudents.map((s) => s.id));
                }}
                className={`px-3.5 py-1.5 rounded-lg text-[12px] font-bold transition-all ${
                  enrollAll ? 'bg-[#063b78] text-white shadow-xs' : 'text-[#64748b] hover:text-[#092f63]'
                }`}
              >
                {lang === 'bn' ? 'সকল যোগ্য শিক্ষার্থী' : 'All Eligible'}
              </button>
              <button
                type="button"
                onClick={() => setEnrollAll(false)}
                className={`px-3.5 py-1.5 rounded-lg text-[12px] font-bold transition-all ${
                  !enrollAll ? 'bg-[#063b78] text-white shadow-xs' : 'text-[#64748b] hover:text-[#092f63]'
                }`}
              >
                {lang === 'bn' ? 'বাছাইকৃত শিক্ষার্থী' : 'Select Manually'}
              </button>
            </div>
          </div>

          {/* Student Search & Quick Select */}
          {!enrollAll && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Icon name="search" size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748b]" />
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder={lang === 'bn' ? 'নাম, আইডি বা রোল দিয়ে খুঁজুন…' : 'Search by name, ID or roll…'}
                  className="w-full rounded-xl border border-[#dce5f0] pl-10 pr-3.5 py-2 text-[13px] text-[#092f63] focus:border-[#063b78] focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedStudentIds(eligibleStudents.map((s) => s.id))}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-[#dce5f0] hover:bg-[#f8fafc] text-[#063b78]"
                >
                  {lang === 'bn' ? 'সব নির্বাচন' : 'Select All'}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedStudentIds([])}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-[#dce5f0] hover:bg-[#f8fafc] text-[#64748b]"
                >
                  {lang === 'bn' ? 'সব বাতিল' : 'Clear All'}
                </button>
              </div>
            </div>
          )}

          {/* Student Roster Table */}
          {loadingStudents ? (
            <div className="py-12 text-center text-[#64748b]">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
              <p className="mt-2 text-[13px] font-medium">
                {lang === 'bn' ? 'শিক্ষার্থী তালিকা লোড হচ্ছে…' : 'Loading student roster…'}
              </p>
            </div>
          ) : eligibleStudents.length === 0 ? (
            <div className="py-10 text-center border-2 border-dashed border-[#dce5f0] rounded-2xl">
              <Icon name="user" size={32} className="text-[#64748b] mx-auto mb-2 opacity-50" />
              <p className="text-[14px] font-bold text-[#092f63]">
                {lang === 'bn' ? 'কোনো শিক্ষার্থী পাওয়া যায়নি' : 'No eligible students found'}
              </p>
              <p className="text-[12px] text-[#64748b] mt-1">
                {lang === 'bn'
                  ? 'এই শিক্ষাবর্ষ এবং শ্রেণিতে কোনো শিক্ষার্থী ভর্তি বা ব্যাচে নেই।'
                  : 'No active enrollments or batch assignments exist for this academic context.'}
              </p>
            </div>
          ) : (
            <div className="border border-[#dce5f0] rounded-xl overflow-hidden">
              <div className="bg-[#f8fafc] px-4 py-2.5 border-b border-[#dce5f0] flex items-center justify-between text-[12px] font-bold text-[#64748b]">
                <span>
                  {lang === 'bn'
                    ? `মোট যোগ্য শিক্ষার্থী: ${toBanglaNumeral(eligibleStudents.length)} জন | নির্বাচিত: ${toBanglaNumeral(
                        enrollAll ? eligibleStudents.length : selectedStudentIds.length
                      )} জন`
                    : `Total Eligible: ${eligibleStudents.length} | Selected: ${
                        enrollAll ? eligibleStudents.length : selectedStudentIds.length
                      }`}
                </span>
              </div>
              <div className="max-h-[360px] overflow-y-auto divide-y divide-[#edf2f7]">
                {filteredStudents.map((st) => {
                  const isSelected = enrollAll || selectedStudentIds.includes(st.id);
                  return (
                    <div
                      key={st.id}
                      onClick={() => {
                        if (enrollAll) return;
                        if (selectedStudentIds.includes(st.id)) {
                          setSelectedStudentIds(selectedStudentIds.filter((id) => id !== st.id));
                        } else {
                          setSelectedStudentIds([...selectedStudentIds, st.id]);
                        }
                      }}
                      className={`px-4 py-3 flex items-center justify-between transition-colors ${
                        !enrollAll ? 'cursor-pointer hover:bg-[#f8fafc]' : ''
                      } ${isSelected ? 'bg-blue-50/40' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={enrollAll}
                          onChange={() => {}}
                          className="h-4 w-4 rounded border-gray-300 text-[#063b78] focus:ring-[#063b78]"
                        />
                        <div>
                          <div className="font-bold text-[13.5px] text-[#092f63]">
                            {lang === 'bn' && st.banglaName ? st.banglaName : st.name}
                          </div>
                          <div className="text-[11.5px] text-[#64748b] flex items-center gap-2">
                            <span className="font-mono">{st.studentIdCode}</span>
                            {st.rollNumber && (
                              <span>
                                • {lang === 'bn' ? 'রোল:' : 'Roll:'} {st.rollNumber}
                              </span>
                            )}
                            {st.batchName && (
                              <span className="rounded bg-gray-100 px-1.5 py-0.2 text-[10.5px]">
                                {st.batchName}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <span
                        className={`text-[11.5px] font-bold px-2 py-0.5 rounded ${
                          isSelected ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {isSelected
                          ? lang === 'bn'
                            ? 'নির্বাচিত'
                            : 'Enrolled'
                          : lang === 'bn'
                          ? 'বাদ'
                          : 'Excluded'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-between pt-4 border-t border-[#edf2f7]">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-2 rounded-xl border border-[#dce5f0] px-5 py-2.5 text-[13.5px] font-semibold text-[#092f63] hover:bg-[#f8fafc] transition-colors"
            >
              <Icon name="chevronleft" size={16} />
              <span>{lang === 'bn' ? 'পূর্ববর্তী' : 'Previous'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (validateStep3()) setStep(4);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-[#063b78] px-6 py-2.5 text-[13.5px] font-semibold text-white hover:bg-[#084b96] transition-colors"
            >
              <span>{lang === 'bn' ? 'পরবর্তী: পর্যালোচনা' : 'Next: Review & Finalize'}</span>
              <Icon name="chevronright" size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Review & Finalize */}
      {step === 4 && (
        <div className="card p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-6">
          <div className="border-b border-[#edf2f7] pb-3">
            <h2 className="text-lg font-bold text-[#063b78]">
              {lang === 'bn' ? 'পরীক্ষা চূড়ান্ত পর্যালোচনা' : 'Review Exam Configuration'}
            </h2>
            <p className="text-[12.5px] text-[#64748b]">
              {lang === 'bn'
                ? 'তৈরি করার পূর্বে সকল তথ্য ভালোভাবে যাচাই করে নিন'
                : 'Double-check all configurations before creating the exam record'}
            </p>
          </div>

          {/* Exam Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-[#dce5f0] bg-[#f8fafc]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748b] block mb-2">
                {lang === 'bn' ? 'পরীক্ষার বিবরণ' : 'Exam Details'}
              </span>
              <div className="flex flex-col gap-1.5 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-[#64748b]">{lang === 'bn' ? 'শিরোনাম:' : 'Title:'}</span>
                  <span className="font-bold text-[#092f63]">{title}</span>
                </div>
                {banglaTitle && (
                  <div className="flex justify-between">
                    <span className="text-[#64748b]">{lang === 'bn' ? 'বাংলা নাম:' : 'Bangla Title:'}</span>
                    <span className="font-bold text-[#092f63]">{banglaTitle}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[#64748b]">{lang === 'bn' ? 'ধরন:' : 'Type:'}</span>
                  <span className="font-semibold text-[#063b78]">
                    {examType === 'Other' ? customExamType : examType}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748b]">{lang === 'bn' ? 'তারিখ:' : 'Dates:'}</span>
                  <span className="font-medium text-[#092f63]">
                    {startDate || '—'} {endDate ? `থেকে ${endDate}` : ''}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-[#dce5f0] bg-[#f8fafc]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748b] block mb-2">
                {lang === 'bn' ? 'একাডেমিক কাঠামো' : 'Academic Context'}
              </span>
              <div className="flex flex-col gap-1.5 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-[#64748b]">{lang === 'bn' ? 'শিক্ষাবর্ষ:' : 'Session:'}</span>
                  <span className="font-semibold text-[#092f63]">
                    {sessions.find((s) => s.id === academicSessionId)?.name || '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748b]">{lang === 'bn' ? 'প্রোগ্রাম ও শ্রেণি:' : 'Program & Class:'}</span>
                  <span className="font-semibold text-[#092f63]">
                    {selectedProgram?.name || '—'} • {selectedClass?.name || '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748b]">{lang === 'bn' ? 'ব্যাচ:' : 'Batch:'}</span>
                  <span className="font-semibold text-[#092f63]">
                    {batchId ? batches.find((b) => b.id === batchId)?.name || '—' : (lang === 'bn' ? 'সকল ব্যাচ' : 'All Batches')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748b]">{lang === 'bn' ? 'পরীক্ষার্থী সংখ্যা:' : 'Enrolled Students:'}</span>
                  <span className="font-bold text-emerald-700">
                    {enrollAll ? eligibleStudents.length : selectedStudentIds.length} {lang === 'bn' ? 'জন' : 'students'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Subjects Table in Review */}
          <div>
            <h3 className="text-[13.5px] font-bold text-[#092f63] mb-2.5">
              {lang === 'bn' ? `বিষয়সমূহ (${toBanglaNumeral(subjects.length)}টি)` : `Subjects (${subjects.length})`}
            </h3>
            <div className="border border-[#dce5f0] rounded-xl overflow-hidden">
              <table className="w-full text-left text-[12.5px]">
                <thead className="bg-[#f8fafc] border-b border-[#dce5f0] text-[#64748b]">
                  <tr>
                    <th className="px-4 py-2.5 font-bold">#</th>
                    <th className="px-4 py-2.5 font-bold">{lang === 'bn' ? 'বিষয়' : 'Subject'}</th>
                    <th className="px-4 py-2.5 font-bold">{lang === 'bn' ? 'তারিখ' : 'Date'}</th>
                    <th className="px-4 py-2.5 font-bold">{lang === 'bn' ? 'সময়কাল' : 'Duration'}</th>
                    <th className="px-4 py-2.5 font-bold text-right">{lang === 'bn' ? 'পূর্ণমান' : 'Total Marks'}</th>
                    <th className="px-4 py-2.5 font-bold text-right">{lang === 'bn' ? 'পাস নম্বর' : 'Pass Marks'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf2f7]">
                  {subjects.map((s, idx) => {
                    const subObj = availableSubjects.find((sub) => sub.id === s.subjectId);
                    return (
                      <tr key={idx} className="hover:bg-[#f8fafc]">
                        <td className="px-4 py-2.5 text-[#64748b] font-mono">{idx + 1}</td>
                        <td className="px-4 py-2.5 font-bold text-[#092f63]">
                          {lang === 'bn' && subObj?.banglaName ? subObj.banglaName : subObj?.name || 'Subject'}
                        </td>
                        <td className="px-4 py-2.5 text-[#64748b]">{s.examDate || '—'}</td>
                        <td className="px-4 py-2.5 text-[#64748b]">{s.duration ? `${s.duration} min` : '—'}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-[#092f63]">{s.totalMarks}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-emerald-700">{s.passMarks}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t border-[#edf2f7]">
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl border border-[#dce5f0] px-5 py-2.5 text-[13.5px] font-semibold text-[#092f63] hover:bg-[#f8fafc] transition-colors disabled:opacity-50"
            >
              <Icon name="chevronleft" size={16} />
              <span>{lang === 'bn' ? 'পূর্ববর্তী' : 'Previous'}</span>
            </button>

            <button
              type="button"
              onClick={handleFinalSubmit}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-7 py-2.5 text-[14px] font-bold text-white hover:bg-emerald-700 transition-colors shadow-xs disabled:opacity-50"
            >
              {submitting ? (
                <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-r-transparent" />
              ) : (
                <Icon name="check" size={17} />
              )}
              <span>{submitting ? (lang === 'bn' ? 'তৈরি হচ্ছে…' : 'Creating…') : (lang === 'bn' ? 'পরীক্ষা চূড়ান্তভাবে তৈরি করুন' : 'Confirm & Create Exam')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Modal: Create Custom Subject */}
      {newSubjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-[#dce5f0] space-y-4">
            <div className="flex items-center justify-between border-b border-[#edf2f7] pb-3">
              <div>
                <h3 className="text-base font-bold text-[#063b78]">
                  {lang === 'bn' ? 'নতুন বিষয় তৈরি করুন' : 'Create Custom Subject'}
                </h3>
                <p className="text-[12px] text-[#64748b]">
                  {lang === 'bn'
                    ? `${selectedClass?.name || 'শ্রেণি'}-এর জন্য পাঠ্যসূচিতে বিষয় যুক্ত করুন`
                    : `Add a subject to ${selectedClass?.name || 'class'} catalog`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewSubjectModal(false)}
                className="rounded-lg p-1.5 text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#092f63]"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubject} className="space-y-3.5">
              <div>
                <label className="block text-[12px] font-bold text-[#092f63] mb-1">
                  {lang === 'bn' ? 'বিষয়ের নাম (English) *' : 'Subject Name (English) *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Higher Mathematics 1st Paper"
                  value={newSubjectForm.name}
                  onChange={(e) => setNewSubjectForm({ ...newSubjectForm, name: e.target.value })}
                  className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2 text-[13px] text-[#092f63] focus:border-[#063b78] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[12px] font-bold text-[#092f63] mb-1">
                  {lang === 'bn' ? 'বিষয়ের নাম (বাংলা)' : 'Bangla Name (বাংলা)'}
                </label>
                <input
                  type="text"
                  placeholder="যেমন: উচ্চতর গণিত ১ম পত্র"
                  value={newSubjectForm.banglaName}
                  onChange={(e) => setNewSubjectForm({ ...newSubjectForm, banglaName: e.target.value })}
                  className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2 text-[13px] text-[#092f63] focus:border-[#063b78] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[12px] font-bold text-[#092f63] mb-1">
                  {lang === 'bn' ? 'বিষয় কোড (Code) *' : 'Subject Code *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. HMATH1"
                  value={newSubjectForm.code}
                  onChange={(e) => setNewSubjectForm({ ...newSubjectForm, code: e.target.value.toUpperCase() })}
                  className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2 text-[13px] font-mono text-[#092f63] focus:border-[#063b78] focus:outline-none"
                />
              </div>

              {availableGroups.length > 0 && (
                <div>
                  <label className="block text-[12px] font-bold text-[#092f63] mb-1">
                    {lang === 'bn' ? 'গ্রুপ / বিভাগ (ঐচ্ছিক)' : 'Academic Group (Optional)'}
                  </label>
                  <select
                    value={newSubjectForm.academicGroupId}
                    onChange={(e) => setNewSubjectForm({ ...newSubjectForm, academicGroupId: e.target.value })}
                    className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2 text-[13px] text-[#092f63] focus:border-[#063b78] focus:outline-none bg-white"
                  >
                    <option value="">{lang === 'bn' ? 'সকল গ্রুপ / আবশ্যিক' : 'All Groups / Compulsory'}</option>
                    {availableGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} {g.banglaName ? `(${g.banglaName})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-[#edf2f7]">
                <button
                  type="button"
                  onClick={() => setNewSubjectModal(false)}
                  className="rounded-xl border border-[#dce5f0] px-4 py-2 text-[12.5px] font-semibold text-[#64748b] hover:bg-[#f8fafc]"
                >
                  {lang === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={creatingSubject}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#063b78] px-5 py-2 text-[12.5px] font-bold text-white hover:bg-[#084b96] transition-colors disabled:opacity-50"
                >
                  {creatingSubject && (
                    <div className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-solid border-white border-r-transparent" />
                  )}
                  <span>{creatingSubject ? (lang === 'bn' ? 'তৈরি হচ্ছে…' : 'Creating…') : (lang === 'bn' ? 'তৈরি ও যুক্ত করুন' : 'Create & Add to Exam')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
