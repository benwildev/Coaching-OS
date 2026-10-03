'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import { useApp } from '@/lib/store';
import { DICTIONARY, pickLocalized } from '@/lib/i18n';
import { downloadCsv, useReportOptions, type ReportParams } from '@/lib/reports/client';
import type { ReportOptions } from '@/lib/reports/options';

export const CATEGORY_META: Array<{ id: string; href: string; icon: string }> = [
  { id: 'students', href: '/reports/students', icon: 'users' },
  { id: 'attendance', href: '/reports/attendance', icon: 'calcheck' },
  { id: 'finance', href: '/reports/finance', icon: 'wallet' },
  { id: 'exams', href: '/reports/exams', icon: 'award' },
  { id: 'teachers', href: '/reports/teachers', icon: 'grad' },
  { id: 'batches', href: '/reports/batches', icon: 'layers' },
  { id: 'communications', href: '/reports/communications', icon: 'message' },
];

const FILTER_LABEL_KEYS: Record<string, string> = {
  academicSessionId: 'academicYear',
  branchId: 'branch',
  programId: 'program',
  classId: 'class',
  groupId: 'group',
  courseId: 'course',
  batchId: 'batch',
  subjectId: 'subject',
  teacherId: 'teacher',
  status: 'status',
  method: 'method',
  channel: 'channel',
  event: 'event',
  examType: 'examType',
  resultScope: 'resultScope',
  granularity: 'granularity',
  search: 'search',
  overdueOnly: 'overdueOnly',
  adjustmentType: 'adjustmentType',
};

/** Human-readable summary of the active filters, for the print header. */
export function describeFilters(params: ReportParams, options: ReportOptions | null, lang: 'en' | 'bn'): string[] {
  const R = DICTIONARY[lang].reports;
  const F = R.filter as Record<string, string>;
  const out: string[] = [];
  const lookup = (list: Array<{ id: string; name: string; banglaName?: string | null }> | undefined, id: string) => {
    const hit = list?.find((x) => x.id === id);
    return hit ? pickLocalized(lang, hit.name, hit.banglaName) : id;
  };
  if (params.dateFrom || params.dateTo) out.push(`${R.rangeLabel}: ${params.dateFrom || '…'} – ${params.dateTo || '…'}`);
  for (const [k, v] of Object.entries(params)) {
    const labelKey = FILTER_LABEL_KEYS[k];
    if (!labelKey || !v) continue;
    let value = v;
    if (k === 'academicSessionId') value = lookup(options?.sessions, v);
    else if (k === 'branchId') value = lookup(options?.branches, v);
    else if (k === 'programId') value = lookup(options?.programs, v);
    else if (k === 'classId') value = lookup(options?.classes, v);
    else if (k === 'groupId') value = lookup(options?.groups, v);
    else if (k === 'courseId') value = lookup(options?.courses, v);
    else if (k === 'batchId') value = lookup(options?.batches, v);
    else if (k === 'subjectId') value = lookup(options?.subjects, v);
    else if (k === 'teacherId') value = lookup(options?.teachers, v);
    else if (k === 'resultScope') value = v === 'internal' ? F.internal : F.published;
    else if (k === 'granularity') value = F[v] ?? v;
    else if (k === 'overdueOnly') value = v === 'true' ? '✓' : '—';
    out.push(`${F[labelKey]}: ${value}`);
  }
  return out;
}

