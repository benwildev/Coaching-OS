'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { usePortal } from './PortalProvider';
import { DICTIONARY, formatDhakaDate } from '@/lib/i18n';

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  actionUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

export default function PortalNotificationBell() {
  const router = useRouter();
  const { lang, portalUser } = usePortal();
  const t = DICTIONARY[lang].portalNotifications;
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const loadCount = () => {
    fetch('/api/portal/notifications/unread-count')
      .then((r) => r.json())
      .then((res) => res.success && setCount(res.count))
      .catch(() => {});
  };

  useEffect(() => {
    if (!portalUser) return;
    loadCount();
    const id = setInterval(loadCount, 30000);
    return () => clearInterval(id);
  }, [portalUser]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      fetch('/api/portal/notifications?pageSize=8')
        .then((r) => r.json())
        .then((res) => res.success && setItems(res.notifications))
        .finally(() => setLoading(false));
    }
  };

  const handleClick = async (item: NotificationItem) => {
    if (!item.isRead) {
      await fetch(`/api/portal/notifications/${item.id}/read`, { method: 'POST' });
      loadCount();
    }
    setOpen(false);
    if (item.actionUrl) router.push(item.actionUrl);
  };

  if (!portalUser) return null;

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={toggleOpen} className="relative ibtn text-[#092f63] hover:bg-[#f0f5fc]" aria-label={t.title}>
        <Icon name="bell" size={19} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[9.5px] font-bold flex items-center justify-center">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white border border-[#dce5f0] rounded-2xl shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-[#edf1f7] font-bold text-[13px] text-[#092f63]">{t.title}</div>
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center text-[12.5px] text-[#64748b]">…</div>
            ) : items.length === 0 ? (
              <div className="py-8 text-center text-[12.5px] text-[#64748b]">{t.empty}</div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleClick(item)}
                  className={`w-full text-left px-4 py-2.5 border-b border-[#f3f6fa] last:border-0 hover:bg-[#f8fafc] ${!item.isRead ? 'bg-[#f0f5fc]' : ''}`}
                >
                  <div className={`text-[12.5px] ${!item.isRead ? 'font-bold text-[#092f63]' : 'font-semibold text-[#475569]'}`}>{item.title}</div>
                  <div className="text-[11.5px] text-[#64748b] mt-0.5 line-clamp-2">{item.body}</div>
                  <div className="text-[10.5px] text-[#94a3b8] mt-1">{formatDhakaDate(item.createdAt)}</div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
