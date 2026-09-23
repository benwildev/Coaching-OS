'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';
import {
  type AdmissionInput,
  GUARDIAN_RELATIONS,
  COMMUNICATION_CHANNELS,
  BLOOD_GROUPS,
  isValidBdPhone,
} from '@/lib/validations/student';

interface HierarchyData {
  sessions: Array<{ id: string; name: string; banglaName?: string | null; isCurrent: boolean }>;
  branches: Array<{ id: string; name: string; banglaName?: string | null; isMain: boolean }>;
  programs: Array<{
    id: string;
    name: string;
    banglaName?: string | null;
    classes: Array<{
      id: string;
      name: string;
      banglaName?: string | null;
      groups: Array<{ id: string; name: string; banglaName?: string | null }>;
    }>;
  }>;
  courses: Array<{
    id: string;
    name: string;
    banglaName?: string | null;
    academicProgramId: string;
    academicClassId: string;
    academicGroupId?: string | null;
    fee: number;
  }>;
  batches: Array<{
    id: string;
    name: string;
    banglaName?: string | null;
    code: string;
    branchId: string;
    academicSessionId: string;
    academicProgramId: string;
    academicClassId: string;
    academicGroupId?: string | null;
    capacity: number;
  }>;
  boards: Array<{ id: string; name: string; banglaName?: string | null; code: string }>;
}

