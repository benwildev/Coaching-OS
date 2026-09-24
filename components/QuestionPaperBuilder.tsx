'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import FilterSelect from './FilterSelect';
import { DifficultyBadge, QuestionTypeBadge } from './QuestionBadges';
import { useApp } from '@/lib/store';
import { DICTIONARY, localizeNumber, pickLocalized } from '@/lib/i18n';
import { useQuestionBankOptions } from '@/lib/hooks/useQuestionBankOptions';
import { QUESTION_DIFFICULTIES, QUESTION_TYPES } from '@/lib/validations/question';
import { PAPER_EXAM_TYPES } from '@/lib/validations/question-paper';

export interface SelectedQuestion {
  id: string;
  type: string;
  marks: number;
  difficulty: string | null;
  questionText: string;
  banglaQuestionText: string | null;
}

export interface PaperBuilderInitial {
  id: string;
  title: string;
  banglaTitle: string | null;
  academicSessionId: string | null;
  academicProgramId: string | null;
  academicClassId: string | null;
  academicGroupId: string | null;
  subjectId: string;
  subjectPaperId: string | null;
  examType: string | null;
  examDate: string | null;
  durationMinutes: number;
  totalMarks: number;
  instructions: string | null;
  banglaInstructions: string | null;
  items: Array<{
    questionId: string | null;
    type: string;
    marks: number;
    difficulty: string | null;
    questionText: string;
    banglaQuestionText: string | null;
  }>;
}

const cents = (n: number) => Math.round(n * 100);
const SEARCH_PAGE_SIZE = 10;

