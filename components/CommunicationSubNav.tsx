'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';

const TABS = [
  { id: 'notices', href: '/notices', permission: 'notices.read' },
  { id: 'templates', href: '/communication/templates', permission: 'communication.templates.read' },
  { id: 'logs', href: '/communication/logs', permission: 'communication.logs.read' },
] as const;

export default function CommunicationSubNav() {
  const pathname = usePathname();
  const { lang, can } = useApp();
  const dict = DICTIONARY[lang].communication;

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto hs pb-1">
      {TABS.filter((tab) => can(tab.permission)).map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link key={tab.id} href={tab.href} className="chip" aria-pressed={active}>
            {dict[tab.id as keyof typeof dict]}
          </Link>
        );
      })}
      {can('settings.communication.update') && (
        <Link href="/settings/communication" className="chip" aria-pressed={pathname.startsWith('/settings/communication')}>
          {dict.settingsTab}
        </Link>
      )}
      {can('settings.notification_policy.update') && (
        <Link href="/settings/notifications" className="chip" aria-pressed={pathname.startsWith('/settings/notifications')}>
          {lang === 'bn' ? 'অ্যালার্ট পলিসি' : 'Alert Policies'}
        </Link>
      )}
    </div>
  );
}
