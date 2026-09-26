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
import { NOTICE_AUDIENCES, createNoticeSchema } from '@/lib/validations/notice';

type FormInput = z.input<typeof createNoticeSchema>;
type FormOutput = z.output<typeof createNoticeSchema>;

export interface NoticeFormInitial {
  id: string;
  title: string;
  banglaTitle: string | null;
  content: string;
  banglaContent: string | null;
  targetAudience: string;
  branchId: string | null;
  academicSessionId: string | null;
  academicProgramId: string | null;
  academicClassId: string | null;
  academicGroupId: string | null;
  batchId: string | null;
  status: string;
}

export default function NoticeForm({ initial }: { initial?: NoticeFormInitial }) {
  const router = useRouter();
  const { lang, showToast, currentCenter } = useApp();
  const t = DICTIONARY[lang];
  const nDict = t.notices;
  const c = t.common;
  const { options: opts, allClasses } = useQuestionBankOptions();
  const branches: Array<{ id: string; name: string; banglaName?: string | null }> = currentCenter?.branches || [];
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createNoticeSchema),
    defaultValues: {
      title: initial?.title ?? '',
      banglaTitle: initial?.banglaTitle ?? '',
      content: initial?.content ?? '',
      banglaContent: initial?.banglaContent ?? '',
      targetAudience: (NOTICE_AUDIENCES as readonly string[]).includes(initial?.targetAudience ?? '')
        ? (initial!.targetAudience as FormInput['targetAudience'])
        : 'ALL_CENTER',
      branchId: initial?.branchId ?? '',
      academicSessionId: initial?.academicSessionId ?? '',
      academicProgramId: initial?.academicProgramId ?? '',
      academicClassId: initial?.academicClassId ?? '',
      academicGroupId: initial?.academicGroupId ?? '',
      batchId: initial?.batchId ?? '',
      status: initial?.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
    },
  });

  const audience = useWatch({ control, name: 'targetAudience' });
  const classId = useWatch({ control, name: 'academicClassId' });
  const groups = allClasses.find((cl) => cl.id === classId)?.groups || [];
  const batches = opts.batches.filter((b) => !classId || b.academicClassId === classId);

  const onSubmit = async (values: FormOutput) => {
    setServerError(null);
    const res = await fetch(initial ? `/api/notices/${initial.id}` : '/api/notices', {
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
    router.push(`/notices/${data.notice.id}`);
  };

  const err = (msg?: string) => (msg ? <span className="text-[12px] text-rose-600">{msg}</span> : null);

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      <section className="card p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="fld">
          <label htmlFor="ntc-title">{nDict.englishTitle} *</label>
          <input id="ntc-title" {...register('title')} />
          {err(errors.title?.message)}
        </div>
        <div className="fld">
          <label htmlFor="ntc-title-bn">{nDict.banglaTitle}</label>
          <input id="ntc-title-bn" className="font-bangla" {...register('banglaTitle')} />
        </div>
        <div className="fld sm:col-span-2">
          <label htmlFor="ntc-content">{nDict.content} *</label>
          <textarea id="ntc-content" rows={5} {...register('content')} />
          {err(errors.content?.message)}
        </div>
        <div className="fld sm:col-span-2">
          <label htmlFor="ntc-content-bn">{nDict.banglaContent}</label>
          <textarea id="ntc-content-bn" rows={5} className="font-bangla" {...register('banglaContent')} />
        </div>
      </section>

      <section className="card p-5 flex flex-col gap-4">
        <h2 className="ttl">{nDict.audience}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="fld">
            <label htmlFor="ntc-audience">{nDict.audience} *</label>
            <select id="ntc-audience" {...register('targetAudience')}>
              {NOTICE_AUDIENCES.map((v) => (
                <option key={v} value={v}>{(t.noticeAudience as Record<string, string>)[v]}</option>
              ))}
            </select>
            {err(errors.targetAudience?.message)}
          </div>

          {(audience === 'BRANCH' || audience === 'ALL_CENTER') && (
            <div className="fld">
              <label htmlFor="ntc-branch">{nDict.branch}{audience === 'BRANCH' && ' *'}</label>
              <select id="ntc-branch" {...register('branchId')}>
                <option value="">{c.anyOption}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{pickLocalized(lang, b.name, b.banglaName)}</option>
                ))}
              </select>
            </div>
          )}

          {(audience === 'CLASS' || audience === 'GROUP' || audience === 'BATCH') && (
            <div className="fld">
              <label htmlFor="ntc-class">{nDict.class} *</label>
              <select
                id="ntc-class"
                {...register('academicClassId', { onChange: () => { setValue('academicGroupId', ''); setValue('batchId', ''); } })}
              >
                <option value="">{c.selectOption}</option>
                {allClasses.map((cl) => (
                  <option key={cl.id} value={cl.id}>{pickLocalized(lang, cl.name, cl.banglaName)}</option>
                ))}
              </select>
              {err(errors.academicClassId?.message)}
            </div>
          )}

          {audience === 'GROUP' && (
            <div className="fld">
              <label htmlFor="ntc-group">{nDict.group} *</label>
              <select id="ntc-group" {...register('academicGroupId')} disabled={!classId}>
                <option value="">{c.selectOption}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{pickLocalized(lang, g.name, g.banglaName)}</option>
                ))}
              </select>
              {err(errors.academicGroupId?.message)}
            </div>
          )}

          {audience === 'BATCH' && (
            <div className="fld">
              <label htmlFor="ntc-batch">{nDict.batch} *</label>
              <select id="ntc-batch" {...register('batchId')} disabled={!classId}>
                <option value="">{c.selectOption}</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>{pickLocalized(lang, b.name, b.banglaName)} ({b.code})</option>
                ))}
              </select>
              {err(errors.batchId?.message)}
            </div>
          )}
        </div>
      </section>

      <section className="card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <fieldset className="flex items-center gap-4">
          <legend className="text-[12.5px] font-bold text-[#063b78] mb-1.5">{c.status}</legend>
          {(['DRAFT', 'PUBLISHED'] as const).map((s) => (
            <label key={s} className="flex items-center gap-2 text-[13.5px] font-semibold text-[#092f63]">
              <input type="radio" value={s} {...register('status')} />
              {(t.noticeStatus as Record<string, string>)[s]}
            </label>
          ))}
        </fieldset>
        <div className="flex flex-col items-stretch sm:items-end gap-2">
          {serverError && <span className="text-[12.5px] text-rose-600 max-w-md">{serverError}</span>}
          <div className="flex gap-2 justify-end">
            <button type="button" className="tb" onClick={() => router.back()}>{c.cancel}</button>
            <button type="submit" className="btn-navy" disabled={isSubmitting}>
              <Icon name="check2" size={16} />
              {isSubmitting ? c.saving : initial ? c.save : nDict.create}
            </button>
          </div>
        </div>
      </section>
    </form>
  );
}
