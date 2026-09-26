'use client';

import PageHeader from '@/components/PageHeader';
import NoticeForm from '@/components/NoticeForm';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';

export default function NewNoticePage() {
  const { lang } = useApp();
  const t = DICTIONARY[lang];
  return (
    <div className="max-w-[1000px] mx-auto flex flex-col gap-5">
      <PageHeader backHref="/notices" backLabel={t.notices.title} title={t.notices.create} subtitle={t.notices.subtitle} />
      <NoticeForm />
    </div>
  );
}
