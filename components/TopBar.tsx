'use client';
import { useState } from 'react';
import Icon from './Icon';
import { DATA, NAV, QUICK, RANGES } from '@/lib/data';
import { useApp } from '@/lib/store';
import { usePathname } from 'next/navigation';

export default function TopBar() {
  const { cls, setCls, range, setRangeId, setMobileNav, showToast } = useApp();
  const [menu, setMenu] = useState<null | 'class' | 'range' | 'notif' | 'quick' | 'profile'>(null);
  const pathname = usePathname();
  const activeId = pathname === '/' ? 'dashboard' : pathname.replace('/', '');
  const pageTitle = NAV.find((n) => n.id === activeId)?.label || 'Dashboard';
  const clsLabel = cls === 'all' ? 'All classes' : DATA.classes.find((c: any) => c.id === cls)?.name;
  const unread = DATA.notifications.filter((n: any) => n.unread).length;

  const toggle = (m: typeof menu) => setMenu(menu === m ? null : m);

  return (
    <header className="sticky top-0 z-30 bg-[#f5f8fd]/90 backdrop-blur border-b border-[#d8e1ee]">
      <div className="flex items-center gap-2 px-4 md:px-6 h-16">
        <button type="button" className="md:hidden ibtn" aria-label="Open menu" onClick={() => setMobileNav(true)}>
          <Icon name="menu" size={20} />
        </button>

        <div className="min-w-0 mr-2">
          <div className="dsp font-bold text-[#00296b] text-[15px] md:text-base truncate">{pageTitle}</div>
          <div className="hidden sm:block text-[11.5px] text-[#55637a] truncate">{DATA.org.today} · as of {DATA.org.asOf}</div>
        </div>

        <div className="hidden lg:flex items-center gap-1.5 ml-2 border-l border-[#d8e1ee] pl-3">
          <Icon name="search" size={16} className="text-[#55637a]" />
          <input placeholder="Search students, batches, receipts…" className="text-[13.5px] bg-transparent outline-none w-56 placeholder:text-[#8795ab]" />
        </div>

        <div className="grow" />

        <div className="relative hidden sm:block">
          <button type="button" className="tb" onClick={() => toggle('class')} aria-haspopup="listbox" aria-expanded={menu === 'class'}>
            <Icon name="building" size={15} />
            <span>{clsLabel}</span>
            <Icon name="chevdown" size={14} />
          </button>
          {menu === 'class' && (
            <>
              <button className="fixed inset-0 z-40" aria-hidden onClick={() => setMenu(null)} />
              <div className="menu-pop absolute right-0 mt-2 w-56 bg-white border border-[#d8e1ee] rounded-2xl shadow-2xl p-1.5 z-50">
                {[{ id: 'all', name: 'All classes' }, ...DATA.classes].map((c: any) => (
                  <button
                    key={c.id}
                    role="option"
                    aria-selected={cls === c.id}
                    className={`mi w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[13.5px] ${cls === c.id ? 'bg-[#e6effa] text-[#001d4d] font-bold' : 'text-[#1f2d44] hover:bg-[#eef3fa]'}`}
                    onClick={() => { setCls(c.id); setMenu(null); }}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="relative hidden md:block">
          <button type="button" className="tb" onClick={() => toggle('range')} aria-haspopup="listbox" aria-expanded={menu === 'range'}>
            <Icon name="calendar" size={15} />
            <span>{range.label}</span>
            <Icon name="chevdown" size={14} />
          </button>
          {menu === 'range' && (
            <>
              <button className="fixed inset-0 z-40" aria-hidden onClick={() => setMenu(null)} />
              <div className="menu-pop absolute right-0 mt-2 w-56 bg-white border border-[#d8e1ee] rounded-2xl shadow-2xl p-1.5 z-50">
                {RANGES.map((r) => (
                  <button
                    key={r.id}
                    className={`mi w-full flex flex-col items-start px-2.5 py-2 rounded-lg text-left ${range.id === r.id ? 'bg-[#e6effa] text-[#001d4d] font-bold' : 'text-[#1f2d44] hover:bg-[#eef3fa]'}`}
                    onClick={() => { setRangeId(r.id); setMenu(null); }}
                  >
                    <span className="text-[13.5px]">{r.label}</span>
                    <span className="text-[11px] text-[#55637a]">{r.sub}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="relative">
          <button type="button" className="primary hidden sm:inline-flex" onClick={() => toggle('quick')}>
            <Icon name="plus" size={16} />
            <span>Quick actions</span>
          </button>
          <button type="button" className="ibtn sm:hidden" aria-label="Quick actions" onClick={() => toggle('quick')}>
            <Icon name="plus" size={20} />
          </button>
          {menu === 'quick' && (
            <>
              <button className="fixed inset-0 z-40" aria-hidden onClick={() => setMenu(null)} />
              <div className="menu-pop absolute right-0 mt-2 w-64 bg-white border border-[#d8e1ee] rounded-2xl shadow-2xl p-1.5 z-50">
                {QUICK.map((q) => (
                  <button key={q.id} className="mi w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[13.5px] text-[#1f2d44] hover:bg-[#eef3fa]" onClick={() => { setMenu(null); showToast(q.label + ' (demo)'); }}>
                    <Icon name={q.icon} size={16} className="text-[#00296b]" />
                    {q.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="relative">
          <button type="button" className="ibtn" aria-label="Notifications" onClick={() => toggle('notif')}>
            <Icon name="bell" size={19} />
            {unread > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#fdc500] ring-1 ring-white" />}
          </button>
          {menu === 'notif' && (
            <>
              <button className="fixed inset-0 z-40" aria-hidden onClick={() => setMenu(null)} />
              <div className="menu-pop absolute right-0 mt-2 w-80 bg-white border border-[#d8e1ee] rounded-2xl shadow-2xl p-1.5 z-50 max-h-96 overflow-y-auto scroll">
                <div className="px-2.5 py-2 text-xs font-bold text-[#55637a] uppercase tracking-wide">Notifications</div>
                {DATA.notifications.map((n: any) => (
                  <div key={n.id} className="flex items-start gap-2.5 px-2.5 py-2.5 rounded-lg hover:bg-[#eef3fa]">
                    <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${n.unread ? 'bg-[#fdc500]' : 'bg-transparent'}`} />
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold text-[#00296b]">{n.title}</div>
                      <div className="text-[12px] text-[#3b4a63]">{n.body}</div>
                      <div className="text-[11px] text-[#55637a] mt-0.5">{n.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="relative">
          <button type="button" className="flex items-center gap-2 pl-1 pr-2 h-10 rounded-xl hover:bg-[#e9eef7]" onClick={() => toggle('profile')}>
            <span className="w-8 h-8 rounded-full bg-[#00296b] text-white flex items-center justify-center text-xs font-bold">{DATA.user.initials}</span>
            <Icon name="chevdown" size={14} className="hidden sm:block text-[#55637a]" />
          </button>
          {menu === 'profile' && (
            <>
              <button className="fixed inset-0 z-40" aria-hidden onClick={() => setMenu(null)} />
              <div className="menu-pop absolute right-0 mt-2 w-56 bg-white border border-[#d8e1ee] rounded-2xl shadow-2xl p-1.5 z-50">
                <div className="px-2.5 py-2 border-b border-[#edf1f7] mb-1">
                  <div className="text-[13.5px] font-bold text-[#00296b]">{DATA.user.name}</div>
                  <div className="text-[11.5px] text-[#55637a]">{DATA.user.role}</div>
                </div>
                <a href="/settings" className="mi w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[13.5px] text-[#1f2d44] hover:bg-[#eef3fa]">
                  <Icon name="sliders" size={16} /> Settings
                </a>
                <button className="mi w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[13.5px] text-[#1f2d44] hover:bg-[#eef3fa]" onClick={() => { setMenu(null); showToast('Signed out (demo)'); }}>
                  <Icon name="logout" size={16} /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
