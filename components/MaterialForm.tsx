'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import Icon from './Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY, pickLocalized } from '@/lib/i18n';
import { useQuestionBankOptions } from '@/lib/hooks/useQuestionBankOptions';
import { MATERIAL_TYPES, createMaterialSchema } from '@/lib/validations/study-material';

type FormInput = z.input<typeof createMaterialSchema>;
type FormOutput = z.output<typeof createMaterialSchema>;

export interface MaterialFormInitial {
  id: string;
  title: string;
  banglaTitle: string | null;
  description: string | null;
  banglaDescription: string | null;
  academicClassId: string;
  academicGroupId: string | null;
  subjectId: string;
  subjectPaperId: string | null;
  batchId: string | null;
  type: string;
  fileUrl: string | null;
  thumbnailUrl: string | null;
  status: string;
}

export default function MaterialForm({ initial }: { initial?: MaterialFormInitial }) {
  const router = useRouter();
  const { lang, showToast } = useApp();
  const t = DICTIONARY[lang];
  const m = t.materials;
  const c = t.common;
  const { options: opts, allClasses } = useQuestionBankOptions();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createMaterialSchema),
    defaultValues: {
      title: initial?.title ?? '',
      banglaTitle: initial?.banglaTitle ?? '',
      description: initial?.description ?? '',
      banglaDescription: initial?.banglaDescription ?? '',
      academicClassId: initial?.academicClassId ?? '',
      academicGroupId: initial?.academicGroupId ?? '',
      subjectId: initial?.subjectId ?? '',
      subjectPaperId: initial?.subjectPaperId ?? '',
      batchId: initial?.batchId ?? '',
      type: (MATERIAL_TYPES as readonly string[]).includes(initial?.type ?? '') ? (initial!.type as FormInput['type']) : 'PDF',
      fileUrl: initial?.fileUrl ?? '',
      thumbnailUrl: initial?.thumbnailUrl ?? '',
      status: initial?.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
    },
  });

  const classId = useWatch({ control, name: 'academicClassId' });
  const groupId = useWatch({ control, name: 'academicGroupId' });
  const subjectId = useWatch({ control, name: 'subjectId' });
  const type = useWatch({ control, name: 'type' });

  const groups = allClasses.find((cl) => cl.id === classId)?.groups || [];
  const subjects = opts.subjects.filter(
    (s) => (!classId || s.academicClassId === classId) && (!groupId || !s.academicGroupId || s.academicGroupId === groupId)
  );
  const papers = opts.subjects.find((s) => s.id === subjectId)?.papers || [];
  const batches = opts.batches.filter(
    (b) => b.academicClassId === classId && (!groupId || !b.academicGroupId || b.academicGroupId === groupId)
  );

  const onSubmit = async (values: FormOutput) => {
    setServerError(null);
    const res = await fetch(initial ? `/api/materials/${initial.id}` : '/api/materials', {
      method: initial ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      const detail = data.details ? Object.values(data.details).flat().join(' · ') : '';
      setServerError(detail || data.message || c.actionFailed);
      return;
    }
    showToast(c.saved);
    router.push(`/materials/${data.material.id}`);
  };

  const err = (msg?: string) => (msg ? <span className="text-[12px] text-rose-600">{msg}</span> : null);

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      <section className="card p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="fld">
          <label htmlFor="m-title">{m.englishTitle} *</label>
          <input id="m-title" {...register('title')} />
          {err(errors.title?.message)}
        </div>
        <div className="fld">
          <label htmlFor="m-title-bn">{m.banglaTitle}</label>
          <input id="m-title-bn" className="font-bangla" {...register('banglaTitle')} />
        </div>
        <div className="fld">
          <label htmlFor="m-type">{m.type} *</label>
          <select id="m-type" {...register('type')}>
            {MATERIAL_TYPES.map((v) => (
              <option key={v} value={v}>{(t.materialType as Record<string, string>)[v]}</option>
            ))}
          </select>
        </div>
        <div className="fld">
          <label htmlFor="m-url">{m.resourceUrl}{type !== 'NOTE' && ' *'}</label>
          <input id="m-url" type="url" placeholder="https://" {...register('fileUrl')} />
          <span className="text-[11.5px] text-[#64748b]">{m.resourceHint}</span>
          {err(errors.fileUrl?.message)}
        </div>
        <div className="fld">
          <label htmlFor="m-desc">{m.description}</label>
          <textarea id="m-desc" rows={type === 'NOTE' ? 6 : 3} {...register('description')} />
          {type === 'NOTE' && <span className="text-[11.5px] text-[#64748b]">{m.noteHint}</span>}
        </div>
        <div className="fld">
          <label htmlFor="m-desc-bn">{m.banglaDescription}</label>
          <textarea id="m-desc-bn" rows={type === 'NOTE' ? 6 : 3} className="font-bangla" {...register('banglaDescription')} />
        </div>
        <div className="fld sm:col-span-2">
          <label htmlFor="m-thumb">{m.thumbnailUrl} <span className="font-normal text-[#64748b]">({c.optional})</span></label>
          <input id="m-thumb" type="url" placeholder="https://" {...register('thumbnailUrl')} />
          {err(errors.thumbnailUrl?.message)}
        </div>
      </section>

      <section className="card p-5 flex flex-col gap-4">
        <h2 className="ttl">{t.questionBank.academicContext}</h2>
        {opts.restrictedToTeacherSubjects && <p className="text-[12.5px] text-[#64748b]">{t.questionBank.teacherScopeHint}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="fld">
            <label htmlFor="m-class">{c.class} *</label>
            <select
              id="m-class"
              {...register('academicClassId', {
                onChange: () => {
                  setValue('academicGroupId', '');
                  setValue('subjectId', '');
                  setValue('subjectPaperId', '');
                  setValue('batchId', '');
                },
              })}
            >
              <option value="">{c.selectOption}</option>
              {allClasses.map((cl) => (
                <option key={cl.id} value={cl.id}>{pickLocalized(lang, cl.name, cl.banglaName)}</option>
              ))}
            </select>
            {err(errors.academicClassId?.message)}
          </div>
          <div className="fld">
            <label htmlFor="m-group">{c.group}</label>
            <select id="m-group" {...register('academicGroupId')}>
              <option value="">{c.anyOption}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{pickLocalized(lang, g.name, g.banglaName)}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="m-batch">{c.batch}</label>
            <select id="m-batch" {...register('batchId')} disabled={!classId}>
              <option value="">{m.allBatches}</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>{pickLocalized(lang, b.name, b.banglaName)} ({b.code})</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="m-subject">{c.subject} *</label>
            <select id="m-subject" {...register('subjectId', { onChange: () => setValue('subjectPaperId', '') })}>
              <option value="">{c.selectOption}</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{pickLocalized(lang, s.name, s.banglaName)} ({s.code})</option>
              ))}
            </select>
            {err(errors.subjectId?.message)}
          </div>
          <div className="fld">
            <label htmlFor="m-paper">{c.subjectPaper}</label>
            <select id="m-paper" {...register('subjectPaperId')} disabled={!papers.length}>
              <option value="">{c.anyOption}</option>
              {papers.map((p) => (
                <option key={p.id} value={p.id}>{pickLocalized(lang, p.name, p.banglaName)}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <fieldset className="flex items-center gap-4">
          <legend className="text-[12.5px] font-bold text-[#063b78] mb-1.5">{m.visibility}</legend>
          {(['DRAFT', 'PUBLISHED'] as const).map((s) => (
            <label key={s} className="flex items-center gap-2 text-[13.5px] font-semibold text-[#092f63]">
              <input type="radio" value={s} {...register('status')} />
              {(t.materialStatus as Record<string, string>)[s]}
            </label>
          ))}
        </fieldset>
        <div className="flex flex-col items-stretch sm:items-end gap-2">
          {serverError && <span className="text-[12.5px] text-rose-600 max-w-md">{serverError}</span>}
          <div className="flex gap-2 justify-end">
            <button type="button" className="tb" onClick={() => router.back()}>{c.cancel}</button>
            <button type="submit" className="btn-navy" disabled={isSubmitting}>
              <Icon name="check2" size={16} />
              {isSubmitting ? c.saving : initial ? c.save : m.createMaterial}
            </button>
          </div>
        </div>
      </section>
    </form>
  );
}
