'use client';

import { use, useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import QuestionForm, { type QuestionFormInitial } from '@/components/QuestionForm';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';

export default function EditQuestionPage({ params }: { params: Promise<{ questionId: string }> }) {
  const { questionId } = use(params);
  const { lang } = useApp();
  const t = DICTIONARY[lang];
  const [question, setQuestion] = useState<(QuestionFormInitial & { canModify?: boolean }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/questions/${questionId}`)
      .then((r) => r.json())
      .then((d) => (d.success ? setQuestion(d.question) : setError(d.message || d.error)))
      .catch(() => setError(t.common.loadFailed));
  }, [questionId, t.common.loadFailed]);

  const blocked = question && (!question.canModify || question.status === 'ARCHIVED');

  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-5">
      <PageHeader backHref={`/questions/${questionId}`} backLabel={t.common.back} title={t.questionBank.editQuestion} />
      {error && <div className="card p-6 text-rose-600 text-[13.5px]">{error}</div>}
      {!question && !error && <div className="card p-10 text-center text-[#64748b] text-[13px]">{t.common.loading}</div>}
      {blocked && (
        <div className="card p-6 text-[13.5px] text-[#092f63]">
          {question.status === 'ARCHIVED' ? t.questionBank.archivedHint : t.questionBank.readOnly}
        </div>
      )}
      {question && !blocked && <QuestionForm initial={question} />}
    </div>
  );
}
