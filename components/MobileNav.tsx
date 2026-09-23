'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from './Icon';
import { useApp } from '@/lib/store';
import { SidebarContent } from './Sidebar';
import { DICTIONARY } from '@/lib/i18n';

const BOTTOM_ITEMS = [
  { id: 'dashboard', icon: 'chart', href: '/dashboard' },
  { id: 'students', icon: 'user', href: '/students' },
  { id: 'fees', icon: 'wallet', href: '/fees' },
  { id: 'attendance', icon: 'check', href: '/attendance' },
];

export default function MobileNav() {
  const pathname = usePathname();
  const activeId = pathname === '/' || pathname === '/dashboard' ? 'dashboard' : pathname.replace('/', '');
  const { mobileNav, setMobileNav, lang } = useApp();
  const dict = DICTIONARY[lang].nav;

  return (
    <>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[#dce5f0] flex items-stretch h-16 shadow-lg">
        {BOTTOM_ITEMS.map((item) => {
          const label = (dict as any)[item.id] || item.id;
          const active = activeId === item.id;
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 ${
                active ? 'text-[#063b78] font-bold' : 'text-[#64748b]'
              }`}
            >
              <Icon name={item.icon} size={20} />
              <span className="text-[10.5px] font-semibold">{label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileNav(true)}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[#64748b]"
        >
          <Icon name="menu" size={20} />
          <span className="text-[10.5px] font-semibold">{lang === 'bn' ? 'মেনু' : 'Menu'}</span>
        </button>
      </nav>

      {mobileNav && (
        <div className="md:hidden fixed inset-0 z-50 flex fade-in">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileNav(false)}
          />
          <div className="relative w-72 h-full z-10">
            <SidebarContent collapsed={false} onNavigate={() => setMobileNav(false)} />
          </div>
        </div>
      )}
    </>
  );
}
