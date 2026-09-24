'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import PageHeader from '@/components/PageHeader';
import { MATERIAL_TYPE_ICON } from '@/components/QuestionBadges';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate, localizeNumber, pickLocalized } from '@/lib/i18n';

type Named = { name: string; banglaName?: string | null; code?: string } | null;

interface MaterialDetail {
  id: string;
  title: string;
  banglaTitle: string | null;
  description: string | null;
  banglaDescription: string | null;
  type: string;
  status: string;
  fileUrl: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  canModify: boolean;
  subject: Named;
  subjectPaper: Named;
  academicClass: Named;
  academicGroup: Named;
  batch: Named;
  branch: Named;
  createdBy: { name: string } | null;
}

export default function MaterialDetailPage({ params }: { params: Promise<{ materialId: string }> }) {
  const { materialId } = use(params);
  const router = useRouter();
  const { lang, showToast } = useApp();
  const t = DICTIONARY[lang];
  const m = t.materials;
  const c = t.common;
  const [mat, setMat] = useState<MaterialDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/materials/${materialId}`)
      .then((r) => r.json())
      .then((d) => (d.success ? setMat(d.material) : setError(d.message || d.error)))
      .catch(() => setError(c.loadFailed));
  }, [materialId, c.loadFailed]);

  useEffect(load, [load]);

  const act = async (path: string, okMsg: string, method: 'POST' | 'DELETE' = 'POST') => {
    setBusy(true);
    try {
      const res = await fetch(`/api/materials/${materialId}${path}`, { method });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.message || c.actionFailed);
        return false;
      }
      showToast(okMsg);
      return true;
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="card p-6 text-rose-600 text-[13.5px] max-w-[1000px] mx-auto">{error}</div>;
  if (!mat) return <div className="card p-10 text-center text-[#64748b] text-[13px] max-w-[1000px] mx-auto">{c.loading}</div>;

  const loc = (n: Named) => (n ? pickLocalized(lang, n.name, n.banglaName) : c.none);
  const rows: Array<[string, string]> = [
    [m.type, (t.materialType as Record<string, string>)[mat.type] || mat.type],
    [c.subject, loc(mat.subject)],
    [c.subjectPaper, loc(mat.subjectPaper)],
    [c.class, loc(mat.academicClass)],
    [c.group, loc(mat.academicGroup)],
    [c.batch, mat.batch ? loc(mat.batch) : m.allBatches],
    [c.createdBy, mat.createdBy?.name || c.none],
    [c.createdAt, localizeNumber(lang, formatDhakaDate(mat.createdAt))],
    [c.updatedAt, localizeNumber(lang, formatDhakaDate(mat.updatedAt))],
    [m.publishedAt, mat.publishedAt ? localizeNumber(lang, formatDhakaDate(mat.publishedAt)) : c.none],
  ];

  return (
    <div className="max-w-[1000px] mx-auto flex flex-col gap-5">
      <PageHeader backHref="/materials" backLabel={m.title} title={pickLocalized(lang, mat.title, mat.banglaTitle)}>
        <StatusBadge status={mat.status} dictKey="materialStatus" />
        {mat.fileUrl && (
          <a href={mat.fileUrl} target="_blank" rel="noopener noreferrer" className="primary">
            <Icon name="globe" size={16} />
            {m.open}
          </a>
        )}
        {mat.canModify && mat.status !== 'ARCHIVED' && (
          <Link href={`/materials/${mat.id}/edit`} className="tb">
            <Icon name="sliders" size={16} />
            {c.edit}
          </Link>
        )}
        {mat.canModify && mat.status === 'DRAFT' && (
          <button type="button" className="btn-navy" disabled={busy} onClick={async () => (await act('/publish', m.published_)) && load()}>
            {m.publish}
          </button>
        )}
        {mat.canModify && mat.status === 'PUBLISHED' && (
          <button type="button" className="tb" disabled={busy} onClick={async () => (await act('/unpublish', c.saved)) && load()}>
            {m.unpublish}
          </button>
        )}
        {mat.canModify && mat.status === 'ARCHIVED' && (
          <button type="button" className="tb" disabled={busy} onClick={async () => (await act('/restore', c.saved)) && load()}>
            {m.restore}
          </button>
        )}
        {mat.canModify && mat.status !== 'ARCHIVED' && (
          <button type="button" className="tb" disabled={busy} onClick={async () => (await act('/archive', m.archived_)) && load()}>
            {m.archive}
          </button>
        )}
        {mat.canModify && (
          <button
            type="button"
            className="tb !text-rose-600"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm(c.confirmDelete)) return;
              if (await act('', m.deleted, 'DELETE')) router.push('/materials');
            }}
          >
            {c.delete}
          </button>
        )}
      </PageHeader>

      {!mat.canModify && <div className="card px-5 py-3 text-[12.5px] text-[#64748b]">{m.readOnly}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        <section className="card p-5 flex flex-col gap-4 min-w-0">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-xl bg-[#eef4fb] text-[#063b78] flex items-center justify-center">
              <Icon name={MATERIAL_TYPE_ICON[mat.type] || 'file'} size={20} />
            </span>
            <div className="min-w-0">
              <div className="font-bold text-[#092f63]">{mat.title}</div>
              {mat.banglaTitle && <div className="text-[13px] text-[#64748b] font-bangla">{mat.banglaTitle}</div>}
            </div>
          </div>
          {mat.thumbnailUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- external thumbnail URLs of arbitrary hosts
            <img src={mat.thumbnailUrl} alt="" className="rounded-xl border border-[#dce5f0] max-h-64 object-cover" />
          )}
          {mat.description && <p className="text-[14px] text-[#092f63] whitespace-pre-wrap">{mat.description}</p>}
          {mat.banglaDescription && <p className="text-[14px] text-[#092f63] whitespace-pre-wrap font-bangla">{mat.banglaDescription}</p>}
          {mat.fileUrl && (
            <a href={mat.fileUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] text-[#063b78] underline break-all">
              {mat.fileUrl}
            </a>
          )}
        </section>
        <aside className="card p-5 h-fit">
          <dl className="flex flex-col gap-2.5 text-[13px]">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-[#64748b]">{k}</dt>
                <dd className="font-semibold text-[#092f63] text-right">{v}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>
    </div>
  );
}
