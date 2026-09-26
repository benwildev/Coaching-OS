'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import Icon from './Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';
import { NOTIFICATION_EVENTS } from '@/lib/notifications/events';
import { COMMUNICATION_CHANNELS, communicationTemplateSchema } from '@/lib/validations/communication-template';

type FormOutput = z.output<typeof communicationTemplateSchema>;

export interface TemplateFormInitial {
  id: string;
  title: string;
  channel: string;
  bodyEn: string;
  bodyBn: string;
  triggerEvent: string | null;
  isActive: boolean;
}

export default function CommunicationTemplateForm({ initial }: { initial?: TemplateFormInitial }) {
  const router = useRouter();
  const { lang, showToast } = useApp();
  const t = DICTIONARY[lang];
  const comm = t.communication;
  const c = t.common;
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormOutput>({
    resolver: zodResolver(communicationTemplateSchema),
    defaultValues: {
      title: initial?.title ?? '',
      channel: (COMMUNICATION_CHANNELS as readonly string[]).includes(initial?.channel ?? '')
        ? (initial!.channel as FormOutput['channel'])
        : 'SMS',
      bodyEn: initial?.bodyEn ?? '',
      bodyBn: initial?.bodyBn ?? '',
      triggerEvent: (initial?.triggerEvent as FormOutput['triggerEvent']) ?? null,
      isActive: initial?.isActive ?? true,
    },
  });

  const onSubmit = async (values: FormOutput) => {
    setServerError(null);
    const res = await fetch(initial ? `/api/communication/templates/${initial.id}` : '/api/communication/templates', {
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
    router.push(`/communication/templates/${data.template.id}`);
  };

  const err = (msg?: string) => (msg ? <span className="text-[12px] text-rose-600">{msg}</span> : null);

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      <section className="card p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="fld">
          <label htmlFor="tpl-title">{c.title} *</label>
          <input id="tpl-title" {...register('title')} />
          {err(errors.title?.message)}
        </div>
        <div className="fld">
          <label htmlFor="tpl-channel">{comm.channel} *</label>
          <select id="tpl-channel" {...register('channel')}>
            {COMMUNICATION_CHANNELS.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
        <div className="fld sm:col-span-2">
          <label htmlFor="tpl-event">{comm.event}</label>
          <select id="tpl-event" {...register('triggerEvent')}>
            <option value="">{c.anyOption}</option>
            {NOTIFICATION_EVENTS.map((v) => (
              <option key={v} value={v}>{(t.notificationEvent as Record<string, string>)[v] || v}</option>
            ))}
          </select>
        </div>
        <div className="fld sm:col-span-2">
          <label htmlFor="tpl-body-en">{c.english} *</label>
          <textarea id="tpl-body-en" rows={4} {...register('bodyEn')} />
          {err(errors.bodyEn?.message)}
        </div>
        <div className="fld sm:col-span-2">
          <label htmlFor="tpl-body-bn">{c.bangla} *</label>
          <textarea id="tpl-body-bn" rows={4} className="font-bangla" {...register('bodyBn')} />
          {err(errors.bodyBn?.message)}
        </div>
      </section>

      <section className="card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col items-stretch sm:items-end gap-2 ml-auto">
          {serverError && <span className="text-[12.5px] text-rose-600 max-w-md">{serverError}</span>}
          <div className="flex gap-2 justify-end">
            <button type="button" className="tb" onClick={() => router.back()}>{c.cancel}</button>
            <button type="submit" className="btn-navy" disabled={isSubmitting}>
              <Icon name="check2" size={16} />
              {isSubmitting ? c.saving : initial ? c.save : comm.newTemplate}
            </button>
          </div>
        </div>
      </section>
    </form>
  );
}
