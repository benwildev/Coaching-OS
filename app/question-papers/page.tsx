'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import FilterSelect from '@/components/FilterSelect';
import PageHeader, { EmptyState, Pager, StatTile } from '@/components/PageHeader';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate, localizeNumber, pickLocalized } from '@/lib/i18n';
import { useQuestionBankOptions } from '@/lib/hooks/useQuestionBankOptions';
import { QUESTION_PAPER_STATUSES } from '@/lib/validations/question-paper';

interface PaperRow {
  id: string;
  title: string;
  banglaTitle: string | null;
  examType: string | null;
  status: string;
  totalMarks: number;
  durationMinutes: number;
  updatedAt: string;
  subject: { name: string; banglaName: string | null; code: string };
  subjectPaper: { name: string; banglaName: string | null } | null;
  academicClass: { name: string; banglaName: string | null } | null;
  createdBy: { name: string } | null;
  _count: { items: number };
}

export default function QuestionPapersPage() {
  const { lang } = useApp();
  const t = DICTIONARY[lang];
  const qp = t.questionPapers;
  const c = t.common;
  const num = (n: number) => localizeNumber(lang, n);
  const { options, allClasses } = useQuestionBankOptions();

  const [rows, setRows] = useState<PaperRow[]>([]);
  const [stats, setStats] = useState<{ total: number; draft: number; finalized: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [subject, setSubject] = useState('');
  const [cls, setCls] = useState('');

  useEffect(() => {
    const h = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(h);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const sp = new URLSearchParams({ page: String(page), stats: '1' });
      if (search) sp.set('search', search);
      if (status) sp.set('status', status);
      if (subject) sp.set('subject', subject);
      if (cls) sp.set('class', cls);
      const res = await fetch(`/api/question-papers?${sp}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error();
      setRows(data.papers);
      setStats(data.stats);
      setPagination({ total: data.pagination.total, totalPages: data.pagination.totalPages });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [page, search, status, subject, cls]);

  useEffect(() => {
    load();
  }, [load]);

  const hasFilters = !!(search || status || subject || cls);

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
      <PageHeader eyebrow={t.nav.questionPapers} title={qp.title} subtitle={qp.subtitle}>
        <Link href="/questions" className="tb">
          <Icon name="target" size={16} />
          {t.nav.questions}
        </Link>
        <Link href="/question-papers/new" className="primary">
          <Icon name="plus" size={16} />
          {qp.newPaper}
        </Link>
      </PageHeader>

      {stats && stats.total > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <StatTile label={qp.total} value={num(stats.total)} />
          <StatTile label={qp.draft} value={num(stats.draft)} tone="slate" />
          <StatTile label={qp.finalized} value={num(stats.finalized)} tone="blue" />
        </div>
      )}

      <div className="card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr] gap-3 items-end">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={qp.searchPlaceholder}
          aria-label={c.search}
          className="h-10 rounded-xl border border-[#dce5f0] px-3 text-[13.5px]"
        />
        <FilterSelect label={c.status} value={status} anyLabel={c.all} onChange={(v) => { setStatus(v); setPage(1); }}
          items={QUESTION_PAPER_STATUSES.map((v) => ({ value: v, label: (t.paperStatus as Record<string, string>)[v] }))} />
        <FilterSelect label={c.class} value={cls} anyLabel={c.all} onChange={(v) => { setCls(v); setSubject(''); setPage(1); }}
          items={allClasses.map((x) => ({ value: x.id, label: pickLocalized(lang, x.name, x.banglaName) }))} />
        <FilterSelect label={c.subject} value={subject} anyLabel={c.all} onChange={(v) => { setSubject(v); setPage(1); }}
          items={options.subjects.filter((s) => !cls || s.academicClassId === cls).map((s) => ({ value: s.id, label: `${pickLocalized(lang, s.name, s.banglaName)} (${s.code})` }))} />
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-[13px] text-[#64748b]">{c.loading}</div>
        ) : error ? (
          <div className="py-16 text-center text-[13px] text-rose-600">{c.loadFailed}</div>
        ) : rows.length === 0 ? (
          hasFilters ? (
            <EmptyState message={qp.noMatch} icon="search" />
          ) : (
            <EmptyState message={qp.empty} actionHref="/question-papers/new" actionLabel={qp.newPaper} icon="file" />
          )
        ) : (
          <>
            <div className="overflow-x-auto scroll">
              <table className="tbl min-w-[860px]">
                <thead>
                  <tr>
                    <th>{qp.paperTitle}</th>
                    <th style={{ textAlign: 'left' }}>{c.subject}</th>
                    <th>{qp.questions}</th>
                    <th>{qp.totalMarks}</th>
                    <th>{qp.durationShort}</th>
                    <th style={{ textAlign: 'left' }}>{c.status}</th>
                    <th style={{ textAlign: 'left' }}>{c.createdBy}</th>
                    <th>{c.updatedAt}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} className="trow">
                      <td>
                        <Link href={`/question-papers/${p.id}`} className="font-semibold text-[#092f63] hover:underline">
                          {pickLocalized(lang, p.title, p.banglaTitle)}
                        </Link>
                        {p.examType && (
                          <div className="text-[11.5px] text-[#64748b]">{(t.examType as Record<string, string>)[p.examType] || p.examType}</div>
                        )}
                      </td>
                      <td style={{ textAlign: 'left' }}>
                        <div className="font-semibold text-[#092f63]">{pickLocalized(lang, p.subject.name, p.subject.banglaName)}</div>
                        <div className="text-[11.5px] text-[#64748b]">
                          {[p.subjectPaper && pickLocalized(lang, p.subjectPaper.name, p.subjectPaper.banglaName), p.academicClass && pickLocalized(lang, p.academicClass.name, p.academicClass.banglaName)]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </td>
                      <td className="num">{num(p._count.items)}</td>
                      <td className="num font-bold">{num(p.totalMarks)}</td>
                      <td className="num whitespace-nowrap">{num(p.durationMinutes)} {qp.minutes}</td>
                      <td style={{ textAlign: 'left' }}><StatusBadge status={p.status} size="sm" dictKey="paperStatus" /></td>
                      <td style={{ textAlign: 'left' }} className="text-[#64748b]">{p.createdBy?.name || c.none}</td>
                      <td className="num text-[#64748b]">{localizeNumber(lang, formatDhakaDate(p.updatedAt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} totalPages={pagination.totalPages} total={pagination.total} onPage={setPage} labels={c} formatNumber={num} />
          </>
        )}
      </div>
    </div>
  );
}
