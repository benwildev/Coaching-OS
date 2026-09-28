'use client';

import PageHeader from '@/components/PageHeader';
import HomeworkForm from '@/components/HomeworkForm';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';

export default function NewHomeworkPage() {
  const { lang } = useApp();
  const t = DICTIONARY[lang];
  return (
    <div className="max-w-[1000px] mx-auto flex flex-col gap-5">
      <PageHeader backHref="/homework" backLabel={t.homework.title} title={t.homework.createHomework} subtitle={t.homework.subtitle} />
      <HomeworkForm />
    </div>
  );
}