export default function QuestionPaperBuilder({
  initial,
  onSaved,
}: {
  initial?: PaperBuilderInitial;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const { lang, showToast } = useApp();
  const t = DICTIONARY[lang];
  const qp = t.questionPapers;
  const qb = t.questionBank;
  const c = t.common;
  const num = (n: number) => localizeNumber(lang, n);
  const { options: opts, allClasses } = useQuestionBankOptions();

  // ---- paper details ----
  const [d, setD] = useState({
    title: initial?.title ?? '',
    banglaTitle: initial?.banglaTitle ?? '',
    academicSessionId: initial?.academicSessionId ?? '',
    academicProgramId: initial?.academicProgramId ?? '',
    academicClassId: initial?.academicClassId ?? '',
    academicGroupId: initial?.academicGroupId ?? '',
    subjectId: initial?.subjectId ?? '',
    subjectPaperId: initial?.subjectPaperId ?? '',
    examType: initial?.examType ?? '',
    examDate: initial?.examDate ? initial.examDate.slice(0, 10) : '',
    durationMinutes: String(initial?.durationMinutes ?? 60),
    totalMarks: initial ? String(initial.totalMarks) : '',
    instructions: initial?.instructions ?? '',
    banglaInstructions: initial?.banglaInstructions ?? '',
  });
  const set = (k: keyof typeof d, v: string) => setD((prev) => ({ ...prev, [k]: v }));

  // ---- selection (array order = paper order) ----
  const [selected, setSelected] = useState<SelectedQuestion[]>(
    () =>
      initial?.items
        .filter((i) => i.questionId)
        .map((i) => ({
          id: i.questionId!,
          type: i.type,
          marks: i.marks,
          difficulty: i.difficulty,
          questionText: i.questionText,
          banglaQuestionText: i.banglaQuestionText,
        })) ?? []
  );

  // ---- question search (server-side, limited) ----
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [f, setF] = useState({ type: '', difficulty: '', chapter: '' });
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<SelectedQuestion[]>([]);
  const [resultTotal, setResultTotal] = useState(0);
  const [resultPages, setResultPages] = useState(1);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const h = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(h);
  }, [searchInput]);

  const selectedIds = useMemo(() => selected.map((s) => s.id), [selected]);
  const selectedKey = selectedIds.join(',');

  const runSearch = useCallback(async () => {
    if (!d.subjectId) {
      setResults([]);
      setResultTotal(0);
      return;
    }
    setSearching(true);
    try {
      const sp = new URLSearchParams({ subject: d.subjectId, page: String(page), pageSize: String(SEARCH_PAGE_SIZE) });
      if (search) sp.set('search', search);
      if (f.type) sp.set('type', f.type);
      if (f.difficulty) sp.set('difficulty', f.difficulty);
      if (f.chapter) sp.set('chapter', f.chapter);
      if (d.subjectPaperId) sp.set('subjectPaper', d.subjectPaperId);
      if (selectedKey) sp.set('exclude', selectedKey);
      const res = await fetch(`/api/questions?${sp}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setResults(data.questions);
        setResultTotal(data.pagination.total);
        setResultPages(data.pagination.totalPages);
      }
    } finally {
      setSearching(false);
    }
  }, [d.subjectId, d.subjectPaperId, page, search, f, selectedKey]);

  useEffect(() => {
    runSearch();
  }, [runSearch]);

  // ---- derived totals ----
  const calculated = selected.reduce((a, q) => a + cents(q.marks), 0) / 100;
  const declared = d.totalMarks === '' ? calculated : Number(d.totalMarks);
  const mismatch = selected.length > 0 && cents(declared) !== cents(calculated);
  const breakdown = useMemo(() => {
    const m = new Map<string, { type: string; marks: number; count: number }>();
    for (const q of selected) {
      const key = `${q.type}|${q.marks}`;
      const e = m.get(key) || { type: q.type, marks: q.marks, count: 0 };
      e.count += 1;
      m.set(key, e);
    }
    return [...m.values()];
  }, [selected]);

  const move = (i: number, dir: -1 | 1) =>
    setSelected((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const add = (q: SelectedQuestion) => {
    if (selectedIds.includes(q.id)) return; // never add twice
    setSelected((prev) => [...prev, q]);
  };

  const classes = d.academicProgramId
    ? opts.programs.find((p) => p.id === d.academicProgramId)?.classes || []
    : allClasses;
  const groups = allClasses.find((cl) => cl.id === d.academicClassId)?.groups || [];
  const subjects = opts.subjects.filter(
    (s) =>
      (!d.academicClassId || s.academicClassId === d.academicClassId) &&
      (!d.academicGroupId || !s.academicGroupId || s.academicGroupId === d.academicGroupId)
  );
  const papers = opts.subjects.find((s) => s.id === d.subjectId)?.papers || [];

  const onSubjectChange = (id: string) => {
    const s = opts.subjects.find((x) => x.id === id);
    const cls = s ? allClasses.find((cl) => cl.id === s.academicClassId) : undefined;
    setD((prev) => ({
      ...prev,
      subjectId: id,
      subjectPaperId: '',
      academicClassId: cls?.id ?? prev.academicClassId,
      academicProgramId: cls?.academicProgramId ?? prev.academicProgramId,
      academicGroupId: s?.academicGroupId ?? prev.academicGroupId,
    }));
    // Questions must match the paper subject.
    if (id !== d.subjectId) setSelected([]);
    setPage(1);
  };

  const save = async () => {
    setError(null);
    if (!d.title.trim()) return setError(`${qp.paperTitle}: required`);
    if (!d.subjectId) return setError(`${c.subject}: required`);
    if (selected.length === 0) return setError(qp.noneSelected);
    setSaving(true);
    try {
      const body = {
        ...d,
        examType: d.examType || null,
        examDate: d.examDate || null,
        durationMinutes: Number(d.durationMinutes),
        totalMarks: d.totalMarks === '' ? null : Number(d.totalMarks),
        questionIds: selectedIds,
      };
      const res = await fetch(initial ? `/api/question-papers/${initial.id}` : '/api/question-papers', {
        method: initial ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const detail = data.details ? Object.values(data.details).flat().join(' · ') : '';
        setError(detail || data.message || c.actionFailed);
        return;
      }
      showToast(c.saved);
      if (onSaved) onSaved();
      else router.push(`/question-papers/${data.paper.id}`);
    } finally {
      setSaving(false);
    }
  };

  const qText = (q: SelectedQuestion) => pickLocalized(lang, q.questionText, q.banglaQuestionText);

  return (
    <div className="flex flex-col gap-5">
      {/* Paper details */}
      <section className="card p-5 flex flex-col gap-4">
        <h2 className="ttl">{qp.details}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="fld sm:col-span-2">
            <label htmlFor="p-title">{qp.englishTitle} *</label>
            <input id="p-title" value={d.title} onChange={(e) => set('title', e.target.value)} />
          </div>
          <div className="fld sm:col-span-2">
            <label htmlFor="p-title-bn">{qp.banglaTitle}</label>
            <input id="p-title-bn" className="font-bangla" value={d.banglaTitle} onChange={(e) => set('banglaTitle', e.target.value)} />
          </div>
          <div className="fld">
            <label htmlFor="p-session">{c.session}</label>
            <select id="p-session" value={d.academicSessionId} onChange={(e) => set('academicSessionId', e.target.value)}>
              <option value="">{c.selectOption}</option>
              {opts.sessions.map((s) => (
                <option key={s.id} value={s.id}>{pickLocalized(lang, s.name, s.banglaName)}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="p-program">{c.program}</label>
            <select
              id="p-program"
              value={d.academicProgramId}
              onChange={(e) => setD((p) => ({ ...p, academicProgramId: e.target.value, academicClassId: '', academicGroupId: '' }))}
            >
              <option value="">{c.selectOption}</option>
              {opts.programs.map((p) => (
                <option key={p.id} value={p.id}>{pickLocalized(lang, p.name, p.banglaName)}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="p-class">{c.class}</label>
            <select
              id="p-class"
              value={d.academicClassId}
              onChange={(e) => setD((p) => ({ ...p, academicClassId: e.target.value, academicGroupId: '' }))}
            >
              <option value="">{c.selectOption}</option>
              {classes.map((cl) => (
                <option key={cl.id} value={cl.id}>{pickLocalized(lang, cl.name, cl.banglaName)}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="p-group">{c.group}</label>
            <select id="p-group" value={d.academicGroupId} onChange={(e) => set('academicGroupId', e.target.value)}>
              <option value="">{c.anyOption}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{pickLocalized(lang, g.name, g.banglaName)}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="p-subject">{c.subject} *</label>
            <select id="p-subject" value={d.subjectId} onChange={(e) => onSubjectChange(e.target.value)}>
              <option value="">{c.selectOption}</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{pickLocalized(lang, s.name, s.banglaName)} ({s.code})</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="p-paper">{c.subjectPaper}</label>
            <select id="p-paper" value={d.subjectPaperId} disabled={!papers.length} onChange={(e) => set('subjectPaperId', e.target.value)}>
              <option value="">{c.anyOption}</option>
              {papers.map((p) => (
                <option key={p.id} value={p.id}>{pickLocalized(lang, p.name, p.banglaName)}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="p-type">{qp.examType}</label>
            <select id="p-type" value={d.examType} onChange={(e) => set('examType', e.target.value)}>
              <option value="">{c.selectOption}</option>
              {PAPER_EXAM_TYPES.map((v) => (
                <option key={v} value={v}>{(t.examType as Record<string, string>)[v]}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="p-date">{qp.examDate}</label>
            <input id="p-date" type="date" value={d.examDate} onChange={(e) => set('examDate', e.target.value)} />
          </div>
          <div className="fld">
            <label htmlFor="p-duration">{qp.duration} *</label>
            <input id="p-duration" type="number" min="1" value={d.durationMinutes} onChange={(e) => set('durationMinutes', e.target.value)} />
          </div>
          <div className="fld">
            <label htmlFor="p-total">{qp.declaredMarks}</label>
            <input
              id="p-total"
              type="number"
              min="0"
              step="0.5"
              placeholder={num(calculated)}
              value={d.totalMarks}
              onChange={(e) => set('totalMarks', e.target.value)}
            />
          </div>
          <div className="fld sm:col-span-2">
            <label htmlFor="p-ins">{qp.instructions}</label>
            <textarea id="p-ins" rows={2} value={d.instructions} onChange={(e) => set('instructions', e.target.value)} />
          </div>
          <div className="fld sm:col-span-2">
            <label htmlFor="p-ins-bn">{qp.banglaInstructions}</label>
            <textarea id="p-ins-bn" rows={2} className="font-bangla" value={d.banglaInstructions} onChange={(e) => set('banglaInstructions', e.target.value)} />
          </div>
        </div>
      </section>

      {/* Two-panel builder: search (left) + selected (right); single column on mobile */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        <section className="card p-4 flex flex-col gap-3 min-w-0">
          <h2 className="ttl">{qp.findQuestions}</h2>
          {!d.subjectId ? (
            <p className="text-[13px] text-[#64748b] py-8 text-center">{qp.pickSubjectFirst}</p>
          ) : (
            <>
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={qb.searchPlaceholder}
                className="h-10 rounded-xl border border-[#dce5f0] px-3 text-[13.5px]"
              />
              <div className="grid grid-cols-3 gap-2">
                <FilterSelect label={qb.type} value={f.type} anyLabel={c.all} onChange={(v) => { setF((x) => ({ ...x, type: v })); setPage(1); }}
                  items={QUESTION_TYPES.map((v) => ({ value: v, label: (t.questionType as Record<string, string>)[v] }))} />
                <FilterSelect label={qb.difficulty} value={f.difficulty} anyLabel={c.all} onChange={(v) => { setF((x) => ({ ...x, difficulty: v })); setPage(1); }}
                  items={QUESTION_DIFFICULTIES.map((v) => ({ value: v, label: (t.questionDifficulty as Record<string, string>)[v] }))} />
                <label className="flex flex-col gap-1 min-w-0">
                  <span className="text-[11px] font-bold text-[#64748b] uppercase tracking-wide truncate">{qb.chapter}</span>
                  <input value={f.chapter} onChange={(e) => { setF((x) => ({ ...x, chapter: e.target.value })); setPage(1); }}
                    className="h-9 rounded-lg border border-[#dce5f0] px-2.5 text-[13px] min-w-0" />
                </label>
              </div>
              <div className="flex flex-col divide-y divide-[#edf1f7] border border-[#edf1f7] rounded-xl">
                {searching && results.length === 0 ? (
                  <p className="text-[13px] text-[#64748b] py-6 text-center">{c.loading}</p>
                ) : results.length === 0 ? (
                  <p className="text-[13px] text-[#64748b] py-6 text-center">{qb.noMatch}</p>
                ) : (
                  results.map((q) => (
                    <div key={q.id} className="flex items-start gap-3 p-3">
                      <div className="min-w-0 grow">
                        <p className="text-[13.5px] text-[#092f63] line-clamp-2">{qText(q)}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <QuestionTypeBadge type={q.type} />
                          <DifficultyBadge difficulty={q.difficulty} />
                          <span className="text-[11.5px] font-bold text-[#092f63]">{qb.marks}: {num(q.marks)}</span>
                        </div>
                      </div>
                      <button type="button" className="tb shrink-0" onClick={() => add(q)}>
                        <Icon name="plus" size={14} />
                        {qp.add}
                      </button>
                    </div>
                  ))
                )}
              </div>
              {resultTotal > SEARCH_PAGE_SIZE && (
                <div className="flex items-center justify-between text-[12.5px] text-[#64748b]">
                  <span>{num(resultTotal)} {c.results}</span>
                  <div className="flex gap-2">
                    <button type="button" className="tb" disabled={page <= 1} onClick={() => setPage(page - 1)}>{c.previous}</button>
                    <button type="button" className="tb" disabled={page >= resultPages} onClick={() => setPage(page + 1)}>{c.next}</button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        <section className="card p-4 flex flex-col gap-3 min-w-0">
          {/* Sticky summary */}
          <div className="sticky top-16 z-10 -mx-4 -mt-4 px-4 pt-4 pb-3 bg-white rounded-t-[18px] border-b border-[#edf1f7] flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="ttl">{qp.selectedQuestions}</h2>
              <div className="flex gap-4 text-[13px] font-bold text-[#092f63]">
                <span>{qp.selected}: <span className="num">{num(selected.length)}</span></span>
                <span>{qp.totalMarks}: <span className="num">{num(calculated)}</span></span>
              </div>
            </div>
            {breakdown.length > 0 && (
              <div className="flex flex-wrap gap-1.5 text-[11.5px] text-[#64748b]">
                {breakdown.map((b) => (
                  <span key={`${b.type}-${b.marks}`} className="rounded-md bg-[#f5f8fc] border border-[#edf1f7] px-2 py-0.5 num">
                    {(t.questionType as Record<string, string>)[b.type] || b.type}: {num(b.count)} × {num(b.marks)} = {num(Math.round(b.count * b.marks * 100) / 100)}
                  </span>
                ))}
              </div>
            )}
            {mismatch && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[12.5px] text-amber-800">
                <Icon name="alert" size={14} />
                <span className="grow">{qp.marksMismatch} ({qp.declaredMarks}: {num(declared)})</span>
                <button type="button" className="font-bold underline" onClick={() => set('totalMarks', String(calculated))}>
                  {qp.useCalculated}
                </button>
              </div>
            )}
          </div>

          {selected.length === 0 ? (
            <p className="text-[13px] text-[#64748b] py-8 text-center">{qp.noneSelected}</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {selected.map((q, i) => (
                <li key={q.id} className="flex items-start gap-3 rounded-xl border border-[#dce5f0] p-3">
                  <span className="w-7 h-7 shrink-0 rounded-full bg-[#063b78] text-white flex items-center justify-center text-[12px] font-black num">
                    {num(i + 1)}
                  </span>
                  <div className="min-w-0 grow">
                    <p className="text-[13.5px] text-[#092f63] line-clamp-2">{qText(q)}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <QuestionTypeBadge type={q.type} />
                      <DifficultyBadge difficulty={q.difficulty} />
                      <span className="text-[11.5px] font-bold text-[#092f63]">{qb.marks}: {num(q.marks)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-1 shrink-0">
                    <button type="button" className="ibtn !w-8 !h-8" disabled={i === 0} onClick={() => move(i, -1)} title={qp.moveUp} aria-label={qp.moveUp}>
                      <Icon name="chevright" size={15} className="-rotate-90" />
                    </button>
                    <button type="button" className="ibtn !w-8 !h-8" disabled={i === selected.length - 1} onClick={() => move(i, 1)} title={qp.moveDown} aria-label={qp.moveDown}>
                      <Icon name="chevdown" size={15} />
                    </button>
                    <button type="button" className="ibtn !w-8 !h-8 !text-rose-600" onClick={() => setSelected((p) => p.filter((x) => x.id !== q.id))} title={qp.remove} aria-label={qp.remove}>
                      <Icon name="x" size={15} />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <div className="card p-4 flex flex-col sm:flex-row sm:items-center justify-end gap-3">
        {error && <span className="text-[12.5px] text-rose-600 grow">{error}</span>}
        <button type="button" className="tb" onClick={() => (onSaved ? onSaved() : router.back())}>{c.cancel}</button>
        <button type="button" className="btn-navy" disabled={saving} onClick={save}>
          <Icon name="check2" size={16} />
          {saving ? c.saving : qp.saveDraft}
        </button>
      </div>
    </div>
  );
}
