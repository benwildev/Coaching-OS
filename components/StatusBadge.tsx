'use client';

import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
  /** Which dictionary section (e.g. "batchStatus", "roomStatus", "courseStatus", "scheduleStatus", "attendanceStatus") to resolve the label from. Defaults to "studentStatus". */
  dictKey?:
    | 'studentStatus'
    | 'batchStatus'
    | 'studentBatchStatus'
    | 'courseStatus'
    | 'roomStatus'
    | 'scheduleStatus'
    | 'attendanceStatus'
    | 'sessionStatus'
    | 'teacherStatus'
    | 'invoiceStatus'
    | 'feeAssignmentStatus'
    | 'paymentStatus';
}

// Centralized semantic status → color tokens, shared by StatusBadge and any
// interactive status control (e.g. the attendance P/A/L/E buttons) so the
// same status always renders the same color everywhere in the app.
export const STATUS_DOT_COLOR: Record<string, string> = {
  ACTIVE: 'bg-emerald-500',
  PLANNED: 'bg-sky-500',
  OPEN: 'bg-sky-500',
  PAUSED: 'bg-amber-500',
  INACTIVE: 'bg-slate-400',
  TRANSFERRED: 'bg-amber-500',
  COMPLETED: 'bg-blue-500',
  DROPPED_OUT: 'bg-rose-500',
  DROPPED: 'bg-rose-500',
  CANCELLED: 'bg-rose-500',
  ARCHIVED: 'bg-slate-400',
  ENROLLED: 'bg-indigo-500',
  MAINTENANCE: 'bg-orange-500',
  ENDED: 'bg-slate-400',
  PRESENT: 'bg-emerald-500',
  ABSENT: 'bg-rose-500',
  LATE: 'bg-amber-500',
  EXCUSED: 'bg-indigo-500',
  DRAFT: 'bg-slate-400',
  ISSUED: 'bg-sky-500',
  PARTIAL: 'bg-amber-500',
  PAID: 'bg-emerald-500',
  OVERDUE: 'bg-rose-500',
  PENDING: 'bg-sky-500',
  WAIVED: 'bg-indigo-500',
  REFUNDED: 'bg-rose-500',
  PARTIALLY_REFUNDED: 'bg-amber-500',
  VOIDED: 'bg-slate-400',
};

export const STATUS_BG_COLOR: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PLANNED: 'bg-sky-50 text-sky-700 border-sky-200',
  OPEN: 'bg-sky-50 text-sky-700 border-sky-200',
  PAUSED: 'bg-amber-50 text-amber-700 border-amber-200',
  INACTIVE: 'bg-slate-100 text-slate-600 border-slate-200',
  TRANSFERRED: 'bg-amber-50 text-amber-700 border-amber-200',
  COMPLETED: 'bg-blue-50 text-blue-700 border-blue-200',
  DROPPED_OUT: 'bg-rose-50 text-rose-700 border-rose-200',
  DROPPED: 'bg-rose-50 text-rose-700 border-rose-200',
  CANCELLED: 'bg-rose-50 text-rose-700 border-rose-200',
  ARCHIVED: 'bg-slate-100 text-slate-600 border-slate-200',
  ENROLLED: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  MAINTENANCE: 'bg-orange-50 text-orange-700 border-orange-200',
  ENDED: 'bg-slate-100 text-slate-600 border-slate-200',
  PRESENT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ABSENT: 'bg-rose-50 text-rose-700 border-rose-200',
  LATE: 'bg-amber-50 text-amber-700 border-amber-200',
  EXCUSED: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  DRAFT: 'bg-slate-100 text-slate-600 border-slate-200',
  ISSUED: 'bg-sky-50 text-sky-700 border-sky-200',
  PARTIAL: 'bg-amber-50 text-amber-700 border-amber-200',
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  OVERDUE: 'bg-rose-50 text-rose-700 border-rose-200',
  PENDING: 'bg-sky-50 text-sky-700 border-sky-200',
  WAIVED: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  REFUNDED: 'bg-rose-50 text-rose-700 border-rose-200',
  PARTIALLY_REFUNDED: 'bg-amber-50 text-amber-700 border-amber-200',
  VOIDED: 'bg-slate-100 text-slate-600 border-slate-200',
};

const DOT_COLOR = STATUS_DOT_COLOR;
const BG_COLOR = STATUS_BG_COLOR;

export default function StatusBadge({ status, size = 'md', dictKey = 'studentStatus' }: StatusBadgeProps) {
  const { lang } = useApp();
  const dict = DICTIONARY[lang];

  const s = (status || '').toUpperCase();
  const section = (dict as any)[dictKey] || {};
  const label = section[s] || s.replace(/_/g, ' ');
  const colorClasses = BG_COLOR[s] || 'bg-gray-100 text-gray-700 border-gray-200';
  const dotColor = DOT_COLOR[s] || 'bg-gray-400';

  const sizeClasses =
    size === 'sm'
      ? 'px-2 py-0.5 text-[11px] font-medium'
      : 'px-2.5 py-1 text-[12px] font-semibold';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${colorClasses} ${sizeClasses}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      {label}
    </span>
  );
}
