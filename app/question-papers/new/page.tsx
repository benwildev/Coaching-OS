'use client';

import PageHeader from '@/components/PageHeader';
import QuestionPaperBuilder from '@/components/QuestionPaperBuilder';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';

export default function NewQuestionPaperPage() {
  const { lang } = useApp();
  const t = DICTIONARY[lang];
  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
      <PageHeader
        backHref="/question-papers"
        backLabel={t.questionPapers.title}
        title={t.questionPapers.newPaper}
        subtitle={t.questionPapers.subtitle}
      />
      <QuestionPaperBuilder />
    </div>
  );
}
