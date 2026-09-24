'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import Icon from './Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY, pickLocalized } from '@/lib/i18n';
import { useQuestionBankOptions } from '@/lib/hooks/useQuestionBankOptions';
import {
  MAX_MCQ_OPTIONS,
  QUESTION_DIFFICULTIES,
  QUESTION_TYPES,
  createQuestionSchema,
} from '@/lib/validations/question';

type FormInput = z.input<typeof createQuestionSchema>;
type FormOutput = z.output<typeof createQuestionSchema>;

export interface QuestionFormInitial {
  id: string;
  academicSessionId: string | null;
  academicProgramId: string | null;
  academicClassId: string | null;
  academicGroupId: string | null;
  subjectId: string;
  subjectPaperId: string | null;
  chapter: string | null;
  type: string;
  difficulty: string | null;
  marks: number | null;
  questionText: string;
  banglaQuestionText: string | null;
  answer?: string | null;
  banglaAnswer?: string | null;
  explanation?: string | null;
  banglaExplanation?: string | null;
  status: string;
  options: Array<{ optionText: string; banglaOptionText: string | null; isCorrect?: boolean }>;
}

const LETTERS = 'ABCDEFGH';
const blankOption = () => ({ optionText: '', banglaOptionText: '', isCorrect: false });

export default function QuestionForm({ initial }: { initial?: QuestionFormInitial }) {
  const router = useRouter();
  const { lang, showToast } = useApp();
  const t = DICTIONARY[lang];
  const qb = t.questionBank;
  const c = t.common;
  const { options: opts, allClasses } = useQuestionBankOptions();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createQuestionSchema),
    defaultValues: {
      academicSessionId: initial?.academicSessionId ?? '',
      academicProgramId: initial?.academicProgramId ?? '',
      academicClassId: initial?.academicClassId ?? '',
      academicGroupId: initial?.academicGroupId ?? '',
      subjectId: initial?.subjectId ?? '',
      subjectPaperId: initial?.subjectPaperId ?? '',
      chapter: initial?.chapter ?? '',
      type: (initial?.type as FormInput['type']) ?? 'MCQ',
      difficulty: (initial?.difficulty as FormInput['difficulty']) ?? 'MEDIUM',
      marks: initial?.marks ?? 1,
      questionText: initial?.questionText ?? '',
      banglaQuestionText: initial?.banglaQuestionText ?? '',
      answer: initial?.answer ?? '',
      banglaAnswer: initial?.banglaAnswer ?? '',
      explanation: initial?.explanation ?? '',
      banglaExplanation: initial?.banglaExplanation ?? '',
      status: initial?.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
      options: initial
        ? initial.options.map((o) => ({
            optionText: o.optionText,
            banglaOptionText: o.banglaOptionText ?? '',
            isCorrect: !!o.isCorrect,
          }))
        : [blankOption(), blankOption(), blankOption(), blankOption()],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({ control, name: 'options' });

  const type = useWatch({ control, name: 'type' });
  const programId = useWatch({ control, name: 'academicProgramId' });
  const classId = useWatch({ control, name: 'academicClassId' });
  const groupId = useWatch({ control, name: 'academicGroupId' });
  const subjectId = useWatch({ control, name: 'subjectId' });
  const optionValues = useWatch({ control, name: 'options' });
  const isOptionType = type === 'MCQ' || type === 'TRUE_FALSE';

  const classes = useMemo(
    () => (programId ? opts.programs.find((p) => p.id === programId)?.classes || [] : allClasses),
    [programId, opts.programs, allClasses]
  );
  const groups = allClasses.find((cl) => cl.id === classId)?.groups || [];
  const subjects = opts.subjects.filter(
    (s) => (!classId || s.academicClassId === classId) && (!groupId || !s.academicGroupId || s.academicGroupId === groupId)
  );
  const papers = opts.subjects.find((s) => s.id === subjectId)?.papers || [];

  const onTypeChange = (next: string) => {
    if (next === 'TRUE_FALSE') {
      replace([
        { optionText: DICTIONARY.en.questionBank.tfTrue, banglaOptionText: DICTIONARY.bn.questionBank.tfTrue, isCorrect: true },
        { optionText: DICTIONARY.en.questionBank.tfFalse, banglaOptionText: DICTIONARY.bn.questionBank.tfFalse, isCorrect: false },
      ]);
    } else if (next === 'MCQ') {
      if (type !== 'MCQ') replace([blankOption(), blankOption(), blankOption(), blankOption()]);
    } else {
      replace([]);
    }
  };

  const onSubjectChange = (id: string) => {
    const s = opts.subjects.find((x) => x.id === id);
    setValue('subjectPaperId', '');
    if (!s) return;
    const cls = allClasses.find((cl) => cl.id === s.academicClassId);
    if (cls) {
      setValue('academicClassId', cls.id);
      setValue('academicProgramId', cls.academicProgramId);
    }
    if (s.academicGroupId) setValue('academicGroupId', s.academicGroupId);
  };

  const markCorrect = (index: number) => {
    optionValues?.forEach((_, i) => setValue(`options.${i}.isCorrect`, i === index, { shouldValidate: true }));
  };

  const onSubmit = async (values: FormOutput) => {
    setServerError(null);
    const res = await fetch(initial ? `/api/questions/${initial.id}` : '/api/questions', {
      method: initial ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      const detail = data.details ? Object.values(data.details).flat().join(' · ') : '';
      setServerError(detail || data.message || c.actionFailed);
      return;
    }
    showToast(c.saved);
    router.push(`/questions/${data.question.id}`);
    router.refresh();
  };

  const fieldError = (msg?: string) => (msg ? <span className="text-[12px] text-rose-600">{msg}</span> : null);
  const optionsError =
    (errors.options as { message?: string; root?: { message?: string } } | undefined)?.message ||
    (errors.options as { root?: { message?: string } } | undefined)?.root?.message;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
      {/* Academic context */}
      <section className="card p-5 flex flex-col gap-4">
        <h2 className="ttl">{qb.academicContext}</h2>
        {opts.restrictedToTeacherSubjects && <p className="text-[12.5px] text-[#64748b]">{qb.teacherScopeHint}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="fld">
            <label htmlFor="q-session">{c.session}</label>
            <select id="q-session" {...register('academicSessionId')}>
              <option value="">{c.selectOption}</option>
              {opts.sessions.map((s) => (
                <option key={s.id} value={s.id}>{pickLocalized(lang, s.name, s.banglaName)}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="q-program">{c.program}</label>
            <select
              id="q-program"
              {...register('academicProgramId', {
                onChange: () => {
                  setValue('academicClassId', '');
                  setValue('academicGroupId', '');
                },
              })}
            >
              <option value="">{c.selectOption}</option>
              {opts.programs.map((p) => (
                <option key={p.id} value={p.id}>{pickLocalized(lang, p.name, p.banglaName)}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="q-class">{c.class}</label>
            <select
              id="q-class"
              {...register('academicClassId', {
                onChange: () => {
                  setValue('academicGroupId', '');
                },
              })}
            >
              <option value="">{c.selectOption}</option>
              {classes.map((cl) => (
                <option key={cl.id} value={cl.id}>{pickLocalized(lang, cl.name, cl.banglaName)}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="q-group">{c.group} <span className="font-normal text-[#64748b]">({c.optional})</span></label>
            <select id="q-group" {...register('academicGroupId')}>
              <option value="">{c.anyOption}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{pickLocalized(lang, g.name, g.banglaName)}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="q-subject">{c.subject} *</label>
            <select id="q-subject" {...register('subjectId', { onChange: (e) => onSubjectChange(e.target.value) })}>
              <option value="">{c.selectOption}</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{pickLocalized(lang, s.name, s.banglaName)} ({s.code})</option>
              ))}
            </select>
            {fieldError(errors.subjectId?.message)}
          </div>
          <div className="fld">
            <label htmlFor="q-paper">{c.subjectPaper} <span className="font-normal text-[#64748b]">({c.optional})</span></label>
            <select id="q-paper" {...register('subjectPaperId')} disabled={papers.length === 0}>
              <option value="">{c.anyOption}</option>
              {papers.map((p) => (
                <option key={p.id} value={p.id}>{pickLocalized(lang, p.name, p.banglaName)}</option>
              ))}
            </select>
          </div>
          <div className="fld sm:col-span-2 lg:col-span-3">
            <label htmlFor="q-chapter">{qb.chapter}</label>
            <input id="q-chapter" {...register('chapter')} />
          </div>
        </div>
      </section>

      {/* Question */}
      <section className="card p-5 flex flex-col gap-4">
        <h2 className="ttl">{qb.questionSection}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="fld">
            <label htmlFor="q-type">{qb.type} *</label>
            <select id="q-type" {...register('type', { onChange: (e) => onTypeChange(e.target.value) })}>
              {QUESTION_TYPES.map((v) => (
                <option key={v} value={v}>{(t.questionType as Record<string, string>)[v]}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="q-difficulty">{qb.difficulty} *</label>
            <select id="q-difficulty" {...register('difficulty')}>
              {QUESTION_DIFFICULTIES.map((v) => (
                <option key={v} value={v}>{(t.questionDifficulty as Record<string, string>)[v]}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="q-marks">{qb.marks} *</label>
            <input id="q-marks" type="number" step="0.5" min="0.5" {...register('marks')} />
            {fieldError(errors.marks?.message)}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="fld">
            <label htmlFor="q-text">{qb.englishQuestion} *</label>
            <textarea id="q-text" rows={4} {...register('questionText')} />
            {fieldError(errors.questionText?.message)}
          </div>
          <div className="fld">
            <label htmlFor="q-text-bn">{qb.banglaQuestion}</label>
            <textarea id="q-text-bn" rows={4} className="font-bangla" {...register('banglaQuestionText')} />
          </div>
        </div>

        {isOptionType && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[13px] font-bold text-[#063b78]">{qb.options}</div>
                <div className="text-[12px] text-[#64748b]">{qb.mcqHint}</div>
              </div>
              {type === 'MCQ' && fields.length < MAX_MCQ_OPTIONS && (
                <button type="button" className="tb" onClick={() => append(blankOption())}>
                  <Icon name="plus" size={14} />
                  {qb.addOption}
                </button>
              )}
            </div>
            {fields.map((f, i) => {
              const isCorrect = !!optionValues?.[i]?.isCorrect;
              return (
                <div
                  key={f.id}
                  className={`grid grid-cols-[auto_1fr] md:grid-cols-[auto_1fr_1fr_auto] gap-2.5 items-center rounded-xl border p-2.5 ${
                    isCorrect ? 'border-emerald-300 bg-emerald-50/50' : 'border-[#dce5f0]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => markCorrect(i)}
                    aria-pressed={isCorrect}
                    title={qb.markCorrect}
                    className={`w-9 h-9 rounded-full font-black text-[13px] border ${
                      isCorrect ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-[#063b78] border-[#dce5f0]'
                    }`}
                  >
                    {LETTERS[i]}
                  </button>
                  <input
                    aria-label={`${qb.option} ${LETTERS[i]} (${c.english})`}
                    placeholder={`${qb.option} ${LETTERS[i]}`}
                    readOnly={type === 'TRUE_FALSE'}
                    className="h-10 rounded-lg border border-[#dce5f0] px-3 text-[13.5px] min-w-0"
                    {...register(`options.${i}.optionText`)}
                  />
                  <input
                    aria-label={`${qb.option} ${LETTERS[i]} (${c.bangla})`}
                    placeholder={`${qb.option} ${LETTERS[i]} (বাংলা)`}
                    readOnly={type === 'TRUE_FALSE'}
                    className="h-10 rounded-lg border border-[#dce5f0] px-3 text-[13.5px] min-w-0 font-bangla col-span-2 md:col-span-1"
                    {...register(`options.${i}.banglaOptionText`)}
                  />
                  {type === 'MCQ' && fields.length > 2 ? (
                    <button type="button" className="ibtn" onClick={() => remove(i)} title={qb.removeOption} aria-label={qb.removeOption}>
                      <Icon name="x" size={16} />
                    </button>
                  ) : (
                    <span className="hidden md:block w-10" />
                  )}
                </div>
              );
            })}
            {fieldError(optionsError)}
          </div>
        )}
      </section>

      {/* Answer & explanation */}
      <section className="card p-5 flex flex-col gap-4">
        <h2 className="ttl">{qb.answer} & {qb.explanation}</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="fld">
            <label htmlFor="q-ans">{qb.englishAnswer}</label>
            <textarea id="q-ans" rows={3} {...register('answer')} />
          </div>
          <div className="fld">
            <label htmlFor="q-ans-bn">{qb.banglaAnswer}</label>
            <textarea id="q-ans-bn" rows={3} className="font-bangla" {...register('banglaAnswer')} />
          </div>
          <div className="fld">
            <label htmlFor="q-exp">{qb.englishExplanation}</label>
            <textarea id="q-exp" rows={3} {...register('explanation')} />
          </div>
          <div className="fld">
            <label htmlFor="q-exp-bn">{qb.banglaExplanation}</label>
            <textarea id="q-exp-bn" rows={3} className="font-bangla" {...register('banglaExplanation')} />
          </div>
        </div>
      </section>

      {/* Status & submit */}
      <section className="card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <fieldset className="flex items-center gap-4">
          <legend className="text-[12.5px] font-bold text-[#063b78] mb-1.5">{qb.saveAs}</legend>
          {(['DRAFT', 'PUBLISHED'] as const).map((s) => (
            <label key={s} className="flex items-center gap-2 text-[13.5px] font-semibold text-[#092f63]">
              <input type="radio" value={s} {...register('status')} />
              {(t.questionStatus as Record<string, string>)[s]}
            </label>
          ))}
        </fieldset>
        <div className="flex flex-col items-stretch sm:items-end gap-2">
          {serverError && <span className="text-[12.5px] text-rose-600 max-w-md">{serverError}</span>}
          <div className="flex gap-2 justify-end">
            <button type="button" className="tb" onClick={() => router.back()}>{c.cancel}</button>
            <button type="submit" className="btn-navy" disabled={isSubmitting}>
              <Icon name="check2" size={16} />
              {isSubmitting ? c.saving : initial ? c.save : qb.createQuestion}
            </button>
          </div>
        </div>
      </section>
    </form>
  );
}
