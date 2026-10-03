'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';
import { COURSE_STATUSES } from '@/lib/validations/course';
import EnglishInput from '@/components/EnglishInput';
import BanglaInput from '@/components/BanglaInput';
import { hasBangla, hasEnglish } from '@/lib/format';
import CoursePricingPanel from '@/components/CoursePricingPanel';
import CourseStudentsTab from '@/components/CourseStudentsTab';
import CourseScheduleTab from '@/components/CourseScheduleTab';

interface SubjectOption {
  id: string;
  name: string;
  banglaName?: string | null;
}

interface CourseDetail {
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
  courseSubjects: Array<{
    id: string;
    displayOrder: number;
    isMandatory: boolean;
    totalMarks?: string | number | null;
    subject: { id: string; name: string; banglaName?: string | null };
  }>;
  batches: Array<{ id: string; name: string; code: string; status: string; capacity: number }>;
}

export default function CourseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.courseId as string;
  const { lang, showToast, can } = useApp();
  const dict = DICTIONARY[lang];

  const canUpdate = can('courses.update');
  const canDelete = can('courses.delete');
  const canViewFees = can('courses.pricing.update') || can('fees.read');

  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [availableSubjects, setAvailableSubjects] = useState<SubjectOption[]>([]);

  const [editForm, setEditForm] = useState({
    name: '', banglaName: '', code: '', description: '', durationMonths: 12, status: 'ACTIVE',
  });
  // Course Fee lives in the Fee & Payment Plan tab, not in this basic-info form.
  const [tab, setTab] = useState<'overview' | 'students' | 'batches' | 'schedule' | 'fees'>('overview');

  const [subjectDraft, setSubjectDraft] = useState<
    Array<{ subjectId: string; isMandatory: boolean; totalMarks: string }>
  >([]);
  const [addSubjectId, setAddSubjectId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [courseRes, optionsRes] = await Promise.all([
        fetch(`/api/courses/${courseId}`),
        fetch('/api/batches/options'),
      ]);
      if (courseRes.status === 403) {
        setForbidden(true);
        return;
      }
      if (courseRes.ok) {
        const data = await courseRes.json();
        if (data.success) {
          const c: CourseDetail = data.course;
          setCourse(c);
          setEditForm({
            name: c.name,
            banglaName: c.banglaName || '',
            code: c.code,
            description: c.description || '',
            durationMonths: c.durationMonths,
            status: c.status,
          });
          setSubjectDraft(
            c.courseSubjects
              .sort((a, b) => a.displayOrder - b.displayOrder)
              .map((cs) => ({
                subjectId: cs.subject.id,
                isMandatory: cs.isMandatory,
                totalMarks: cs.totalMarks != null ? String(cs.totalMarks) : '',
              }))
          );

          if (optionsRes.ok) {
            const optData = await optionsRes.json();
            const program = (optData.programs || []).find((p: any) => p.id === c.academicProgram.id);
            const cls = program?.classes?.find((cl: any) => cl.id === c.academicClass.id);
            setAvailableSubjects(cls?.subjects || []);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load course', err);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  const saveDetails = async () => {
    if (!canUpdate) return;
    if (editForm.name && hasBangla(editForm.name)) {
      showToast(lang === 'bn' ? 'কোর্সের নাম ইংরেজিতে লিখুন' : 'Course name must be in English');
      return;
    }
    if (editForm.banglaName && hasEnglish(editForm.banglaName)) {
      showToast(lang === 'bn' ? 'কোর্সের বাংলা নাম শুধুমাত্র বাংলায় লিখুন' : 'Course Bangla name must not contain English characters');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/courses/${courseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editForm,
          durationMonths: Number(editForm.durationMonths),
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(lang === 'bn' ? 'কোর্স আপডেট হয়েছে' : 'Course updated successfully');
        load();
      } else {
        showToast(data.error || 'Failed to update course');
      }
    } finally {
      setSaving(false);
    }
  };

  const saveSubjects = async () => {
    if (!canUpdate) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/subjects`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjects: subjectDraft.map((s, idx) => ({
            subjectId: s.subjectId,
            displayOrder: idx,
            isMandatory: s.isMandatory,
            totalMarks: s.totalMarks ? Number(s.totalMarks) : null,
            status: 'ACTIVE',
          })),
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(lang === 'bn' ? 'বিষয়সমূহ সংরক্ষিত হয়েছে' : 'Subjects saved successfully');
        load();
      } else {
        showToast(data.error || 'Failed to save subjects');
      }
    } finally {
      setSaving(false);
    }
  };

  const archiveCourse = async () => {
    if (!canDelete) return;
    const res = await fetch(`/api/courses/${courseId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast(lang === 'bn' ? 'কোর্স আর্কাইভ হয়েছে' : 'Course archived');
      router.push('/courses');
    } else {
      showToast(data.error || 'Failed to archive course');
    }
  };

  if (loading) {
    return (
      <div className="max-w-[1000px] mx-auto flex items-center justify-center min-h-[300px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#063b78] border-t-transparent" />
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="max-w-[800px] mx-auto py-12 text-center">
        <div className="p-8 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col items-center">
          <Icon name="shield" size={32} className="text-rose-500 mb-3" />
          <h2 className="text-xl font-bold text-[#092f63]">
            {lang === 'bn' ? 'অনুমতি নেই (Forbidden)' : 'Access Forbidden'}
          </h2>
          <p className="text-[13.5px] text-[#64748b] mt-1 mb-5">
            {lang === 'bn'
              ? 'এই কোর্সের তথ্য দেখার আপনার কোনো অনুমতি নেই।'
              : 'You do not have authorization to view this course.'}
          </p>
          <Link
            href="/courses"
            className="inline-flex items-center gap-2 rounded-xl bg-[#063b78] px-5 py-2.5 text-[13.5px] font-semibold text-white"
          >
            <Icon name="chevleft" size={15} />
            <span>{lang === 'bn' ? 'কোর্স তালিকায় ফিরুন' : 'Back to Courses'}</span>
          </Link>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="max-w-[1000px] mx-auto text-center py-16">
        <p className="text-[#64748b]">Course not found.</p>
        <Link href="/courses" className="text-[#063b78] font-semibold hover:underline">
          {dict.batches.back.replace('Batch', 'Course')}
        </Link>
      </div>
    );
  }

  const unusedSubjects = availableSubjects.filter((s) => !subjectDraft.some((d) => d.subjectId === s.id));

  const tabs: Array<{ id: 'overview' | 'students' | 'batches' | 'schedule' | 'fees'; text: string }> = [
    { id: 'overview', text: lang === 'bn' ? 'সারসংক্ষেপ' : 'Overview' },
    { id: 'students', text: lang === 'bn' ? 'শিক্ষার্থীবৃন্দ' : 'Students' },
    { id: 'batches', text: dict.batches.title },
    { id: 'schedule', text: lang === 'bn' ? 'ক্লাস রুটিন' : 'Schedule' },
    ...(canViewFees ? [{ id: 'fees' as const, text: dict.coursePricing.tab }] : []),
  ];

  return (
    <div className="max-w-[1000px] mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <Link href="/courses" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#063b78] hover:underline">
          <Icon name="chevleft" size={16} />
          <span>{lang === 'bn' ? 'কোর্স তালিকায় ফিরুন' : 'Back to Courses'}</span>
        </Link>
        <StatusBadge status={course.status} dictKey="courseStatus" />
      </div>

      <div role="tablist" className="flex gap-1 border-b border-[#dce5f0]">
        {tabs.map(({ id, text }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`px-4 py-2.5 text-[13.5px] font-semibold border-b-2 -mb-px transition-colors ${
              tab === id ? 'border-[#063b78] text-[#063b78]' : 'border-transparent text-[#64748b] hover:text-[#063b78]'
            }`}
          >
            {text}
          </button>
        ))}
      </div>

      {tab === 'fees' && canViewFees && <CoursePricingPanel courseId={courseId} />}
      {tab === 'students' && <CourseStudentsTab courseId={courseId} />}
      {tab === 'schedule' && <CourseScheduleTab courseId={courseId} />}

      {tab === 'overview' && (
      <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[#063b78]">{dict.courses.title.replace(/s$/, '')} {lang === 'bn' ? 'তথ্য' : 'Details'}</h2>
          {canDelete && course.status !== 'ARCHIVED' && (
            <button type="button" onClick={archiveCourse} className="text-[12.5px] font-semibold text-rose-600 hover:underline">
              {dict.courses.archive}
            </button>
          )}
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="fld">
            <label>{dict.courses.name}</label>
            <EnglishInput disabled={!canUpdate} value={editForm.name} onChange={(val) => setEditForm({ ...editForm, name: val })} />
          </div>
          <div className="fld">
            <label>{dict.courses.banglaName}</label>
            <BanglaInput disabled={!canUpdate} value={editForm.banglaName || ''} onChange={(val) => setEditForm({ ...editForm, banglaName: val })} />
          </div>
          <div className="fld">
            <label>{dict.courses.code}</label>
            <input disabled={!canUpdate} value={editForm.code} onChange={(e) => setEditForm({ ...editForm, code: e.target.value.toUpperCase() })} />
          </div>
          <div className="fld">
            <label>{dict.courses.status}</label>
            <select disabled={!canUpdate} value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
              {COURSE_STATUSES.map((s) => (
                <option key={s} value={s}>{(dict.courseStatus as any)[s]}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label>{dict.courses.duration}</label>
            <input
              type="number"
              disabled={!canUpdate}
              value={editForm.durationMonths}
              onChange={(e) => setEditForm({ ...editForm, durationMonths: Number(e.target.value) })}
            />
          </div>
          <div className="fld md:col-span-2">
            <label>{dict.courses.description}</label>
            <textarea disabled={!canUpdate} rows={2} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
          </div>
          <div className="md:col-span-2 flex items-center gap-2 text-[12.5px] text-[#64748b]">
            <span className="font-semibold text-[#092f63]">
              {lang === 'bn' && course.academicProgram.banglaName ? course.academicProgram.banglaName : course.academicProgram.name}
            </span>
            <span>›</span>
            <span>{lang === 'bn' && course.academicClass.banglaName ? course.academicClass.banglaName : course.academicClass.name}</span>
            {course.academicGroup && (
              <>
                <span>›</span>
                <span>{lang === 'bn' && course.academicGroup.banglaName ? course.academicGroup.banglaName : course.academicGroup.name}</span>
              </>
            )}
          </div>
          {canUpdate && (
            <div className="md:col-span-2 pt-2">
              <button type="button" onClick={saveDetails} disabled={saving} className="primary">
                {saving ? '…' : dict.courses.save}
              </button>
            </div>
          )}
        </div>
      </div>
      )}

      {tab === 'overview' && (
      <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
        <h2 className="text-lg font-bold text-[#063b78] mb-1">{dict.courses.subjects}</h2>
        <p className="text-[12.5px] text-[#64748b] mb-4">{dict.courses.noSubjects}</p>

        {subjectDraft.length > 0 ? (
          <div className="divide-y divide-[#edf1f7]">
            {subjectDraft.map((s, idx) => {
              const meta = availableSubjects.find((a) => a.id === s.subjectId);
              return (
                <div key={s.subjectId} className="py-2.5 flex items-center gap-3 flex-wrap">
                  <span className="font-semibold text-[#092f63] text-[13.5px] grow min-w-[140px]">
                    {meta ? (lang === 'bn' && meta.banglaName ? meta.banglaName : meta.name) : s.subjectId}
                  </span>
                  <label className="flex items-center gap-1.5 text-[12px] text-[#64748b]">
                    <input
                      type="checkbox"
                      disabled={!canUpdate}
                      checked={s.isMandatory}
                      onChange={(e) => {
                        const next = [...subjectDraft];
                        next[idx] = { ...next[idx], isMandatory: e.target.checked };
                        setSubjectDraft(next);
                      }}
                    />
                    {dict.courses.mandatory}
                  </label>
                  <input
                    type="number"
                    disabled={!canUpdate}
                    placeholder={dict.courses.totalMarks}
                    value={s.totalMarks}
                    onChange={(e) => {
                      const next = [...subjectDraft];
                      next[idx] = { ...next[idx], totalMarks: e.target.value };
                      setSubjectDraft(next);
                    }}
                    className="w-24 rounded-lg border border-[#dce5f0] px-2 py-1 text-[12.5px] disabled:bg-slate-50"
                  />
                  {canUpdate && (
                    <button
                      type="button"
                      onClick={() => setSubjectDraft(subjectDraft.filter((_, i) => i !== idx))}
                      className="text-rose-600 hover:text-rose-700"
                    >
                      <Icon name="x" size={16} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[13px] text-[#94a3b8] italic">{dict.courses.noSubjects}</p>
        )}

        {canUpdate && (
          <>
            <div className="flex items-center gap-2 mt-4">
              <select
                value={addSubjectId}
                onChange={(e) => setAddSubjectId(e.target.value)}
                className="grow rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px]"
              >
                <option value="">{lang === 'bn' ? 'বিষয় নির্বাচন করুন' : 'Select a subject'}</option>
                {unusedSubjects.map((s) => (
                  <option key={s.id} value={s.id}>{lang === 'bn' && s.banglaName ? s.banglaName : s.name}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!addSubjectId}
                onClick={() => {
                  setSubjectDraft([...subjectDraft, { subjectId: addSubjectId, isMandatory: true, totalMarks: '' }]);
                  setAddSubjectId('');
                }}
                className="tb disabled:opacity-40"
              >
                {dict.courses.addSubject}
              </button>
            </div>

            <div className="pt-4">
              <button type="button" onClick={saveSubjects} disabled={saving} className="primary">
                {saving ? '…' : dict.courses.saveSubjects}
              </button>
            </div>
          </>
        )}
      </div>
      )}

      {tab === 'batches' && course.batches.length === 0 && (
        <p className="text-[13px] text-[#94a3b8] italic">{dict.batches.emptyTitle}</p>
      )}

      {tab === 'batches' && course.batches.length > 0 && (
        <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
          <h2 className="text-lg font-bold text-[#063b78] mb-3">{dict.courses.batchesUsing}</h2>
          <div className="flex flex-wrap gap-2">
            {course.batches.map((b) => (
              <Link
                key={b.id}
                href={`/batches/${b.id}`}
                className="px-3 py-1.5 rounded-lg border border-[#dce5f0] bg-[#f8fafc] text-[12.5px] font-semibold text-[#092f63] hover:border-[#063b78]"
              >
                {b.name} <span className="text-[#94a3b8] font-mono">({b.code})</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
