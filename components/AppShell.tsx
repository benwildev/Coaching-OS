'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import MobileNav from './MobileNav';
import DynamicFavicon from './DynamicFavicon';
import ForbiddenState from './ForbiddenState';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';
import { canAccessRoute, isUnguardedPath } from '@/lib/route-access';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { toast, currentCenter, currentUser, authStatus, lang } = useApp();
  const pathname = usePathname();
  const router = useRouter();

  // The login, setup, super-admin, and student/guardian portal pages have their own full-screen
  // layouts and must never inherit the staff sidebar/topbar (or the staff page guard).
  const unguarded = isUnguardedPath(pathname ?? '');

  // A signed-out visitor never sees protected pages: send them to sign-in.
  useEffect(() => {
    if (!unguarded && authStatus === 'unauthenticated') router.replace('/login');
  }, [unguarded, authStatus, router]);

  if (unguarded) {
    return <>{children}</>;
  }

  // Page authorization (Phase 14.2): the page is only MOUNTED once we know
  // who the user is and that they hold the page's permission, so a forbidden
  // page never renders and never fires its data requests. Unknown route =
  // forbidden. The API behind each page enforces its permission independently.
  let content: React.ReactNode;
  if (authStatus !== 'authenticated') {
    content = (
      <div className="p-8 text-center text-sm text-[#64748b]" role="status">
        {DICTIONARY[lang].forbidden.loading}
      </div>
    );
  } else if (canAccessRoute(currentUser, pathname ?? '')) {
    content = children;
  } else {
    content = <ForbiddenState />;
  }

  return (
    <div className="flex min-h-screen bg-[#f5f8fd]">
      <DynamicFavicon url={currentCenter?.branding?.faviconUrl} />
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col pb-16 md:pb-0">
        <TopBar />
        <main className="flex-1 min-w-0 p-4 md:p-6">{content}</main>
      </div>
      <MobileNav />
      {toast && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-[#00296b] text-white text-[13.5px] font-semibold px-4 py-2.5 rounded-full shadow-2xl fade-in">
          {toast.msg}
        </div>
      )}
    </div>
  );
}
