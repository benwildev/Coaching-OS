'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutGrid,
  Calendar,
  Award,
  CheckCircle2,
  BookOpen,
  ClipboardCheck,
  Bell,
  User,
  LogOut,
  Menu,
  X,
  Lock,
} from 'lucide-react';
import { usePortal } from './PortalProvider';
import PortalNotificationBell from './PortalNotificationBell';
import DynamicFavicon from '../DynamicFavicon';
import { DICTIONARY } from '@/lib/i18n';

export default function PortalShell({ children }: { children: React.ReactNode }) {
  const { lang, setLang, portalUser, portalCenter, loadingUser } = usePortal();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const dict = DICTIONARY[lang].portal;

  useEffect(() => {
    if (!loadingUser && !portalUser) {
      router.replace('/login');
    }
  }, [loadingUser, portalUser, router]);

  if (loadingUser || !portalUser) return null;

  const handleLogout = async () => {
    await fetch('/api/portal/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const isStudent = portalUser.portalType === 'STUDENT';
  const isStudentDashboard = pathname === '/portal/student';

  const studentNavItems = [
    { id: 'home', label: lang === 'bn' ? 'হোম' : 'Home', icon: LayoutGrid, href: '/portal/student' },
    { id: 'timetable', label: lang === 'bn' ? 'রুটিন' : 'Timetable', icon: Calendar, href: '/portal/student/timetable' },
    { id: 'results', label: lang === 'bn' ? 'পরীক্ষা ও ফলাফল' : 'Exams & results', icon: Award, href: '/portal/student/results' },
    { id: 'attendance', label: lang === 'bn' ? 'উপস্থিতি' : 'Attendance', icon: CheckCircle2, href: '/portal/student/attendance' },
    { id: 'materials', label: lang === 'bn' ? 'স্টাডি মেটেরিয়াল' : 'Study material', icon: BookOpen, href: '/portal/student/materials' },
    { id: 'homework', label: lang === 'bn' ? 'হোমওয়ার্ক' : 'Homework', icon: ClipboardCheck, href: '/portal/student/homework' },
    { id: 'notices', label: lang === 'bn' ? 'নোটিশ' : 'Notices', icon: Bell, href: '/portal/student/notices' },
  ];

  const guardianNavItems = [
    { id: 'home', label: lang === 'bn' ? 'হোম' : 'Home', icon: LayoutGrid, href: '/portal/guardian' },
    { id: 'children', label: lang === 'bn' ? 'সন্তানবৃন্দ' : 'Children', icon: User, href: '/portal/guardian/children' },
    { id: 'notices', label: lang === 'bn' ? 'নোটিশ' : 'Notices', icon: Bell, href: '/portal/guardian/notices' },
    { id: 'notifications', label: lang === 'bn' ? 'বিজ্ঞপ্তি' : 'Notifications', icon: Bell, href: '/portal/guardian/notifications' },
    { id: 'profile', label: lang === 'bn' ? 'প্রোফাইল' : 'Profile', icon: User, href: '/portal/guardian/profile' },
  ];

  const navItems = isStudent ? studentNavItems : guardianNavItems;
  const baseHref = isStudent ? '/portal/student' : '/portal/guardian';

  const centerName = (lang === 'bn' && portalCenter?.banglaName) || portalCenter?.name || 'Coaching OS';
  const centerLogoUrl = portalCenter?.branding?.logoUrl;
  const centerAccentColor = portalCenter?.branding?.accentColor || '#ffd200';
  const centerPrimaryColor = portalCenter?.branding?.primaryColor || '#063b78';

  // Get user initials for avatar
  const initials = portalUser.name
    ? portalUser.name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0].toUpperCase())
        .join('')
    : 'ST';

  return (
    <div className="min-h-screen bg-[#f3f6fa] flex flex-col md:flex-row font-sans">
      <DynamicFavicon url={portalCenter?.branding?.faviconUrl} />
      {/*
        DESKTOP LEFT RAIL SIDEBAR:
        - Deep Navy background (#041e46) matching Figma mockup for student portal
      */}
      <aside
        className={`hidden md:flex flex-col w-64 shrink-0 h-screen sticky top-0 p-4 z-20 ${
          isStudent
            ? 'bg-[#041e46] text-white border-r border-[#031533]'
            : 'bg-white text-[#092f63] border-r border-[#dce5f0]'
        }`}
      >
        {/* Top: Brand Header */}
        <div className="flex items-center gap-3 mb-7 px-2 pt-1">
          {centerLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={centerLogoUrl} alt={centerName} className="w-9 h-9 rounded-xl object-cover shadow-sm shrink-0 bg-white" />
          ) : (
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm font-extrabold text-sm shrink-0"
              style={{ backgroundColor: centerAccentColor, color: centerPrimaryColor }}
            >
              {/* Custom 3-bar Coaching OS chart icon matching original brand badge */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="4" y="11" width="4" height="9" rx="1.5" />
                <rect x="10" y="5" width="4" height="15" rx="1.5" />
                <rect x="16" y="8" width="4" height="12" rx="1.5" />
              </svg>
            </div>
          )}
          <div>
            <div className="font-extrabold text-[16px] leading-tight tracking-tight truncate max-w-[160px]">
              {centerName}
            </div>
            <div
              className={`text-[11px] font-medium ${
                isStudent ? 'text-blue-200/70' : 'text-slate-500'
              }`}
            >
              {isStudent
                ? lang === 'bn'
                  ? 'শিক্ষার্থী পোর্টাল'
                  : 'Student portal'
                : lang === 'bn'
                ? 'অভিভাবক পোর্টাল'
                : 'Guardian portal'}
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex flex-col gap-1.5 flex-1">
          {navItems.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== baseHref && pathname?.startsWith(item.href));
            const IconComp = item.icon;

            if (isStudent) {
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`flex items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-[13.5px] font-bold transition-all duration-150 ${
                    active
                      ? 'bg-[#ffd200] text-[#063b78] shadow-sm'
                      : 'text-blue-100/75 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <IconComp className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            }

            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-[13.5px] font-bold transition-colors ${
                  active
                    ? 'bg-[#ffd200] text-[#063b78] shadow-sm'
                    : 'text-[#092f63] hover:bg-[#f0f5fc]'
                }`}
              >
                <IconComp className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom Profile Widget matching Mockup */}
        <div
          className={`mt-auto pt-4 border-t ${
            isStudent ? 'border-white/10' : 'border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between gap-2 px-1">
            <Link
              href={isStudent ? '/portal/student/profile' : '/portal/guardian/profile'}
              className="flex items-center gap-3 min-w-0 hover:opacity-85 transition-opacity"
            >
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                  isStudent
                    ? 'bg-blue-500/20 text-white border border-white/20'
                    : 'bg-[#063b78] text-white'
                }`}
              >
                {initials}
              </div>
              <div className="min-w-0">
                <div className="font-bold text-[13px] truncate leading-tight">
                  {portalUser.name}
                </div>
                <div
                  className={`text-[11px] truncate mt-0.5 ${
                    isStudent ? 'text-blue-200/60' : 'text-slate-500'
                  }`}
                >
                  {isStudent ? dict.studentRole : dict.guardianRole}
                </div>
              </div>
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              className={`p-2 rounded-xl transition-colors cursor-pointer shrink-0 ${
                isStudent
                  ? 'text-blue-200/60 hover:text-white hover:bg-white/10'
                  : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
              }`}
              title={dict.logout}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col pb-20 md:pb-8">
        {/* Top Header for non-dashboard subpages or mobile */}
        {(!isStudentDashboard || !isStudent) && (
          <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-[#dce5f0] h-14 flex items-center px-4 gap-3">
            <span className="md:hidden w-8 h-8 rounded-lg bg-[#063b78] text-white flex items-center justify-center font-black text-xs shrink-0">
              {initials}
            </span>
            <div className="min-w-0 flex-1 md:hidden">
              <div className="text-[13px] font-bold text-[#092f63] truncate">
                {portalUser.name}
              </div>
            </div>
            <div className="hidden md:block flex-1" />
            <PortalNotificationBell />
            <div className="flex items-center bg-[#f0f5fc] border border-[#dce5f0] rounded-xl p-0.5">
              <button
                type="button"
                onClick={() => setLang('bn')}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                  lang === 'bn' ? 'bg-[#063b78] text-white' : 'text-[#64748b]'
                }`}
              >
                বাংলা
              </button>
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                  lang === 'en' ? 'bg-[#063b78] text-white' : 'text-[#64748b]'
                }`}
              >
                EN
              </button>
            </div>
            <button
              type="button"
              className="md:hidden p-2 rounded-xl text-slate-700 hover:bg-slate-100"
              aria-label={dict.menu}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </header>
        )}

        {/* Mobile Slide-over Menu */}
        {menuOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <button
              aria-label="Close menu"
              className="absolute inset-0 bg-black/50"
              onClick={() => setMenuOpen(false)}
            />
            <div className="relative w-64 h-full bg-[#041e46] text-white p-5 flex flex-col gap-2">
              <div className="flex items-center gap-3 pb-4 border-b border-white/10 mb-2">
                <div className="w-9 h-9 rounded-full bg-blue-500/20 text-white font-bold text-xs flex items-center justify-center border border-white/20">
                  {initials}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-[13px] truncate">{portalUser.name}</div>
                  <div className="text-[11px] text-blue-200/60">
                    {isStudent ? dict.studentRole : dict.guardianRole}
                  </div>
                </div>
              </div>

              {navItems.map((item) => {
                const IconComp = item.icon;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-blue-100/80 hover:bg-white/10 hover:text-white"
                  >
                    <IconComp className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}

              <Link
                href={isStudent ? '/portal/student/profile' : '/portal/guardian/profile'}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-blue-100/80 hover:bg-white/10 hover:text-white mt-auto"
              >
                <User className="w-4 h-4" />
                <span>{dict.nav.profile}</span>
              </Link>
              <Link
                href="/portal/change-password"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-blue-100/80 hover:bg-white/10 hover:text-white"
              >
                <Lock className="w-4 h-4" />
                <span>{dict.changePassword}</span>
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-rose-300 hover:bg-rose-500/20 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>{dict.logout}</span>
              </button>
            </div>
          </div>
        )}

        {/* Page Content */}
        <main className={`flex-1 min-w-0 ${isStudentDashboard ? 'p-0 md:p-8' : 'p-4 md:p-6'}`}>
          {children}
        </main>
      </div>

      {/* 
        MOBILE BOTTOM NAVIGATION BAR:
        - Exact 4 items from Mobile Mockup: Home, Timetable, Results, Material
      */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[#dce5f0] flex items-stretch h-16 shadow-lg">
        {isStudent ? (
          <>
            <Link
              href="/portal/student"
              className={`flex-1 flex flex-col items-center justify-center gap-1 ${
                pathname === '/portal/student' ? 'text-[#063b78] font-bold' : 'text-slate-400'
              }`}
            >
              <LayoutGrid className="w-5 h-5" />
              <span className="text-[10px] font-semibold">{lang === 'bn' ? 'হোম' : 'Home'}</span>
            </Link>
            <Link
              href="/portal/student/timetable"
              className={`flex-1 flex flex-col items-center justify-center gap-1 ${
                pathname === '/portal/student/timetable' ? 'text-[#063b78] font-bold' : 'text-slate-400'
              }`}
            >
              <Calendar className="w-5 h-5" />
              <span className="text-[10px] font-semibold">{lang === 'bn' ? 'রুটিন' : 'Timetable'}</span>
            </Link>
            <Link
              href="/portal/student/results"
              className={`flex-1 flex flex-col items-center justify-center gap-1 ${
                pathname?.startsWith('/portal/student/results') ? 'text-[#063b78] font-bold' : 'text-slate-400'
              }`}
            >
              <Award className="w-5 h-5" />
              <span className="text-[10px] font-semibold">{lang === 'bn' ? 'ফলাফল' : 'Results'}</span>
            </Link>
            <Link
              href="/portal/student/materials"
              className={`flex-1 flex flex-col items-center justify-center gap-1 ${
                pathname?.startsWith('/portal/student/materials') ? 'text-[#063b78] font-bold' : 'text-slate-400'
              }`}
            >
              <BookOpen className="w-5 h-5" />
              <span className="text-[10px] font-semibold">{lang === 'bn' ? 'মেটেরিয়াল' : 'Material'}</span>
            </Link>
          </>
        ) : (
          guardianNavItems.map((item) => {
            const active = pathname === item.href;
            const IconComp = item.icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex-1 flex flex-col items-center justify-center gap-1 ${
                  active ? 'text-[#063b78] font-bold' : 'text-slate-400'
                }`}
              >
                <IconComp className="w-5 h-5" />
                <span className="text-[10.5px] font-semibold">{item.label}</span>
              </Link>
            );
          })
        )}
      </nav>
    </div>
  );
}
