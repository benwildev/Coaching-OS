'use client';

import { use, useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import NoticeForm, { type NoticeFormInitial } from '@/components/NoticeForm';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';

export default function EditNoticePage({ params }: { params: Promise<{ noticeId: string }> }) {
  const { noticeId } = use(params);
  const { lang } = useApp();
  const t = DICTIONARY[lang];
  const c = t.common;
  const [notice, setNotice] = useState<NoticeFormInitial | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/notices/${noticeId}`)
      .then((r) => r.json())
      .then((d) => (d.success ? setNotice(d.notice) : setError(d.message || d.error)))
      .catch(() => setError(c.loadFailed));
  }, [noticeId, c.loadFailed]);

  if (error) return <div className="card p-6 text-rose-600 text-[13.5px] max-w-[1000px] mx-auto">{error}</div>;
  if (!notice) return <div className="card p-10 text-center text-[#64748b] text-[13px] max-w-[1000px] mx-auto">{c.loading}</div>;

  return (
    <div className="max-w-[1000px] mx-auto flex flex-col gap-5">
      <PageHeader backHref={`/notices/${noticeId}`} backLabel={t.notices.title} title={t.notices.edit} subtitle={t.notices.subtitle} />
      <NoticeForm initial={notice} />
    </div>
  );
}
