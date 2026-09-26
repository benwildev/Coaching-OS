'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';

const TABS = [
  { id: 'notices', href: '/notices' },
  { id: 'templates', href: '/communication/templates' },
  { id: 'logs', href: '/communication/logs' },
] as const;

export default function CommunicationSubNav() {
  const pathname = usePathname();
  const { lang } = useApp();
  const dict = DICTIONARY[lang].communication;

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto hs pb-1">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link key={tab.id} href={tab.href} className="chip" aria-pressed={active}>
            {dict[tab.id as keyof typeof dict]}
          </Link>
        );
      })}
    </div>
  );
}