export default function ReportShell({
  category,
  title,
  subtitle,
  backHref,
  params,
  exportView,
  exportDisabled,
  children,
}: {
  category?: string;
  title: string;
  subtitle?: string;
  backHref?: string;
  params: ReportParams;
  /** When set, shows Export CSV for this view. */
  exportView?: string;
  exportDisabled?: boolean;
  children: React.ReactNode;
}) {
  const { lang, showToast } = useApp();
  const R = DICTIONARY[lang].reports;
  const pathname = usePathname();
  const { options } = useReportOptions();
  const [exporting, setExporting] = useState(false);

  const allowed = options?.permissions.categories ?? [];
  const branchName = params.branchId
    ? pickLocalized(lang, options?.branches.find((b) => b.id === params.branchId)?.name, options?.branches.find((b) => b.id === params.branchId)?.banglaName)
    : options?.branchLocked
      ? pickLocalized(lang, options?.branches[0]?.name, options?.branches[0]?.banglaName)
      : R.print.branchAll;
  const filterLines = describeFilters(params, options, lang);
  const generated = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' }).format(new Date());

  const onExport = async () => {
    if (!category || !exportView) return;
    setExporting(true);
    const err = await downloadCsv(category, { ...params, view: exportView }, lang);
    setExporting(false);
    if (err) showToast(err === 'EXPORT_TOO_LARGE' ? R.errors.exportTooLarge : err.startsWith('FORBIDDEN') ? R.errors.forbidden : R.errors.load);
  };

  return (
    <div className="report-root max-w-[1400px] mx-auto flex flex-col gap-4 min-w-0">
      <div className="report-print-header">
        <div style={{ fontSize: '15pt', fontWeight: 800 }}>{pickLocalized(lang, options?.center?.name, options?.center?.banglaName)}</div>
        <div style={{ fontSize: '10pt' }}>{branchName}</div>
        <div style={{ fontSize: '13pt', fontWeight: 700, marginTop: 4 }}>{title}</div>
        <div style={{ fontSize: '9pt', marginTop: 2 }}>
          {R.print.filters}: {filterLines.length ? filterLines.join(' · ') : R.print.noFilters}
        </div>
        <div style={{ fontSize: '9pt' }}>
          {R.print.generatedAt}: {generated} (Asia/Dhaka)
        </div>
      </div>

      <PageHeader eyebrow={R.title} title={title} subtitle={subtitle} backHref={backHref} backLabel={R.actions.back}>
        {exportView && (
          <button type="button" className="tb" onClick={onExport} disabled={exporting || exportDisabled}>
            <Icon name="download" size={15} />
            {R.actions.exportCsv}
          </button>
        )}
        <button type="button" className="tb" onClick={() => window.print()}>
          <Icon name="file" size={15} />
          {R.actions.print}
        </button>
      </PageHeader>

      {options && (
        <div className="no-print w-full overflow-x-auto hs py-0.5">
          <nav
            aria-label={R.title}
            className="bg-[#edf2f9]/90 p-1.5 rounded-2xl border border-[#d8e2ee] inline-flex items-center gap-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] max-w-full"
          >
            {CATEGORY_META.filter((c) => (allowed as string[]).includes(c.id)).map((c) => {
              const active = pathname === c.href || pathname.startsWith(`${c.href}/`);
              return (
                <Link
                  key={c.id}
                  href={c.href}
                  aria-current={active ? 'page' : undefined}
                  className={`h-[38px] px-3.5 rounded-xl text-[13px] font-semibold flex items-center gap-2 whitespace-nowrap select-none transition-all duration-150 ${
                    active
                      ? 'bg-white text-[#063b78] border border-[#d0deee] font-bold shadow-[0_1px_3px_rgba(0,0,0,0.06)]'
                      : 'text-[#55637a] hover:text-[#063b78] hover:bg-white/60 border border-transparent'
                  }`}
                >
                  <Icon name={c.icon} size={15} />
                  <span>{(R.categories as Record<string, string>)[c.id]}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      )}

      {children}
    </div>
  );
}

/** Stand-alone CSV export button for a secondary view on the same page. */
export function ExportButton({ category, view, params }: { category: string; view: string; params: ReportParams }) {
  const { lang, showToast } = useApp();
  const R = DICTIONARY[lang].reports;
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="tb h-8 text-[12.5px] no-print"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const err = await downloadCsv(category, { ...params, view }, lang);
        setBusy(false);
        if (err) showToast(err === 'EXPORT_TOO_LARGE' ? R.errors.exportTooLarge : R.errors.load);
      }}
    >
      <Icon name="download" size={14} />
      {R.actions.exportCsv}
    </button>
  );
}

/** Sub-view switcher within a category. */
export function ViewTabs({ views, current, onChange }: { views: string[]; current: string; onChange: (v: string) => void }) {
  const { lang } = useApp();
  const V = DICTIONARY[lang].reports.views as Record<string, string>;
  return (
    <div className="no-print w-full overflow-x-auto hs">
      <div
        role="tablist"
        className="bg-slate-100/80 p-1 rounded-xl border border-[#e2e8f0] inline-flex items-center gap-1 max-w-full"
      >
        {views.map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={v === current}
            className={`h-[30px] px-3 rounded-lg text-[12.5px] font-semibold whitespace-nowrap select-none transition-all duration-150 ${
              v === current
                ? 'bg-[#063b78] text-white shadow-[0_1px_3px_rgba(6,59,120,0.25)] font-bold'
                : 'text-[#64748b] hover:text-[#063b78] hover:bg-white/70'
            }`}
            onClick={() => onChange(v)}
          >
            {V[v] ?? v}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Section({ title, note, children, actions }: { title?: string; note?: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="report-section bg-white rounded-2xl border border-[#dce5f0] shadow-xs min-w-0 overflow-hidden">
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 md:px-5 py-3 border-b border-[#edf1f7]">
          {title && <h2 className="font-bold text-[14.5px] text-[#063b78]">{title}</h2>}
          {actions}
        </div>
      )}
      {note && <p className="px-4 md:px-5 pt-3 text-[12px] text-[#64748b]">{note}</p>}
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function Notes({ items }: { items: Array<string | false | null | undefined> }) {
  const list = items.filter(Boolean) as string[];
  if (!list.length) return null;
  return (
    <ul className="flex flex-col gap-1 text-[12px] text-[#64748b] px-1">
      {list.map((n) => (
        <li key={n} className="flex gap-1.5">
          <Icon name="info" size={13} className="shrink-0 mt-[2px]" />
          <span>{n}</span>
        </li>
      ))}
    </ul>
  );
}

export function Loading() {
  return (
    <div className="bg-white rounded-2xl border border-[#dce5f0] p-10 text-center">
      <div className="inline-block h-7 w-7 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent" />
    </div>
  );
}

export function ReportError({ code }: { code: string }) {
  const { lang } = useApp();
  const E = DICTIONARY[lang].reports.errors;
  const msg =
    code === 'FORBIDDEN_BRANCH'
      ? E.forbiddenBranch
      : code.startsWith('FORBIDDEN')
        ? E.forbidden
        : code === 'INVALID_DATE_RANGE'
          ? E.invalidRange
          : code === 'VALIDATION_FAILED' || code === 'INVALID_FILTER'
            ? E.invalidFilter
            : code === 'UNAUTHORIZED'
              ? E.unauthorized
              : code.endsWith('NOT_FOUND')
                ? E.notFound
                : E.load;
  return (
    <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-5 text-[13.5px] font-semibold flex items-start gap-2">
      <Icon name="alert" size={18} className="shrink-0" />
      {msg}
    </div>
  );
}

export function Kpis({ items }: { items: Array<{ label: string; value: string; tone?: 'navy' | 'green' | 'rose' | 'slate' | 'amber' }> }) {
  const tone = { navy: 'text-[#063b78]', green: 'text-emerald-700', rose: 'text-rose-700', slate: 'text-slate-600', amber: 'text-amber-700' };
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
      {items.map((k) => (
        <div key={k.label} className="report-section bg-white p-3.5 rounded-2xl border border-[#dce5f0] min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[#64748b] leading-snug break-words" title={k.label}>
            {k.label}
          </div>
          <div className={`text-[19px] font-black mt-0.5 num break-words ${tone[k.tone || 'navy']}`}>{k.value}</div>
        </div>
      ))}
    </div>
  );
}
