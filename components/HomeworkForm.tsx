'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import Icon from './Icon';
import EnglishInput from './EnglishInput';
import BanglaInput from './BanglaInput';
import FileUploadButton from './FileUploadButton';
import { useApp } from '@/lib/store';
import { DICTIONARY, pickLocalized } from '@/lib/i18n';
import { dhakaLocalToIso, isoToDhakaLocal } from '@/lib/schedule';
import { createHomeworkSchema } from '@/lib/validations/homework';

type FormInput = z.input<typeof createHomeworkSchema>;
type FormOutput = z.output<typeof createHomeworkSchema>;

interface AssignmentOption {
  batch: { id: string; name: string; banglaName: string | null; code: string };
  subject: { id: string; name: string; banglaName: string | null; code: string };
}

export interface HomeworkFormInitial {
  id: string;
  title: string;
  banglaTitle: string | null;
  description: string | null;
  banglaDescription: string | null;
  batchId: string;
  subjectId: string;
  fileUrl: string | null;
  publishAt: string | null;
  dueAt: string;
  status: string;
}

export default function HomeworkForm({ initial }: { initial?: HomeworkFormInitial }) {
  const router = useRouter();
  const { lang, showToast } = useApp();
  const t = DICTIONARY[lang];
  const h = t.homework;
  const c = t.common;
  const [assignments, setAssignments] = useState<AssignmentOption[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/homework/options')
      .then((r) => r.json())
      .then((d) => d.success && setAssignments(d.assignments))
      .catch(() => {});
  }, []);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createHomeworkSchema),
    defaultValues: {
      title: initial?.title ?? '',
      banglaTitle: initial?.banglaTitle ?? '',
      description: initial?.description ?? '',
      banglaDescription: initial?.banglaDescription ?? '',
      batchId: initial?.batchId ?? '',
      subjectId: initial?.subjectId ?? '',
      fileUrl: initial?.fileUrl ?? '',
      publishAt: initial?.publishAt ? isoToDhakaLocal(initial.publishAt) : '',
      dueAt: initial?.dueAt ? isoToDhakaLocal(initial.dueAt) : '',
      status: initial?.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
    },
  });

  const batchId = useWatch({ control, name: 'batchId' });

  const batchOptions = useMemo(() => {
    const seen = new Map<string, AssignmentOption['batch']>();
    assignments.forEach((a) => seen.set(a.batch.id, a.batch));
    return [...seen.values()];
  }, [assignments]);
  const subjectOptions = useMemo(
    () => assignments.filter((a) => a.batch.id === batchId).map((a) => a.subject),
    [assignments, batchId]
  );

  const onSubmit = async (values: FormOutput) => {
    setServerError(null);
    const payload = {
      ...values,
      publishAt: values.publishAt ? dhakaLocalToIso(values.publishAt) : null,
      dueAt: dhakaLocalToIso(values.dueAt),
    };
    const res = await fetch(initial ? `/api/homework/${initial.id}` : '/api/homework', {
      method: initial ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      const detail = data.details ? Object.values(data.details).flat().join(' · ') : '';
      setServerError(detail || data.message || c.actionFailed);
      return;
    }
    showToast(c.saved);
    router.push(`/homework/${data.homework.id}`);
  };

  const err = (msg?: string) => (msg ? <span className="text-[12px] text-rose-600">{msg}</span> : null);

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      <section className="card p-5 flex flex-col gap-4">
        <h2 className="ttl">{c.batch} / {c.subject}</h2>
        {assignments.length === 0 && (
          <p className="text-[12.5px] text-[#64748b]">{h.readOnly}</p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="fld">
            <label htmlFor="hw-batch">{c.batch} *</label>
            <select
              id="hw-batch"
              {...register('batchId', { onChange: () => setValue('subjectId', '') })}
            >
              <option value="">{c.selectOption}</option>
              {batchOptions.map((b) => (
                <option key={b.id} value={b.id}>{pickLocalized(lang, b.name, b.banglaName)} ({b.code})</option>
              ))}
            </select>
            {err(errors.batchId?.message)}
          </div>
          <div className="fld">
            <label htmlFor="hw-subject">{c.subject} *</label>
            <select id="hw-subject" {...register('subjectId')} disabled={!batchId}>
              <option value="">{c.selectOption}</option>
              {subjectOptions.map((s) => (
                <option key={s.id} value={s.id}>{pickLocalized(lang, s.name, s.banglaName)} ({s.code})</option>
              ))}
            </select>
            {err(errors.subjectId?.message)}
          </div>
        </div>
      </section>

      <section className="card p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="fld">
          <label htmlFor="hw-title">{h.englishTitle} *</label>
          <Controller
            control={control}
            name="title"
            render={({ field }) => <EnglishInput id="hw-title" value={field.value} onChange={field.onChange} />}
          />
          {err(errors.title?.message)}
        </div>
        <div className="fld">
          <label htmlFor="hw-title-bn">{h.banglaTitle}</label>
          <Controller
            control={control}
            name="banglaTitle"
            render={({ field }) => (
              <BanglaInput id="hw-title-bn" className="font-bangla" value={field.value ?? ''} onChange={field.onChange} />
            )}
          />
          {err(errors.banglaTitle?.message)}
        </div>
        <div className="fld">
          <label htmlFor="hw-due">{h.dueAt} *</label>
          <input id="hw-due" type="datetime-local" {...register('dueAt')} />
          {err(errors.dueAt?.message)}
        </div>
        <div className="fld">
          <label htmlFor="hw-publish">{h.publishAt}</label>
          <input id="hw-publish" type="datetime-local" {...register('publishAt')} />
          <span className="text-[11.5px] text-[#64748b]">{h.publishAtHint}</span>
        </div>
        <div className="fld sm:col-span-2">
          <label htmlFor="hw-desc">{h.description}</label>
          <textarea id="hw-desc" rows={4} {...register('description')} />
        </div>
        <div className="fld sm:col-span-2">
          <label htmlFor="hw-desc-bn">{h.banglaDescription}</label>
          <Controller
            control={control}
            name="banglaDescription"
            render={({ field }) => (
              <BanglaInput as="textarea" rows={4} id="hw-desc-bn" className="font-bangla" value={field.value ?? ''} onChange={field.onChange} />
            )}
          />
          {err(errors.banglaDescription?.message)}
        </div>
        <div className="fld sm:col-span-2">
          <label htmlFor="hw-file">{h.resourceUrl}</label>
          <div className="flex items-center gap-2">
            <input id="hw-file" type="url" placeholder="https://" className="grow" {...register('fileUrl')} />
            <FileUploadButton scope="homework" lang={lang} onUploaded={(url) => setValue('fileUrl', url, { shouldValidate: true, shouldDirty: true })} />
          </div>
          <span className="text-[11.5px] text-[#64748b]">{h.resourceHint}</span>
          {err(errors.fileUrl?.message)}
        </div>
      </section>

      <section className="card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <fieldset className="flex items-center gap-4">
          <legend className="text-[12.5px] font-bold text-[#063b78] mb-1.5">{h.visibility}</legend>
          {(['DRAFT', 'PUBLISHED'] as const).map((s) => (
            <label key={s} className="flex items-center gap-2 text-[13.5px] font-semibold text-[#092f63]">
              <input type="radio" value={s} {...register('status')} />
              {(t.homeworkStatus as Record<string, string>)[s]}
            </label>
          ))}
        </fieldset>
        <div className="flex flex-col items-stretch sm:items-end gap-2">
          {serverError && <span className="text-[12.5px] text-rose-600 max-w-md">{serverError}</span>}
          <div className="flex gap-2 justify-end">
            <button type="button" className="tb" onClick={() => router.back()}>{c.cancel}</button>
            <button type="submit" className="btn-navy" disabled={isSubmitting}>
              <Icon name="check2" size={16} />
              {isSubmitting ? c.saving : initial ? c.save : h.createHomework}
            </button>
          </div>
        </div>
      </section>
    </form>
  );
}
