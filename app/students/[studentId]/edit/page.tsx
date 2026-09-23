'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';
import {
  GUARDIAN_RELATIONS,
  COMMUNICATION_CHANNELS,
  STUDENT_STATUSES,
  BLOOD_GROUPS,
  isValidBdPhone,
} from '@/lib/validations/student';

interface AcademicOptions {
  sessions: Array<{ id: string; name: string; isCurrent: boolean }>;
  branches: Array<{ id: string; name: string; isMain: boolean }>;
  programs: Array<{
    id: string;
    name: string;
    classes: Array<{
      id: string;
      name: string;
      groups: Array<{ id: string; name: string }>;
    }>;
  }>;
  courses: Array<{
    id: string;
    name: string;
    academicProgramId: string;
    academicClassId: string;
  }>;
  batches: Array<{
    id: string;
    name: string;
    branchId: string;
    academicProgramId: string;
    academicClassId: string;
  }>;
}

export default function EditStudentPage() {
  const params = useParams();
  const router = useRouter();
  const studentId = params?.studentId as string;
  const { lang, showToast } = useApp();
  const dict = DICTIONARY[lang];

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Student form state
  const [form, setForm] = useState({
    name: '',
    banglaName: '',
    gender: 'MALE',
    dob: '',
    bloodGroup: '',
    religion: 'Islam',
    phone: '',
    email: '',
    address: '',
    schoolName: '',
    nidBirthReg: '',
    sscRoll: '',
    sscReg: '',
    status: 'ACTIVE',

    // Guardian
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

    // Advance / New Enrollment option
    advanceEnrollment: false,
    newSessionId: '',
    newBranchId: '',
    newProgramId: '',
    newClassId: '',
    newGroupId: '',
    newCourseId: '',
    newBatchId: '',
    newRollNumber: '',
  });

  const [options, setOptions] = useState<AcademicOptions>({
    sessions: [],
    branches: [],
    programs: [],
    courses: [],
    batches: [],
  });

  useEffect(() => {
    async function loadData() {
      if (!studentId) return;
      try {
        const [studentRes, optionsRes] = await Promise.all([
          fetch(`/api/students/${studentId}`),
          fetch('/api/academic/options'),
        ]);

        if (!studentRes.ok) throw new Error('Student not found');

        const studentData = await studentRes.json();
        const optionsData = await optionsRes.json();

        setOptions(optionsData);

        const s = studentData.student;
        const g = s.studentGuardians?.find((x: any) => x.isPrimary)?.guardian || s.studentGuardians?.[0]?.guardian;

        setForm((prev) => ({
          ...prev,
          name: s.name || '',
          banglaName: s.banglaName || '',
          gender: s.gender || 'MALE',
          dob: s.dob ? s.dob.split('T')[0] : '',
          bloodGroup: s.bloodGroup || '',
          religion: s.religion || '',
          phone: s.phone || '',
          email: s.email || '',
          address: s.address || '',
          schoolName: s.schoolName || '',
          nidBirthReg: s.nidBirthReg || '',
          sscRoll: s.sscRoll || '',
          sscReg: s.sscReg || '',
          status: s.status || 'ACTIVE',
          guardianName: g?.name || '',
          guardianBanglaName: g?.banglaName || '',
          guardianRelationship: g?.relationship || 'FATHER',
          guardianPhone: g?.phone || '',
          guardianAltPhone: g?.altPhone || '',
          guardianWhatsapp: g?.whatsapp || '',
          guardianEmail: g?.email || '',
          guardianOccupation: g?.occupation || '',
          guardianAddress: g?.address || '',
          preferredChannel: g?.preferredChannel || 'SMS',
          newSessionId: optionsData.sessions?.[0]?.id || '',
          newBranchId: optionsData.branches?.[0]?.id || '',
          newProgramId: optionsData.programs?.[0]?.id || '',
          newClassId: optionsData.programs?.[0]?.classes?.[0]?.id || '',
        }));
      } catch (err: any) {
        setError(err?.message || 'Failed to load details');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [studentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError(lang === 'bn' ? 'শিক্ষার্থীর নাম আবশ্যক।' : 'Student name is required.');
      return;
    }

    if (form.phone && !isValidBdPhone(form.phone)) {
      setError(lang === 'bn' ? 'শিক্ষার্থীর সঠিক মোবাইল নম্বর দিন।' : 'Invalid student mobile number.');
      return;
    }

    if (form.guardianPhone && !isValidBdPhone(form.guardianPhone)) {
      setError(lang === 'bn' ? 'অভিভাবকের সঠিক মোবাইল নম্বর দিন।' : 'Invalid guardian mobile number.');
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        name: form.name,
        banglaName: form.banglaName,
        gender: form.gender,
        dob: form.dob || null,
        bloodGroup: form.bloodGroup || null,
        religion: form.religion,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        schoolName: form.schoolName || null,
        nidBirthReg: form.nidBirthReg || null,
        sscRoll: form.sscRoll || null,
        sscReg: form.sscReg || null,
        status: form.status,
        guardianName: form.guardianName,
        guardianBanglaName: form.guardianBanglaName,
        guardianRelationship: form.guardianRelationship,
        guardianPhone: form.guardianPhone,
        guardianAltPhone: form.guardianAltPhone || null,
        guardianWhatsapp: form.guardianWhatsapp || null,
        guardianEmail: form.guardianEmail || null,
        guardianOccupation: form.guardianOccupation || null,
        guardianAddress: form.guardianAddress || null,
        preferredChannel: form.preferredChannel,
      };

      if (form.advanceEnrollment) {
        payload.newEnrollment = {
          academicSessionId: form.newSessionId,
          branchId: form.newBranchId,
          academicProgramId: form.newProgramId,
          academicClassId: form.newClassId,
          academicGroupId: form.newGroupId || undefined,
          courseId: form.newCourseId || undefined,
          batchId: form.newBatchId || undefined,
          rollNumber: form.newRollNumber || undefined,
        };
      }

      const res = await fetch(`/api/students/${studentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update student');

      showToast(lang === 'bn' ? 'শিক্ষার্থীর তথ্য সংরক্ষিত হয়েছে!' : 'Student updated successfully!');
      router.push(`/students/${studentId}`);
    } catch (err: any) {
      setError(err?.message || 'Failed to save changes');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-[1000px] mx-auto py-16 text-center text-[#64748b]">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
        <p className="mt-3 text-[14px] font-medium">Loading student data…</p>
      </div>
    );
  }

  const selectedNewProg = options.programs.find((p) => p.id === form.newProgramId);
  const newClasses = selectedNewProg?.classes || [];
  const selectedNewCls = newClasses.find((c) => c.id === form.newClassId);
  const newGroups = selectedNewCls?.groups || [];

  return (
    <div className="max-w-[1000px] mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/students/${studentId}`}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#063b78] hover:underline mb-1"
          >
            <Icon name="chevronleft" size={15} />
            <span>{lang === 'bn' ? 'প্রোফাইলে ফিরুন' : 'Back to Profile'}</span>
          </Link>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#063b78] tracking-tight">
            {lang === 'bn' ? 'শিক্ষার্থী তথ্য সম্পাদনা' : 'Edit Student Profile'}
          </h1>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[13.5px] font-medium flex items-center gap-2.5">
          <Icon name="alert" size={18} className="shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card p-6 md:p-8 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-6">
        {/* Status Transition Control */}
        <div className="p-4 rounded-xl bg-[#f8fafc] border border-[#dce5f0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="font-bold text-[#092f63] text-[14px]">
              {lang === 'bn' ? 'শিক্ষার্থীর অবস্থা' : 'Student Status'}
            </span>
            <p className="text-[12px] text-[#64748b]">
              {lang === 'bn'
                ? 'শিক্ষার্থী প্রতিষ্ঠান ত্যাগ করলে মুছে ফেলার পরিবর্তে নিষ্ক্রিয় বা স্থানান্তরিত চিহ্নিত করুন।'
                : 'Do not delete students who leave; transition their status to Inactive or Transferred.'}
            </p>
          </div>
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
            className="rounded-xl border border-[#dce5f0] px-3.5 py-2 text-[13px] font-bold text-[#063b78] bg-white outline-none focus:border-[#063b78]"
          >
            {STUDENT_STATUSES.map((st) => (
              <option key={st} value={st}>{dict.studentStatus[st]}</option>
            ))}
          </select>
        </div>

        {/* Section 1: Personal Info */}
        <div className="flex flex-col gap-4">
          <div className="border-b border-[#edf2f7] pb-2">
            <h2 className="text-base font-bold text-[#063b78] flex items-center gap-2">
              <Icon name="user" size={17} />
              <span>{dict.profile.personalInfo}</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-bold text-[#092f63] mb-1">
                {dict.admission.fullName} *
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2 text-[13.5px] text-[#092f63]"
              />
            </div>

            <div>
              <label className="block text-[13px] font-bold text-[#092f63] mb-1">
                {dict.admission.banglaName}
              </label>
              <input
                type="text"
                value={form.banglaName}
                onChange={(e) => setForm({ ...form, banglaName: e.target.value })}
                className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2 text-[13.5px] text-[#092f63]"
              />
            </div>

            <div>
              <label className="block text-[13px] font-bold text-[#092f63] mb-1">
                {dict.admission.gender}
              </label>
              <select
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value })}
                className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2 text-[13.5px] bg-white"
              >
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-[13px] font-bold text-[#092f63] mb-1">
                {dict.admission.dob}
              </label>
              <input
                type="date"
                value={form.dob}
                onChange={(e) => setForm({ ...form, dob: e.target.value })}
                className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2 text-[13.5px] bg-white"
              />
            </div>

            <div>
              <label className="block text-[13px] font-bold text-[#092f63] mb-1">
                {dict.admission.bloodGroup}
              </label>
              <select
                value={form.bloodGroup}
                onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}
                className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2 text-[13.5px] bg-white"
              >
                <option value="">None</option>
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg} value={bg}>{bg}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[13px] font-bold text-[#092f63] mb-1">
                {dict.admission.studentPhone}
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2 text-[13.5px] font-mono"
              />
            </div>

            <div>
              <label className="block text-[13px] font-bold text-[#092f63] mb-1">
                {dict.admission.studentEmail}
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2 text-[13.5px]"
              />
            </div>

            <div>
              <label className="block text-[13px] font-bold text-[#092f63] mb-1">
                {dict.admission.schoolName}
              </label>
              <input
                type="text"
                value={form.schoolName}
                onChange={(e) => setForm({ ...form, schoolName: e.target.value })}
                className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2 text-[13.5px]"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[13px] font-bold text-[#092f63] mb-1">
                {dict.admission.presentAddress}
              </label>
              <textarea
                rows={2}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2 text-[13.5px]"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Guardian Info */}
        <div className="flex flex-col gap-4">
          <div className="border-b border-[#edf2f7] pb-2">
            <h2 className="text-base font-bold text-[#063b78] flex items-center gap-2">
              <Icon name="check" size={17} />
              <span>{dict.profile.guardianInfo}</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-bold text-[#092f63] mb-1">
                {dict.admission.guardianName} *
              </label>
              <input
                type="text"
                required
                value={form.guardianName}
                onChange={(e) => setForm({ ...form, guardianName: e.target.value })}
                className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2 text-[13.5px]"
              />
            </div>

            <div>
              <label className="block text-[13px] font-bold text-[#092f63] mb-1">
                {dict.admission.relation}
              </label>
              <select
                value={form.guardianRelationship}
                onChange={(e) => setForm({ ...form, guardianRelationship: e.target.value })}
                className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2 text-[13.5px] bg-white"
              >
                {GUARDIAN_RELATIONS.map((rel) => (
                  <option key={rel} value={rel}>{dict.relations[rel]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[13px] font-bold text-[#092f63] mb-1">
                {dict.admission.guardianPhone} *
              </label>
              <input
                type="tel"
                required
                value={form.guardianPhone}
                onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })}
                className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2 text-[13.5px] font-mono"
              />
            </div>

            <div>
              <label className="block text-[13px] font-bold text-[#092f63] mb-1">
                {dict.admission.guardianWhatsapp}
              </label>
              <input
                type="tel"
                value={form.guardianWhatsapp}
                onChange={(e) => setForm({ ...form, guardianWhatsapp: e.target.value })}
                className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2 text-[13.5px] font-mono"
              />
            </div>

            <div>
              <label className="block text-[13px] font-bold text-[#092f63] mb-1">
                {dict.admission.preferredChannel}
              </label>
              <select
                value={form.preferredChannel}
                onChange={(e) => setForm({ ...form, preferredChannel: e.target.value })}
                className="w-full rounded-xl border border-[#dce5f0] px-3.5 py-2 text-[13.5px] bg-white"
              >
                {COMMUNICATION_CHANNELS.map((ch) => (
                  <option key={ch} value={ch}>{ch}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Section 3: Advance to New Academic Session / Class (Preserves History) */}
        <div className="flex flex-col gap-4 p-5 rounded-2xl bg-blue-50/40 border border-blue-100">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={form.advanceEnrollment}
              onChange={(e) => setForm({ ...form, advanceEnrollment: e.target.checked })}
              className="h-4 w-4 rounded border-[#dce5f0] text-[#063b78] focus:ring-[#063b78]"
            />
            <span className="font-bold text-[#063b78] text-[14px]">
              {lang === 'bn'
                ? 'নতুন শিক্ষাবর্ষ বা শ্রেণিতে পদোন্নতি / ভর্তি যোগ করুন (ইতিহাস সংরক্ষিত থাকবে)'
                : 'Enroll into New Session / Class (Preserves past enrollment history)'}
            </span>
          </label>

          {form.advanceEnrollment && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 pt-3 border-t border-blue-200/60">
              <div>
                <label className="block text-[12.5px] font-bold text-[#092f63] mb-1">
                  {dict.admission.session}
                </label>
                <select
                  value={form.newSessionId}
                  onChange={(e) => setForm({ ...form, newSessionId: e.target.value })}
                  className="w-full rounded-xl border border-[#dce5f0] px-3 py-2 text-[13px] bg-white"
                >
                  {options.sessions.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[12.5px] font-bold text-[#092f63] mb-1">
                  {dict.admission.branch}
                </label>
                <select
                  value={form.newBranchId}
                  onChange={(e) => setForm({ ...form, newBranchId: e.target.value })}
                  className="w-full rounded-xl border border-[#dce5f0] px-3 py-2 text-[13px] bg-white"
                >
                  {options.branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[12.5px] font-bold text-[#092f63] mb-1">
                  {dict.admission.program}
                </label>
                <select
                  value={form.newProgramId}
                  onChange={(e) => {
                    const prog = options.programs.find((p) => p.id === e.target.value);
                    setForm({
                      ...form,
                      newProgramId: e.target.value,
                      newClassId: prog?.classes[0]?.id || '',
                    });
                  }}
                  className="w-full rounded-xl border border-[#dce5f0] px-3 py-2 text-[13px] bg-white"
                >
                  {options.programs.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[12.5px] font-bold text-[#092f63] mb-1">
                  {dict.admission.class}
                </label>
                <select
                  value={form.newClassId}
                  onChange={(e) => setForm({ ...form, newClassId: e.target.value })}
                  className="w-full rounded-xl border border-[#dce5f0] px-3 py-2 text-[13px] bg-white"
                >
                  {newClasses.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-[#edf2f7]">
          <Link
            href={`/students/${studentId}`}
            className="rounded-xl border border-[#dce5f0] px-5 py-2.5 text-[13.5px] font-semibold text-[#64748b] hover:bg-[#f8fafc]"
          >
            {dict.actions.cancel}
          </Link>

          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-[#063b78] px-7 py-2.5 text-[14px] font-semibold text-white shadow-sm hover:bg-[#052e5e] disabled:opacity-50 transition-colors"
          >
            {saving ? (lang === 'bn' ? 'সংরক্ষণ হচ্ছে…' : 'Saving…') : dict.actions.save}
          </button>
        </div>
      </form>
    </div>
  );
}
