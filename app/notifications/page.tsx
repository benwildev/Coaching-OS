'use client';

import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import PageHeader, { EmptyState, Pager } from '@/components/PageHeader';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate, localizeNumber } from '@/lib/i18n';

interface NotificationRow {
  id: string;
  title: string;
  body: string;
  type: string;
  actionUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

export default function NotificationsPage() {
  const { lang } = useApp();
  const t = DICTIONARY[lang];
  const n = t.notifications;
  const c = t.common;
  const num = (x: number) => localizeNumber(lang, x);

  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [unreadOnly, setUnreadOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const sp = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (unreadOnly) sp.set('unreadOnly', '1');
      const res = await fetch(`/api/notifications?${sp}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error();
      setRows(data.notifications);
      setPagination({ total: data.pagination.total, totalPages: data.pagination.totalPages });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [page, unreadOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (id: string) => {
    await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, isRead: true } : r)));
  };

  const markAllRead = async () => {
    await fetch('/api/notifications/read-all', { method: 'POST' });
    setRows((prev) => prev.map((r) => ({ ...r, isRead: true })));
  };

  return (
    <div className="max-w-[900px] mx-auto flex flex-col gap-5">
      <PageHeader eyebrow={t.nav.notifications} title={n.title} subtitle={n.subtitle}>
        <button type="button" className="chip" aria-pressed={unreadOnly} onClick={() => { setUnreadOnly((v) => !v); setPage(1); }}>
          {n.unread}
        </button>
        <button type="button" className="tb" onClick={markAllRead}>
          <Icon name="check2" size={14} />
          {n.markAllRead}
        </button>
      </PageHeader>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-[13px] text-[#64748b]">{c.loading}</div>
        ) : error ? (
          <div className="py-16 text-center text-[13px] text-rose-600">{c.loadFailed}</div>
        ) : rows.length === 0 ? (
          <EmptyState message={n.empty} icon="bell" />
        ) : (
          <>
            <div className="flex flex-col divide-y divide-[#edf1f7]">
              {rows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    if (!r.isRead) markRead(r.id);
                    if (r.actionUrl) window.location.href = r.actionUrl;
                  }}
                  className={`text-left px-5 py-3.5 flex items-start gap-3 hover:bg-[#f7faff] transition-colors ${!r.isRead ? 'bg-[#f7faff]' : ''}`}
                >
                  {!r.isRead && <span className="mt-1.5 h-2 w-2 rounded-full bg-[#063b78] shrink-0" />}
                  <div className={`min-w-0 flex-1 ${r.isRead ? 'ml-5' : ''}`}>
                    <div className="text-[13.5px] font-bold text-[#092f63]">{r.title}</div>
                    <div className="text-[12.5px] text-[#55637a] mt-0.5">{r.body}</div>
                    <div className="text-[11px] text-[#94a3b8] mt-1 num">{localizeNumber(lang, formatDhakaDate(r.createdAt))}</div>
                  </div>
                </button>
              ))}
            </div>
            <Pager page={page} totalPages={pagination.totalPages} total={pagination.total} onPage={setPage} labels={c} formatNumber={num} />
          </>
        )}
      </div>
    </div>
  );
}
