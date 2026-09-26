'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import { Pager } from '@/components/PageHeader';
import { usePortal } from '@/components/portal/PortalProvider';
import { DICTIONARY, formatDhakaDate, localizeNumber } from '@/lib/i18n';

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type: string;
  actionUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

export default function StudentPortalNotificationsPage() {
  const { lang } = usePortal();
  const t = DICTIONARY[lang];
  const n = t.portalNotifications;
  const c = t.common;
  const num = (v: number) => localizeNumber(lang, v);

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });

  const load = () => {
    setLoading(true);
    fetch(`/api/portal/notifications?page=${page}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setItems(res.notifications);
          setPagination({ total: res.pagination.total, totalPages: res.pagination.totalPages });
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [page]);

  const markRead = async (id: string) => {
    await fetch(`/api/portal/notifications/${id}/read`, { method: 'POST' });
    load();
  };

  const markAllRead = async () => {
    await fetch('/api/portal/notifications/read-all', { method: 'POST' });
    load();
  };

  return (
    <div className="max-w-[800px] mx-auto flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-[#092f63]">{n.title}</h1>
        <button type="button" onClick={markAllRead} className="tb text-[12px]">{n.markAllRead}</button>
      </div>

      <div className="card rounded-2xl bg-white border border-[#dce5f0] overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-[13px] text-[#64748b]">{c.loading}</div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-[#64748b]">{n.empty}</div>
        ) : (
          <>
            <ul className="divide-y divide-[#edf1f7]">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={`flex items-start gap-3 p-4 cursor-pointer ${!item.isRead ? 'bg-[#f0f5fc]' : ''}`}
                  onClick={() => {
                    if (!item.isRead) markRead(item.id);
                    if (item.actionUrl) window.location.href = item.actionUrl;
                  }}
                >
                  <Icon name="bell" size={16} className={`shrink-0 mt-0.5 ${!item.isRead ? 'text-[#063b78]' : 'text-[#94a3b8]'}`} />
                  <div className="min-w-0 grow">
                    <div className={`text-[13.5px] ${!item.isRead ? 'font-bold text-[#092f63]' : 'font-semibold text-[#475569]'}`}>{item.title}</div>
                    <div className="text-[12.5px] text-[#64748b] mt-0.5">{item.body}</div>
                    <div className="text-[11px] text-[#94a3b8] mt-1">{formatDhakaDate(item.createdAt)}</div>
                  </div>
                  {!item.isRead && <span className="w-2 h-2 rounded-full bg-[#063b78] shrink-0 mt-1.5" />}
                </li>
              ))}
            </ul>
            <Pager page={page} totalPages={pagination.totalPages} total={pagination.total} onPage={setPage} labels={c} formatNumber={num} />
          </>
        )}
      </div>
    </div>
  );
}
