'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from './Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';

const NAV_ITEMS = [
  { id: 'dashboard', icon: 'chart', href: '/dashboard' },
  { id: 'students', icon: 'user', href: '/students' },
  { id: 'courses', icon: 'book', href: '/courses' },
  { id: 'batches', icon: 'layers', href: '/batches' },
  { id: 'routine', icon: 'calendar', href: '/routine' },
  { id: 'attendance', icon: 'check', href: '/attendance' },
  { id: 'fees', icon: 'wallet', href: '/fees' },
  { id: 'exams', icon: 'award', href: '/exams' },
  { id: 'teachers', icon: 'grad', href: '/teachers' },
  { id: 'communication', icon: 'message', href: '/communication' },
  { id: 'reports', icon: 'doc', href: '/reports' },
  { id: 'settings', icon: 'sliders', href: '/settings' },
];

function NavLink({
  label,
  icon,
  href,
  collapsed,
  active,
  onClick,
}: {
  label: string;
  icon: string;
  href: string;
  collapsed: boolean;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold transition-colors ${
        active
          ? 'bg-[#ffd200] text-[#063b78] shadow-xs'
          : 'text-[#e9eef7] hover:bg-white/10'
      }`}
      title={collapsed ? label : undefined}
    >
      <Icon name={icon} size={19} className="shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

export function SidebarContent({
  collapsed,
  onNavigate,
  onToggleCollapse,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  onToggleCollapse?: () => void;
}) {
  const pathname = usePathname();
  const { lang, currentCenter, currentUser } = useApp();
  const dict = DICTIONARY[lang].nav;

  const centerName =
    (lang === 'bn' && currentCenter?.banglaName) ||
    currentCenter?.name ||
    'Alokito Coaching';

  const campusName =
    currentCenter?.branches?.[0]?.name ||
    (currentCenter?.district ? `${currentCenter.district} Campus` : 'Main Campus');

  const userDisplayName =
    (lang === 'bn' && currentUser?.banglaName) ||
    currentUser?.name ||
    'Administrator';

  const userRole = currentUser?.role || 'OWNER';

  return (
    <div
      className="h-full flex flex-col gap-1 p-3 text-[#e9eef7] relative overflow-hidden"
      style={{
        background:
          'radial-gradient(120% 60% at 0% 0%, #063b78 0%, rgba(6,59,120,0) 60%), linear-gradient(180deg, #063b78 0%, #001d4d 100%)',
      }}
    >
      {/* Brand & Organization Title */}
      <div className={`flex items-center gap-2.5 px-2 py-3 mb-2 ${collapsed ? 'justify-center' : ''}`}>
        <span className="w-9 h-9 rounded-xl bg-[#ffd200] text-[#063b78] flex items-center justify-center font-black dsp text-lg shrink-0 shadow-sm">
          {centerName.charAt(0)}
        </span>
        {!collapsed && (
          <div className="min-w-0 grow">
            <div className="dsp font-bold text-sm text-white truncate">{centerName}</div>
            <div className="text-[11px] text-[#8fb3de] truncate">{campusName}</div>
          </div>
        )}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden md:flex ibtn text-white hover:bg-white/10 shrink-0"
          >
            <Icon name="panel" size={16} />
          </button>
        )}
      </div>

      {/* Navigation List */}
      <nav className="flex flex-col gap-1 overflow-y-auto scroll">
        {NAV_ITEMS.map((n) => {
          const label = (dict as any)[n.id] || n.id;
          const isActive = pathname === n.href || (n.id === 'dashboard' && pathname === '/');
          return (
            <NavLink
              key={n.id}
              label={label}
              icon={n.icon}
              href={n.href}
              collapsed={collapsed}
              active={isActive}
              onClick={onNavigate}
            />
          );
        })}
      </nav>

      {/* Bottom Area: Phase status, Collapse and User Profile */}
      <div className="mt-auto pt-2 flex flex-col gap-2 border-t border-white/10">
        {!collapsed && (
          <div className="rounded-xl p-3 bg-white/5 border border-white/10 flex flex-col gap-1.5">
            <div className="text-[10px] font-extrabold text-[#ffd200] tracking-wider uppercase">
              Phase 1 Foundation
            </div>
            <div className="text-[11px] text-[#8fb3de] leading-snug">
              Bangladesh-first configurable architecture & multi-tenant isolation.
            </div>
          </div>
        )}

        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-[#c7d4e6] hover:text-white hover:bg-white/10 text-xs font-semibold transition-colors ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            <Icon name="panel" size={16} />
            {!collapsed && <span>Collapse Sidebar</span>}
          </button>
        )}

        {/* User Card */}
        <div className={`flex items-center gap-2.5 px-2 py-1.5 ${collapsed ? 'justify-center' : ''}`}>
          <span className="w-8 h-8 rounded-full bg-[#8fb3de] text-[#063b78] flex items-center justify-center text-xs font-bold shrink-0">
            {userDisplayName.charAt(0)}
          </span>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold text-white truncate">{userDisplayName}</div>
              <div className="text-[11px] text-[#ffd200] font-bold truncate">{userRole}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const { collapsed, setCollapsed } = useApp();
  return (
    <aside
      className="hidden md:flex flex-col shrink-0 h-screen sticky top-0 transition-[width] duration-200"
      style={{ width: collapsed ? 76 : 252 }}
    >
      <SidebarContent collapsed={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)} />
    </aside>
  );
}