export default function NewStudentPage() {
  const router = useRouter();
  const { lang, showToast } = useApp();
  const dict = DICTIONARY[lang];

  const [step, setStep] = useState<number>(1);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Hierarchy Options
  const [options, setOptions] = useState<HierarchyData>({
    sessions: [],
    branches: [],
    programs: [],
    courses: [],
    batches: [],
    boards: [],
  });
  const [optionsLoading, setOptionsLoading] = useState(true);

  // Form State
  const [form, setForm] = useState<AdmissionInput>({
    // Step 1: Student
    name: '',
    banglaName: '',
    gender: 'MALE',
    dob: '',
    bloodGroup: '',
    religion: 'Islam',
    nationality: 'Bangladeshi',
    phone: '',
    email: '',
    photoUrl: '',
    address: '',
    permanentAddress: '',
    schoolName: '',
    educationBoardId: '',
    nidBirthReg: '',
    sscRoll: '',
    sscReg: '',

    // Step 2: Guardian
    guardianName: '',
    guardianBanglaName: '',
    guardianRelationship: 'FATHER',
    guardianPhone: '',
    guardianAltPhone: '',
    guardianWhatsapp: '',
    guardianEmail: '',
    guardianOccupation: '',
    guardianAddress: '',
    preferredChannel: 'SMS',
    hasSecondaryGuardian: false,
    secondaryName: '',
    secondaryRelationship: 'MOTHER',
    secondaryPhone: '',

    // Step 3: Academic
    academicSessionId: '',
    branchId: '',
    academicProgramId: '',
    academicClassId: '',
    academicGroupId: '',
    courseId: '',
    rollNumber: '',
    admissionDate: new Date().toISOString().split('T')[0],

    // Step 4: Batch
    batchId: '',
    remarks: '',
  });

  // Load academic hierarchy
  useEffect(() => {
    async function loadOptions() {
      try {
        const res = await fetch('/api/academic/options');
        if (res.ok) {
          const data: HierarchyData = await res.json();
          setOptions(data);

          // Set sensible defaults if available
          const currentSession = data.sessions.find((s) => s.isCurrent) || data.sessions[0];
          const mainBranch = data.branches.find((b) => b.isMain) || data.branches[0];
          const defaultProgram = data.programs[0];
          const defaultClass = defaultProgram?.classes[0];
          const defaultGroup = defaultClass?.groups[0];

          setForm((prev) => ({
            ...prev,
            academicSessionId: currentSession?.id || '',
            branchId: mainBranch?.id || '',
            academicProgramId: defaultProgram?.id || '',
            academicClassId: defaultClass?.id || '',
            academicGroupId: defaultGroup?.id || '',
          }));
        }
      } catch (err) {
        console.error('Failed to load academic options', err);
      } finally {
        setOptionsLoading(false);
      }
    }
    loadOptions();
  }, []);

  // Filter dependent classes based on program
  const selectedProgram = options.programs.find((p) => p.id === form.academicProgramId);
  const availableClasses = selectedProgram ? selectedProgram.classes : [];

  // Filter dependent groups based on class
  const selectedClass = availableClasses.find((c) => c.id === form.academicClassId);
  const availableGroups = selectedClass ? selectedClass.groups : [];

  // Filter dependent courses
  const availableCourses = options.courses.filter((c) => {
    if (c.academicProgramId !== form.academicProgramId) return false;
    if (c.academicClassId !== form.academicClassId) return false;
    if (form.academicGroupId && c.academicGroupId && c.academicGroupId !== form.academicGroupId) {
      return false;
    }
    return true;
  });

  // Filter dependent batches (matching branch, session, program, class, group)
  const availableBatches = options.batches.filter((b) => {
    if (b.branchId !== form.branchId) return false;
    if (b.academicSessionId !== form.academicSessionId) return false;
    if (b.academicProgramId !== form.academicProgramId) return false;
    if (b.academicClassId !== form.academicClassId) return false;
    if (form.academicGroupId && b.academicGroupId && b.academicGroupId !== form.academicGroupId) {
      return false;
    }
    return true;
  });

  // Step Validation before continuing
  const validateStep = (): boolean => {
    setError(null);

    if (step === 1) {
      if (!form.name.trim()) {
        setError(lang === 'bn' ? 'শিক্ষার্থীর ইংরেজি নাম আবশ্যক।' : 'Student English name is required.');
        return false;
      }
      if (form.phone && !isValidBdPhone(form.phone)) {
        setError(
          lang === 'bn'
            ? 'সঠিক বাংলাদেশি মোবাইল নম্বর দিন (১১ ডিজিট, যেমন: 017XXXXXXXX)।'
            : 'Enter a valid Bangladeshi mobile number (11 digits, e.g. 017XXXXXXXX).'
        );
        return false;
      }
    }

    if (step === 2) {
      if (!form.guardianName.trim()) {
        setError(lang === 'bn' ? 'অভিভাবকের নাম আবশ্যক।' : 'Guardian name is required.');
        return false;
      }
      if (!form.guardianPhone.trim() || !isValidBdPhone(form.guardianPhone)) {
        setError(
          lang === 'bn'
            ? 'অভিভাবকের সঠিক বাংলাদেশি মোবাইল নম্বর আবশ্যক।'
            : 'Valid Bangladeshi mobile number is required for guardian.'
        );
        return false;
      }
      if (form.guardianAltPhone && !isValidBdPhone(form.guardianAltPhone)) {
        setError(lang === 'bn' ? 'বিকল্প মোবাইল নম্বর সঠিক নয়।' : 'Invalid alternative mobile number.');
        return false;
      }
      if (form.hasSecondaryGuardian && form.secondaryPhone && !isValidBdPhone(form.secondaryPhone)) {
        setError(lang === 'bn' ? 'দ্বিতীয় অভিভাবকের মোবাইল নম্বর সঠিক নয়।' : 'Invalid secondary guardian mobile number.');
        return false;
      }
    }

    if (step === 3) {
      if (!form.academicSessionId) {
        setError(lang === 'bn' ? 'শিক্ষাবর্ষ নির্বাচন করুন।' : 'Please select an academic session.');
        return false;
      }
      if (!form.branchId) {
        setError(lang === 'bn' ? 'শাখা / ক্যাম্পাস নির্বাচন করুন।' : 'Please select a branch.');
        return false;
      }
      if (!form.academicProgramId) {
        setError(lang === 'bn' ? 'একাডেমিক প্রোগ্রাম নির্বাচন করুন।' : 'Please select an academic program.');
        return false;
      }
      if (!form.academicClassId) {
        setError(lang === 'bn' ? 'শ্রেণি নির্বাচন করুন।' : 'Please select a class.');
        return false;
      }
    }

    return true;
  };

  const handleNext = () => {
    if (validateStep()) {
      setStep((prev) => Math.min(5, prev + 1));
    }
  };

  const handlePrev = () => {
    setError(null);
    setStep((prev) => Math.max(1, prev - 1));
  };

  // Complete Admission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to complete admission');
      }

      showToast(dict.admission.successToast);
      router.push(`/students/${data.student.id}`);
    } catch (err: any) {
      setError(err?.message || 'Failed to complete admission');
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-[1000px] mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/students"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#063b78] hover:underline mb-1"
          >
            <Icon name="chevronleft" size={15} />
            <span>{dict.profile.back}</span>
          </Link>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#063b78] tracking-tight">
            {dict.admission.title}
          </h1>
          <p className="text-[13.5px] text-[#64748b] font-medium mt-0.5">
            {dict.admission.subtitle}
          </p>
        </div>
      </div>

      {/* Stepper Progress Bar */}
      <div className="card p-4 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
        <div className="grid grid-cols-5 gap-2 text-center">
          {[
            { num: 1, label: dict.admission.step1 },
            { num: 2, label: dict.admission.step2 },
            { num: 3, label: dict.admission.step3 },
            { num: 4, label: dict.admission.step4 },
            { num: 5, label: dict.admission.step5 },
          ].map((s) => {
            const isDone = s.num < step;
            const isCurrent = s.num === step;

            return (
              <div key={s.num} className="flex flex-col items-center gap-1.5">
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors ${
                    isCurrent
                      ? 'bg-[#063b78] text-white ring-4 ring-blue-100'
                      : isDone
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {isDone ? <Icon name="check" size={14} /> : s.num}
                </div>
                <span
                  className={`text-[11.5px] font-semibold hidden sm:inline truncate max-w-full ${
                    isCurrent
                      ? 'text-[#063b78]'
                      : isDone
                      ? 'text-emerald-600'
                      : 'text-slate-400'
                  }`}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[13.5px] font-medium flex items-center gap-2.5">
          <Icon name="alert" size={18} className="shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Admission Form Card */}
      <div className="card p-6 md:p-8 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
        {optionsLoading ? (
          <div className="py-12 text-center text-[#64748b]">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
            <p className="mt-3 text-[14px] font-medium">Loading form configuration…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            {/* STEP 1: Student Information */}
            {step === 1 && (
              <div className="flex flex-col gap-5">
                <div className="border-b border-[#edf2f7] pb-3">
                  <h2 className="text-lg font-bold text-[#063b78]">
                    {dict.admission.step1Title}
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Full Name English */}
                  <div>
                    <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                      {dict.admission.fullName} <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. Tanvir Ahmed"
                      className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78]"
                    />
                  </div>

                  {/* Bangla Name */}
                  <div>
                    <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                      {dict.admission.banglaName}
                    </label>
                    <input
                      type="text"
                      value={form.banglaName || ''}
                      onChange={(e) => setForm({ ...form, banglaName: e.target.value })}
                      placeholder="যেমন: তানভীর আহমেদ"
                      className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78]"
                    />
                  </div>

                  {/* Gender */}
                  <div>
                    <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                      {dict.admission.gender}
                    </label>
                    <select
                      value={form.gender || 'MALE'}
                      onChange={(e) => setForm({ ...form, gender: e.target.value as any })}
                      className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78] bg-white"
                    >
                      <option value="MALE">{lang === 'bn' ? 'পুরুষ' : 'Male'}</option>
                      <option value="FEMALE">{lang === 'bn' ? 'নারী' : 'Female'}</option>
                      <option value="OTHER">{lang === 'bn' ? 'অন্যান্য' : 'Other'}</option>
                    </select>
                  </div>

                  {/* Date of Birth */}
                  <div>
                    <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                      {dict.admission.dob}
                    </label>
                    <input
                      type="date"
                      value={form.dob || ''}
                      onChange={(e) => setForm({ ...form, dob: e.target.value })}
                      className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78] bg-white"
                    />
                  </div>

                  {/* Blood Group */}
                  <div>
                    <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                      {dict.admission.bloodGroup}
                    </label>
                    <select
                      value={form.bloodGroup || ''}
                      onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}
                      className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78] bg-white"
                    >
                      <option value="">{lang === 'bn' ? 'নির্বাচন করুন' : 'Select blood group'}</option>
                      {BLOOD_GROUPS.map((bg) => (
                        <option key={bg} value={bg}>{bg}</option>
                      ))}
                    </select>
                  </div>

                  {/* Student Mobile */}
                  <div>
                    <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                      {dict.admission.studentPhone}
                    </label>
                    <input
                      type="tel"
                      value={form.phone || ''}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="01XXXXXXXXX"
                      className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] font-mono text-[#092f63] outline-none focus:border-[#063b78]"
                    />
                  </div>

                  {/* Student Email */}
                  <div>
                    <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                      {dict.admission.studentEmail}
                    </label>
                    <input
                      type="email"
                      value={form.email || ''}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="student@example.com"
                      className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78]"
                    />
                  </div>

                  {/* Current School / College */}
                  <div>
                    <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                      {dict.admission.schoolName}
                    </label>
                    <input
                      type="text"
                      value={form.schoolName || ''}
                      onChange={(e) => setForm({ ...form, schoolName: e.target.value })}
                      placeholder="e.g. Notre Dame College / Ideal School"
                      className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78]"
                    />
                  </div>

                  {/* Optional NID / BRN */}
                  <div>
                    <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                      {dict.admission.nidBirthReg}
                    </label>
                    <input
                      type="text"
                      value={form.nidBirthReg || ''}
                      onChange={(e) => setForm({ ...form, nidBirthReg: e.target.value })}
                      placeholder="NID or Birth Certificate number"
                      className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78]"
                    />
                  </div>

                  {/* Present Address */}
                  <div className="md:col-span-2">
                    <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                      {dict.admission.presentAddress}
                    </label>
                    <textarea
                      rows={2}
                      value={form.address || ''}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      placeholder="House / Flat / Road, Area, Thana, District"
                      className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: Guardian Information */}
            {step === 2 && (
              <div className="flex flex-col gap-5">
                <div className="border-b border-[#edf2f7] pb-3">
                  <h2 className="text-lg font-bold text-[#063b78]">
                    {dict.admission.step2Title}
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Guardian Name */}
                  <div>
                    <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                      {dict.admission.guardianName} <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={form.guardianName}
                      onChange={(e) => setForm({ ...form, guardianName: e.target.value })}
                      placeholder="e.g. Md. Rafiqul Islam"
                      className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78]"
                    />
                  </div>

                  {/* Relationship */}
                  <div>
                    <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                      {dict.admission.relation} <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={form.guardianRelationship}
                      onChange={(e) => setForm({ ...form, guardianRelationship: e.target.value as any })}
                      className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78] bg-white"
                    >
                      {GUARDIAN_RELATIONS.map((rel) => (
                        <option key={rel} value={rel}>
                          {dict.relations[rel]}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Guardian Phone */}
                  <div>
                    <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                      {dict.admission.guardianPhone} <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      value={form.guardianPhone}
                      onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })}
                      placeholder="01XXXXXXXXX"
                      className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] font-mono text-[#092f63] outline-none focus:border-[#063b78]"
                    />
                  </div>

                  {/* WhatsApp */}
                  <div>
                    <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                      {dict.admission.guardianWhatsapp}
                    </label>
                    <input
                      type="tel"
                      value={form.guardianWhatsapp || ''}
                      onChange={(e) => setForm({ ...form, guardianWhatsapp: e.target.value })}
                      placeholder="01XXXXXXXXX (if different)"
                      className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] font-mono text-[#092f63] outline-none focus:border-[#063b78]"
                    />
                  </div>

                  {/* Guardian Email */}
                  <div>
                    <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                      {dict.admission.guardianEmail}
                    </label>
                    <input
                      type="email"
                      value={form.guardianEmail || ''}
                      onChange={(e) => setForm({ ...form, guardianEmail: e.target.value })}
                      placeholder="guardian@example.com"
                      className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78]"
                    />
                  </div>

                  {/* Preferred Channel */}
                  <div>
                    <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                      {dict.admission.preferredChannel}
                    </label>
                    <select
                      value={form.preferredChannel}
                      onChange={(e) => setForm({ ...form, preferredChannel: e.target.value as any })}
                      className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78] bg-white"
                    >
                      {COMMUNICATION_CHANNELS.map((ch) => (
                        <option key={ch} value={ch}>
                          {ch === 'SMS' ? 'SMS (Short Message)' : ch === 'WHATSAPP' ? 'WhatsApp' : 'Email'}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Secondary Guardian Toggle */}
                <div className="pt-3 border-t border-[#edf2f7]">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.hasSecondaryGuardian}
                      onChange={(e) => setForm({ ...form, hasSecondaryGuardian: e.target.checked })}
                      className="h-4 w-4 rounded border-[#dce5f0] text-[#063b78] focus:ring-[#063b78]"
                    />
                    <span className="text-[13.5px] font-bold text-[#092f63]">
                      {dict.admission.hasSecondary}
                    </span>
                  </label>

                  {form.hasSecondaryGuardian && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3 p-4 rounded-xl bg-[#f8fafc] border border-[#dce5f0]">
                      <div>
                        <label className="block text-[12.5px] font-semibold text-[#092f63] mb-1">
                          {dict.admission.secondaryName}
                        </label>
                        <input
                          type="text"
                          value={form.secondaryName || ''}
                          onChange={(e) => setForm({ ...form, secondaryName: e.target.value })}
                          placeholder="Secondary guardian name"
                          className="w-full rounded-xl border border-[#dce5f0] px-3 py-2 text-[13px] text-[#092f63] bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[12.5px] font-semibold text-[#092f63] mb-1">
                          {dict.admission.secondaryRelation}
                        </label>
                        <select
                          value={form.secondaryRelationship || 'MOTHER'}
                          onChange={(e) => setForm({ ...form, secondaryRelationship: e.target.value })}
                          className="w-full rounded-xl border border-[#dce5f0] px-3 py-2 text-[13px] text-[#092f63] bg-white"
                        >
                          {GUARDIAN_RELATIONS.map((rel) => (
                            <option key={rel} value={rel}>{dict.relations[rel]}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[12.5px] font-semibold text-[#092f63] mb-1">
                          {dict.admission.secondaryPhone}
                        </label>
                        <input
                          type="tel"
                          value={form.secondaryPhone || ''}
                          onChange={(e) => setForm({ ...form, secondaryPhone: e.target.value })}
                          placeholder="01XXXXXXXXX"
                          className="w-full rounded-xl border border-[#dce5f0] px-3 py-2 text-[13px] font-mono text-[#092f63] bg-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* STEP 3: Academic Enrollment (Dependent Cascades) */}
            {step === 3 && (
              <div className="flex flex-col gap-5">
                <div className="border-b border-[#edf2f7] pb-3">
                  <h2 className="text-lg font-bold text-[#063b78]">
                    {dict.admission.step3Title}
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Session */}
                  <div>
                    <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                      {dict.admission.session} <span className="text-rose-500">*</span>
                    </label>
                    <select
                      required
                      value={form.academicSessionId}
                      onChange={(e) => setForm({ ...form, academicSessionId: e.target.value, batchId: '' })}
                      className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78] bg-white font-medium"
                    >
                      {options.sessions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {lang === 'bn' && s.banglaName ? s.banglaName : s.name} {s.isCurrent ? (lang === 'bn' ? '(বর্তমান)' : '(Current)') : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Branch / Campus */}
                  <div>
                    <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                      {dict.admission.branch} <span className="text-rose-500">*</span>
                    </label>
                    <select
                      required
                      value={form.branchId}
                      onChange={(e) => setForm({ ...form, branchId: e.target.value, batchId: '' })}
                      className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78] bg-white font-medium"
                    >
                      {options.branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {lang === 'bn' && b.banglaName ? b.banglaName : b.name} {b.isMain ? (lang === 'bn' ? '(প্রধান শাখা)' : '(Main Branch)') : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Academic Program */}
                  <div>
                    <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                      {dict.admission.program} <span className="text-rose-500">*</span>
                    </label>
                    <select
                      required
                      value={form.academicProgramId}
                      onChange={(e) => {
                        const newProgId = e.target.value;
                        const prog = options.programs.find((p) => p.id === newProgId);
                        const firstCls = prog?.classes[0];
                        const firstGrp = firstCls?.groups[0];
                        setForm({
                          ...form,
                          academicProgramId: newProgId,
                          academicClassId: firstCls?.id || '',
                          academicGroupId: firstGrp?.id || '',
                          courseId: '',
                          batchId: '',
                        });
                      }}
                      className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78] bg-white font-medium"
                    >
                      {options.programs.map((p) => (
                        <option key={p.id} value={p.id}>
                          {lang === 'bn' && p.banglaName ? p.banglaName : p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Academic Class */}
                  <div>
                    <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                      {dict.admission.class} <span className="text-rose-500">*</span>
                    </label>
                    <select
                      required
                      value={form.academicClassId}
                      onChange={(e) => {
                        const newClsId = e.target.value;
                        const cls = availableClasses.find((c) => c.id === newClsId);
                        const firstGrp = cls?.groups[0];
                        setForm({
                          ...form,
                          academicClassId: newClsId,
                          academicGroupId: firstGrp?.id || '',
                          courseId: '',
                          batchId: '',
                        });
                      }}
                      className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78] bg-white font-medium"
                    >
                      {availableClasses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {lang === 'bn' && c.banglaName ? c.banglaName : c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Academic Group (if class has groups) */}
                  {availableGroups.length > 0 && (
                    <div>
                      <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                        {dict.admission.group}
                      </label>
                      <select
                        value={form.academicGroupId || ''}
                        onChange={(e) => setForm({ ...form, academicGroupId: e.target.value, courseId: '', batchId: '' })}
                        className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78] bg-white font-medium"
                      >
                        <option value="">{lang === 'bn' ? 'সাধারণ / বিভাগ নেই' : 'General / None'}</option>
                        {availableGroups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {lang === 'bn' && g.banglaName ? g.banglaName : g.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Education Board */}
                  <div>
                    <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                      {dict.admission.board}
                    </label>
                    <select
                      value={form.educationBoardId || ''}
                      onChange={(e) => setForm({ ...form, educationBoardId: e.target.value })}
                      className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78] bg-white font-medium"
                    >
                      <option value="">{lang === 'bn' ? 'শিক্ষা বোর্ড নির্বাচন করুন' : 'Select Education Board'}</option>
                      {options.boards.map((b) => (
                        <option key={b.id} value={b.id}>
                          {lang === 'bn' && b.banglaName ? b.banglaName : b.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Course (if available) */}
                  {availableCourses.length > 0 && (
                    <div>
                      <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                        {dict.admission.course}
                      </label>
                      <select
                        value={form.courseId || ''}
                        onChange={(e) => setForm({ ...form, courseId: e.target.value })}
                        className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78] bg-white font-medium"
                      >
                        <option value="">{lang === 'bn' ? 'কোর্স নির্বাচন করুন (ঐচ্ছিক)' : 'Select Course (Optional)'}</option>
                        {availableCourses.map((crs) => (
                          <option key={crs.id} value={crs.id}>
                            {lang === 'bn' && crs.banglaName ? crs.banglaName : crs.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Roll Number */}
                  <div>
                    <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                      {dict.admission.rollNumber}
                    </label>
                    <input
                      type="text"
                      value={form.rollNumber || ''}
                      onChange={(e) => setForm({ ...form, rollNumber: e.target.value })}
                      placeholder="e.g. 101"
                      className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78]"
                    />
                  </div>

                  {/* Admission Date */}
                  <div>
                    <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                      {dict.admission.admissionDate}
                    </label>
                    <input
                      type="date"
                      value={form.admissionDate || ''}
                      onChange={(e) => setForm({ ...form, admissionDate: e.target.value })}
                      className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2.5 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78] bg-white"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: Batch Selection (Real batches only, zero fake batches) */}
            {step === 4 && (
              <div className="flex flex-col gap-5">
                <div className="border-b border-[#edf2f7] pb-3">
                  <h2 className="text-lg font-bold text-[#063b78]">
                    {dict.admission.step4Title}
                  </h2>
                </div>

                {availableBatches.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <label
                      className={`card p-4 rounded-xl border cursor-pointer transition-all ${
                        !form.batchId
                          ? 'border-[#063b78] bg-blue-50/50 ring-2 ring-[#063b78]'
                          : 'border-[#dce5f0] hover:bg-[#f8fafc]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="batchId"
                        value=""
                        checked={!form.batchId}
                        onChange={() => setForm({ ...form, batchId: '' })}
                        className="sr-only"
                      />
                      <div className="font-bold text-[#092f63]">
                        {lang === 'bn' ? 'এখনই ব্যাচ নির্ধারণ নয়' : 'Assign Later (No Batch)'}
                      </div>
                      <div className="text-[12px] text-[#64748b] mt-1">
                        {lang === 'bn' ? 'ভর্তির পর পরবর্তীতে যেকোনো সময় ব্যাচে দেওয়া যাবে।' : 'Student can be assigned to a batch at a later time.'}
                      </div>
                    </label>

                    {availableBatches.map((b) => {
                      const isSelected = form.batchId === b.id;
                      return (
                        <label
                          key={b.id}
                          className={`card p-4 rounded-xl border cursor-pointer transition-all ${
                            isSelected
                              ? 'border-[#063b78] bg-blue-50/50 ring-2 ring-[#063b78]'
                              : 'border-[#dce5f0] hover:bg-[#f8fafc]'
                          }`}
                        >
                          <input
                            type="radio"
                            name="batchId"
                            value={b.id}
                            checked={isSelected}
                            onChange={() => setForm({ ...form, batchId: b.id })}
                            className="sr-only"
                          />
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[#092f63]">
                              {lang === 'bn' && b.banglaName ? b.banglaName : b.name}
                            </span>
                            <span className="font-mono text-[11px] font-bold rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
                              {b.code}
                            </span>
                          </div>
                          <div className="text-[12px] text-[#64748b] mt-1">
                            {lang === 'bn' ? `ধারণক্ষমতা: ${b.capacity} জন` : `Capacity: ${b.capacity} seats`}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-center">
                    <Icon name="layers" size={28} className="mx-auto text-slate-400 mb-2" />
                    <p className="text-[14px] font-semibold text-[#092f63]">
                      {dict.admission.noBatchAvailable}
                    </p>
                    <p className="text-[12.5px] text-[#64748b] mt-1">
                      {lang === 'bn' ? 'ব্যাচ তৈরি না থাকলেও শিক্ষার্থী ভর্তি সম্পন্ন করা যাবে।' : 'You can proceed with admission and assign batches later.'}
                    </p>
                  </div>
                )}

                {/* Optional Remarks */}
                <div className="pt-2">
                  <label className="block text-[13px] font-bold text-[#092f63] mb-1.5">
                    {dict.admission.remarks}
                  </label>
                  <textarea
                    rows={2}
                    value={form.remarks || ''}
                    onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                    placeholder="Special instructions, reference, or admission notes"
                    className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2 text-[13.5px] text-[#092f63] outline-none focus:border-[#063b78]"
                  />
                </div>
              </div>
            )}

            {/* STEP 5: Review & Confirm */}
            {step === 5 && (
              <div className="flex flex-col gap-5">
                <div className="border-b border-[#edf2f7] pb-3">
                  <h2 className="text-lg font-bold text-[#063b78]">
                    {dict.admission.step5Title}
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[13.5px]">
                  {/* Student Summary */}
                  <div className="p-4 rounded-xl bg-[#f8fafc] border border-[#dce5f0] flex flex-col gap-2">
                    <div className="font-bold text-[#063b78] border-b border-[#e2e8f0] pb-1.5 flex items-center gap-2">
                      <Icon name="user" size={16} />
                      <span>{dict.admission.step1}</span>
                    </div>
                    <div><span className="text-[#64748b]">{dict.admission.fullName}:</span> <strong className="text-[#092f63]">{form.name}</strong></div>
                    {form.banglaName && <div><span className="text-[#64748b]">{dict.admission.banglaName}:</span> <strong>{form.banglaName}</strong></div>}
                    <div><span className="text-[#64748b]">{dict.admission.gender}:</span> {form.gender}</div>
                    {form.phone && <div><span className="text-[#64748b]">{dict.admission.studentPhone}:</span> <span className="font-mono">{form.phone}</span></div>}
                    {form.schoolName && <div><span className="text-[#64748b]">{dict.admission.schoolName}:</span> {form.schoolName}</div>}
                  </div>

                  {/* Guardian Summary */}
                  <div className="p-4 rounded-xl bg-[#f8fafc] border border-[#dce5f0] flex flex-col gap-2">
                    <div className="font-bold text-[#063b78] border-b border-[#e2e8f0] pb-1.5 flex items-center gap-2">
                      <Icon name="check" size={16} />
                      <span>{dict.admission.step2}</span>
                    </div>
                    <div><span className="text-[#64748b]">{dict.admission.guardianName}:</span> <strong className="text-[#092f63]">{form.guardianName}</strong> ({dict.relations[form.guardianRelationship]})</div>
                    <div><span className="text-[#64748b]">{dict.admission.guardianPhone}:</span> <strong className="font-mono text-[#063b78]">{form.guardianPhone}</strong></div>
                    {form.guardianWhatsapp && <div><span className="text-[#64748b]">{dict.admission.guardianWhatsapp}:</span> <span className="font-mono">{form.guardianWhatsapp}</span></div>}
                    <div><span className="text-[#64748b]">{dict.admission.preferredChannel}:</span> <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-semibold text-[#063b78]">{form.preferredChannel}</span></div>
                  </div>

                  {/* Academic Summary */}
                  <div className="p-4 rounded-xl bg-[#f8fafc] border border-[#dce5f0] flex flex-col gap-2 md:col-span-2">
                    <div className="font-bold text-[#063b78] border-b border-[#e2e8f0] pb-1.5 flex items-center gap-2">
                      <Icon name="layers" size={16} />
                      <span>{dict.admission.step3} & {dict.admission.step4}</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div><span className="text-[#64748b]">{dict.admission.session}:</span> <div><strong>{options.sessions.find((s) => s.id === form.academicSessionId)?.name}</strong></div></div>
                      <div><span className="text-[#64748b]">{dict.admission.branch}:</span> <div><strong>{options.branches.find((b) => b.id === form.branchId)?.name}</strong></div></div>
                      <div><span className="text-[#64748b]">{dict.admission.program}:</span> <div><strong>{selectedProgram?.name}</strong></div></div>
                      <div><span className="text-[#64748b]">{dict.admission.class}:</span> <div><strong>{selectedClass?.name}</strong> {form.academicGroupId && <span>({availableGroups.find((g) => g.id === form.academicGroupId)?.name})</span>}</div></div>
                    </div>
                    <div className="pt-2 border-t border-[#e2e8f0] text-[13px]">
                      <span className="text-[#64748b]">{dict.admission.batch}:</span>{' '}
                      <strong>{options.batches.find((b) => b.id === form.batchId)?.name || (lang === 'bn' ? 'অনির্ধারিত' : 'Unassigned')}</strong>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Stepper Navigation Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-[#edf2f7]">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={handlePrev}
                  className="rounded-xl border border-[#dce5f0] px-5 py-2.5 text-[14px] font-semibold text-[#092f63] hover:bg-[#f8fafc] transition-colors"
                >
                  {dict.admission.prev}
                </button>
              ) : (
                <div />
              )}

              {step < 5 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="rounded-xl bg-[#063b78] px-6 py-2.5 text-[14px] font-semibold text-white shadow-sm hover:bg-[#052e5e] transition-colors"
                >
                  {dict.admission.next}
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-[#063b78] px-8 py-2.5 text-[14px] font-semibold text-white shadow-sm hover:bg-[#052e5e] disabled:opacity-50 transition-colors"
                >
                  {submitting ? dict.admission.submitting : dict.admission.submit}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
