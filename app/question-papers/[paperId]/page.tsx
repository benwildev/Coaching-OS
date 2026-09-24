'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import PageHeader from '@/components/PageHeader';
import QuestionPaperBuilder, { type PaperBuilderInitial } from '@/components/QuestionPaperBuilder';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate, localizeNumber, pickLocalized } from '@/lib/i18n';

type Named = { name: string; banglaName?: string | null } | null;

interface PaperItem {
  id: string;
  questionId: string | null;
  order: number;
  type: string;
  questionText: string;
  banglaQuestionText: string | null;
  marks: number;
  difficulty: string | null;
  options: Array<{ text: string; banglaText: string | null; order: number; isCorrect?: boolean }>;
  answer?: string | null;
  explanation?: string | null;
}

interface PaperDetail extends Omit<PaperBuilderInitial, 'items'> {
  status: string;
  calculatedMarks: number;
  marksMatch: boolean;
  canModify: boolean;
  finalizedAt: string | null;
  coachingCenter: { name: string; banglaName: string | null; address: string | null };
  branch: Named;
  subject: { name: string; banglaName: string | null; code: string };
  subjectPaper: Named;
  academicClass: Named;
  academicGroup: Named;
  academicSession: Named;
  finalizedBy: Named;
  items: PaperItem[];
}

const LETTERS = 'ABCDEFGH';
const BN_LETTERS = ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ'];

