'use client';

import { useCallback, useEffect, useState } from 'react';
import StatusBadge from '@/components/StatusBadge';
import FilterSelect from '@/components/FilterSelect';
import PageHeader, { EmptyState, Pager } from '@/components/PageHeader';
import CommunicationSubNav from '@/components/CommunicationSubNav';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate, localizeNumber } from '@/lib/i18n';
import { COMMUNICATION_CHANNELS } from '@/lib/validations/communication-template';

interface LogRow {
  id: string;
  channel: string;
  event: string | null;
  status: string;
  provider: string | null;
  recipientPhone: string | null;
  recipientEmail: string | null;
  errorMessage: string | null;
  createdAt: string;
  sentAt: string | null;
  guardian: { id: string; name: string; phone: string } | null;
  student: { id: string; name: string; studentIdCode: string } | null;
}

const LOG_STATUSES = ['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED'] as const;

export default function CommunicationLogsPage() {
  const { lang } = useApp();
  const t = DICTIONARY[lang];
  const comm = t.communication;
  const c = t.common;
  const num = (x: number) => localizeNumber(lang, x);

  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [f, setF] = useState({ channel: '', status: '' });

  useEffect(() => {
    const h = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(h);
  }, [searchInput]);

  const setFilter = (k: keyof typeof f, v: string) => {
    setF((prev) => ({ ...prev, [k]: v }));
    setPage(1);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const sp = new URLSearchParams({ page: String(page) });
      if (search) sp.set('search', search);
      Object.entries(f).forEach(([k, v]) => v && sp.set(k, v));
      const res = await fetch(`/api/communication/logs?${sp}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error();
      setRows(data.logs);
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
    <div className="max-w-[1300px] mx-auto flex flex-col gap-4">
      <PageHeader eyebrow={t.nav.communication} title={comm.logs} subtitle={comm.subtitle} />

      <CommunicationSubNav />

      <div className="card p-4 grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr] gap-3 items-end">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={c.search}
          aria-label={c.search}
          className="h-10 rounded-xl border border-[#dce5f0] px-3 text-[13.5px]"
        />
        <FilterSelect label={comm.channel} value={f.channel} anyLabel={c.all} onChange={(v) => setFilter('channel', v)}
          items={COMMUNICATION_CHANNELS.map((v) => ({ value: v, label: v }))} />
        <FilterSelect label={c.status} value={f.status} anyLabel={c.all} onChange={(v) => setFilter('status', v)}
          items={LOG_STATUSES.map((v) => ({ value: v, label: (t.communicationLogStatus as Record<string, string>)[v] }))} />
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-[13px] text-[#64748b]">{c.loading}</div>
        ) : error ? (
          <div className="py-16 text-center text-[13px] text-rose-600">{c.loadFailed}</div>
        ) : rows.length === 0 ? (
          hasFilters ? <EmptyState message={comm.logsEmpty} icon="search" /> : <EmptyState message={comm.logsEmpty} icon="message" />
        ) : (
          <>
            <div className="overflow-x-auto scroll">
              <table className="tbl min-w-[900px]">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>{comm.recipient}</th>
                    <th style={{ textAlign: 'left' }}>{comm.channel}</th>
                    <th style={{ textAlign: 'left' }}>{comm.event}</th>
                    <th>{c.status}</th>
                    <th style={{ textAlign: 'left' }}>{comm.provider}</th>
                    <th>{comm.createdAt}</th>
                    <th>{comm.sentAt}</th>
                    <th style={{ textAlign: 'left' }}>{comm.failureReason}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="trow">
                      <td style={{ textAlign: 'left' }}>
                        {r.guardian?.name || r.student?.name || r.recipientPhone || r.recipientEmail || c.none}
                      </td>
                      <td style={{ textAlign: 'left' }}>{r.channel}</td>
                      <td style={{ textAlign: 'left' }}>{r.event ? (t.notificationEvent as Record<string, string>)[r.event] || r.event : c.none}</td>
                      <td><StatusBadge status={r.status} size="sm" dictKey="communicationLogStatus" /></td>
                      <td style={{ textAlign: 'left' }} className="text-[#64748b]">{r.provider || c.none}</td>
                      <td className="num text-[#64748b] whitespace-nowrap">{localizeNumber(lang, formatDhakaDate(r.createdAt))}</td>
                      <td className="num text-[#64748b] whitespace-nowrap">{r.sentAt ? localizeNumber(lang, formatDhakaDate(r.sentAt)) : c.none}</td>
                      <td style={{ textAlign: 'left' }} className="text-[#94a3b8] text-[12px]">{r.errorMessage || c.none}</td>
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
