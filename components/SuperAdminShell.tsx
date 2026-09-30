'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';

/**
 * Chrome for the platform console. Uses the platform session only — it never
 * calls the tenant /api/auth/me. Unauthenticated visitors (including signed-in
 * coaching-center users, who have no platform cookie) are sent to the platform
 * login; the pages' data calls are independently protected by the API guard.
 */
export default function SuperAdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { lang, setLang, toast } = useApp();
  const t = DICTIONARY[lang].superAdmin;
  const [admin, setAdmin] = useState<{ name: string; email: string } | null>(null);
  const [checked, setChecked] = useState(false);
  const isLogin = pathname === '/super-admin/login';

  useEffect(() => {
    if (isLogin) return;
    fetch('/api/super-admin/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated) setAdmin(d.admin);
        else router.replace('/login');
      })
      .catch(() => router.replace('/login'))
      .finally(() => setChecked(true));
  }, [isLogin, router]);

  if (isLogin) return <>{children}</>;
  if (!checked || !admin) return <div className="min-h-screen bg-[#f5f8fc]" />;

  const nav = [
    { href: '/super-admin/dashboard', label: t.dashboard },
    { href: '/super-admin/coaching-centers', label: t.centers },
    { href: '/super-admin/plans', label: t.plans },
  ];

  const signOut = async () => {
    await fetch('/api/super-admin/auth/logout', { method: 'POST' });
    window.location.assign('/login');
  };

  return (
    <div className="min-h-screen bg-[#f5f8fc]">
      <header className="bg-[#063b78] text-white">
        <div className="max-w-[1300px] mx-auto px-4 md:px-6 py-2 md:py-0 md:h-14 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="w-8 h-8 rounded-lg bg-[#ffd200] text-[#063b78] font-black flex items-center justify-center">S</span>
          <span className="font-bold hidden sm:inline">{t.platform}</span>
          <nav className="order-last md:order-none w-full md:w-auto flex items-center gap-1 md:ml-2 overflow-x-auto">
            {nav.map((n) => {
              const active = pathname?.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`px-3 py-1.5 rounded-lg text-[13.5px] font-semibold whitespace-nowrap ${active ? 'bg-[#ffd200] text-[#063b78]' : 'text-[#e9eef7] hover:bg-white/10'}`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-[12.5px]">
            <button type="button" onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')} className="px-2 py-1 rounded-md border border-white/30 hover:bg-white/10 font-semibold">
              {lang === 'bn' ? 'EN' : 'বাংলা'}
            </button>
            <span className="hidden md:inline opacity-80">{admin.email}</span>
            <button type="button" onClick={signOut} className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 font-semibold">
              {t.signOut}
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-[1300px] mx-auto p-4 md:p-6">{children}</main>
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-[#00296b] text-white text-[13.5px] font-semibold px-4 py-2.5 rounded-full shadow-2xl">
          {toast.msg}
        </div>
      )}
    </div>
  );
}
