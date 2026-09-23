'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';
import { BATCH_STATUSES } from '@/lib/validations/batch';

interface OptionsData {
  branches: Array<{ id: string; name: string; banglaName?: string | null; isMain: boolean }>;
  sessions: Array<{ id: string; name: string; banglaName?: string | null; isCurrent: boolean }>;
  programs: Array<{
    id: string;
    name: string;
    banglaName?: string | null;
    code: string;
    classes: Array<{
      id: string;
      name: string;
      banglaName?: string | null;
      code: string;
      groups: Array<{ id: string; name: string; banglaName?: string | null; code: string }>;
      subjects: Array<{ id: string; name: string; banglaName?: string | null }>;
    }>;
  }>;
  courses: Array<{
    id: string;
    name: string;
    banglaName?: string | null;
    academicProgramId: string;
    academicClassId: string;
    academicGroupId?: string | null;
    courseSubjects: Array<{ subject: { id: string; name: string; banglaName?: string | null } }>;
  }>;
  batches: Array<{ id: string; code: string; academicProgramId: string; academicClassId: string; academicGroupId?: string | null; academicSessionId: string }>;
}

export default function NewBatchPage() {
  const router = useRouter();
  const { lang, showToast } = useApp();
  const dict = DICTIONARY[lang];

  const [options, setOptions] = useState<OptionsData>({ branches: [], sessions: [], programs: [], courses: [], batches: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [codeEdited, setCodeEdited] = useState(false);

  const [form, setForm] = useState({
    name: '',
    banglaName: '',
    code: '',
    description: '',
    branchId: '',
    academicSessionId: '',
    academicProgramId: '',
    academicClassId: '',
    academicGroupId: '',
    courseId: '',
    capacity: 40,
    startDate: '',
    endDate: '',
    status: 'PLANNED' as const,
  });

  const [subjectIds, setSubjectIds] = useState<string[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/batches/options');
        if (res.ok) {
          const data = await res.json();
          setOptions(data);
          const currentSession = data.sessions.find((s: any) => s.isCurrent) || data.sessions[0];
          const mainBranch = data.branches.find((b: any) => b.isMain) || data.branches[0];
          setForm((prev) => ({
            ...prev,
            academicSessionId: currentSession?.id || '',
            branchId: mainBranch?.id || '',
          }));
        }
      } catch (err) {
        console.error('Failed to load options', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const selectedProgram = options.programs.find((p) => p.id === form.academicProgramId);
  const availableClasses = selectedProgram?.classes || [];
  const selectedClass = availableClasses.find((c) => c.id === form.academicClassId);
  const availableGroups = selectedClass?.groups || [];
  const availableSubjects = selectedClass?.subjects || [];
  const availableCourses = options.courses.filter(
    (c) => c.academicProgramId === form.academicProgramId && c.academicClassId === form.academicClassId
  );

  // Auto-suggest a human-readable code whenever the hierarchy selection changes,
  // unless the staff member has already typed a custom code. Recomputed each
  // render (cheap, small arrays) rather than memoized, since the inputs are
  // themselves derived and not stable across renders.
  function computeSuggestedCode(): string {
    if (!selectedProgram || !selectedClass) return '';
    const groupObj = availableGroups.find((g) => g.id === form.academicGroupId);
    const session = options.sessions.find((s) => s.id === form.academicSessionId);
    const yearShort = session?.name?.match(/\d{2}$/)?.[0] || '';

    const siblingCount = options.batches.filter(
      (b) =>
        b.academicProgramId === form.academicProgramId &&
        b.academicClassId === form.academicClassId &&
        b.academicGroupId === (form.academicGroupId || null) &&
        b.academicSessionId === form.academicSessionId
    ).length;
    const letter = String.fromCharCode(65 + siblingCount); // A, B, C...

    const parts = [selectedProgram.code + selectedClass.code.replace(/[^0-9]/g, '')];
    if (groupObj) parts.push(groupObj.code.slice(0, 3));
    parts.push(letter);
    if (yearShort) parts.push(yearShort);
    return parts.join('-').toUpperCase();
  }

  const suggestedCode = computeSuggestedCode();

  useEffect(() => {
    if (!codeEdited && suggestedCode) {
      setForm((prev) => ({ ...prev, code: suggestedCode }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedCode, codeEdited]);

  const handleCourseSelect = (courseId: string) => {
    setForm({ ...form, courseId });
    const course = options.courses.find((c) => c.id === courseId);
    if (course) {
      setSubjectIds(course.courseSubjects.map((cs) => cs.subject.id));
    }
  };

  const toggleSubject = (id: string) => {
    setSubjectIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const submit = async () => {
    if (!form.name.trim() || !form.code.trim() || !form.branchId || !form.academicSessionId || !form.academicProgramId || !form.academicClassId) {
      showToast(lang === 'bn' ? 'সব আবশ্যক তথ্য পূরণ করুন' : 'Please fill in all required fields');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, capacity: Number(form.capacity), subjectIds }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(lang === 'bn' ? 'ব্যাচ তৈরি হয়েছে' : 'Batch created successfully');
        router.push(`/batches/${data.batch.id}`);
      } else {
        showToast(data.error || 'Failed to create batch');
      }
    } catch {
      showToast('Error creating batch');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-[900px] mx-auto flex items-center justify-center min-h-[300px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#063b78] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-[900px] mx-auto flex flex-col gap-6">
      <div>
        <Link href="/batches" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#063b78] hover:underline mb-2">
          <Icon name="chevleft" size={16} />
          <span>{dict.batches.back}</span>
        </Link>
        <h1 className="text-2xl font-extrabold text-[#063b78] tracking-tight">{dict.batches.createBtn}</h1>
      </div>

      <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="fld">
            <label>{dict.batches.branch} *</label>
            <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
              <option value="">—</option>
              {options.branches.map((b) => (
                <option key={b.id} value={b.id}>{lang === 'bn' && b.banglaName ? b.banglaName : b.name}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label>{dict.batches.session} *</label>
            <select value={form.academicSessionId} onChange={(e) => setForm({ ...form, academicSessionId: e.target.value })}>
              <option value="">—</option>
              {options.sessions.map((s) => (
                <option key={s.id} value={s.id}>{lang === 'bn' && s.banglaName ? s.banglaName : s.name}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label>{dict.batches.program} *</label>
            <select
              value={form.academicProgramId}
              onChange={(e) => setForm({ ...form, academicProgramId: e.target.value, academicClassId: '', academicGroupId: '', courseId: '' })}
            >
              <option value="">—</option>
              {options.programs.map((p) => (
                <option key={p.id} value={p.id}>{lang === 'bn' && p.banglaName ? p.banglaName : p.name}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label>{dict.batches.class} *</label>
            <select
              value={form.academicClassId}
              disabled={!form.academicProgramId}
              onChange={(e) => setForm({ ...form, academicClassId: e.target.value, academicGroupId: '', courseId: '' })}
            >
              <option value="">—</option>
              {availableClasses.map((c) => (
                <option key={c.id} value={c.id}>{lang === 'bn' && c.banglaName ? c.banglaName : c.name}</option>
              ))}
            </select>
          </div>
          {availableGroups.length > 0 && (
            <div className="fld">
              <label>{dict.batches.group}</label>
              <select value={form.academicGroupId} onChange={(e) => setForm({ ...form, academicGroupId: e.target.value, courseId: '' })}>
                <option value="">—</option>
                {availableGroups.map((g) => (
                  <option key={g.id} value={g.id}>{lang === 'bn' && g.banglaName ? g.banglaName : g.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="fld">
            <label>{dict.batches.course}</label>
            <select value={form.courseId} onChange={(e) => handleCourseSelect(e.target.value)} disabled={!form.academicClassId}>
              <option value="">—</option>
              {availableCourses.map((c) => (
                <option key={c.id} value={c.id}>{lang === 'bn' && c.banglaName ? c.banglaName : c.name}</option>
              ))}
            </select>
          </div>

          <div className="fld">
            <label>{dict.batches.name} *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="fld">
            <label>{dict.batches.banglaName}</label>
            <input value={form.banglaName} onChange={(e) => setForm({ ...form, banglaName: e.target.value })} />
          </div>
          <div className="fld">
            <label>{dict.batches.code} *</label>
            <input
              value={form.code}
              onChange={(e) => {
                setCodeEdited(true);
                setForm({ ...form, code: e.target.value.toUpperCase() });
              }}
            />
            <p className="text-[11px] text-[#8795ab] mt-1">{dict.batches.codeHint}</p>
          </div>
          <div className="fld">
            <label>{dict.batches.capacity}</label>
            <input type="number" min={1} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
          </div>
          <div className="fld">
            <label>{dict.batches.startDate}</label>
            <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div className="fld">
            <label>{dict.batches.endDate}</label>
            <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
          <div className="fld">
            <label>{dict.batches.status}</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })}>
              {BATCH_STATUSES.map((s) => (
                <option key={s} value={s}>{(dict.batchStatus as any)[s]}</option>
              ))}
            </select>
          </div>
          <div className="fld md:col-span-2">
            <label>{dict.batches.description}</label>
            <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>
      </div>

      {availableSubjects.length > 0 && (
        <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
          <h2 className="text-[14px] font-bold text-[#063b78] mb-3">{dict.batches.inheritSubjects}</h2>
          <div className="grid sm:grid-cols-2 gap-2">
            {availableSubjects.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-[13px] text-[#092f63] p-2 rounded-lg border border-[#edf1f7]">
                <input type="checkbox" checked={subjectIds.includes(s.id)} onChange={() => toggleSubject(s.id)} />
                {lang === 'bn' && s.banglaName ? s.banglaName : s.name}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Link href="/batches" className="tb">{lang === 'bn' ? 'বাতিল' : 'Cancel'}</Link>
        <button type="button" onClick={submit} disabled={saving} className="primary">
          {saving ? '…' : dict.batches.save}
        </button>
      </div>
    </div>
  );
}
