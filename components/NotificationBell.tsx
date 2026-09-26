'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type: string;
  actionUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

export default function NotificationBell() {
  const router = useRouter();
  const { lang } = useApp();
  const dict = DICTIONARY[lang].notifications;
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/unread-count');
      const data = await res.json();
      if (data.success) setUnreadCount(data.count);
    } catch {
      // silent — the bell just shows no badge if this fails
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  const fetchRecent = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/notifications?pageSize=8');
      const data = await res.json();
      if (data.success) setItems(data.notifications);
    } catch {
      // keep whatever was shown before
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) fetchRecent();
  };

  const handleItemClick = async (item: NotificationItem) => {
    if (!item.isRead) {
      try {
        await fetch(`/api/notifications/${item.id}/read`, { method: 'POST' });
        setUnreadCount((c) => Math.max(0, c - 1));
        setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
      } catch {
        // navigation still proceeds even if marking-read failed
      }
    }
    setOpen(false);
    if (item.actionUrl) router.push(item.actionUrl);
  };

  return (
    <div className="relative">
      <button
        type="button"
        className="relative ibtn"
        aria-label={dict.title}
        onClick={toggleOpen}
      >
        <Icon name="bell" size={19} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <button className="fixed inset-0 z-40" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white border border-[#dce5f0] rounded-2xl shadow-xl z-50 fade-in overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#edf1f7]">
              <span className="text-[13px] font-bold text-[#063b78]">{dict.title}</span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="text-[11px] font-bold text-[#063b78] hover:underline"
                  onClick={async () => {
                    await fetch('/api/notifications/read-all', { method: 'POST' });
                    setUnreadCount(0);
                    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
                  }}
                >
                  {dict.markAllRead}
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto scroll">
              {loading && <div className="px-3 py-6 text-center text-[12px] text-[#64748b]">…</div>}
              {!loading && items.length === 0 && (
                <div className="px-3 py-6 text-center text-[12px] text-[#64748b]">{dict.empty}</div>
              )}
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleItemClick(item)}
                  className={`w-full text-left px-3 py-2.5 border-b border-[#f4f7fb] hover:bg-[#f0f5fc] transition-colors ${
                    !item.isRead ? 'bg-[#f7faff]' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!item.isRead && <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#063b78] shrink-0" />}
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-bold text-[#092f63] truncate">{item.title}</div>
                      <div className="text-[11.5px] text-[#55637a] line-clamp-2">{item.body}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <a
              href="/notifications"
              className="block px-3 py-2.5 text-center text-[12px] font-bold text-[#063b78] hover:bg-[#f0f5fc] border-t border-[#edf1f7]"
              onClick={() => setOpen(false)}
            >
              {dict.viewAll}
            </a>
          </div>
        </>
      )}
    </div>
  );
}
