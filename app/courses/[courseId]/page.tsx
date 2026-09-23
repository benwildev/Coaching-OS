'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';
import { COURSE_STATUSES } from '@/lib/validations/course';

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
  const { lang, showToast } = useApp();
  const dict = DICTIONARY[lang];

  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [availableSubjects, setAvailableSubjects] = useState<SubjectOption[]>([]);

  const [editForm, setEditForm] = useState({
    name: '', banglaName: '', code: '', description: '', durationMonths: 12, fee: 0, status: 'ACTIVE',
  });

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
            fee: Number(c.fee),
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
    setSaving(true);
    try {
      const res = await fetch(`/api/courses/${courseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editForm,
          durationMonths: Number(editForm.durationMonths),
          fee: Number(editForm.fee),
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

  return (
    <div className="max-w-[1000px] mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <Link href="/courses" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#063b78] hover:underline">
          <Icon name="chevleft" size={16} />
          <span>{lang === 'bn' ? 'কোর্স তালিকায় ফিরুন' : 'Back to Courses'}</span>
        </Link>
        <StatusBadge status={course.status} dictKey="courseStatus" />
      </div>

      <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[#063b78]">{dict.courses.title.replace(/s$/, '')} {lang === 'bn' ? 'তথ্য' : 'Details'}</h2>
          {course.status !== 'ARCHIVED' && (
            <button type="button" onClick={archiveCourse} className="text-[12.5px] font-semibold text-rose-600 hover:underline">
              {dict.courses.archive}
            </button>
          )}
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="fld">
            <label>{dict.courses.name}</label>
            <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          </div>
          <div className="fld">
            <label>{dict.courses.banglaName}</label>
            <input value={editForm.banglaName} onChange={(e) => setEditForm({ ...editForm, banglaName: e.target.value })} />
          </div>
          <div className="fld">
            <label>{dict.courses.code}</label>
            <input value={editForm.code} onChange={(e) => setEditForm({ ...editForm, code: e.target.value.toUpperCase() })} />
          </div>
          <div className="fld">
            <label>{dict.courses.status}</label>
            <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
              {COURSE_STATUSES.map((s) => (
                <option key={s} value={s}>{(dict.courseStatus as any)[s]}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label>{dict.courses.duration}</label>
            <input
              type="number"
              value={editForm.durationMonths}
              onChange={(e) => setEditForm({ ...editForm, durationMonths: Number(e.target.value) })}
            />
          </div>
          <div className="fld">
            <label>{dict.courses.fee}</label>
            <input type="number" value={editForm.fee} onChange={(e) => setEditForm({ ...editForm, fee: Number(e.target.value) })} />
          </div>
          <div className="fld md:col-span-2">
            <label>{dict.courses.description}</label>
            <textarea rows={2} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
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
          <div className="md:col-span-2 pt-2">
            <button type="button" onClick={saveDetails} disabled={saving} className="primary">
              {saving ? '…' : dict.courses.save}
            </button>
          </div>
        </div>
      </div>

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
                    placeholder={dict.courses.totalMarks}
                    value={s.totalMarks}
                    onChange={(e) => {
                      const next = [...subjectDraft];
                      next[idx] = { ...next[idx], totalMarks: e.target.value };
                      setSubjectDraft(next);
                    }}
                    className="w-24 rounded-lg border border-[#dce5f0] px-2 py-1 text-[12.5px]"
                  />
                  <button
                    type="button"
                    onClick={() => setSubjectDraft(subjectDraft.filter((_, i) => i !== idx))}
                    className="text-rose-600 hover:text-rose-700"
                  >
                    <Icon name="x" size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[13px] text-[#94a3b8] italic">{dict.courses.noSubjects}</p>
        )}

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
      </div>

      {course.batches.length > 0 && (
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
