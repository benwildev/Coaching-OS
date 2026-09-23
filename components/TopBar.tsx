'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Icon from './Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate, toBanglaNumeral } from '@/lib/i18n';

export default function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { lang, setLang, setMobileNav, currentUser, currentCenter } = useApp();
  const [profileMenu, setProfileMenu] = useState(false);
  const [timeStr, setTimeStr] = useState('');

  // Dhaka time tick
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const timePart = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Dhaka',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
      }).format(now);

      const datePart = formatDhakaDate(now);
      const formatted = `${datePart} · ${timePart} (Dhaka)`;
      setTimeStr(lang === 'bn' ? toBanglaNumeral(formatted) : formatted);
    };

    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, [lang]);

  const dict = DICTIONARY[lang];
  const activeId = pathname === '/' || pathname === '/dashboard' ? 'dashboard' : pathname.replace('/', '');
  const pageTitle = (dict.nav as any)[activeId] || 'Coaching OS';

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch {
      router.push('/login');
    }
  };

  const userDisplayName =
    (lang === 'bn' && currentUser?.banglaName) ||
    currentUser?.name ||
    'Guest Administrator';

  return (
    <header className="sticky top-0 z-30 bg-[#f5f8fc]/95 backdrop-blur border-b border-[#dce5f0]">
      <div className="flex items-center gap-2 px-4 md:px-6 h-16">
        {/* Mobile Menu Trigger */}
        <button
          type="button"
          className="md:hidden ibtn"
          aria-label="Open menu"
          onClick={() => setMobileNav(true)}
        >
          <Icon name="menu" size={20} />
        </button>

        {/* Page Title & Dhaka Time */}
        <div className="min-w-0 mr-2">
          <div className="dsp font-bold text-[#063b78] text-[15px] md:text-base truncate">
            {pageTitle}
          </div>
          <div className="hidden sm:block text-[11px] text-[#64748b] truncate font-medium">
            {timeStr}
          </div>
        </div>

        {/* Global Search */}
        <div className="hidden lg:flex items-center gap-2 ml-3 border-l border-[#dce5f0] pl-3">
          <Icon name="search" size={16} className="text-[#64748b]" />
          <input
            placeholder={dict.actions.search}
            className="text-[13px] bg-transparent outline-none w-64 placeholder:text-[#94a3b8]"
          />
        </div>

        <div className="grow" />

        {/* Language Switcher Button */}
        <div className="flex items-center bg-white border border-[#dce5f0] rounded-xl p-0.5 shadow-2xs">
          <button
            type="button"
            onClick={() => setLang('bn')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
              lang === 'bn' ? 'bg-[#063b78] text-white shadow-xs' : 'text-[#64748b] hover:text-[#063b78]'
            }`}
          >
            বাংলা
          </button>
          <button
            type="button"
            onClick={() => setLang('en')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
              lang === 'en' ? 'bg-[#063b78] text-white shadow-xs' : 'text-[#64748b] hover:text-[#063b78]'
            }`}
          >
            EN
          </button>
        </div>

        {/* User Profile & Actions Dropdown */}
        <div className="relative ml-1">
          <button
            type="button"
            className="flex items-center gap-2 pl-1 pr-2 h-10 rounded-xl hover:bg-[#e9eef7] transition-colors"
            onClick={() => setProfileMenu(!profileMenu)}
          >
            <span className="w-8 h-8 rounded-full bg-[#063b78] text-white flex items-center justify-center text-xs font-bold shadow-xs">
              {userDisplayName.charAt(0)}
            </span>
            <span className="hidden sm:block text-xs font-bold text-[#063b78] max-w-[120px] truncate">
              {userDisplayName}
            </span>
            <Icon name="chevdown" size={14} className="hidden sm:block text-[#64748b]" />
          </button>

          {profileMenu && (
            <>
              <button
                className="fixed inset-0 z-40"
                aria-hidden
                onClick={() => setProfileMenu(false)}
              />
              <div className="absolute right-0 mt-2 w-60 bg-white border border-[#dce5f0] rounded-2xl shadow-xl p-1.5 z-50 fade-in">
                <div className="px-3 py-2.5 border-b border-[#edf1f7] mb-1">
                  <div className="text-[13px] font-bold text-[#063b78] truncate">
                    {userDisplayName}
                  </div>
                  <div className="text-[11px] font-bold text-[#16a34a]">
                    {currentUser?.role || 'OWNER'} · {currentCenter?.code || 'ACC'}
                  </div>
                  {currentUser?.email && (
                    <div className="text-[11px] text-[#64748b] truncate mt-0.5">
                      {currentUser.email}
                    </div>
                  )}
                </div>

                <a
                  href="/settings"
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-[13px] text-[#092f63] hover:bg-[#f0f5fc] font-semibold"
                  onClick={() => setProfileMenu(false)}
                >
                  <Icon name="sliders" size={16} />
                  <span>{dict.nav.settings}</span>
                </a>

                <button
                  type="button"
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-[13px] text-red-600 hover:bg-red-50 font-semibold"
                  onClick={() => {
                    setProfileMenu(false);
                    handleSignOut();
                  }}
                >
                  <Icon name="logout" size={16} />
                  <span>{dict.actions.logout}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
