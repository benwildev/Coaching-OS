'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';
import { COURSE_STATUSES } from '@/lib/validations/course';

interface HierarchyProgram {
  id: string;
  name: string;
  banglaName?: string | null;
  classes: Array<{
    id: string;
    name: string;
    banglaName?: string | null;
    groups: Array<{ id: string; name: string; banglaName?: string | null }>;
  }>;
}

interface CourseItem {
  id: string;
  name: string;
  banglaName?: string | null;
  code: string;
  description?: string | null;
  durationMonths: number;
  fee: string | number;
  status: string;
  academicProgram: { id: string; name: string; banglaName?: string | null };
  academicClass: { id: string; name: string; banglaName?: string | null };
  academicGroup?: { id: string; name: string; banglaName?: string | null } | null;
  courseSubjects: Array<{ id: string; subject: { id: string; name: string; banglaName?: string | null } }>;
  _count?: { batches: number };
}

const emptyNewCourse = {
  name: '',
  banglaName: '',
  code: '',
  description: '',
  academicProgramId: '',
  academicClassId: '',
  academicGroupId: '',
  durationMonths: 12,
  fee: 0,
  status: 'ACTIVE' as const,
};

export default function CoursesPage() {
  const { lang, showToast } = useApp();
  const dict = DICTIONARY[lang];

  const [search, setSearch] = useState('');
  const [programFilter, setProgramFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [programs, setPrograms] = useState<HierarchyProgram[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<typeof emptyNewCourse>(emptyNewCourse);

  const loadOptions = useCallback(async () => {
    try {
      const res = await fetch('/api/batches/options');
      if (res.ok) {
        const data = await res.json();
        setPrograms(data.programs || []);
      }
    } catch (err) {
      console.error('Failed to load academic options', err);
    }
  }, []);

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set('search', search.trim());
      if (programFilter !== 'all') q.set('program', programFilter);
      if (classFilter !== 'all') q.set('class', classFilter);
      if (groupFilter !== 'all') q.set('group', groupFilter);
      if (statusFilter !== 'all') q.set('status', statusFilter);
      q.set('pageSize', '100');

      const res = await fetch(`/api/courses?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCourses(data.courses || []);
      }
    } catch (err) {
      console.error('Failed to load courses', err);
    } finally {
      setLoading(false);
    }
  }, [search, programFilter, classFilter, groupFilter, statusFilter]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    const t = setTimeout(fetchCourses, 250);
    return () => clearTimeout(t);
  }, [fetchCourses]);

  const selectedProgram = programs.find((p) => p.id === form.academicProgramId);
  const availableClasses = selectedProgram?.classes || [];
  const selectedClass = availableClasses.find((c) => c.id === form.academicClassId);
  const availableGroups = selectedClass?.groups || [];

  const filterProgram = programs.find((p) => p.id === programFilter);
  const filterClasses = filterProgram?.classes || [];
  const filterClassObj = filterClasses.find((c) => c.id === classFilter);
  const filterGroups = filterClassObj?.groups || [];

  const createCourse = async () => {
    if (!form.name.trim() || !form.code.trim() || !form.academicProgramId || !form.academicClassId) {
      showToast(lang === 'bn' ? 'নাম, কোড, প্রোগ্রাম ও শ্রেণি আবশ্যক' : 'Name, code, program and class are required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          durationMonths: Number(form.durationMonths) || 12,
          fee: Number(form.fee) || 0,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(lang === 'bn' ? 'কোর্স তৈরি হয়েছে' : 'Course created successfully');
        setModalOpen(false);
        setForm(emptyNewCourse);
        fetchCourses();
      } else {
        showToast(data.error || 'Failed to create course');
      }
    } catch {
      showToast('Error creating course');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#063b78] tracking-tight">{dict.courses.title}</h1>
          <p className="text-[13.5px] text-[#64748b] mt-0.5 font-medium">{dict.courses.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#063b78] px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm hover:bg-[#052e5e] transition-colors"
        >
          <Icon name="plus" size={17} />
          <span>{dict.courses.createBtn}</span>
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4 md:p-5 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-3.5">
        <div className="flex items-center gap-2.5 rounded-xl border border-[#dce5f0] px-3.5 py-2.5 bg-[#f8fafc] max-w-lg focus-within:border-[#063b78] focus-within:bg-white transition-colors">
          <Icon name="search" size={17} className="text-[#64748b]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={dict.courses.searchPlaceholder}
            className="bg-transparent outline-none w-full text-[13.5px] text-[#092f63] placeholder:text-[#94a3b8]"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <select
            value={programFilter}
            onChange={(e) => {
              setProgramFilter(e.target.value);
              setClassFilter('all');
              setGroupFilter('all');
            }}
            className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78]"
          >
            <option value="all">{dict.courses.filterProgram}: {dict.courses.all}</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>{lang === 'bn' && p.banglaName ? p.banglaName : p.name}</option>
            ))}
          </select>
          <select
            value={classFilter}
            disabled={programFilter === 'all'}
            onChange={(e) => {
              setClassFilter(e.target.value);
              setGroupFilter('all');
            }}
            className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78] disabled:opacity-50"
          >
            <option value="all">{dict.courses.filterClass}: {dict.courses.all}</option>
            {filterClasses.map((c) => (
              <option key={c.id} value={c.id}>{lang === 'bn' && c.banglaName ? c.banglaName : c.name}</option>
            ))}
          </select>
          <select
            value={groupFilter}
            disabled={filterGroups.length === 0}
            onChange={(e) => setGroupFilter(e.target.value)}
            className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78] disabled:opacity-50"
          >
            <option value="all">{dict.courses.filterGroup}: {dict.courses.all}</option>
            {filterGroups.map((g) => (
              <option key={g.id} value={g.id}>{lang === 'bn' && g.banglaName ? g.banglaName : g.name}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78]"
          >
            <option value="all">{dict.courses.filterStatus}: {dict.courses.all}</option>
            {COURSE_STATUSES.map((s) => (
              <option key={s} value={s}>{(dict.courseStatus as any)[s]}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="card p-12 rounded-2xl bg-white border border-[#dce5f0] text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
        </div>
      ) : courses.length === 0 ? (
        <div className="card p-12 md:p-16 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs text-center flex flex-col items-center">
          <div className="h-16 w-16 rounded-2xl bg-blue-50 text-[#063b78] flex items-center justify-center mb-4">
            <Icon name="book" size={32} />
          </div>
          <h2 className="text-xl font-bold text-[#063b78]">{dict.courses.emptyTitle}</h2>
          <p className="text-[14px] text-[#64748b] max-w-md mt-1.5 font-normal">{dict.courses.emptyDesc}</p>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#063b78] px-6 py-2.5 text-[14px] font-semibold text-white shadow-sm hover:bg-[#052e5e] transition-colors"
          >
            <Icon name="plus" size={17} />
            <span>{dict.courses.emptyAction}</span>
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((c) => (
            <Link
              key={c.id}
              href={`/courses/${c.id}`}
              className="card p-4 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs hover:border-[#063b78] transition-colors flex flex-col gap-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-[#092f63] text-[15px] leading-tight">{c.name}</div>
                  {c.banglaName && <div className="text-[12px] text-[#64748b] mt-0.5">{c.banglaName}</div>}
                </div>
                <StatusBadge status={c.status} size="sm" dictKey="courseStatus" />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                <span className="font-mono font-bold rounded bg-blue-50 px-2 py-0.5 text-[#063b78]">{c.code}</span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-[#475569]">
                  {lang === 'bn' && c.academicProgram.banglaName ? c.academicProgram.banglaName : c.academicProgram.name}
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-[#475569]">
                  {lang === 'bn' && c.academicClass.banglaName ? c.academicClass.banglaName : c.academicClass.name}
                </span>
                {c.academicGroup && (
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-[#475569]">
                    {lang === 'bn' && c.academicGroup.banglaName ? c.academicGroup.banglaName : c.academicGroup.name}
                  </span>
                )}
              </div>
              {c.courseSubjects.length > 0 && (
                <div className="text-[11.5px] text-[#64748b]">
                  {c.courseSubjects.map((cs) => (lang === 'bn' && cs.subject.banglaName ? cs.subject.banglaName : cs.subject.name)).join(' · ')}
                </div>
              )}
              <div className="flex items-center justify-between text-[11.5px] text-[#64748b] pt-1.5 border-t border-[#f1f5f9]">
                <span>{c.durationMonths} {lang === 'bn' ? 'মাস' : 'months'}</span>
                <span>{c._count?.batches ?? 0} {lang === 'bn' ? 'ব্যাচ' : 'batches'}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Course Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card p-6 bg-white max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto scroll">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-base text-[#063b78]">{dict.courses.createBtn}</h3>
              <button onClick={() => setModalOpen(false)} className="text-[#64748b] hover:text-black">
                <Icon name="x" size={18} />
              </button>
            </div>

            <div className="fld">
              <label>{dict.courses.name} *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="fld">
              <label>{dict.courses.banglaName}</label>
              <input value={form.banglaName} onChange={(e) => setForm({ ...form, banglaName: e.target.value })} />
            </div>
            <div className="fld">
              <label>{dict.courses.code} *</label>
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
            </div>
            <div className="fld">
              <label>{dict.courses.description}</label>
              <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="fld">
              <label>{dict.courses.program} *</label>
              <select
                value={form.academicProgramId}
                onChange={(e) => setForm({ ...form, academicProgramId: e.target.value, academicClassId: '', academicGroupId: '' })}
              >
                <option value="">—</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>{lang === 'bn' && p.banglaName ? p.banglaName : p.name}</option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label>{dict.courses.class} *</label>
              <select
                value={form.academicClassId}
                disabled={!form.academicProgramId}
                onChange={(e) => setForm({ ...form, academicClassId: e.target.value, academicGroupId: '' })}
              >
                <option value="">—</option>
                {availableClasses.map((c) => (
                  <option key={c.id} value={c.id}>{lang === 'bn' && c.banglaName ? c.banglaName : c.name}</option>
                ))}
              </select>
            </div>
            {availableGroups.length > 0 && (
              <div className="fld">
                <label>{dict.courses.group}</label>
                <select value={form.academicGroupId} onChange={(e) => setForm({ ...form, academicGroupId: e.target.value })}>
                  <option value="">—</option>
                  {availableGroups.map((g) => (
                    <option key={g.id} value={g.id}>{lang === 'bn' && g.banglaName ? g.banglaName : g.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="fld">
                <label>{dict.courses.duration}</label>
                <input
                  type="number"
                  min={1}
                  value={form.durationMonths}
                  onChange={(e) => setForm({ ...form, durationMonths: Number(e.target.value) })}
                />
              </div>
              <div className="fld">
                <label>{dict.courses.fee}</label>
                <input type="number" min={0} value={form.fee} onChange={(e) => setForm({ ...form, fee: Number(e.target.value) })} />
              </div>
            </div>
            <div className="fld">
              <label>{dict.courses.status}</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })}>
                {COURSE_STATUSES.map((s) => (
                  <option key={s} value={s}>{(dict.courseStatus as any)[s]}</option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModalOpen(false)} className="tb">
                {lang === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button type="button" onClick={createCourse} disabled={saving} className="primary">
                {saving ? '…' : dict.courses.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
