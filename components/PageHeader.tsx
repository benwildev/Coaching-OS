import Link from 'next/link';
import Icon from './Icon';

/**
 * Page header card used across modules: eyebrow, title, subtitle and
 * right-aligned actions. Same visual treatment as the Exams header.
 */
export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  backHref,
  backLabel,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-[#dce5f0] shadow-xs">
      <div className="min-w-0">
        {backHref && (
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-xs font-bold text-[#64748b] hover:text-[#063b78] mb-1"
          >
            <Icon name="chevleft" size={14} />
            {backLabel}
          </Link>
        )}
        {eyebrow && (
          <div className="text-xs font-black uppercase tracking-wider text-[#64748b]">{eyebrow}</div>
        )}
        <h1 className="text-xl sm:text-2xl font-black text-[#092f63] mt-0.5 break-words">{title}</h1>
        {subtitle && <p className="text-xs sm:text-[13px] text-[#64748b] mt-0.5">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2.5 flex-wrap">{children}</div>}
    </div>
  );
}

export function StatTile({ label, value, tone = 'navy' }: { label: string; value: string; tone?: 'navy' | 'green' | 'slate' | 'blue' }) {
  const color = {
    navy: 'text-[#063b78]',
    green: 'text-emerald-600',
    slate: 'text-slate-500',
    blue: 'text-blue-600',
  }[tone];
  return (
    <div className="bg-white p-4 rounded-2xl border border-[#dce5f0] shadow-xs">
      <div className="text-[11.5px] font-bold uppercase tracking-wider text-[#64748b]">{label}</div>
      <div className={`text-2xl font-black mt-1 num ${color}`}>{value}</div>
    </div>
  );
}

export function EmptyState({
  message,
  actionHref,
  actionLabel,
  icon = 'info',
}: {
  message: string;
  actionHref?: string;
  actionLabel?: string;
  icon?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-4 gap-3">
      <span className="w-12 h-12 rounded-2xl bg-[#f5f8fc] border border-[#dce5f0] flex items-center justify-center text-[#64748b]">
        <Icon name={icon} size={22} />
      </span>
      <p className="text-[14px] font-semibold text-[#092f63]">{message}</p>
      {actionHref && actionLabel && (
        <Link href={actionHref} className="primary">
          <Icon name="plus" size={16} />
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

export function Pager({
  page,
  totalPages,
  total,
  onPage,
  labels,
  formatNumber,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
  labels: { previous: string; next: string; page: string; of: string; results: string };
  formatNumber: (n: number) => string;
}) {
  if (total === 0) return null;
  return (
    <div className="no-print flex items-center justify-between gap-3 px-4 py-3 border-t border-[#edf1f7] text-[12.5px] text-[#64748b]">
      <span>
        {formatNumber(total)} {labels.results} · {labels.page} {formatNumber(page)} {labels.of} {formatNumber(totalPages)}
      </span>
      <div className="flex gap-2">
        <button type="button" className="tb" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <Icon name="chevleft" size={14} />
          {labels.previous}
        </button>
        <button type="button" className="tb" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          {labels.next}
          <Icon name="chevright" size={14} />
        </button>
      </div>
    </div>
  );
}
