'use client';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import MobileNav from './MobileNav';
import { useApp } from '@/lib/store';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { toast } = useApp();
  const pathname = usePathname();

  // The student/guardian portal has its own layout/shell (components/portal)
  // and its own auth — it must never inherit the staff sidebar/topbar.
  if (pathname?.startsWith('/portal')) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-[#f5f8fd]">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col pb-16 md:pb-0">
        <TopBar />
        <main className="flex-1 min-w-0 p-4 md:p-6">{children}</main>
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
