'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Icon from '@/components/Icon';

const RANGE_LABELS: Record<number, string> = { 1: 'This month', 3: 'Last 3 months', 6: 'Last 6 months', 12: 'Last 12 months' };

const QUICK_ACTIONS = [
  { label: 'New admission', icon: 'userplus', href: '/students/new' },
  { label: 'Collect fee', icon: 'banknote', href: '/fees/invoices' },
  { label: 'Mark attendance', icon: 'calcheck', href: '/attendance' },
  { label: 'New batch', icon: 'layers', href: '/batches/new' },
  { label: 'Send message', icon: 'send', href: '/communication' },
];

export default function DashboardFilters({
  classes,
  classId,
  range,
}: {
  classes: { id: string; name: string }[];
  classId: string;
  range: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  const setParam = (key: string, value: string, fallback: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === fallback) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const selectCls =
    'h-9 max-w-[190px] truncate rounded-xl border border-[#dce5f0] bg-white px-3 pr-8 text-[13px] font-semibold text-[#063b78] outline-none focus:border-[#063b78] appearance-none bg-no-repeat bg-[right_10px_center]';
  const chevron = {
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23063b78' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Filter by class"
        className={selectCls}
        style={chevron}
        value={classId}
        onChange={(e) => setParam('class', e.target.value, 'all')}
      >
        <option value="all">All classes</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Date range"
        className={selectCls}
        style={chevron}
        value={String(range)}
        onChange={(e) => setParam('range', e.target.value, '3')}
      >
        {Object.entries(RANGE_LABELS).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>

      <div className="relative">
        <button type="button" className="primary"
          style={{ height: 36, fontSize: 13 }} onClick={() => setOpen(!open)} aria-expanded={open}>
          <Icon name="zap" size={15} />
          <span>Quick actions</span>
          <Icon name="chevdown" size={14} />
        </button>
        {open && (
          <>
            <button className="fixed inset-0 z-40 cursor-default" aria-hidden tabIndex={-1} onClick={() => setOpen(false)} />
            <div className="absolute right-0 mt-2 w-56 bg-white border border-[#dce5f0] rounded-2xl shadow-xl p-1.5 z-50 fade-in">
              {QUICK_ACTIONS.map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-semibold text-[#092f63] hover:bg-[#f0f5fc]"
                >
                  <Icon name={a.icon} size={16} className="text-[#063b78]" />
                  {a.label}
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
