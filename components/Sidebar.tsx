'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from './Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';

const NAV_ITEMS: { id: string; icon: string; href: string; staffOnly?: boolean; feature?: string }[] = [
  { id: 'dashboard', icon: 'chart', href: '/dashboard' },
  { id: 'students', icon: 'user', href: '/students' },
  { id: 'courses', icon: 'book', href: '/courses' },
  { id: 'batches', icon: 'layers', href: '/batches' },
  { id: 'routine', icon: 'calendar', href: '/routine' },
  { id: 'attendance', icon: 'check', href: '/attendance' },
  { id: 'fees', icon: 'wallet', href: '/fees' },
  { id: 'salary', icon: 'banknote', href: '/salary', staffOnly: true },
  { id: 'exams', icon: 'award', href: '/exams' },
  { id: 'questions', icon: 'target', href: '/questions' },
  { id: 'questionPapers', icon: 'file', href: '/question-papers' },
  { id: 'materials', icon: 'book', href: '/materials' },
  { id: 'homework', icon: 'calcheck', href: '/homework', feature: 'HOMEWORK' },
  { id: 'teachers', icon: 'grad', href: '/teachers' },
  { id: 'notifications', icon: 'bell', href: '/notifications' },
  { id: 'notices', icon: 'pin', href: '/notices' },
  { id: 'communication', icon: 'message', href: '/communication', staffOnly: true },
  { id: 'reports', icon: 'doc', href: '/reports', feature: 'ADVANCED_REPORTS' },
  { id: 'settings', icon: 'sliders', href: '/settings' },
];

function NavLink({
  label,
  icon,
  href,
  collapsed,
  active,
  onClick,
  accentColor,
  primaryColor,
}: {
  label: string;
  icon: string;
  href: string;
  collapsed: boolean;
  active: boolean;
  onClick?: () => void;
  accentColor: string;
  primaryColor: string;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold transition-colors ${active ? 'shadow-xs' : 'text-[#e9eef7] hover:bg-white/10'
        }`}
      style={active ? { backgroundColor: accentColor, color: primaryColor } : undefined}
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
    'Coaching OS';

  const campusName =
    currentCenter?.branches?.[0]?.name ||
    (currentCenter?.district ? `${currentCenter.district} Campus` : 'Main Campus');

  const userDisplayName =
    (lang === 'bn' && currentUser?.banglaName) ||
    currentUser?.name ||
    'Administrator';

  const userRole = currentUser?.role || 'OWNER';

  const primaryColor = currentCenter?.branding?.primaryColor || '#063b78';
  const secondaryColor = currentCenter?.branding?.secondaryColor || '#001d4d';
  const accentColor = currentCenter?.branding?.accentColor || '#ffd200';
  const logoUrl = currentCenter?.branding?.logoUrl;

  return (
    <div
      className="h-full flex flex-col gap-1 p-3 text-[#e9eef7] relative overflow-hidden"
      style={{
        background: `radial-gradient(120% 60% at 0% 0%, ${primaryColor} 0%, ${primaryColor}00 60%), linear-gradient(180deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
      }}
    >
      {/* Brand & Organization Title */}
      <div className={`flex items-center gap-2.5 px-2 py-3 mb-2 ${collapsed ? 'justify-center' : ''}`}>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={centerName} className="w-9 h-9 rounded-xl object-cover shrink-0 shadow-sm bg-white" />
        ) : (
          <span
            className="w-9 h-9 rounded-xl flex items-center justify-center font-black dsp text-lg shrink-0 shadow-sm"
            style={{ backgroundColor: accentColor, color: primaryColor }}
          >
            {centerName.charAt(0)}
          </span>
        )}
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
        {NAV_ITEMS.filter((n) => (!n.staffOnly || userRole !== 'TEACHER') && !(n.feature && currentCenter?.features?.[n.feature] === false)).map((n) => {
          const label = (dict as any)[n.id] || n.id;
          const isActive =
            pathname === n.href ||
            pathname.startsWith(`${n.href}/`) ||
            (n.id === 'dashboard' && pathname === '/');
          return (
            <NavLink
              key={n.id}
              label={label}
              icon={n.icon}
              href={n.href}
              collapsed={collapsed}
              active={isActive}
              onClick={onNavigate}
              accentColor={accentColor}
              primaryColor={primaryColor}
            />
          );
        })}
      </nav>
      <div className="mt-auto pt-2 flex flex-col gap-2 border-t border-white/10">


        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-[#c7d4e6] hover:text-white hover:bg-white/10 text-xs font-semibold transition-colors ${collapsed ? 'justify-center' : ''
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
              <div className="text-[11px] font-bold truncate" style={{ color: accentColor }}>{userRole}</div>
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
