'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import PageHeader, { EmptyState, Pager, StatTile } from '@/components/PageHeader';
import { DifficultyBadge, QuestionTypeBadge } from '@/components/QuestionBadges';
import FilterSelect from '@/components/FilterSelect';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate, localizeNumber, pickLocalized } from '@/lib/i18n';
import { useQuestionBankOptions } from '@/lib/hooks/useQuestionBankOptions';
import { QUESTION_DIFFICULTIES, QUESTION_STATUSES, QUESTION_TYPES } from '@/lib/validations/question';

interface QuestionRow {
  id: string;
  type: string;
  difficulty: string | null;
  marks: number;
  status: string;
  chapter: string | null;
  questionText: string;
  banglaQuestionText: string | null;
  updatedAt: string;
  canModify: boolean;
  subject: { id: string; name: string; banglaName: string | null; code: string };
  subjectPaper: { id: string; name: string; banglaName: string | null } | null;
  academicClass: { id: string; name: string; banglaName: string | null } | null;
  createdBy: { id: string; name: string } | null;
}

const EMPTY_FILTERS = {
  type: '',
  difficulty: '',
  status: '',
  subject: '',
  subjectPaper: '',
  class: '',
  group: '',
  chapter: '',
  createdBy: '',
};

export default function QuestionBankPage() {
  const router = useRouter();
  const { lang, showToast } = useApp();
  const t = DICTIONARY[lang];
  const qb = t.questionBank;
  const c = t.common;
  const num = (n: number) => localizeNumber(lang, n);

  const { options, allClasses } = useQuestionBankOptions();

  const [rows, setRows] = useState<QuestionRow[]>([]);
  const [stats, setStats] = useState<{ total: number; published: number; draft: number; archived: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  // Debounce free-text search so each keystroke doesn't hit the server.
  useEffect(() => {
    const h = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(h);
  }, [searchInput]);

  const setFilter = (key: keyof typeof EMPTY_FILTERS, value: string) => {
    setFilters((f) => {
      const next = { ...f, [key]: value };
      if (key === 'class') {
        next.group = '';
        next.subject = '';
        next.subjectPaper = '';
      }
      if (key === 'subject') next.subjectPaper = '';
      return next;
    });
    setPage(1);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const sp = new URLSearchParams({ page: String(page), pageSize: '20', stats: '1' });
      if (search) sp.set('search', search);
      Object.entries(filters).forEach(([k, v]) => v && sp.set(k, v));
      const res = await fetch(`/api/questions?${sp}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message);
      setRows(data.questions);
      setStats(data.stats);
      setPagination({ total: data.pagination.total, totalPages: data.pagination.totalPages });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [page, search, filters]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedClass = allClasses.find((cl) => cl.id === filters.class);
  const subjectsForFilter = useMemo(
    () => options.subjects.filter((s) => !filters.class || s.academicClassId === filters.class),
    [options.subjects, filters.class]
  );
  const selectedSubject = options.subjects.find((s) => s.id === filters.subject);
  const hasFilters = !!search || Object.values(filters).some(Boolean);

  const duplicate = async (id: string) => {
    const res = await fetch(`/api/questions/${id}/duplicate`, { method: 'POST' });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast(qb.duplicated);
      router.push(`/questions/${data.question.id}/edit`);
    } else {
      showToast(data.message || c.actionFailed);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
      <PageHeader eyebrow={t.nav.questions} title={qb.title} subtitle={qb.subtitle}>
        <Link href="/question-papers" className="tb">
          <Icon name="file" size={16} />
          {t.nav.questionPapers}
        </Link>
        <Link href="/questions/new" className="primary">
          <Icon name="plus" size={16} />
          {qb.newQuestion}
        </Link>
      </PageHeader>

      {stats && stats.total > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile label={qb.total} value={num(stats.total)} />
          <StatTile label={qb.published} value={num(stats.published)} tone="green" />
          <StatTile label={qb.draft} value={num(stats.draft)} tone="slate" />
          <StatTile label={qb.archived} value={num(stats.archived)} tone="slate" />
        </div>
      )}

      {/* Filter bar */}
      <div className="card p-4 flex flex-col gap-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b]">
              <Icon name="search" size={16} />
            </span>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={qb.searchPlaceholder}
              className="w-full h-10 rounded-xl border border-[#dce5f0] pl-9 pr-3 text-[13.5px] focus:outline-2 focus:outline-[#063b78]"
            />
          </div>
          {hasFilters && (
            <button
              type="button"
              className="tb"
              onClick={() => {
                setFilters(EMPTY_FILTERS);
                setSearchInput('');
                setPage(1);
              }}
            >
              <Icon name="x" size={14} />
              {c.clear}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-2.5">
          <FilterSelect label={qb.type} value={filters.type} onChange={(v) => setFilter('type', v)} anyLabel={c.all}
            items={QUESTION_TYPES.map((v) => ({ value: v, label: (t.questionType as Record<string, string>)[v] }))} />
          <FilterSelect label={qb.difficulty} value={filters.difficulty} onChange={(v) => setFilter('difficulty', v)} anyLabel={c.all}
            items={QUESTION_DIFFICULTIES.map((v) => ({ value: v, label: (t.questionDifficulty as Record<string, string>)[v] }))} />
          <FilterSelect label={c.status} value={filters.status} onChange={(v) => setFilter('status', v)} anyLabel={c.all}
            items={QUESTION_STATUSES.map((v) => ({ value: v, label: (t.questionStatus as Record<string, string>)[v] }))} />
          <FilterSelect label={c.class} value={filters.class} onChange={(v) => setFilter('class', v)} anyLabel={c.all}
            items={allClasses.map((cl) => ({ value: cl.id, label: pickLocalized(lang, cl.name, cl.banglaName) }))} />
          <FilterSelect label={c.group} value={filters.group} onChange={(v) => setFilter('group', v)} anyLabel={c.all}
            items={(selectedClass?.groups || []).map((g) => ({ value: g.id, label: pickLocalized(lang, g.name, g.banglaName) }))} />
          <FilterSelect label={c.subject} value={filters.subject} onChange={(v) => setFilter('subject', v)} anyLabel={c.all}
            items={subjectsForFilter.map((s) => ({ value: s.id, label: `${pickLocalized(lang, s.name, s.banglaName)} (${s.code})` }))} />
          <FilterSelect label={c.subjectPaper} value={filters.subjectPaper} onChange={(v) => setFilter('subjectPaper', v)} anyLabel={c.all}
            items={(selectedSubject?.papers || []).map((p) => ({ value: p.id, label: pickLocalized(lang, p.name, p.banglaName) }))} />
          <FilterSelect label={c.createdBy} value={filters.createdBy} onChange={(v) => setFilter('createdBy', v)} anyLabel={c.all}
            items={options.creators.map((u) => ({ value: u.id, label: u.name }))} />
          <label className="flex flex-col gap-1 min-w-0">
            <span className="text-[11px] font-bold text-[#64748b] uppercase tracking-wide">{qb.chapter}</span>
            <input
              value={filters.chapter}
              onChange={(e) => setFilter('chapter', e.target.value)}
              className="h-9 rounded-lg border border-[#dce5f0] px-2.5 text-[13px] min-w-0"
            />
          </label>
        </div>
      </div>

      {/* Data panel */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-[13px] text-[#64748b]">{c.loading}</div>
        ) : error ? (
          <div className="py-16 text-center text-[13px] text-rose-600">{c.loadFailed}</div>
        ) : rows.length === 0 ? (
          hasFilters ? (
            <EmptyState message={qb.noMatch} icon="search" />
          ) : (
            <EmptyState message={qb.empty} actionHref="/questions/new" actionLabel={qb.firstQuestion} icon="target" />
          )
        ) : (
          <>
            <div className="overflow-x-auto scroll">
              <table className="tbl min-w-[980px]">
                <thead>
                  <tr>
                    <th>{qb.question}</th>
                    <th style={{ textAlign: 'left' }}>{c.subject}</th>
                    <th style={{ textAlign: 'left' }}>{qb.type}</th>
                    <th style={{ textAlign: 'left' }}>{qb.difficulty}</th>
                    <th>{qb.marks}</th>
                    <th style={{ textAlign: 'left' }}>{c.status}</th>
                    <th style={{ textAlign: 'left' }}>{c.createdBy}</th>
                    <th>{c.updatedAt}</th>
                    <th>{c.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((q) => (
                    <tr key={q.id} className="trow">
                      <td className="max-w-[380px]">
                        <Link href={`/questions/${q.id}`} className="block group">
                          <span className="line-clamp-2 font-semibold text-[#092f63] group-hover:text-[#063b78] group-hover:underline">
                            {pickLocalized(lang, q.questionText, q.banglaQuestionText)}
                          </span>
                          {q.chapter && <span className="text-[11.5px] text-[#64748b]">{q.chapter}</span>}
                        </Link>
                      </td>
                      <td style={{ textAlign: 'left' }}>
                        <div className="font-semibold text-[#092f63] whitespace-nowrap">
                          {pickLocalized(lang, q.subject.name, q.subject.banglaName)}
                        </div>
                        <div className="text-[11.5px] text-[#64748b] whitespace-nowrap">
                          {[q.subjectPaper && pickLocalized(lang, q.subjectPaper.name, q.subjectPaper.banglaName), q.academicClass && pickLocalized(lang, q.academicClass.name, q.academicClass.banglaName)]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </td>
                      <td style={{ textAlign: 'left' }}><QuestionTypeBadge type={q.type} /></td>
                      <td style={{ textAlign: 'left' }}><DifficultyBadge difficulty={q.difficulty} /></td>
                      <td className="num font-bold">{num(q.marks)}</td>
                      <td style={{ textAlign: 'left' }}><StatusBadge status={q.status} size="sm" dictKey="questionStatus" /></td>
                      <td style={{ textAlign: 'left' }} className="whitespace-nowrap text-[#64748b]">{q.createdBy?.name || c.none}</td>
                      <td className="num whitespace-nowrap text-[#64748b]">{localizeNumber(lang, formatDhakaDate(q.updatedAt))}</td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <Link href={`/questions/${q.id}`} className="ibtn" title={c.view} aria-label={c.view}>
                            <Icon name="eye" size={16} />
                          </Link>
                          {q.canModify && q.status !== 'ARCHIVED' && (
                            <Link href={`/questions/${q.id}/edit`} className="ibtn" title={c.edit} aria-label={c.edit}>
                              <Icon name="sliders" size={16} />
                            </Link>
                          )}
                          <button type="button" className="ibtn" title={qb.duplicate} aria-label={qb.duplicate} onClick={() => duplicate(q.id)}>
                            <Icon name="copy" size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              page={page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              onPage={setPage}
              labels={c}
              formatNumber={num}
            />
          </>
        )}
      </div>
    </div>
  );
}
