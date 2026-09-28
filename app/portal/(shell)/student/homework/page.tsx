'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import { EmptyState, Pager } from '@/components/PageHeader';
import { usePortal } from '@/components/portal/PortalProvider';
import { DICTIONARY, formatDhakaDate, localizeNumber, pickLocalized } from '@/lib/i18n';

interface PortalHomework {
  id: string;
  title: string;
  banglaTitle: string | null;
  dueAt: string;
  status: string;
  computedStatus: string;
  subject: { id: string; name: string; banglaName: string | null; code: string };
  batch: { id: string; name: string; banglaName: string | null; code: string };
  submission: { status: string; isLate: boolean } | null;
}

const TABS = ['UPCOMING', 'DUE_SOON', 'SUBMITTED', 'REVIEWED'] as const;

export default function StudentPortalHomeworkPage() {
  const { lang } = usePortal();
  const t = DICTIONARY[lang];
  const ph = t.portalHomework;
  const c = t.common;
  const num = (n: number) => localizeNumber(lang, n);

  const [tab, setTab] = useState<(typeof TABS)[number]>('UPCOMING');
  const [items, setItems] = useState<PortalHomework[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // "Submitted" bundles LATE/RETURNED alongside SUBMITTED — all mean the
    // student has already put something in; "Reviewed" is its own bucket.
    const statusParam = tab === 'SUBMITTED' ? 'SUBMITTED' : tab;
    const sp = new URLSearchParams({ page: String(page), status: statusParam });
    fetch(`/api/portal/student/homework?${sp}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d.success) return setError(d.message || c.loadFailed);
        let rows: PortalHomework[] = d.homeworks;
        if (tab === 'SUBMITTED') rows = rows.filter((r) => ['SUBMITTED', 'LATE', 'RETURNED'].includes(r.computedStatus));
        setItems(rows);
        setPagination({ total: d.pagination.total, totalPages: d.pagination.totalPages });
      })
      .catch(() => !cancelled && setError(c.loadFailed))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tab, page, c.loadFailed]);

  const tabLabel: Record<(typeof TABS)[number], string> = {
    UPCOMING: ph.tabUpcoming,
    DUE_SOON: ph.tabDueSoon,
    SUBMITTED: ph.tabSubmitted,
    REVIEWED: ph.tabReviewed,
  };

  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-5">
      <h1 className="text-lg font-bold text-[#092f63]">{ph.title}</h1>

      <div className="flex gap-2 overflow-x-auto scroll">
        {TABS.map((tb) => (
          <button
            key={tb}
            type="button"
            onClick={() => {
              setTab(tb);
              setPage(1);
            }}
            className={`px-3.5 py-2 rounded-xl text-[13px] font-bold whitespace-nowrap transition-colors ${
              tab === tb ? 'bg-[#063b78] text-white' : 'bg-white border border-[#dce5f0] text-[#64748b]'
            }`}
          >
            {tabLabel[tb]}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-[13px] text-[#64748b]">{c.loading}</div>
        ) : error ? (
          <div className="py-16 text-center text-[13px] text-rose-600">{error}</div>
        ) : items.length === 0 ? (
          <EmptyState message={ph.empty} icon="calcheck" />
        ) : (
          <>
            <ul className="divide-y divide-[#edf1f7]">
              {items.map((hw) => (
                <li key={hw.id}>
                  <Link href={`/portal/student/homework/${hw.id}`} className="flex items-start gap-3 p-4 hover:bg-[#f8fafc]">
                    <span className="w-10 h-10 shrink-0 rounded-xl bg-[#eef4fb] text-[#063b78] flex items-center justify-center">
                      <Icon name="calcheck" size={18} />
                    </span>
                    <div className="min-w-0 grow">
                      <div className="font-bold text-[#092f63]">{pickLocalized(lang, hw.title, hw.banglaTitle)}</div>
                      <div className="text-[12px] text-[#64748b]">
                        {[
                          pickLocalized(lang, hw.subject.name, hw.subject.banglaName),
                          pickLocalized(lang, hw.batch.name, hw.batch.banglaName),
                          `${ph.deadline}: ${localizeNumber(lang, formatDhakaDate(hw.dueAt))}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                    <StatusBadge status={hw.submission?.status ?? hw.computedStatus} size="sm" dictKey="submissionStatus" />
                  </Link>
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
