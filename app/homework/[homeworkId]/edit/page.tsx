'use client';

import { use, useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import HomeworkForm, { type HomeworkFormInitial } from '@/components/HomeworkForm';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';

export default function EditHomeworkPage({ params }: { params: Promise<{ homeworkId: string }> }) {
  const { homeworkId } = use(params);
  const { lang } = useApp();
  const t = DICTIONARY[lang];
  const [homework, setHomework] = useState<(HomeworkFormInitial & { canModify: boolean }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/homework/${homeworkId}`)
      .then((r) => r.json())
      .then((d) => (d.success ? setHomework(d.homework) : setError(d.message || d.error)))
      .catch(() => setError(t.common.loadFailed));
  }, [homeworkId, t.common.loadFailed]);

  const blocked = homework && (!homework.canModify || homework.status === 'ARCHIVED' || homework.status === 'CLOSED');

  return (
    <div className="max-w-[1000px] mx-auto flex flex-col gap-5">
      <PageHeader backHref={`/homework/${homeworkId}`} backLabel={t.common.back} title={t.homework.editHomework} />
      {error && <div className="card p-6 text-rose-600 text-[13.5px]">{error}</div>}
      {!homework && !error && <div className="card p-10 text-center text-[#64748b] text-[13px]">{t.common.loading}</div>}
      {blocked && <div className="card p-6 text-[13.5px] text-[#092f63]">{t.homework.readOnly}</div>}
      {homework && !blocked && <HomeworkForm initial={homework} />}
    </div>
  );
}
