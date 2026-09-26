'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import { Pager } from '@/components/PageHeader';
import { usePortal } from '@/components/portal/PortalProvider';
import { DICTIONARY, formatDhakaDate, pickLocalized, localizeNumber } from '@/lib/i18n';

interface NoticeItem {
  id: string;
  title: string;
  banglaTitle: string | null;
  content: string;
  banglaContent: string | null;
  publishedAt: string | null;
}

export default function StudentPortalNoticesPage() {
  const { lang } = usePortal();
  const t = DICTIONARY[lang];
  const n = t.portalNotices;
  const c = t.common;
  const num = (v: number) => localizeNumber(lang, v);

  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/portal/student/notices?page=${page}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setNotices(res.notices);
          setPagination({ total: res.pagination.total, totalPages: res.pagination.totalPages });
        }
      })
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="max-w-[800px] mx-auto flex flex-col gap-5">
      <h1 className="text-lg font-bold text-[#092f63]">{n.title}</h1>

      <div className="card rounded-2xl bg-white border border-[#dce5f0] overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-[13px] text-[#64748b]">{c.loading}</div>
        ) : notices.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-[#64748b]">{n.empty}</div>
        ) : (
          <>
            <ul className="divide-y divide-[#edf1f7]">
              {notices.map((item) => {
                const isOpen = expanded === item.id;
                return (
                  <li key={item.id} className="p-4">
                    <button type="button" onClick={() => setExpanded(isOpen ? null : item.id)} className="w-full flex items-start gap-3 text-left">
                      <Icon name="pin" size={16} className="text-[#063b78] shrink-0 mt-0.5" />
                      <div className="min-w-0 grow">
                        <div className="font-bold text-[#092f63] text-[13.5px]">{pickLocalized(lang, item.title, item.banglaTitle)}</div>
                        {item.publishedAt && <div className="text-[11px] text-[#64748b] mt-0.5">{n.publishedOn}: {formatDhakaDate(item.publishedAt)}</div>}
                      </div>
                    </button>
                    {isOpen && (
                      <p className="mt-2.5 text-[13px] text-[#092f63] whitespace-pre-wrap pl-7">
                        {pickLocalized(lang, item.content, item.banglaContent)}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            <Pager page={page} totalPages={pagination.totalPages} total={pagination.total} onPage={setPage} labels={c} formatNumber={num} />
          </>
        )}
      </div>
    </div>
  );
}
