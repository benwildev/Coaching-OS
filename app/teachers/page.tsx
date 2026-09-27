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
  batchTeacherAssignments: Array<{ batch: { id: string; name: string; code: string } }>;
  weeklyClassCount: number;
  todaysClassCount: number;
}

const emptyForm = {
  branchId: '',
  name: '',
  banglaName: '',
  phone: '',
  email: '',
  designation: '',
  qualification: '',
  status: 'ACTIVE' as const,
  joiningDate: '',
  subjectIds: [] as string[],
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

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const loadOptions = useCallback(async () => {
    try {
      const res = await fetch('/api/batches/options');
      if (res.ok) {
        const data = await res.json();
        setBranches(data.branches || []);
        const allSubjects = new Map<string, { id: string; name: string; banglaName?: string | null }>();
        for (const p of data.programs || []) {
          for (const c of p.classes || []) {
            for (const s of c.subjects || []) allSubjects.set(s.id, s);
          }
        }
        setSubjects(Array.from(allSubjects.values()));
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
        name: trimmedName,
        banglaName: trimmedBangla,
        phone: normalizedPhone,
        email: trimmedEmail,
        designation: form.designation.trim(),
        qualification: form.qualification.trim(),
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
    setModalOpen(true);
  };

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#063b78] tracking-tight">{dict.teachers.title}</h1>
          <p className="text-[13.5px] text-[#64748b] mt-0.5 font-medium">{dict.teachers.subtitle}</p>
        </div>
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
                          t.batchTeacherAssignments.map((a) => (
                            <span key={a.batch.id} className="text-[11px] font-semibold text-[#063b78] bg-[#eef2f8] px-1.5 py-0.5 rounded">
                              {a.batch.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-[#94a3b8] italic text-[12px]">{dict.teachers.noBatches}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-[12.5px] text-[#64748b]">{t.branch?.name || '—'}</td>
                    <td className="py-3.5 px-4 text-right font-bold text-[#063b78]">
                      {lang === 'bn' ? toBanglaNumeral(t.todaysClassCount) : t.todaysClassCount}
                    </td>
                    <td className="py-3.5 px-4 text-right font-semibold text-[#475569]">
                      {lang === 'bn' ? toBanglaNumeral(t.weeklyClassCount) : t.weeklyClassCount}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={t.status} size="sm" dictKey="teacherStatus" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mobile cards */}
      {!loading && teachers.length > 0 && (
        <div className="md:hidden flex flex-col gap-3">
          {teachers.map((t) => (
            <Link key={t.id} href={`/teachers/${t.id}`} className="card p-4 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-[#092f63] text-[14.5px]">{t.name}</div>
                  <div className="font-mono text-[11px] text-[#8795ab]">{t.teacherCode}</div>
                </div>
                <StatusBadge status={t.status} size="sm" dictKey="teacherStatus" />
              </div>
              <div className="text-[12px] text-[#64748b]">
                {t.teacherSubjects.map((ts) => ts.subject.name).join(', ') || dict.teachers.noSubjects}
              </div>
              <div className="flex items-center justify-between text-[11.5px] text-[#64748b] pt-1.5 border-t border-[#f1f5f9]">
                <span>{dict.teachers.todaysClasses}: <strong className="text-[#063b78]">{t.todaysClassCount}</strong></span>
                <span>{dict.teachers.weeklyClasses}: <strong>{t.weeklyClassCount}</strong></span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card p-6 bg-white max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto scroll">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-base text-[#063b78]">{dict.teachers.createBtn}</h3>
              <button onClick={() => setModalOpen(false)} className="text-[#64748b] hover:text-black">
                <Icon name="x" size={18} />
              </button>
            </div>
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
              <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                <option value="">—</option>
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
            <div className="fld">
              <label>{dict.teachers.subjects}</label>
              <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto scroll border border-[#dce5f0] rounded-xl p-2">
                {subjects.map((s) => (
                  <label key={s.id} className="flex items-center gap-1.5 text-[12.5px] text-[#092f63]">
                    <input
                      type="checkbox"
                      checked={form.subjectIds.includes(s.id)}
                      onChange={() =>
                        setForm((f) => ({
                          ...f,
                          subjectIds: f.subjectIds.includes(s.id) ? f.subjectIds.filter((x) => x !== s.id) : [...f.subjectIds, s.id],
                        }))
                      }
                    />
                    {lang === 'bn' && s.banglaName ? s.banglaName : s.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModalOpen(false)} className="tb">{lang === 'bn' ? 'বাতিল' : 'Cancel'}</button>
              <button type="button" onClick={createTeacher} disabled={saving} className="primary">
                {saving ? '…' : dict.teachers.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
