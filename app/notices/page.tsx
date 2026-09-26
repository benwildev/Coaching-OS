'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import FilterSelect from '@/components/FilterSelect';
import PageHeader, { EmptyState, Pager } from '@/components/PageHeader';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate, localizeNumber, pickLocalized } from '@/lib/i18n';
import { NOTICE_STATUSES } from '@/lib/validations/notice';

interface NoticeRow {
  id: string;
  title: string;
  banglaTitle: string | null;
  targetAudience: string;
  status: string;
  createdAt: string;
  branch: { id: string; name: string } | null;
  createdBy: { name: string } | null;
}

export default function NoticesPage() {
  const { lang } = useApp();
  const t = DICTIONARY[lang];
  const n = t.notices;
  const c = t.common;
  const num = (x: number) => localizeNumber(lang, x);

  const [rows, setRows] = useState<NoticeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

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
      const sp = new URLSearchParams({ page: String(page) });
      if (search) sp.set('search', search);
      if (status) sp.set('status', status);
      const res = await fetch(`/api/notices?${sp}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error();
      setRows(data.notices);
      setPagination({ total: data.pagination.total, totalPages: data.pagination.totalPages });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    load();
  }, [load]);

  const hasFilters = !!search || !!status;

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-5">
      <PageHeader eyebrow={t.nav.notices} title={n.title} subtitle={n.subtitle}>
        <Link href="/notices/new" className="primary">
          <Icon name="plus" size={16} />
          {n.newNotice}
        </Link>
      </PageHeader>

      <div className="card p-4 grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3 items-end">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={n.searchPlaceholder}
          aria-label={c.search}
          className="h-10 rounded-xl border border-[#dce5f0] px-3 text-[13.5px]"
        />
        <FilterSelect
          label={c.status}
          value={status}
          anyLabel={c.all}
          onChange={(v) => { setStatus(v); setPage(1); }}
          items={NOTICE_STATUSES.map((v) => ({ value: v, label: (t.noticeStatus as Record<string, string>)[v] }))}
        />
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-[13px] text-[#64748b]">{c.loading}</div>
        ) : error ? (
          <div className="py-16 text-center text-[13px] text-rose-600">{c.loadFailed}</div>
        ) : rows.length === 0 ? (
          hasFilters ? (
            <EmptyState message={n.noMatch} icon="search" />
          ) : (
            <EmptyState message={n.empty} actionHref="/notices/new" actionLabel={n.newNotice} icon="pin" />
          )
        ) : (
          <>
            <div className="overflow-x-auto scroll">
              <table className="tbl min-w-[720px]">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>{c.title}</th>
                    <th style={{ textAlign: 'left' }}>{n.audience}</th>
                    <th style={{ textAlign: 'left' }}>{c.status}</th>
                    <th style={{ textAlign: 'left' }}>{c.createdBy}</th>
                    <th>{c.createdAt}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="trow">
                      <td style={{ textAlign: 'left' }}>
                        <Link href={`/notices/${r.id}`} className="font-semibold text-[#092f63] hover:underline line-clamp-2">
                          {pickLocalized(lang, r.title, r.banglaTitle)}
                        </Link>
                      </td>
                      <td style={{ textAlign: 'left' }}>
                        {(t.noticeAudience as Record<string, string>)[r.targetAudience] || r.targetAudience}
                        {r.branch && <div className="text-[11.5px] text-[#64748b]">{r.branch.name}</div>}
                      </td>
                      <td style={{ textAlign: 'left' }}><StatusBadge status={r.status} size="sm" dictKey="noticeStatus" /></td>
                      <td style={{ textAlign: 'left' }} className="text-[#64748b]">{r.createdBy?.name || c.none}</td>
                      <td className="num text-[#64748b] whitespace-nowrap">{localizeNumber(lang, formatDhakaDate(r.createdAt))}</td>
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
