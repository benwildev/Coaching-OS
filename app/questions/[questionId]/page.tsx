'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import PageHeader from '@/components/PageHeader';
import { DifficultyBadge, QuestionTypeBadge } from '@/components/QuestionBadges';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate, localizeNumber, pickLocalized } from '@/lib/i18n';

type Named = { id: string; name: string; banglaName?: string | null } | null;

interface QuestionDetail {
  id: string;
  type: string;
  difficulty: string | null;
  marks: number;
  status: string;
  chapter: string | null;
  questionText: string;
  banglaQuestionText: string | null;
  answer?: string | null;
  banglaAnswer?: string | null;
  explanation?: string | null;
  banglaExplanation?: string | null;
  options: Array<{ id: string; order: number; optionText: string; banglaOptionText: string | null; isCorrect?: boolean }>;
  subject: { id: string; name: string; banglaName: string | null; code: string };
  subjectPaper: Named;
  academicSession: Named;
  academicProgram: Named;
  academicClass: Named;
  academicGroup: Named;
  branch: Named;
  createdBy: Named;
  updatedBy: Named;
  createdAt: string;
  updatedAt: string;
  usedInPapers: number;
  canModify: boolean;
}

const LETTERS = 'ABCDEFGH';

export default function QuestionDetailPage({ params }: { params: Promise<{ questionId: string }> }) {
  const { questionId } = use(params);
  const router = useRouter();
  const { lang, showToast } = useApp();
  const t = DICTIONARY[lang];
  const qb = t.questionBank;
  const c = t.common;
  const [q, setQ] = useState<QuestionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/questions/${questionId}`)
      .then((r) => r.json())
      .then((d) => (d.success ? setQ(d.question) : setError(d.message || d.error)))
      .catch(() => setError(c.loadFailed));
  }, [questionId, c.loadFailed]);

  useEffect(load, [load]);

  const act = async (path: string, okMsg: string, method: 'POST' | 'DELETE' = 'POST') => {
    setBusy(true);
    try {
      const res = await fetch(`/api/questions/${questionId}${path}`, { method });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.message || c.actionFailed);
        return null;
      }
      showToast(okMsg);
      return data;
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="max-w-[1100px] mx-auto flex flex-col gap-5">
        <PageHeader backHref="/questions" backLabel={qb.title} title={qb.title} />
        <div className="card p-6 text-rose-600 text-[13.5px]">{error}</div>
      </div>
    );
  }
  if (!q) return <div className="card p-10 text-center text-[#64748b] text-[13px] max-w-[1100px] mx-auto">{c.loading}</div>;

  const loc = (n: Named) => (n ? pickLocalized(lang, n.name, n.banglaName) : c.none);
  const ctxRows: Array<[string, string]> = [
    [c.subject, `${loc(q.subject)} (${q.subject.code})`],
    [c.subjectPaper, loc(q.subjectPaper)],
    [c.session, loc(q.academicSession)],
    [c.program, loc(q.academicProgram)],
    [c.class, loc(q.academicClass)],
    [c.group, loc(q.academicGroup)],
    [qb.chapter, q.chapter || c.none],
  ];

  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-5">
      <PageHeader backHref="/questions" backLabel={qb.title} title={qb.question} subtitle={`${loc(q.subject)} · ${(t.questionType as Record<string, string>)[q.type] || q.type}`}>
        {q.canModify && q.status !== 'ARCHIVED' && (
          <Link href={`/questions/${q.id}/edit`} className="tb">
            <Icon name="sliders" size={16} />
            {c.edit}
          </Link>
        )}
        {q.canModify && q.status === 'DRAFT' && (
          <button type="button" className="btn-navy" disabled={busy} onClick={async () => (await act('/publish', qb.published_)) && load()}>
            <Icon name="check2" size={16} />
            {qb.publish}
          </button>
        )}
        {q.canModify && q.status === 'PUBLISHED' && (
          <button type="button" className="tb" disabled={busy} onClick={async () => (await act('/unpublish', c.saved)) && load()}>
            {qb.unpublish}
          </button>
        )}
        {q.canModify && q.status === 'ARCHIVED' && (
          <button type="button" className="tb" disabled={busy} onClick={async () => (await act('/restore', c.saved)) && load()}>
            {qb.restore}
          </button>
        )}
        <button
          type="button"
          className="tb"
          disabled={busy}
          onClick={async () => {
            const d = await act('/duplicate', qb.duplicated);
            if (d) router.push(`/questions/${d.question.id}/edit`);
          }}
        >
          <Icon name="copy" size={16} />
          {qb.duplicate}
        </button>
        {q.canModify && q.status !== 'ARCHIVED' && (
          <button type="button" className="tb" disabled={busy} onClick={async () => (await act('/archive', qb.archived_)) && load()}>
            {qb.archive}
          </button>
        )}
        {q.canModify && q.usedInPapers === 0 && (
          <button
            type="button"
            className="tb !text-rose-600"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm(c.confirmDelete)) return;
              if (await act('', qb.deleted, 'DELETE')) router.push('/questions');
            }}
          >
            {c.delete}
          </button>
        )}
      </PageHeader>

      {!q.canModify && <div className="card px-5 py-3 text-[12.5px] text-[#64748b]">{qb.readOnly}</div>}
      {q.usedInPapers > 0 && (
        <div className="card px-5 py-3 text-[12.5px] text-[#092f63] flex items-center gap-2">
          <Icon name="info" size={15} />
          {qb.inUseHint} ({qb.inUse}: {localizeNumber(lang, q.usedInPapers)})
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        <div className="flex flex-col gap-5 min-w-0">
          <section className="card p-5 flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <QuestionTypeBadge type={q.type} />
              <DifficultyBadge difficulty={q.difficulty} />
              <span className="inline-flex items-center rounded-md border border-[#dce5f0] px-2 py-0.5 text-[11.5px] font-bold text-[#092f63]">
                {qb.marks}: {localizeNumber(lang, q.marks)}
              </span>
              <StatusBadge status={q.status} size="sm" dictKey="questionStatus" />
            </div>
            <div>
              <div className="text-[11.5px] font-bold uppercase tracking-wide text-[#64748b]">{qb.englishQuestion}</div>
              <p className="mt-1 text-[15px] text-[#092f63] whitespace-pre-wrap">{q.questionText}</p>
            </div>
            {q.banglaQuestionText && (
              <div>
                <div className="text-[11.5px] font-bold uppercase tracking-wide text-[#64748b]">{qb.banglaQuestion}</div>
                <p className="mt-1 text-[15px] text-[#092f63] whitespace-pre-wrap font-bangla">{q.banglaQuestionText}</p>
              </div>
            )}
            {q.options.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="text-[11.5px] font-bold uppercase tracking-wide text-[#64748b]">{qb.options}</div>
                {q.options.map((o, i) => (
                  <div
                    key={o.id}
                    className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${
                      o.isCorrect ? 'border-emerald-300 bg-emerald-50/60' : 'border-[#dce5f0]'
                    }`}
                  >
                    <span
                      className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-[12px] font-black ${
                        o.isCorrect ? 'bg-emerald-600 text-white' : 'bg-[#eef4fb] text-[#063b78]'
                      }`}
                    >
                      {LETTERS[i]}
                    </span>
                    <div className="min-w-0 grow">
                      <div className="text-[14px] text-[#092f63]">{o.optionText}</div>
                      {o.banglaOptionText && <div className="text-[13px] text-[#64748b] font-bangla">{o.banglaOptionText}</div>}
                    </div>
                    {o.isCorrect && <span className="text-[11.5px] font-bold text-emerald-700 shrink-0">{qb.correctAnswer}</span>}
                  </div>
                ))}
              </div>
            )}
          </section>

          {(q.answer || q.banglaAnswer || q.explanation || q.banglaExplanation) && (
            <section className="card p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                [qb.englishAnswer, q.answer, ''],
                [qb.banglaAnswer, q.banglaAnswer, 'font-bangla'],
                [qb.englishExplanation, q.explanation, ''],
                [qb.banglaExplanation, q.banglaExplanation, 'font-bangla'],
              ]
                .filter(([, v]) => v)
                .map(([label, value, cls]) => (
                  <div key={label as string}>
                    <div className="text-[11.5px] font-bold uppercase tracking-wide text-[#64748b]">{label}</div>
                    <p className={`mt-1 text-[14px] text-[#092f63] whitespace-pre-wrap ${cls}`}>{value}</p>
                  </div>
                ))}
            </section>
          )}
        </div>

        <aside className="card p-5 flex flex-col gap-3 h-fit" aria-label={qb.academicContext}>
          <h2 className="ttl">{qb.academicContext}</h2>
          <dl className="flex flex-col gap-2.5 text-[13px]">
            {ctxRows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-[#64748b]">{k}</dt>
                <dd className="font-semibold text-[#092f63] text-right">{v}</dd>
              </div>
            ))}
            <div className="border-t border-[#edf1f7] my-1" />
            <div className="flex justify-between gap-3">
              <dt className="text-[#64748b]">{c.createdBy}</dt>
              <dd className="font-semibold text-[#092f63] text-right">{q.createdBy?.name || c.none}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[#64748b]">{c.createdAt}</dt>
              <dd className="font-semibold text-[#092f63] num">{localizeNumber(lang, formatDhakaDate(q.createdAt))}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[#64748b]">{c.updatedAt}</dt>
              <dd className="font-semibold text-[#092f63] num">{localizeNumber(lang, formatDhakaDate(q.updatedAt))}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
