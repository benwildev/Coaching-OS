'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import PageHeader from '@/components/PageHeader';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate, localizeNumber, pickLocalized } from '@/lib/i18n';

type Named = { name: string; banglaName?: string | null; code?: string } | null;

interface NoticeDetail {
  id: string;
  title: string;
  banglaTitle: string | null;
  content: string;
  banglaContent: string | null;
  targetAudience: string;
  status: string;
  publishedAt: string | null;
  createdAt: string;
  canModify: boolean;
  branch: Named;
  academicClass: Named;
  academicGroup: Named;
  batch: Named;
  createdBy: { name: string } | null;
  updatedBy: { name: string } | null;
}

export default function NoticeDetailPage({ params }: { params: Promise<{ noticeId: string }> }) {
  const { noticeId } = use(params);
  const { lang, showToast } = useApp();
  const t = DICTIONARY[lang];
  const n = t.notices;
  const c = t.common;
  const [notice, setNotice] = useState<NoticeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/notices/${noticeId}`)
      .then((r) => r.json())
      .then((d) => (d.success ? setNotice(d.notice) : setError(d.message || d.error)))
      .catch(() => setError(c.loadFailed));
  }, [noticeId, c.loadFailed]);

  useEffect(load, [load]);

  const act = async (path: string, okMsg: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/notices/${noticeId}${path}`, { method: 'POST' });
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
  if (!notice) return <div className="card p-10 text-center text-[#64748b] text-[13px] max-w-[1000px] mx-auto">{c.loading}</div>;

  const loc = (x: Named) => (x ? pickLocalized(lang, x.name, x.banglaName) : c.none);
  const rows: Array<[string, string]> = [
    [n.audience, (t.noticeAudience as Record<string, string>)[notice.targetAudience] || notice.targetAudience],
    [n.branch, loc(notice.branch)],
    [n.class, loc(notice.academicClass)],
    [n.group, loc(notice.academicGroup)],
    [n.batch, loc(notice.batch)],
    [n.createdBy, notice.createdBy?.name || c.none],
    [c.createdAt, localizeNumber(lang, formatDhakaDate(notice.createdAt))],
    [n.publishedAt, notice.publishedAt ? localizeNumber(lang, formatDhakaDate(notice.publishedAt)) : c.none],
  ];

  return (
    <div className="max-w-[1000px] mx-auto flex flex-col gap-5">
      <PageHeader backHref="/notices" backLabel={n.title} title={pickLocalized(lang, notice.title, notice.banglaTitle)}>
        <StatusBadge status={notice.status} dictKey="noticeStatus" />
        {notice.canModify && notice.status !== 'ARCHIVED' && (
          <Link href={`/notices/${notice.id}/edit`} className="tb">
            <Icon name="sliders" size={16} />
            {c.edit}
          </Link>
        )}
        {notice.canModify && notice.status === 'DRAFT' && (
          <button type="button" className="btn-navy" disabled={busy} onClick={async () => (await act('/publish', n.publish)) && load()}>
            {n.publish}
          </button>
        )}
        {notice.canModify && notice.status === 'PUBLISHED' && (
          <button type="button" className="tb" disabled={busy} onClick={async () => (await act('/unpublish', c.saved)) && load()}>
            {n.unpublish}
          </button>
        )}
        {notice.canModify && notice.status === 'ARCHIVED' && (
          <button type="button" className="tb" disabled={busy} onClick={async () => (await act('/restore', c.saved)) && load()}>
            {n.restore}
          </button>
        )}
        {notice.canModify && notice.status !== 'ARCHIVED' && (
          <button type="button" className="tb" disabled={busy} onClick={async () => (await act('/archive', c.saved)) && load()}>
            {n.archive}
          </button>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        <section className="card p-5 flex flex-col gap-4 min-w-0">
          <p className="text-[14px] text-[#092f63] whitespace-pre-wrap">{notice.content}</p>
          {notice.banglaContent && <p className="text-[14px] text-[#092f63] whitespace-pre-wrap font-bangla">{notice.banglaContent}</p>}
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
