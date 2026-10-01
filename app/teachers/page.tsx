'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import { useApp } from '@/lib/store';
import { DICTIONARY, toBanglaNumeral } from '@/lib/i18n';
import { TEACHER_STATUSES } from '@/lib/validations/teacher';
import { normalizeBdPhone, isValidBdPhone } from '@/lib/validations/student';
import EnglishInput from '@/components/EnglishInput';
import BanglaInput from '@/components/BanglaInput';
import { hasBangla, hasEnglish } from '@/lib/format';

interface TeacherItem {
  id: string;
  name: string;
  banglaName?: string | null;
  teacherCode: string;
  status: string;
  branch?: { id: string; name: string; code: string } | null;
  teacherSubjects: Array<{ subject: { id: string; name: string; banglaName?: string | null } }>;
  batchTeacherAssignments: Array<{
    batch: {
      id: string;
      name: string;
      code: string;
      course?: { id: string; name: string; banglaName?: string | null } | null;
    };
    subject?: { id: string; name: string };
  }>;
  weeklyClassCount: number;
  todaysClassCount: number;
}

interface AssignmentCourseOption {
  id: string;
  name: string;
  banglaName?: string | null;
  code: string;
  batches: Array<{
    id: string;
    name: string;
    banglaName?: string | null;
    code: string;
    branchId: string;
    branchName: string;
    branchBanglaName?: string | null;
    subjects: Array<{
      id: string;
      name: string;
      banglaName?: string | null;
      code: string;
    }>;
  }>;
}

interface TeachingAssignmentRow {
  courseId: string;
  batchId: string;
  subjectIds: string[];
}

const emptyForm = {
  branchId: '',
  name: '',
  banglaName: '',
  phone: '',
  email: '',
  designation: '',
  qualification: '',
  bio: '',
  status: 'ACTIVE' as const,
  joiningDate: '',
  subjectIds: [] as string[],
  teachingAssignments: [] as TeachingAssignmentRow[],
  createLoginAccount: true,
};

