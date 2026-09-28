'use client';

import { use, useEffect, useState } from 'react';
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
  computedStatus: string;
  subject: { name: string; banglaName: string | null; code: string };
  batch: { name: string; banglaName: string | null; code: string };
  submission: { status: string; isLate: boolean; feedback: string | null } | null;
}

export default function GuardianChildHomeworkPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = use(params);
  const { lang } = usePortal();
  const t = DICTIONARY[lang];
  const ph = t.portalHomework;
  const c = t.common;
  const num = (n: number) => localizeNumber(lang, n);

  const [items, setItems] = useState<PortalHomework[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const sp = new URLSearchParams({ page: String(page) });
    fetch(`/api/portal/guardian/children/${studentId}/homework?${sp}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d.success) return setError(d.error === 'STUDENT_NOT_LINKED' ? t.portalChildren.accessDenied : d.message || c.loadFailed);
        setItems(d.homeworks);
        setPagination({ total: d.pagination.total, totalPages: d.pagination.totalPages });
      })
      .catch(() => !cancelled && setError(c.loadFailed))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [studentId, page, c.loadFailed, t.portalChildren.accessDenied]);

  if (error) return <div className="py-16 text-center text-[13px] text-rose-600">{error}</div>;

  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-5">
      <h1 className="text-lg font-bold text-[#092f63]">{ph.title}</h1>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-[13px] text-[#64748b]">{c.loading}</div>
        ) : items.length === 0 ? (
          <EmptyState message={ph.empty} icon="calcheck" />
        ) : (
          <>
            <ul className="divide-y divide-[#edf1f7]">
              {items.map((hw) => (
                <li key={hw.id} className="flex items-start gap-3 p-4">
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
                      ].join(' · ')}
                    </div>
                    {hw.submission?.feedback && (
                      <p className="text-[13px] text-[#092f63] mt-1.5 whitespace-pre-wrap">
                        <span className="font-semibold">{ph.feedback}:</span> {hw.submission.feedback}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={hw.submission?.status ?? hw.computedStatus} size="sm" dictKey="submissionStatus" />
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
