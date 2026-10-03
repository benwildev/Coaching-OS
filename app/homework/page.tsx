'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import FilterSelect from '@/components/FilterSelect';
import PageHeader, { EmptyState, Pager, StatTile } from '@/components/PageHeader';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate, localizeNumber, pickLocalized } from '@/lib/i18n';
import { HOMEWORK_STATUSES } from '@/lib/validations/homework';

interface HomeworkRow {
  id: string;
  title: string;
  banglaTitle: string | null;
  status: string;
  dueAt: string;
  updatedAt: string;
  totalStudents: number;
  submittedCount: number;
  subject: { name: string; banglaName: string | null; code: string };
  batch: { name: string; banglaName: string | null; code: string };
  teacher: { name: string } | null;
}

interface AssignmentOption {
  batch: { id: string; name: string; banglaName: string | null; code: string };
  subject: { id: string; name: string; banglaName: string | null; code: string };
}

export default function HomeworkPage() {
  const { lang, can } = useApp();
  const t = DICTIONARY[lang];
  const h = t.homework;
  const c = t.common;
  const num = (n: number) => localizeNumber(lang, n);

  const [assignments, setAssignments] = useState<AssignmentOption[]>([]);
  const [rows, setRows] = useState<HomeworkRow[]>([]);
  const [stats, setStats] = useState<{ total: number; published: number; draft: number; closed: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [f, setF] = useState({ status: '', batch: '', subject: '' });

  useEffect(() => {
    fetch('/api/homework/options')
      .then((r) => r.json())
      .then((d) => d.success && setAssignments(d.assignments))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const hnd = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(hnd);
  }, [searchInput]);

  const setFilter = (k: keyof typeof f, v: string) => {
    setF((prev) => ({ ...prev, [k]: v }));
    setPage(1);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const sp = new URLSearchParams({ page: String(page), stats: '1' });
      if (search) sp.set('search', search);
      if (f.status) sp.set('status', f.status);
      if (f.batch) sp.set('batch', f.batch);
      if (f.subject) sp.set('subject', f.subject);
      const res = await fetch(`/api/homework?${sp}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error();
      setRows(data.homeworks);
      setStats(data.stats);
      setPagination({ total: data.pagination.total, totalPages: data.pagination.totalPages });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [page, search, f]);

  useEffect(() => {
    load();
  }, [load]);

  const batchOptions = useMemo(() => {
    const seen = new Map<string, AssignmentOption['batch']>();
    assignments.forEach((a) => seen.set(a.batch.id, a.batch));
    return [...seen.values()];
  }, [assignments]);
  const subjectOptions = useMemo(() => {
    const seen = new Map<string, AssignmentOption['subject']>();
    assignments.filter((a) => !f.batch || a.batch.id === f.batch).forEach((a) => seen.set(a.subject.id, a.subject));
    return [...seen.values()];
  }, [assignments, f.batch]);

  const hasFilters = !!search || Object.values(f).some(Boolean);

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
      <PageHeader eyebrow={t.nav.homework} title={h.title} subtitle={h.subtitle}>
        {can('homework.create') && (
          <Link href="/homework/new" className="primary">
            <Icon name="plus" size={16} />
            {h.newHomework}
          </Link>
        )}
      </PageHeader>

      {stats && stats.total > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <StatTile label={h.total} value={num(stats.total)} />
          <StatTile label={h.published} value={num(stats.published)} tone="green" />
          <StatTile label={h.draft} value={num(stats.draft)} tone="slate" />
          <StatTile label={h.closed} value={num(stats.closed)} tone="slate" />
        </div>
      )}

      <div className="card p-4 grid grid-cols-2 lg:grid-cols-[2fr_repeat(3,1fr)] gap-3 items-end">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={h.searchPlaceholder}
          aria-label={c.search}
          className="col-span-2 lg:col-span-1 h-10 rounded-xl border border-[#dce5f0] px-3 text-[13.5px]"
        />
        <FilterSelect label={c.status} value={f.status} anyLabel={c.all} onChange={(v) => setFilter('status', v)}
          items={HOMEWORK_STATUSES.map((v) => ({ value: v, label: (t.homeworkStatus as Record<string, string>)[v] }))} />
        <FilterSelect label={c.batch} value={f.batch} anyLabel={c.all} onChange={(v) => setFilter('batch', v)}
          items={batchOptions.map((b) => ({ value: b.id, label: `${pickLocalized(lang, b.name, b.banglaName)} (${b.code})` }))} />
        <FilterSelect label={c.subject} value={f.subject} anyLabel={c.all} onChange={(v) => setFilter('subject', v)}
          items={subjectOptions.map((s) => ({ value: s.id, label: `${pickLocalized(lang, s.name, s.banglaName)} (${s.code})` }))} />
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-[13px] text-[#64748b]">{c.loading}</div>
        ) : error ? (
          <div className="py-16 text-center text-[13px] text-rose-600">{c.loadFailed}</div>
        ) : rows.length === 0 ? (
          hasFilters ? (
            <EmptyState message={h.noMatch} icon="search" />
          ) : (
            <EmptyState
              message={h.empty}
              actionHref={can('homework.create') ? '/homework/new' : undefined}
              actionLabel={h.newHomework}
              icon="calcheck"
            />
          )
        ) : (
          <>
            <div className="overflow-x-auto scroll">
              <table className="tbl min-w-[820px]">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>{h.homeworkTitle}</th>
                    <th style={{ textAlign: 'left' }}>{c.subject}</th>
                    <th style={{ textAlign: 'left' }}>{c.batch}</th>
                    <th style={{ textAlign: 'left' }}>{h.dueAt}</th>
                    <th style={{ textAlign: 'left' }}>{h.visibility}</th>
                    <th>{h.submissions}</th>
                    <th>{c.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="trow">
                      <td style={{ textAlign: 'left' }}>
                        <Link href={`/homework/${r.id}`} className="flex items-center gap-2.5 font-semibold text-[#092f63] hover:underline">
                          <span className="w-8 h-8 shrink-0 rounded-lg bg-[#eef4fb] text-[#063b78] flex items-center justify-center">
                            <Icon name="calcheck" size={16} />
                          </span>
                          <span className="line-clamp-2">{pickLocalized(lang, r.title, r.banglaTitle)}</span>
                        </Link>
                      </td>
                      <td style={{ textAlign: 'left' }}>{pickLocalized(lang, r.subject.name, r.subject.banglaName)}</td>
                      <td style={{ textAlign: 'left' }}>
                        {pickLocalized(lang, r.batch.name, r.batch.banglaName)}
                        <div className="text-[11.5px] text-[#64748b]">{r.batch.code}</div>
                      </td>
                      <td style={{ textAlign: 'left' }} className="whitespace-nowrap">{localizeNumber(lang, formatDhakaDate(r.dueAt))}</td>
                      <td style={{ textAlign: 'left' }}><StatusBadge status={r.status} size="sm" dictKey="homeworkStatus" /></td>
                      <td className="num text-[#64748b] whitespace-nowrap">{num(r.submittedCount)}/{num(r.totalStudents)}</td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <Link href={`/homework/${r.id}`} className="ibtn" title={c.view} aria-label={c.view}>
                            <Icon name="eye" size={16} />
                          </Link>
                        </div>
                      </td>
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
