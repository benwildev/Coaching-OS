'use client';

import PageHeader from '@/components/PageHeader';
import QuestionForm from '@/components/QuestionForm';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';

export default function NewQuestionPage() {
  const { lang } = useApp();
  const t = DICTIONARY[lang];
  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-5">
      <PageHeader
        backHref="/questions"
        backLabel={t.questionBank.title}
        title={t.questionBank.createQuestion}
        subtitle={t.questionBank.subtitle}
      />
      <QuestionForm />
    </div>
  );
}
