'use client';

import Link from 'next/link';
import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import { CATEGORY_META, Loading, ReportError } from '@/components/reports/ReportShell';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';
import { useReportOptions } from '@/lib/reports/client';

/** Reports hub — navigation only. No numbers are shown here, so nothing can be stale or invented. */
export default function ReportsHubPage() {
  const { lang } = useApp();
  const R = DICTIONARY[lang].reports;
  const { options, failed } = useReportOptions();
  const allowed = (options?.permissions.categories ?? []) as string[];

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-4">
      <PageHeader title={R.title} subtitle={R.subtitle} />
      <p className="text-[12.5px] text-[#64748b] flex gap-1.5 px-1">
        <Icon name="info" size={14} className="shrink-0 mt-[2px]" />
        {R.hubNote}
      </p>
      {failed ? (
        <ReportError code="LOAD_FAILED" />
      ) : !options ? (
        <Loading />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {CATEGORY_META.filter((c) => allowed.includes(c.id)).map((c) => (
            <Link
              key={c.id}
              href={c.href}
              className="group bg-white p-5 rounded-2xl border border-[#dce5f0] shadow-xs hover:border-[#063b78] transition-colors flex gap-4 items-start min-w-0"
            >
              <span className="w-11 h-11 rounded-xl bg-[#eef3fa] text-[#063b78] flex items-center justify-center shrink-0">
                <Icon name={c.icon} size={21} />
              </span>
              <span className="min-w-0">
                <span className="block font-bold text-[15px] text-[#092f63]">{(R.categories as Record<string, string>)[c.id]}</span>
                <span className="block text-[12.5px] text-[#64748b] mt-0.5">{(R.categoryDesc as Record<string, string>)[c.id]}</span>
                <span className="inline-flex items-center gap-1 text-[12.5px] font-bold text-[#063b78] mt-2 group-hover:underline">
                  {R.open}
                  <Icon name="chevright" size={13} />
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
