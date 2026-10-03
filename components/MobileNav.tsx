'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from './Icon';
import { useApp } from '@/lib/store';
import { SidebarContent } from './Sidebar';
import { DICTIONARY } from '@/lib/i18n';
import { bottomNavigation, filterNavigation, isNavActive } from '@/lib/navigation';

export default function MobileNav() {
  const pathname = usePathname();
  const { mobileNav, setMobileNav, lang, currentUser, currentCenter } = useApp();
  const dict = DICTIONARY[lang].nav;
  // Same configuration and permission filter as the desktop sidebar and the drawer below.
  const bottomItems = bottomNavigation(filterNavigation(currentUser, currentCenter?.features));

  return (
    <>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[#dce5f0] flex items-stretch h-16 shadow-lg">
        {bottomItems.map((item) => {
          const label = (dict as Record<string, string>)[item.id] || item.id;
          const active = isNavActive(pathname, item.href);
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