export default function QuestionPaperPage({ params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = use(params);
  const { lang, showToast } = useApp();
  const t = DICTIONARY[lang];
  const qp = t.questionPapers;
  const c = t.common;
  const [paper, setPaper] = useState<PaperDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [staffView, setStaffView] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/question-papers/${paperId}${staffView ? '' : '?print=1'}`)
      .then((r) => r.json())
      .then((d) => (d.success ? setPaper(d.paper) : setError(d.message || d.error)))
      .catch(() => setError(c.loadFailed));
  }, [paperId, staffView, c.loadFailed]);

  useEffect(load, [load]);

  const act = async (path: string, okMsg: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/question-papers/${paperId}/${path}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) return showToast(data.message || c.actionFailed);
      showToast(okMsg);
      load();
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="card p-6 text-rose-600 text-[13.5px] max-w-[1000px] mx-auto">{error}</div>;
  if (!paper) return <div className="card p-10 text-center text-[#64748b] text-[13px] max-w-[1000px] mx-auto">{c.loading}</div>;

  const loc = (n: Named) => (n ? pickLocalized(lang, n.name, n.banglaName) : '');
  const num = (n: number | string) => localizeNumber(lang, n);

  if (editing) {
    return (
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
        <PageHeader title={qp.edit} subtitle={pickLocalized(lang, paper.title, paper.banglaTitle)} />
        <QuestionPaperBuilder
          initial={paper as unknown as PaperBuilderInitial}
          onSaved={() => {
            setEditing(false);
            load();
          }}
        />
      </div>
    );
  }

  const letters = lang === 'bn' ? BN_LETTERS : LETTERS.split('');
  const instructions = pickLocalized(lang, paper.instructions, paper.banglaInstructions);
  const classLine = [loc(paper.academicClass), loc(paper.academicGroup)].filter(Boolean).join(' · ');
  const subjectLine = [loc(paper.subject), loc(paper.subjectPaper)].filter(Boolean).join(' — ');

  return (
    <div className="max-w-[1000px] mx-auto flex flex-col gap-5">
      <PageHeader
        backHref="/question-papers"
        backLabel={qp.title}
        title={pickLocalized(lang, paper.title, paper.banglaTitle)}
        subtitle={subjectLine}
      >
        <StatusBadge status={paper.status} dictKey="paperStatus" />
        <button type="button" className="tb" onClick={() => setStaffView((v) => !v)} aria-pressed={staffView}>
          <Icon name={staffView ? 'eyeoff' : 'eye'} size={16} />
          {staffView ? qp.preview : qp.staffView}
        </button>
        {paper.canModify && (
          <>
            <button type="button" className="tb" onClick={() => { setStaffView(true); setEditing(true); }}>
              <Icon name="sliders" size={16} />
              {c.edit}
            </button>
            <button
              type="button"
              className="btn-navy"
              disabled={busy || !paper.marksMatch}
              title={!paper.marksMatch ? qp.marksMismatch : undefined}
              onClick={() => window.confirm(qp.finalizeConfirm) && act('finalize', qp.finalized_)}
            >
              <Icon name="lock" size={16} />
              {qp.finalize}
            </button>
          </>
        )}
        {paper.status !== 'ARCHIVED' && (paper.canModify || paper.status === 'FINALIZED') && (
          <button type="button" className="tb" disabled={busy} onClick={() => act('archive', qp.archived_)}>
            {qp.archive}
          </button>
        )}
        <button type="button" className="primary" onClick={() => window.print()}>
          <Icon name="download" size={16} />
          {qp.print}
        </button>
      </PageHeader>

      {paper.status === 'FINALIZED' && (
        <div className="no-print card px-5 py-3 text-[12.5px] text-[#092f63] flex items-center gap-2">
          <Icon name="lock" size={15} />
          {qp.locked}
          {paper.finalizedAt && <span className="text-[#64748b]">({localizeNumber(lang, formatDhakaDate(paper.finalizedAt))}{paper.finalizedBy ? ` · ${paper.finalizedBy.name}` : ''})</span>}
        </div>
      )}
      {paper.status === 'ARCHIVED' && <div className="no-print card px-5 py-3 text-[12.5px] text-[#64748b]">{qp.archivedNote}</div>}
      {!paper.marksMatch && (
        <div className="no-print rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-[12.5px] text-amber-800">
          {qp.marksMismatch} ({qp.declaredMarks}: {num(paper.totalMarks)} · {qp.calculatedMarks}: {num(paper.calculatedMarks)})
        </div>
      )}

      {/* The printable sheet */}
      <article className="print-paper card p-6 sm:p-10">
        <header className="text-center flex flex-col gap-1 pb-4 border-b-2 border-black/80">
          <h2 className="text-[20px] font-black">{pickLocalized(lang, paper.coachingCenter.name, paper.coachingCenter.banglaName)}</h2>
          {paper.branch && <div className="text-[13px]">{loc(paper.branch)}</div>}
          <div className="text-[16px] font-bold mt-1">{pickLocalized(lang, paper.title, paper.banglaTitle)}</div>
          {paper.examType && <div className="text-[13px]">{(t.examType as Record<string, string>)[paper.examType] || paper.examType}</div>}
          <div className="text-[14px] font-semibold">{subjectLine}</div>
          {classLine && <div className="text-[13px]">{classLine}</div>}
          <div className="flex flex-wrap justify-between gap-2 text-[13px] font-semibold mt-2">
            <span>{qp.durationShort}: {num(paper.durationMinutes)} {qp.minutes}</span>
            {paper.examDate && <span>{qp.date}: {localizeNumber(lang, formatDhakaDate(paper.examDate))}</span>}
            <span>{qp.fullMarks}: {num(paper.totalMarks)}</span>
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3 py-4 text-[13px] border-b border-black/30">
          {[qp.studentName, qp.roll, qp.registration].map((label) => (
            <div key={label} className="flex items-end gap-2">
              <span className="whitespace-nowrap font-semibold">{label}:</span>
              <span className="grow border-b border-dotted border-black/60 h-5" />
            </div>
          ))}
        </div>

        {instructions && (
          <div className="pp-section py-3 text-[13px] italic whitespace-pre-wrap border-b border-black/20">{instructions}</div>
        )}

        <ol className="flex flex-col gap-4 pt-4">
          {paper.items.map((it, i) => (
            <li key={it.id} className="pp-question flex gap-3">
              <span className="font-bold shrink-0 num">{num(i + 1)}.</span>
              <div className="grow min-w-0">
                <div className="flex justify-between gap-4">
                  <p className="whitespace-pre-wrap">{pickLocalized(lang, it.questionText, it.banglaQuestionText)}</p>
                  <span className="shrink-0 font-semibold num">[{num(it.marks)}]</span>
                </div>
                {it.options.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-2">
                    {it.options.map((o, oi) => (
                      <div key={oi} className={`flex gap-2 ${staffView && o.isCorrect ? 'font-bold text-emerald-700 print:font-normal' : ''}`}>
                        <span>{letters[oi]}.</span>
                        <span>{pickLocalized(lang, o.text, o.banglaText)}</span>
                        {staffView && o.isCorrect && <Icon name="check2" size={14} className="mt-1 no-print" />}
                      </div>
                    ))}
                  </div>
                )}
                {staffView && (it.answer || it.explanation) && (
                  <div className="no-print mt-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-[12.5px] whitespace-pre-wrap">
                    {it.answer && <div><span className="font-bold">{qp.answerKey}:</span> {it.answer}</div>}
                    {it.explanation && <div className="text-[#64748b] mt-1">{it.explanation}</div>}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </article>
    </div>
  );
}
