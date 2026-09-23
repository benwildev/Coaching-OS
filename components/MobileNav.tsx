'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from './Icon';
import { NAV } from '@/lib/data';
import { useApp } from '@/lib/store';
import { SidebarContent } from './Sidebar';

const BOTTOM = ['dashboard', 'students', 'fees', 'attendance'];

export default function MobileNav() {
  const pathname = usePathname();
  const activeId = pathname === '/' ? 'dashboard' : pathname.replace('/', '');
  const { mobileNav, setMobileNav } = useApp();

  return (
    <>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[#d8e1ee] flex items-stretch h-16">
        {BOTTOM.map((id) => {
          const n = NAV.find((x) => x.id === id)!;
          const active = activeId === id;
          return (
            <Link key={id} href={id === 'dashboard' ? '/' : `/${id}`} className={`flex-1 flex flex-col items-center justify-center gap-0.5 ${active ? 'text-[#00296b]' : 'text-[#8795ab]'}`}>
              <Icon name={n.icon} size={20} />
              <span className="text-[10.5px] font-semibold">{n.label}</span>
            </Link>
          );
        })}
        <button type="button" onClick={() => setMobileNav(true)} className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[#8795ab]">
          <Icon name="menu" size={20} />
          <span className="text-[10.5px] font-semibold">More</span>
        </button>
      </nav>

      {mobileNav && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <button aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setMobileNav(false)} />
          <div className="relative w-72 h-full">
            <SidebarContent collapsed={false} onNavigate={() => setMobileNav(false)} />
          </div>
        </div>
      )}
    </>
  );
}
