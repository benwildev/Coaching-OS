'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';
import { canAny, type PermissionCode } from '@/lib/auth/permissions';

interface TabItem {
  id: 'tabOverview' | 'tabExpenses' | 'tabReports' | 'tabCashBox';
  href: string;
  icon: string;
  permission: readonly PermissionCode[];
}

const TABS: readonly TabItem[] = [
  { id: 'tabOverview', href: '/finance', icon: 'dashboard', permission: ['finance.dashboard.read'] },
  { id: 'tabExpenses', href: '/finance/expenses', icon: 'banknote', permission: ['expenses.read'] },
  { id: 'tabReports', href: '/finance/reports', icon: 'chart', permission: ['reports.finance.read', 'finance.dashboard.read'] },
  { id: 'tabCashBox', href: '/finance/cash-box', icon: 'wallet', permission: ['fees.cash_session.manage', 'finance.dashboard.read'] },
] as const;

export default function FinanceSubNav() {
  const pathname = usePathname();
  const { lang, currentUser } = useApp();
  const dict = DICTIONARY[lang].finance;
  const tabs = TABS.filter((t) => canAny(currentUser, t.permission));

  return (
    <div className="w-full overflow-x-auto hs py-1">
      <nav aria-label="Finance Navigation" className="bg-[#edf2f9]/90 p-1.5 rounded-2xl border border-[#d8e2ee] inline-flex items-center gap-1.5 shadow-2xs max-w-full">
        {tabs.map((tab) => {
          const active = tab.href === '/finance' ? pathname === '/finance' : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`h-9.5 px-3.5 rounded-xl text-[13px] font-semibold flex items-center gap-2 whitespace-nowrap select-none ${
                active ? 'bg-white text-[#063b78] border border-[#d0deee] font-bold shadow-xs' : 'text-[#55637a] hover:text-[#063b78] hover:bg-white/70 border border-transparent'
              }`}
            >
              <Icon name={tab.icon} size={15} />
              <span>{dict[tab.id]}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
