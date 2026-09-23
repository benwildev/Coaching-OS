'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';

const TABS = [
  { id: 'tabOverview', href: '/fees' },
  { id: 'tabStructures', href: '/fees/structures' },
  { id: 'tabInvoices', href: '/fees/invoices' },
  { id: 'tabPayments', href: '/fees/payments' },
  { id: 'tabDue', href: '/fees/reports/due' },
  { id: 'tabCollection', href: '/fees/reports/collection' },
] as const;

export default function FeesSubNav() {
  const pathname = usePathname();
  const { lang } = useApp();
  const dict = DICTIONARY[lang].fees;

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto hs pb-1">
      {TABS.map((tab) => {
        const active = tab.href === '/fees' ? pathname === '/fees' : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={`chip ${active ? 'shrink-0' : 'shrink-0'}`}
            aria-pressed={active}
          >
            {dict[tab.id as keyof typeof dict]}
          </Link>
        );
      })}
    </div>
  );
}
