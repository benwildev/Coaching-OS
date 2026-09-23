'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from './Icon';
import { NAV, DATA } from '@/lib/data';
import { useApp } from '@/lib/store';

function NavLink({ id, label, icon, collapsed, active, onClick }: { id: string; label: string; icon: string; collapsed: boolean; active: boolean; onClick?: () => void }) {
  return (
    <Link
      href={id === 'dashboard' ? '/' : `/${id}`}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold transition-colors ${
        active ? 'bg-[#ffd500] text-[#00296b]' : 'text-[#e9eef7] hover:bg-white/10'
      }`}
      title={collapsed ? label : undefined}
    >
      <Icon name={icon} size={19} className="shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

export function SidebarContent({ collapsed, onNavigate, onToggleCollapse }: { collapsed: boolean; onNavigate?: () => void; onToggleCollapse?: () => void }) {
  const pathname = usePathname();
  const activeId = pathname === '/' ? 'dashboard' : pathname.replace('/', '');
  return (
    <div
      className="h-full flex flex-col gap-1 p-3 text-[#e9eef7] relative overflow-hidden"
      style={{ background: 'radial-gradient(120% 60% at 0% 0%, #003f88 0%, rgba(0,63,136,0) 60%), linear-gradient(180deg, #00296b 0%, #001d4d 100%)' }}
    >
      <div className={`flex items-center gap-2.5 px-2 py-3 mb-2 ${collapsed ? 'justify-center' : ''}`}>
        <span className="w-9 h-9 rounded-xl bg-[#ffd500] text-[#00296b] flex items-center justify-center font-extrabold dsp shrink-0">A</span>
        {!collapsed && (
          <div className="min-w-0 grow">
            <div className="dsp font-bold text-sm text-white truncate">{DATA.org.short}</div>
            <div className="text-[11px] text-[#8fb3de] truncate">{DATA.org.campus}</div>
          </div>
        )}
        {onToggleCollapse && (
          <button type="button" onClick={onToggleCollapse} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="hidden md:flex ibtn text-white hover:bg-white/10 shrink-0">
            <Icon name="panel" size={16} />
          </button>
        )}
      </div>
      <nav className="flex flex-col gap-1 overflow-y-auto scroll">
        {NAV.map((n) => (
          <NavLink key={n.id} id={n.id} label={n.label} icon={n.icon} collapsed={collapsed} active={activeId === n.id} onClick={onNavigate} />
        ))}
      </nav>
      <div className="mt-auto pt-2 flex flex-col gap-2 border-t border-white/10">
        {!collapsed ? (
          <div className="rounded-xl p-3 bg-white/5 border border-white/10 flex flex-col gap-2">
            <div className="text-[10px] font-extrabold text-[#ffd500] tracking-wider uppercase">
              Phase 6 · Complete Prototype
            </div>
            <div className="text-[11px] text-[#8fb3de] leading-snug">
              Every page is live, final content and SSR/client-hybrid ready.
            </div>
            <button
              type="button"
              onClick={() => alert('Project handoff documentation package (demo)')}
              className="w-full bg-[#ffd500] hover:bg-[#ffdf00] text-[#00296b] font-bold text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-sm"
            >
              <Icon name="download" size={14} />
              <span>Project handoff</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            title="Project handoff"
            onClick={() => alert('Project handoff documentation package (demo)')}
            className="w-full h-9 bg-[#ffd500] hover:bg-[#ffdf00] text-[#00296b] rounded-lg flex items-center justify-center"
          >
            <Icon name="download" size={16} />
          </button>
        )}

        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-[#c7d4e6] hover:text-white hover:bg-white/10 text-xs font-semibold transition-colors ${collapsed ? 'justify-center' : ''}`}
          >
            <Icon name="panel" size={16} />
            {!collapsed && <span>Collapse</span>}
          </button>
        )}

        <div className={`flex items-center gap-2.5 px-2 py-1.5 ${collapsed ? 'justify-center' : ''}`}>
          <span className="w-8 h-8 rounded-full bg-[#8fb3de] text-[#00296b] flex items-center justify-center text-xs font-bold shrink-0">{DATA.user.initials}</span>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold text-white truncate">{DATA.user.name}</div>
              <div className="text-[11px] text-[#8fb3de] truncate">{DATA.user.role}</div>
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
    <aside className="hidden md:flex flex-col shrink-0 h-screen sticky top-0 transition-[width] duration-200" style={{ width: collapsed ? 76 : 248 }}>
      <SidebarContent collapsed={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)} />
    </aside>
  );
}
