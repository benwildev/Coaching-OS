'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from './Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';
import { filterNavigation, isNavActive, type NavItem } from '@/lib/navigation';

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

/** One navigation entry (and its already-filtered children, if any). */
function NavTree({
  item,
  pathname,
  dict,
  collapsed,
  onNavigate,
  accentColor,
  primaryColor,
  depth = 0,
}: {
  item: NavItem;
  pathname: string;
  dict: Record<string, string>;
  collapsed: boolean;
  onNavigate?: () => void;
  accentColor: string;
  primaryColor: string;
  depth?: number;
}) {
  return (
    <>
      <NavLink
        label={dict[item.id] || item.id}
        icon={item.icon}
        href={item.href}
        collapsed={collapsed}
        active={isNavActive(pathname, item.href)}
        onClick={onNavigate}
        accentColor={accentColor}
        primaryColor={primaryColor}
      />
      {item.children?.map((child) => (
        <div key={child.id} className={collapsed ? '' : 'pl-3'}>
          <NavTree
            item={child}
            pathname={pathname}
            dict={dict}
            collapsed={collapsed}
            onNavigate={onNavigate}
            accentColor={accentColor}
            primaryColor={primaryColor}
            depth={depth + 1}
          />
        </div>
      ))}
    </>
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
  const { lang, currentCenter, currentUser, authStatus } = useApp();
  const dict = DICTIONARY[lang].nav;
  // Single permission-driven navigation (shared with the mobile bottom bar): nothing until the user is known.
  const navItems = filterNavigation(currentUser, currentCenter?.features);

  const centerName =
    (lang === 'bn' && currentCenter?.banglaName) ||
    currentCenter?.name ||
    'Coaching OS';

  const campusName =
    currentCenter?.branches?.[0]?.name ||
    (currentCenter?.district ? `${currentCenter.district} Campus` : 'Main Campus');

  // No role/name fallback: a loading or logged-out user must never look like anyone (least of all the Owner).
  const userDisplayName =
    (lang === 'bn' && currentUser?.banglaName) ||
    currentUser?.name ||
    '';

  const userRole = currentUser?.role ?? '';

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
        {authStatus === 'loading' &&
          [0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 rounded-xl bg-white/10 animate-pulse" aria-hidden />
          ))}
        {navItems.map((n) => (
          <NavTree
            key={n.id}
            item={n}
            pathname={pathname}
            dict={dict as Record<string, string>}
            collapsed={collapsed}
            onNavigate={onNavigate}
            accentColor={accentColor}
            primaryColor={primaryColor}
          />
        ))}
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
