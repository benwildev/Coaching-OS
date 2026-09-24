'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import FilterSelect from '@/components/FilterSelect';
import PageHeader, { EmptyState, Pager, StatTile } from '@/components/PageHeader';
import { MATERIAL_TYPE_ICON } from '@/components/QuestionBadges';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate, localizeNumber, pickLocalized } from '@/lib/i18n';
import { useQuestionBankOptions } from '@/lib/hooks/useQuestionBankOptions';
import { MATERIAL_STATUSES, MATERIAL_TYPES } from '@/lib/validations/study-material';

interface MaterialRow {
  id: string;
  title: string;
  banglaTitle: string | null;
  type: string;
  status: string;
  fileUrl: string | null;
  createdAt: string;
  updatedAt: string;
  subject: { name: string; banglaName: string | null; code: string };
  academicClass: { name: string; banglaName: string | null };
  batch: { name: string; code: string } | null;
  createdBy: { name: string } | null;
}

export default function MaterialsPage() {
  const { lang } = useApp();
  const t = DICTIONARY[lang];
  const m = t.materials;
  const c = t.common;
  const num = (n: number) => localizeNumber(lang, n);
  const { options, allClasses } = useQuestionBankOptions();

  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [stats, setStats] = useState<{ total: number; published: number; draft: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [f, setF] = useState({ type: '', status: '', class: '', subject: '', batch: '' });

  useEffect(() => {
    const h = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(h);
  }, [searchInput]);

  const setFilter = (k: keyof typeof f, v: string) => {
    setF((prev) => ({ ...prev, [k]: v, ...(k === 'class' ? { subject: '', batch: '' } : {}) }));
    setPage(1);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const sp = new URLSearchParams({ page: String(page), stats: '1' });
      if (search) sp.set('search', search);
      Object.entries(f).forEach(([k, v]) => v && sp.set(k, v));
      const res = await fetch(`/api/materials?${sp}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error();
      setRows(data.materials);
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

  const hasFilters = !!search || Object.values(f).some(Boolean);

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
      <PageHeader eyebrow={t.nav.materials} title={m.title} subtitle={m.subtitle}>
        <Link href="/materials/new" className="primary">
          <Icon name="plus" size={16} />
          {m.newMaterial}
        </Link>
      </PageHeader>

      {stats && stats.total > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <StatTile label={m.total} value={num(stats.total)} />
          <StatTile label={m.published} value={num(stats.published)} tone="green" />
          <StatTile label={m.draft} value={num(stats.draft)} tone="slate" />
        </div>
      )}

      <div className="card p-4 grid grid-cols-2 lg:grid-cols-[2fr_repeat(5,1fr)] gap-3 items-end">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={m.searchPlaceholder}
          aria-label={c.search}
          className="col-span-2 lg:col-span-1 h-10 rounded-xl border border-[#dce5f0] px-3 text-[13.5px]"
        />
        <FilterSelect label={m.type} value={f.type} anyLabel={c.all} onChange={(v) => setFilter('type', v)}
          items={MATERIAL_TYPES.map((v) => ({ value: v, label: (t.materialType as Record<string, string>)[v] }))} />
        <FilterSelect label={c.status} value={f.status} anyLabel={c.all} onChange={(v) => setFilter('status', v)}
          items={MATERIAL_STATUSES.map((v) => ({ value: v, label: (t.materialStatus as Record<string, string>)[v] }))} />
        <FilterSelect label={c.class} value={f.class} anyLabel={c.all} onChange={(v) => setFilter('class', v)}
          items={allClasses.map((x) => ({ value: x.id, label: pickLocalized(lang, x.name, x.banglaName) }))} />
        <FilterSelect label={c.subject} value={f.subject} anyLabel={c.all} onChange={(v) => setFilter('subject', v)}
          items={options.subjects.filter((s) => !f.class || s.academicClassId === f.class).map((s) => ({ value: s.id, label: `${pickLocalized(lang, s.name, s.banglaName)} (${s.code})` }))} />
        <FilterSelect label={c.batch} value={f.batch} anyLabel={c.all} onChange={(v) => setFilter('batch', v)}
          items={options.batches.filter((b) => !f.class || b.academicClassId === f.class).map((b) => ({ value: b.id, label: `${pickLocalized(lang, b.name, b.banglaName)} (${b.code})` }))} />
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-[13px] text-[#64748b]">{c.loading}</div>
        ) : error ? (
          <div className="py-16 text-center text-[13px] text-rose-600">{c.loadFailed}</div>
        ) : rows.length === 0 ? (
          hasFilters ? (
            <EmptyState message={m.noMatch} icon="search" />
          ) : (
            <EmptyState message={m.empty} actionHref="/materials/new" actionLabel={m.newMaterial} icon="book" />
          )
        ) : (
          <>
            <div className="overflow-x-auto scroll">
              <table className="tbl min-w-[820px]">
                <thead>
                  <tr>
                    <th>{m.materialTitle}</th>
                    <th style={{ textAlign: 'left' }}>{m.type}</th>
                    <th style={{ textAlign: 'left' }}>{c.subject}</th>
                    <th style={{ textAlign: 'left' }}>{c.class}</th>
                    <th style={{ textAlign: 'left' }}>{m.visibility}</th>
                    <th style={{ textAlign: 'left' }}>{c.createdBy}</th>
                    <th>{c.updatedAt}</th>
                    <th>{c.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="trow">
                      <td>
                        <Link href={`/materials/${r.id}`} className="flex items-center gap-2.5 font-semibold text-[#092f63] hover:underline">
                          <span className="w-8 h-8 shrink-0 rounded-lg bg-[#eef4fb] text-[#063b78] flex items-center justify-center">
                            <Icon name={MATERIAL_TYPE_ICON[r.type] || 'file'} size={16} />
                          </span>
                          <span className="line-clamp-2">{pickLocalized(lang, r.title, r.banglaTitle)}</span>
                        </Link>
                      </td>
                      <td style={{ textAlign: 'left' }} className="whitespace-nowrap">{(t.materialType as Record<string, string>)[r.type] || r.type}</td>
                      <td style={{ textAlign: 'left' }}>{pickLocalized(lang, r.subject.name, r.subject.banglaName)}</td>
                      <td style={{ textAlign: 'left' }}>
                        {pickLocalized(lang, r.academicClass.name, r.academicClass.banglaName)}
                        {r.batch && <div className="text-[11.5px] text-[#64748b]">{r.batch.code}</div>}
                      </td>
                      <td style={{ textAlign: 'left' }}><StatusBadge status={r.status} size="sm" dictKey="materialStatus" /></td>
                      <td style={{ textAlign: 'left' }} className="text-[#64748b]">{r.createdBy?.name || c.none}</td>
                      <td className="num text-[#64748b] whitespace-nowrap">{localizeNumber(lang, formatDhakaDate(r.updatedAt))}</td>
                      <td>
                        <div className="flex justify-end gap-1">
                          {r.fileUrl && (
                            <a href={r.fileUrl} target="_blank" rel="noopener noreferrer" className="ibtn" title={m.open} aria-label={m.open}>
                              <Icon name="globe" size={16} />
                            </a>
                          )}
                          <Link href={`/materials/${r.id}`} className="ibtn" title={c.view} aria-label={c.view}>
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
