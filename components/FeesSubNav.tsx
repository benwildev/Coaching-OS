'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';

interface TabItem {
  id: 'tabOverview' | 'tabStructures' | 'tabInvoices' | 'tabPayments' | 'tabDailyCollection' | 'tabDue' | 'tabCollection';
  href: string;
  icon: string;
}

const TABS: readonly TabItem[] = [
  { id: 'tabOverview', href: '/fees', icon: 'dashboard' },
  { id: 'tabStructures', href: '/fees/structures', icon: 'layers' },
  { id: 'tabInvoices', href: '/fees/invoices', icon: 'file' },
  { id: 'tabPayments', href: '/fees/payments', icon: 'banknote' },
  { id: 'tabDailyCollection', href: '/fees/collection', icon: 'wallet' },
  { id: 'tabDue', href: '/fees/reports/due', icon: 'alert' },
  { id: 'tabCollection', href: '/fees/reports/collection', icon: 'chart' },
] as const;

export default function FeesSubNav() {
  const pathname = usePathname();
  const { lang } = useApp();
  const dict = DICTIONARY[lang].fees;

  return (
    <div className="w-full overflow-x-auto hs py-1">
      <nav
        aria-label="Fees Navigation"
        className="bg-[#edf2f9]/90 backdrop-blur-md p-1.5 rounded-2xl border border-[#d8e2ee] inline-flex items-center gap-1.5 shadow-2xs max-w-full"
      >
        {TABS.map((tab) => {
          const active = tab.href === '/fees' ? pathname === '/fees' : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={`h-9.5 px-3.5 rounded-xl text-[13px] font-semibold flex items-center gap-2 whitespace-nowrap transition-all duration-200 select-none ${
                active
                  ? 'bg-white text-[#063b78] shadow-[0_2px_8px_-2px_rgba(6,59,120,0.14),0_1px_2px_rgba(0,0,0,0.04)] border border-[#d0deee] font-bold scale-[1.01]'
                  : 'text-[#55637a] hover:text-[#063b78] hover:bg-white/70 border border-transparent'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              <span
                className={`w-5 h-5 rounded-lg flex items-center justify-center transition-colors ${
                  active ? 'text-[#063b78]' : 'text-[#7e8e9f]'
                }`}
              >
                <Icon name={tab.icon} size={15} />
              </span>
              <span>{dict[tab.id as keyof typeof dict]}</span>
              {active && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#063b78] ml-0.5 animate-in fade-in zoom-in-50 duration-200" />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