export default function TeachersPage() {
  const { lang, showToast, currentUser } = useApp();
  const dict = DICTIONARY[lang];
  const canManage = currentUser?.role === 'OWNER' || currentUser?.role === 'ADMIN';

  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<Array<{ id: string; name: string; banglaName?: string | null }>>([]);
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string; banglaName?: string | null }>>([]);
  const [assignmentCourses, setAssignmentCourses] = useState<AssignmentCourseOption[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [createdTeacherAccount, setCreatedTeacherAccount] = useState<{
    teacherId: string;
    teacherName: string;
    email: string;
    temporaryPassword?: string;
  } | null>(null);
  const [copiedCredentials, setCopiedCredentials] = useState(false);

  const loadOptions = useCallback(async () => {
    try {
      const [batchesRes, assignRes] = await Promise.all([
        fetch('/api/batches/options'),
        fetch('/api/teachers/assignment-options'),
      ]);

      if (batchesRes.ok) {
        const data = await batchesRes.json();
        setBranches(data.branches || []);
        const allSubjects = new Map<string, { id: string; name: string; banglaName?: string | null }>();
        for (const p of data.programs || []) {
          for (const c of p.classes || []) {
            for (const s of c.subjects || []) allSubjects.set(s.id, s);
          }
        }
        setSubjects(Array.from(allSubjects.values()));
      }

      if (assignRes.ok) {
        const assignData = await assignRes.json();
        setAssignmentCourses(assignData.courses || []);
      }
    } catch (err) {
      console.error('Failed to load options', err);
    }
  }, []);

  const fetchTeachers = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set('search', search.trim());
      if (branchFilter !== 'all') q.set('branch', branchFilter);
      if (statusFilter !== 'all') q.set('status', statusFilter);
      q.set('pageSize', '100');

      const res = await fetch(`/api/teachers?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTeachers(data.teachers || []);
      }
    } catch (err) {
      console.error('Failed to load teachers', err);
    } finally {
      setLoading(false);
    }
  }, [search, branchFilter, statusFilter]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    const t = setTimeout(fetchTeachers, 250);
    return () => clearTimeout(t);
  }, [fetchTeachers]);

  const addAssignmentRow = () => {
    setForm((f) => ({
      ...f,
      teachingAssignments: [...f.teachingAssignments, { courseId: '', batchId: '', subjectIds: [] }],
    }));
  };

  const removeAssignmentRow = (idx: number) => {
    setForm((f) => ({
      ...f,
      teachingAssignments: f.teachingAssignments.filter((_, i) => i !== idx),
    }));
  };

  const updateAssignmentCourse = (idx: number, courseId: string) => {
    setForm((f) => {
      const rows = [...f.teachingAssignments];
      rows[idx] = { courseId, batchId: '', subjectIds: [] };
      return { ...f, teachingAssignments: rows };
    });
  };

  const updateAssignmentBatch = (idx: number, batchId: string) => {
    setForm((f) => {
      const rows = [...f.teachingAssignments];
      rows[idx] = { ...rows[idx], batchId, subjectIds: [] };
      return { ...f, teachingAssignments: rows };
    });
  };

  const toggleAssignmentSubject = (idx: number, subjectId: string) => {
    setForm((f) => {
      const rows = [...f.teachingAssignments];
      const cur = rows[idx].subjectIds;
      const next = cur.includes(subjectId) ? cur.filter((x) => x !== subjectId) : [...cur, subjectId];
      rows[idx] = { ...rows[idx], subjectIds: next };
      return { ...f, teachingAssignments: rows };
    });
  };

  const createTeacher = async () => {
    const errs: Record<string, string> = {};
    const trimmedName = form.name.trim();
    const trimmedBangla = form.banglaName.trim();
    const normalizedPhone = normalizeBdPhone(form.phone);
    const trimmedEmail = form.email.trim();

    if (!trimmedName) {
      errs.name = lang === 'bn' ? 'শিক্ষকের নাম (ইংরেজি) আবশ্যক' : 'Teacher name (English) is required';
    } else if (trimmedName.length < 2) {
      errs.name = lang === 'bn' ? 'শিক্ষকের নাম কমপক্ষে ২ অক্ষরের হতে হবে' : 'Teacher name must be at least 2 characters';
    } else if (hasBangla(trimmedName)) {
      errs.name = lang === 'bn' ? 'শিক্ষকের নাম ইংরেজিতে লিখুন (বাংলা অক্ষর গ্রহণযোগ্য নয়)' : 'Teacher name must be in English';
    }

    if (trimmedBangla && hasEnglish(trimmedBangla)) {
      errs.banglaName = lang === 'bn' ? 'শিক্ষকের বাংলা নাম শুধুমাত্র বাংলায় লিখুন (ইংরেজি গ্রহণযোগ্য নয়)' : 'Teacher Bangla name must not contain English characters';
    }

    if (!form.phone.trim()) {
      errs.phone = lang === 'bn' ? 'ফোন নম্বর আবশ্যক' : 'Phone number is required';
    } else if (!isValidBdPhone(form.phone)) {
      errs.phone = lang === 'bn' ? 'সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন (যেমন: 01712XXXXXX)' : 'Invalid Bangladeshi mobile number (must be 11 digits starting with 01)';
    }

    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errs.email = lang === 'bn' ? 'সঠিক ইমেইল ঠিকানা দিন' : 'Please enter a valid email address';
    } else if (form.createLoginAccount && !trimmedEmail) {
      errs.email = lang === 'bn' ? 'লগইন একাউন্ট তৈরির জন্য ইমেইল আবশ্যক' : 'Email address is required to create a login account';
    }

    // Validate assignments
    for (let i = 0; i < form.teachingAssignments.length; i++) {
      const a = form.teachingAssignments[i];
      if (!a.courseId) {
        showToast(lang === 'bn' ? `পাঠদান #${i + 1}: কোর্স নির্বাচন করুন` : `Assignment #${i + 1}: Select a course`);
        return;
      }
      if (!a.batchId) {
        showToast(lang === 'bn' ? `পাঠদান #${i + 1}: ব্যাচ নির্বাচন করুন` : `Assignment #${i + 1}: Select a batch`);
        return;
      }
      if (!a.subjectIds.length) {
        showToast(lang === 'bn' ? `পাঠদান #${i + 1}: কমপক্ষে একটি বিষয় নির্বাচন করুন` : `Assignment #${i + 1}: Select at least one subject`);
        return;
      }
    }

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      const firstError = Object.values(errs)[0];
      showToast(firstError);
      return;
    }

    setFieldErrors({});
    setSaving(true);
    try {
      const payload = {
        ...form,
        createLoginAccount: form.createLoginAccount,
        name: trimmedName,
        banglaName: trimmedBangla,
        phone: normalizedPhone,
        email: trimmedEmail,
        designation: form.designation.trim(),
        qualification: form.qualification.trim(),
        teachingAssignments: form.teachingAssignments.filter(
          (a) => a.courseId && a.batchId && a.subjectIds.length > 0
        ),
      };

      const res = await fetch('/api/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        showToast(lang === 'bn' ? 'শিক্ষক সফলভাবে যুক্ত হয়েছে' : 'Teacher added successfully');
        setModalOpen(false);
        setForm(emptyForm);
        setFieldErrors({});
        fetchTeachers();
        if (data.userAccount?.created) {
          setCreatedTeacherAccount({
            teacherId: data.teacher.id,
            teacherName: data.teacher.name,
            email: data.userAccount.email,
            temporaryPassword: data.userAccount.temporaryPassword,
          });
        }
      } else {
        if (data.details) {
          const serverFieldErrors: Record<string, string> = {};
          for (const [key, msgs] of Object.entries(data.details)) {
            if (Array.isArray(msgs) && msgs.length > 0) {
              serverFieldErrors[key] = msgs[0] as string;
            }
          }
          setFieldErrors(serverFieldErrors);
        }
        showToast(data.error || (lang === 'bn' ? 'শিক্ষক যোগ করতে ব্যর্থ হয়েছে' : 'Failed to add teacher'));
      }
    } catch {
      showToast(lang === 'bn' ? 'শিক্ষক যোগ করার সময় সমস্যা হয়েছে' : 'Error adding teacher');
    } finally {
      setSaving(false);
    }
  };

  const openCreateModal = () => {
    setForm(emptyForm);
    setFieldErrors({});
    loadOptions();
    setModalOpen(true);
  };

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#063b78] tracking-tight">{dict.teachers.title}</h1>
          <p className="text-[13.5px] text-[#64748b] mt-0.5 font-medium">{dict.teachers.subtitle}</p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <Link
            href="/attendance/teacher"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#dce5f0] bg-white px-4 py-2.5 text-[14px] font-semibold text-[#063b78] shadow-2xs hover:bg-[#f8fafc] transition-colors"
          >
            <Icon name="check" size={17} />
            <span>{dict.teachers.teacherAttendanceTitle}</span>
          </Link>
          {canManage && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#063b78] px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm hover:bg-[#052e5e] transition-colors"
            >
              <Icon name="userplus" size={17} />
              <span>{dict.teachers.createBtn}</span>
            </button>
          )}
        </div>
      </div>

      <div className="card p-4 md:p-5 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-3.5">
        <div className="flex items-center gap-2.5 rounded-xl border border-[#dce5f0] px-3.5 py-2.5 bg-[#f8fafc] max-w-lg focus-within:border-[#063b78] focus-within:bg-white transition-colors">
          <Icon name="search" size={17} className="text-[#64748b]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={dict.teachers.searchPlaceholder}
            className="bg-transparent outline-none w-full text-[13.5px] text-[#092f63] placeholder:text-[#94a3b8]"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78]">
            <option value="all">{dict.teachers.filterBranch}: {dict.teachers.all}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{lang === 'bn' && b.banglaName ? b.banglaName : b.name}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78]">
            <option value="all">{dict.teachers.filterStatus}: {dict.teachers.all}</option>
            {TEACHER_STATUSES.map((s) => (
              <option key={s} value={s}>{(dict.teacherStatus as any)[s]}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="card p-12 rounded-2xl bg-white border border-[#dce5f0] text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
        </div>
      ) : teachers.length === 0 ? (
        <div className="card p-12 md:p-16 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs text-center flex flex-col items-center">
          <div className="h-16 w-16 rounded-2xl bg-blue-50 text-[#063b78] flex items-center justify-center mb-4">
            <Icon name="grad" size={32} />
          </div>
          <h2 className="text-xl font-bold text-[#063b78]">{dict.teachers.emptyTitle}</h2>
          <p className="text-[14px] text-[#64748b] max-w-md mt-1.5 font-normal">{dict.teachers.emptyDesc}</p>
          {canManage && (
            <button
              type="button"
              onClick={openCreateModal}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#063b78] px-6 py-2.5 text-[14px] font-semibold text-white shadow-sm hover:bg-[#052e5e] transition-colors"
            >
              <Icon name="userplus" size={17} />
              <span>{dict.teachers.emptyAction}</span>
            </button>
          )}
        </div>
      ) : (
        <div className="hidden md:block card rounded-2xl bg-white border border-[#dce5f0] shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#e2e8f0] bg-[#f8fafc] text-[12px] font-bold text-[#64748b] uppercase tracking-wider">
                  <th className="py-3.5 px-4">{dict.teachers.name}</th>
                  <th className="py-3.5 px-4">{dict.teachers.subjects}</th>
                  <th className="py-3.5 px-4">{dict.teachers.assignedBatches}</th>
                  <th className="py-3.5 px-4">{dict.teachers.branch}</th>
                  <th className="py-3.5 px-4 text-right">{dict.teachers.todaysClasses}</th>
                  <th className="py-3.5 px-4 text-right">{dict.teachers.weeklyClasses}</th>
                  <th className="py-3.5 px-4">{dict.teachers.status}</th>
                  <th className="py-3.5 px-4 text-right">{lang === 'bn' ? 'অ্যাকশন' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf2f7] text-[13.5px]">
                {teachers.map((t) => (
                  <tr key={t.id} className="hover:bg-[#f8fafc]/80 transition-colors">
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <Link href={`/teachers/${t.id}`} className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-[#063b78]/10 text-[#063b78] font-bold flex items-center justify-center text-sm shrink-0">
                          {t.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-[#092f63] leading-tight hover:underline">{t.name}</div>
                          <div className="font-mono text-[11px] text-[#8795ab]">{t.teacherCode}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="py-3.5 px-4 max-w-[220px]">
                      <span className="text-[12.5px] text-[#475569]">
                        {t.teacherSubjects.length
                          ? t.teacherSubjects.map((ts) => (lang === 'bn' && ts.subject.banglaName ? ts.subject.banglaName : ts.subject.name)).join(', ')
                          : <span className="text-[#94a3b8] italic">{dict.teachers.noSubjects}</span>}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 max-w-[220px]">
                      <div className="flex flex-wrap gap-1">
                        {t.batchTeacherAssignments.length ? (
                          t.batchTeacherAssignments.map((a, i) => (
                            <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#f1f5f9] text-[11px] font-medium text-[#334155] border border-[#e2e8f0]">
                              {a.batch.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-[#94a3b8] italic text-[12px]">{dict.teachers.noBatches}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-[13px] text-[#475569]">
                      {t.branch ? t.branch.name : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-semibold text-[#092f63]">
                      {lang === 'bn' ? toBanglaNumeral(t.todaysClassCount) : t.todaysClassCount}
                    </td>
                    <td className="py-3.5 px-4 text-right font-semibold text-[#092f63]">
                      {lang === 'bn' ? toBanglaNumeral(t.weeklyClassCount) : t.weeklyClassCount}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <StatusBadge status={t.status} size="sm" dictKey="teacherStatus" />
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <Link
                        href={`/teachers/${t.id}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-semibold text-[#063b78] bg-[#f0f4f9] hover:bg-[#e2e8f0] transition-colors"
                      >
                        <Icon name="edit" size={13} />
                        <span>{dict.teachers.editBtn}</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mobile view */}
      <div className="md:hidden flex flex-col gap-3">
        {teachers.map((t) => (
          <Link
            key={t.id}
            href={`/teachers/${t.id}`}
            className="card p-4 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs hover:border-[#063b78] transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-[#063b78]/10 text-[#063b78] font-bold flex items-center justify-center text-sm shrink-0">
                  {t.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-[#092f63] text-[15px]">{t.name}</h3>
                  <div className="font-mono text-[11.5px] text-[#8795ab]">{t.teacherCode}</div>
                </div>
              </div>
              <StatusBadge status={t.status} size="sm" dictKey="teacherStatus" />
            </div>

            <div className="mt-3.5 pt-3 border-t border-[#f1f5f9] flex items-center justify-between text-[12px] text-[#64748b]">
              <div className="flex items-center gap-3">
                <div>
                  <span className="font-semibold text-[#092f63]">
                    {lang === 'bn' ? toBanglaNumeral(t.todaysClassCount) : t.todaysClassCount}
                  </span>{' '}
                  {dict.teachers.todaysClasses}
                </div>
                <div>
                  <span className="font-semibold text-[#092f63]">
                    {lang === 'bn' ? toBanglaNumeral(t.weeklyClassCount) : t.weeklyClassCount}
                  </span>{' '}
                  {dict.teachers.weeklyClasses}
                </div>
              </div>
              <span className="text-[12px] font-semibold text-[#063b78] flex items-center gap-1">
                <Icon name="edit" size={12} />
                <span>{dict.teachers.editBtn}</span>
              </span>
            </div>
          </Link>
        ))}
      </div>

      {/* Create Teacher Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card p-6 bg-white max-w-3xl w-full shadow-2xl space-y-6 max-h-[92vh] overflow-y-auto scroll rounded-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#edf2f7]">
              <div>
                <h3 className="font-extrabold text-lg text-[#063b78]">{dict.teachers.createBtn}</h3>
                <p className="text-[12.5px] text-[#64748b] mt-0.5">{dict.teachers.subtitle}</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="text-[#64748b] hover:text-black p-1 rounded-lg">
                <Icon name="x" size={20} />
              </button>
            </div>

            {/* SECTION 1: Teacher Information */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-6 w-6 rounded-md bg-[#063b78]/10 text-[#063b78] flex items-center justify-center text-xs font-bold">1</div>
                <h4 className="font-bold text-[14px] text-[#063b78] uppercase tracking-wider">{dict.teachers.tabEmployment}</h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="fld">
                  <label>{dict.teachers.name} *</label>
                  <EnglishInput
                    value={form.name}
                    onChange={(val) => {
                      setForm({ ...form, name: val });
                      if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: '' }));
                    }}
                    className={fieldErrors.name ? '!border-red-500 !ring-1 !ring-red-200' : ''}
                  />
                  {fieldErrors.name && <p className="text-[11.5px] text-red-600 font-medium mt-1">{fieldErrors.name}</p>}
                </div>
                <div className="fld">
                  <label>{dict.teachers.banglaName}</label>
                  <BanglaInput
                    value={form.banglaName}
                    onChange={(val) => {
                      setForm({ ...form, banglaName: val });
                      if (fieldErrors.banglaName) setFieldErrors((prev) => ({ ...prev, banglaName: '' }));
                    }}
                    className={fieldErrors.banglaName ? '!border-red-500 !ring-1 !ring-red-200' : ''}
                  />
                  {fieldErrors.banglaName && <p className="text-[11.5px] text-red-600 font-medium mt-1">{fieldErrors.banglaName}</p>}
                </div>
                <div className="fld">
                  <label>{dict.teachers.phone} *</label>
                  <input
                    value={form.phone}
                    onChange={(e) => {
                      setForm({ ...form, phone: e.target.value });
                      if (fieldErrors.phone) setFieldErrors((prev) => ({ ...prev, phone: '' }));
                    }}
                    placeholder="01712000000"
                    className={fieldErrors.phone ? '!border-red-500 !ring-1 !ring-red-200' : ''}
                  />
                  {fieldErrors.phone && <p className="text-[11.5px] text-red-600 font-medium mt-1">{fieldErrors.phone}</p>}
                </div>
                <div className="fld">
                  <label>{dict.teachers.email}</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => {
                      setForm({ ...form, email: e.target.value });
                      if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: '' }));
                    }}
                    placeholder="teacher@example.com"
                    className={fieldErrors.email ? '!border-red-500 !ring-1 !ring-red-200' : ''}
                  />
                  {fieldErrors.email && <p className="text-[11.5px] text-red-600 font-medium mt-1">{fieldErrors.email}</p>}
                </div>
                <div className="fld">
                  <label>{dict.teachers.branch}</label>
                  <select
                    value={form.branchId}
                    onChange={(e) => {
                      const newBranchId = e.target.value;
                      // Update form and reset any teaching assignments that belong to different branches
                      setForm({ ...form, branchId: newBranchId });
                    }}
                  >
                    <option value="">— {lang === 'bn' ? 'সকল শাখা / সাধারণ' : 'All Branches / Center-wide'} —</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{lang === 'bn' && b.banglaName ? b.banglaName : b.name}</option>
                    ))}
                  </select>
                </div>
                <div className="fld">
                  <label>{dict.teachers.designation}</label>
                  <input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="e.g. Senior Lecturer" />
                </div>
                <div className="fld">
                  <label>{dict.teachers.qualification}</label>
                  <input value={form.qualification} onChange={(e) => setForm({ ...form, qualification: e.target.value })} placeholder="e.g. M.Sc in Physics (DU)" />
                </div>
                <div className="fld">
                  <label>{dict.teachers.joiningDate}</label>
                  <input type="date" value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} />
                </div>
                <div className="fld">
                  <label>{dict.teachers.status}</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })}>
                    {TEACHER_STATUSES.map((s) => (
                      <option key={s} value={s}>{(dict.teacherStatus as any)[s]}</option>
                    ))}
                  </select>
                </div>
                <div className="fld sm:col-span-2">
                  <label>{dict.teachers.bio}</label>
                  <textarea
                    rows={2}
                    value={form.bio}
                    onChange={(e) => setForm({ ...form, bio: e.target.value })}
                    placeholder="Short bio or background notes"
                    className="w-full rounded-xl border border-[#dce5f0] p-2 text-[13px] text-[#092f63] outline-none focus:border-[#063b78]"
                  />
                </div>
              </div>
            </div>

            {/* SECTION: Teacher Login Account */}
            <div className="pt-2 border-t border-[#edf2f7]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-md bg-[#063b78]/10 text-[#063b78] flex items-center justify-center text-xs font-bold">
                    <Icon name="key" size={13} />
                  </div>
                  <h4 className="font-bold text-[14px] text-[#063b78] uppercase tracking-wider">
                    {lang === 'bn' ? 'লগইন একাউন্ট' : 'Login Account'}
                  </h4>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.createLoginAccount}
                    onChange={(e) => setForm({ ...form, createLoginAccount: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-[#063b78] focus:ring-[#063b78]"
                  />
                  <span className="text-sm font-bold text-slate-800">
                    {lang === 'bn' ? 'শিক্ষকের জন্য লগইন একাউন্ট তৈরি করুন' : 'Create Teacher Login Account'}
                  </span>
                </label>
                <p className="text-xs text-slate-600 pl-6.5 leading-relaxed">
                  {lang === 'bn'
                    ? 'সক্রিয় থাকলে উপরে প্রদত্ত ইমেইলে TEACHER রোলে একটি সিস্টেম একাউন্ট এবং একটি নিরাপদ অস্থায়ী পাসওয়ার্ড স্বয়ংক্রিয়ভাবে তৈরি হবে।'
                    : 'When enabled, a user account with TEACHER role will be automatically created using the email provided above, and a secure temporary password will be generated.'}
                </p>
                {form.createLoginAccount && !form.email.trim() && (
                  <p className="text-xs text-amber-700 pl-6.5 font-medium flex items-center gap-1">
                    <Icon name="alert-triangle" size={13} />
                    <span>{lang === 'bn' ? 'লগইন একাউন্ট তৈরির জন্য উপরে ইমেইল প্রদান করুন।' : 'Please enter an email above to enable account creation.'}</span>
                  </p>
                )}
              </div>
            </div>

            {/* SECTION 2: General Subjects (Competencies) */}
            <div className="pt-2 border-t border-[#edf2f7]">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="h-6 w-6 rounded-md bg-[#063b78]/10 text-[#063b78] flex items-center justify-center text-xs font-bold">2</div>
                <h4 className="font-bold text-[14px] text-[#063b78] uppercase tracking-wider">{dict.teachers.generalSubjects}</h4>
              </div>
              <p className="text-[12px] text-[#64748b] mb-3">{dict.teachers.generalSubjectsHelp}</p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto scroll border border-[#dce5f0] rounded-xl p-3 bg-[#f8fafc]">
                {subjects.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-[12.5px] text-[#092f63] cursor-pointer hover:text-[#063b78]">
                    <input
                      type="checkbox"
                      checked={form.subjectIds.includes(s.id)}
                      onChange={() =>
                        setForm((f) => ({
                          ...f,
                          subjectIds: f.subjectIds.includes(s.id) ? f.subjectIds.filter((x) => x !== s.id) : [...f.subjectIds, s.id],
                        }))
                      }
                      className="rounded text-[#063b78] focus:ring-[#063b78]"
                    />
                    <span className="font-medium">{lang === 'bn' && s.banglaName ? s.banglaName : s.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* SECTION 3: Teaching Assignments (Course -> Batch -> Subjects) */}
            <div className="pt-2 border-t border-[#edf2f7]">
              <div className="flex items-center justify-between gap-3 mb-1.5 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-md bg-[#063b78]/10 text-[#063b78] flex items-center justify-center text-xs font-bold">3</div>
                  <h4 className="font-bold text-[14px] text-[#063b78] uppercase tracking-wider">{dict.teachers.teachingAssignments}</h4>
                </div>
                <button
                  type="button"
                  onClick={addAssignmentRow}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#063b78] text-[#063b78] bg-white px-3 py-1.5 text-[12.5px] font-semibold hover:bg-blue-50 transition-colors"
                >
                  <Icon name="userplus" size={14} />
                  <span>{dict.teachers.addAssignment}</span>
                </button>
              </div>
              <p className="text-[12px] text-[#64748b] mb-3">{dict.teachers.assignmentHelp}</p>

              {form.teachingAssignments.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-[#cbd5e1] text-center bg-[#f8fafc]">
                  <p className="text-[12.5px] text-[#64748b]">{dict.teachers.noAssignments}</p>
                  <button
                    type="button"
                    onClick={addAssignmentRow}
                    className="mt-2 text-[12.5px] font-bold text-[#063b78] hover:underline"
                  >
                    + {dict.teachers.addAssignment}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {form.teachingAssignments.map((row, idx) => {
                    const selectedCourse = assignmentCourses.find((c) => c.id === row.courseId);
                    const availableBatches = selectedCourse
                      ? selectedCourse.batches.filter(
                          (b) => !form.branchId || b.branchId === form.branchId
                        )
                      : [];
                    const selectedBatch = availableBatches.find((b) => b.id === row.batchId);
                    const offeredSubjects = selectedBatch ? selectedBatch.subjects : [];

                    return (
                      <div key={idx} className="p-4 rounded-xl border border-[#dce5f0] bg-[#f8fafc] relative flex flex-col gap-3 shadow-2xs">
                        <div className="flex items-center justify-between pb-2 border-b border-[#e2e8f0]">
                          <span className="text-[12px] font-bold text-[#063b78] uppercase tracking-wider">
                            {lang === 'bn' ? `পাঠদান #${idx + 1}` : `Assignment #${idx + 1}`}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeAssignmentRow(idx)}
                            className="text-[#e11d48] hover:text-red-700 text-[12px] font-semibold flex items-center gap-1"
                          >
                            <Icon name="x" size={14} />
                            <span>{dict.teachers.removeAssignment}</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {/* Course selection */}
                          <div className="fld">
                            <label className="text-[12px] font-bold text-[#334155]">{dict.teachers.course} *</label>
                            <select
                              value={row.courseId}
                              onChange={(e) => updateAssignmentCourse(idx, e.target.value)}
                              className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78]"
                            >
                              <option value="">-- {dict.teachers.selectCourse} --</option>
                              {assignmentCourses.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {lang === 'bn' && c.banglaName ? c.banglaName : c.name} ({c.code})
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Batch selection (dependent on course) */}
                          <div className="fld">
                            <label className="text-[12px] font-bold text-[#334155]">{dict.teachers.batch} *</label>
                            <select
                              value={row.batchId}
                              disabled={!row.courseId}
                              onChange={(e) => updateAssignmentBatch(idx, e.target.value)}
                              className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78] disabled:bg-gray-100 disabled:text-gray-400"
                            >
                              <option value="">-- {dict.teachers.selectBatch} --</option>
                              {availableBatches.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {lang === 'bn' && b.banglaName ? b.banglaName : b.name}
                                  {b.branchName ? ` · ${b.branchName}` : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Subject(s) selection (offered by this batch) */}
                        <div className="fld">
                          <label className="text-[12px] font-bold text-[#334155]">{dict.teachers.offeredSubjects} *</label>
                          {!row.batchId ? (
                            <p className="text-[12px] text-[#94a3b8] italic">
                              {lang === 'bn' ? 'বিষয়সমূহ দেখতে প্রথমে কোর্স ও ব্যাচ নির্বাচন করুন।' : 'Select course and batch first to view offered subjects.'}
                            </p>
                          ) : offeredSubjects.length === 0 ? (
                            <p className="text-[12px] text-[#e11d48] italic">
                              {lang === 'bn' ? 'এই ব্যাচে কোনো বিষয় যুক্ত করা নেই।' : 'No subjects associated with this batch.'}
                            </p>
                          ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2.5 rounded-xl border border-[#dce5f0] bg-white max-h-32 overflow-y-auto scroll">
                              {offeredSubjects.map((s) => (
                                <label key={s.id} className="flex items-center gap-2 text-[12px] text-[#092f63] cursor-pointer hover:text-[#063b78]">
                                  <input
                                    type="checkbox"
                                    checked={row.subjectIds.includes(s.id)}
                                    onChange={() => toggleAssignmentSubject(idx, s.id)}
                                    className="rounded text-[#063b78] focus:ring-[#063b78]"
                                  />
                                  <span className="font-medium">{lang === 'bn' && s.banglaName ? s.banglaName : s.name}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2.5 pt-4 border-t border-[#edf2f7]">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-[#dce5f0] text-[13px] font-semibold text-[#64748b] hover:bg-[#f8fafc]"
              >
                {lang === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={createTeacher}
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-[#063b78] text-white text-[13px] font-semibold hover:bg-[#052e5e] shadow-sm disabled:opacity-50"
              >
                {saving ? '…' : dict.teachers.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Account Created Feedback Modal */}
      {createdTeacherAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card p-6 bg-white max-w-md w-full shadow-2xl space-y-5 rounded-2xl border border-emerald-200">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
                <Icon name="check" size={20} />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900">
                  {lang === 'bn' ? 'শিক্ষক লগইন একাউন্ট প্রস্তুত' : 'Teacher Account Created'}
                </h3>
                <p className="text-xs text-slate-500">
                  {lang === 'bn' ? 'লগইন ক্রেডেনশিয়াল সংরক্ষণ করুন' : 'Save these login credentials'}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2.5 text-left">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  {lang === 'bn' ? 'শিক্ষক' : 'Teacher'}
                </span>
                <span className="text-sm font-bold text-slate-800">{createdTeacherAccount.teacherName}</span>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  {lang === 'bn' ? 'ইমেইল' : 'Email'}
                </span>
                <span className="font-mono text-sm font-bold text-slate-900">{createdTeacherAccount.email}</span>
              </div>
              {createdTeacherAccount.temporaryPassword && (
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    {lang === 'bn' ? 'অস্থায়ী পাসওয়ার্ড' : 'Temporary Password'}
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-sm font-extrabold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded border border-emerald-200">
                      {createdTeacherAccount.temporaryPassword}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 leading-relaxed">
              {lang === 'bn'
                ? 'এই পাসওয়ার্ডটি শুধুমাত্র একবার দেখানো হলো। শিক্ষক লগইন করার পর পাসওয়ার্ড পরিবর্তন করে নিতে পারবেন।'
                : 'This temporary password will only be shown once. Please copy and share it securely with the teacher.'}
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
              {createdTeacherAccount.temporaryPassword && (
                <button
                  type="button"
                  onClick={() => {
                    const creds = `Teacher Login:\nEmail: ${createdTeacherAccount.email}\nTemporary Password: ${createdTeacherAccount.temporaryPassword}`;
                    navigator.clipboard.writeText(creds);
                    setCopiedCredentials(true);
                    setTimeout(() => setCopiedCredentials(false), 2500);
                  }}
                  className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 transition-colors shadow-xs"
                >
                  <Icon name="copy" size={14} />
                  <span>{copiedCredentials ? (lang === 'bn' ? 'কপি হয়েছে!' : 'Copied!') : (lang === 'bn' ? 'ক্রেডেনশিয়াল কপি করুন' : 'Copy Credentials')}</span>
                </button>
              )}

              <Link
                href={`/teachers/${createdTeacherAccount.teacherId}`}
                className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#063b78] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#052e5e] transition-colors shadow-xs"
              >
                <Icon name="user" size={14} />
                <span>{lang === 'bn' ? 'প্রোফাইলে যান' : 'Go to Teacher Profile'}</span>
              </Link>

              <button
                type="button"
                onClick={() => setCreatedTeacherAccount(null)}
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {lang === 'bn' ? 'সম্পন্ন' : 'Done'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
