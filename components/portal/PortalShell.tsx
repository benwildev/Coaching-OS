'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { usePortal } from './PortalProvider';
import PortalNotificationBell from './PortalNotificationBell';
import { DICTIONARY } from '@/lib/i18n';

const STUDENT_NAV = [
  { id: 'home', icon: 'chart', href: '/portal/student' },
  { id: 'attendance', icon: 'check', href: '/portal/student/attendance' },
  { id: 'results', icon: 'award', href: '/portal/student/results' },
  { id: 'fees', icon: 'wallet', href: '/portal/student/fees' },
  { id: 'more', icon: 'more', href: '/portal/student/notices' },
];

const GUARDIAN_NAV = [
  { id: 'home', icon: 'chart', href: '/portal/guardian' },
  { id: 'children', icon: 'users', href: '/portal/guardian/children' },
  { id: 'notices', icon: 'pin', href: '/portal/guardian/notices' },
  { id: 'notifications', icon: 'bell', href: '/portal/guardian/notifications' },
  { id: 'more', icon: 'more', href: '/portal/guardian/profile' },
];

export default function PortalShell({ children }: { children: React.ReactNode }) {
  const { lang, setLang, portalUser, loadingUser } = usePortal();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const dict = DICTIONARY[lang].portal;

  // No authenticated portal session — bounce to login rather than render
  // shell chrome around an error message (AGENTS.md §32).
  useEffect(() => {
    if (!loadingUser && !portalUser) {
      router.replace('/portal/login');
    }
  }, [loadingUser, portalUser, router]);

  const navItems = portalUser?.portalType === 'GUARDIAN' ? GUARDIAN_NAV : STUDENT_NAV;
  const baseHref = portalUser?.portalType === 'GUARDIAN' ? '/portal/guardian' : '/portal/student';

  if (loadingUser || !portalUser) return null;

  const handleLogout = async () => {
    await fetch('/api/portal/auth/logout', { method: 'POST' });
    router.push('/portal/login');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-[#f5f8fc] flex flex-col md:flex-row">
      {/* Desktop left rail */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 h-screen sticky top-0 bg-white border-r border-[#dce5f0] p-4">
        <div className="flex items-center gap-2 mb-6">
          <span className="w-9 h-9 rounded-xl bg-[#063b78] text-white flex items-center justify-center font-black text-sm">
            {(portalUser?.name || '?').charAt(0)}
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-bold text-[#092f63] truncate">{portalUser?.name || dict.title}</div>
            <div className="text-[11px] text-[#64748b]">{portalUser?.portalType === 'GUARDIAN' ? dict.guardianRole : dict.studentRole}</div>
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const active = pathname === item.href || (item.href !== baseHref && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold transition-colors ${
                  active ? 'bg-[#ffd200] text-[#063b78]' : 'text-[#092f63] hover:bg-[#f0f5fc]'
                }`}
              >
                <Icon name={item.icon} size={18} />
                {(dict.nav as Record<string, string>)[item.id]}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-1">
          <Link href={portalUser?.portalType === 'GUARDIAN' ? '/portal/guardian/profile' : '/portal/student/profile'} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold text-[#092f63] hover:bg-[#f0f5fc]">
            <Icon name="user" size={18} />
            {dict.nav.profile}
          </Link>
          <button type="button" onClick={handleLogout} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold text-rose-600 hover:bg-rose-50">
            <Icon name="logout" size={18} />
            {dict.logout}
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col pb-16 md:pb-0">
        {/* Mobile/desktop top bar */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-[#dce5f0] h-14 flex items-center px-4 gap-3">
          <span className="md:hidden w-8 h-8 rounded-lg bg-[#063b78] text-white flex items-center justify-center font-black text-xs shrink-0">
            {(portalUser?.name || '?').charAt(0)}
          </span>
          <div className="min-w-0 flex-1 md:hidden">
            <div className="text-[13px] font-bold text-[#092f63] truncate">{portalUser?.name || dict.title}</div>
          </div>
          <div className="hidden md:block flex-1" />
          <PortalNotificationBell />
          <div className="flex items-center bg-[#f0f5fc] border border-[#dce5f0] rounded-xl p-0.5">
            <button type="button" onClick={() => setLang('bn')} className={`px-2 py-1 rounded-lg text-xs font-bold ${lang === 'bn' ? 'bg-[#063b78] text-white' : 'text-[#64748b]'}`}>
              বাংলা
            </button>
            <button type="button" onClick={() => setLang('en')} className={`px-2 py-1 rounded-lg text-xs font-bold ${lang === 'en' ? 'bg-[#063b78] text-white' : 'text-[#64748b]'}`}>
              EN
            </button>
          </div>
          <button type="button" className="md:hidden ibtn" aria-label={dict.menu} onClick={() => setMenuOpen((v) => !v)}>
            <Icon name={menuOpen ? 'x' : 'menu'} size={20} />
          </button>
        </header>

        {menuOpen && (
          <div className="md:hidden fixed inset-0 z-40 flex">
            <button aria-label="Close menu" className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} />
            <div className="relative w-64 h-full bg-white p-4 flex flex-col gap-1">
              <Link href={portalUser?.portalType === 'GUARDIAN' ? '/portal/guardian/profile' : '/portal/student/profile'} onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold text-[#092f63] hover:bg-[#f0f5fc]">
                <Icon name="user" size={18} />
                {dict.nav.profile}
              </Link>
              <Link href="/portal/change-password" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold text-[#092f63] hover:bg-[#f0f5fc]">
                <Icon name="lock" size={18} />
                {dict.changePassword}
              </Link>
              {portalUser?.portalType === 'STUDENT' && (
                <Link href="/portal/student/materials" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold text-[#092f63] hover:bg-[#f0f5fc]">
                  <Icon name="book" size={18} />
                  {dict.nav.materials}
                </Link>
              )}
              <button type="button" onClick={handleLogout} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold text-rose-600 hover:bg-rose-50 mt-auto">
                <Icon name="logout" size={18} />
                {dict.logout}
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 min-w-0 p-4 md:p-6">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-[#dce5f0] flex items-stretch h-16 shadow-lg">
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href !== baseHref && pathname?.startsWith(item.href));
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 ${active ? 'text-[#063b78] font-bold' : 'text-[#64748b]'}`}
            >
              <Icon name={item.icon} size={20} />
              <span className="text-[10.5px] font-semibold">{(dict.nav as Record<string, string>)[item.id]}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
