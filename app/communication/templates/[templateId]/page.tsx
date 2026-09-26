'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import CommunicationSubNav from '@/components/CommunicationSubNav';
import CommunicationTemplateForm, { type TemplateFormInitial } from '@/components/CommunicationTemplateForm';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';

interface PreviewResult {
  isSampleData: boolean;
  en: string;
  bn: string;
}

export default function TemplateDetailPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = use(params);
  const { lang, showToast, currentUser } = useApp();
  const t = DICTIONARY[lang];
  const comm = t.communication;
  const c = t.common;
  const canManage = currentUser?.role === 'OWNER' || currentUser?.role === 'ADMIN';
  const [template, setTemplate] = useState<TemplateFormInitial | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/communication/templates/${templateId}`)
      .then((r) => r.json())
      .then((d) => (d.success ? setTemplate(d.template) : setError(d.message || d.error)))
      .catch(() => setError(c.loadFailed));
  }, [templateId, c.loadFailed]);

  useEffect(load, [load]);

  const loadPreview = async () => {
    const res = await fetch(`/api/communication/templates/${templateId}/preview`, { method: 'POST' });
    const data = await res.json();
    if (data.success) setPreview(data.preview);
  };

  useEffect(() => {
    loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  const toggleActive = async () => {
    if (!template) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/communication/templates/${templateId}/active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !template.isActive }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.message || c.actionFailed);
        return;
      }
      showToast(c.saved);
      load();
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="card p-6 text-rose-600 text-[13.5px] max-w-[900px] mx-auto">{error}</div>;
  if (!template) return <div className="card p-10 text-center text-[#64748b] text-[13px] max-w-[900px] mx-auto">{c.loading}</div>;

  return (
    <div className="max-w-[900px] mx-auto flex flex-col gap-5">
      <PageHeader backHref="/communication/templates" backLabel={comm.templates} title={template.title} subtitle={comm.subtitle}>
        {canManage && (
          <button type="button" className="tb" disabled={busy} onClick={toggleActive}>
            <Icon name={template.isActive ? 'eyeoff' : 'eye'} size={16} />
            {template.isActive ? comm.inactive : comm.active}
          </button>
        )}
      </PageHeader>

      <CommunicationSubNav />

      {preview && (
        <section className="card p-5 flex flex-col gap-3">
          <h2 className="ttl">{comm.preview}</h2>
          <p className="text-[11.5px] text-[#94a3b8]">{comm.previewSampleNote}</p>
          <div className="rounded-xl border border-[#dce5f0] bg-[#fafcff] p-3 text-[13.5px] text-[#1f2d44]">{preview.en}</div>
          <div className="rounded-xl border border-[#dce5f0] bg-[#fafcff] p-3 text-[13.5px] text-[#1f2d44] font-bangla">{preview.bn}</div>
        </section>
      )}

      <CommunicationTemplateForm initial={template} />
    </div>
  );
}
