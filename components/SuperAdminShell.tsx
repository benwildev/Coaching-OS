'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';

/* ─── SVG Icons (inline, no deps) ──────────────────────────────────────────── */
const Icons = {
  dashboard: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2" y="2" width="7" height="8" rx="2" fill="currentColor" opacity="0.85"/><rect x="11" y="2" width="7" height="5" rx="2" fill="currentColor" opacity="0.55"/><rect x="2" y="12" width="7" height="6" rx="2" fill="currentColor" opacity="0.55"/><rect x="11" y="9" width="7" height="9" rx="2" fill="currentColor" opacity="0.85"/></svg>
  ),
  centers: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 2L3 7v11h5v-5h4v5h5V7l-7-5z" fill="currentColor" opacity="0.8"/></svg>
  ),
  plans: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.8" fill="none"/><path d="M7 7h6M7 10h4M7 13h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
  ),
  menu: (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M4 6h14M4 11h14M4 16h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
  ),
  close: (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M6 6l10 10M16 6L6 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
  ),
  globe: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/><ellipse cx="8" cy="8" rx="3" ry="6" stroke="currentColor" strokeWidth="1.2"/><path d="M2.5 6h11M2.5 10h11" stroke="currentColor" strokeWidth="1.1"/></svg>
  ),
  logout: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M12 5l4 4-4 4M16 9H7M7 3H4a2 2 0 00-2 2v8a2 2 0 002 2h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ),
};

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => {
    fetch('/api/super-admin/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated) setAdmin(d.admin);
        else router.replace('/login');
      })
      .catch(() => router.replace('/login'))
      .finally(() => setChecked(true));
  }, [router]);

  // Close sidebar on route change
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  if (!checked || !admin) return <div className="min-h-screen bg-[#f5f8fc]" />;

  const nav = [
    { href: '/super-admin/dashboard', label: t.dashboard, icon: Icons.dashboard },
    { href: '/super-admin/coaching-centers', label: t.centers, icon: Icons.centers },
    { href: '/super-admin/plans', label: t.plans, icon: Icons.plans },
  ];

  const initials = admin.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const signOut = async () => {
    await fetch('/api/super-admin/auth/logout', { method: 'POST' });
    window.location.assign('/login');
  };

  const sidebarContent = (
    <>
      {/* Logo area */}
      <div className="sa-sidebar-logo">
        <span className="sa-logo-mark">S</span>
        <span className="sa-logo-text">{t.platform}</span>
      </div>

      {/* Navigation */}
      <nav className="sa-sidebar-nav">
        {nav.map((n) => {
          const active = pathname?.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} className={`sa-nav-item ${active ? 'sa-nav-active' : ''}`}>
              <span className="sa-nav-icon">{n.icon}</span>
              <span>{n.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="sa-sidebar-bottom">
        <button
          type="button"
          onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')}
          className="sa-lang-btn"
        >
          {Icons.globe}
          <span>{lang === 'bn' ? 'English' : 'বাংলা'}</span>
        </button>

        <div className="sa-user-block">
          <div className="sa-avatar">{initials}</div>
          <div className="sa-user-info">
            <div className="sa-user-name">{admin.name}</div>
            <div className="sa-user-email">{admin.email}</div>
          </div>
        </div>

        <button type="button" onClick={signOut} className="sa-logout-btn">
          {Icons.logout}
          <span>{t.signOut}</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="sa-shell">
      {/* ── Desktop sidebar ───────────────────────────────────────────── */}
      <aside className="sa-sidebar">{sidebarContent}</aside>

      {/* ── Mobile overlay ────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div className="sa-overlay" onClick={() => setSidebarOpen(false)}>
          <aside className="sa-drawer" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="sa-drawer-close" onClick={() => setSidebarOpen(false)} aria-label="Close">
              {Icons.close}
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* ── Main area ─────────────────────────────────────────────────── */}
      <div className="sa-main">
        {/* Mobile header */}
        <header className="sa-mobile-header">
          <button type="button" onClick={() => setSidebarOpen(true)} aria-label="Menu" className="sa-menu-btn">
            {Icons.menu}
          </button>
          <span className="sa-logo-mark" style={{ width: 28, height: 28, fontSize: 13 }}>S</span>
          <span className="sa-mobile-title">{t.platform}</span>
        </header>

        <main className="sa-content">{children}</main>
      </div>

      {/* ── Toast ─────────────────────────────────────────────────────── */}
      {toast && (
        <div className="sa-toast">{toast.msg}</div>
      )}

      <style>{`
        /* ── Shell grid ─────────────────────────────────────── */
        .sa-shell {
          display: flex;
          min-height: 100vh;
          background: #f3f6fb;
        }

        /* ── Sidebar ────────────────────────────────────────── */
        .sa-sidebar {
          position: fixed;
          top: 0; left: 0; bottom: 0;
          width: 248px;
          background: #052e5f;
          display: flex;
          flex-direction: column;
          z-index: 30;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.15) transparent;
        }
        @media (max-width: 868px) {
          .sa-sidebar { display: none; }
        }

        .sa-sidebar-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 22px 20px 18px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .sa-logo-mark {
          width: 34px; height: 34px;
          border-radius: 10px;
          background: #ffd200;
          color: #052e5f;
          font-weight: 900;
          font-size: 15px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .sa-logo-text {
          color: #fff;
          font-weight: 700;
          font-size: 15px;
          letter-spacing: -0.01em;
        }

        /* ── Nav links ──────────────────────────────────────── */
        .sa-sidebar-nav {
          flex: 1;
          padding: 12px 10px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .sa-nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 10px;
          color: rgba(255,255,255,0.7);
          font-size: 13.5px;
          font-weight: 600;
          transition: all 0.15s;
          text-decoration: none;
        }
        .sa-nav-item:hover {
          color: #fff;
          background: rgba(255,255,255,0.08);
        }
        .sa-nav-active {
          color: #ffd200 !important;
          background: rgba(255,210,0,0.1) !important;
        }
        .sa-nav-icon {
          display: flex;
          align-items: center;
          width: 20px;
          flex-shrink: 0;
        }

        /* ── Bottom section ─────────────────────────────────── */
        .sa-sidebar-bottom {
          padding: 12px 10px 16px;
          border-top: 1px solid rgba(255,255,255,0.08);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .sa-lang-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 8px;
          color: rgba(255,255,255,0.6);
          font-size: 12.5px;
          font-weight: 600;
          background: none;
          border: none;
          cursor: pointer;
          transition: all 0.15s;
        }
        .sa-lang-btn:hover {
          color: #fff;
          background: rgba(255,255,255,0.07);
        }
        .sa-user-block {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 10px;
          background: rgba(255,255,255,0.05);
        }
        .sa-avatar {
          width: 34px; height: 34px;
          border-radius: 10px;
          background: linear-gradient(135deg, #0f4f8b, #1a6cb5);
          color: #fff;
          font-size: 12px;
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          letter-spacing: 0.02em;
        }
        .sa-user-info {
          min-width: 0;
        }
        .sa-user-name {
          color: #fff;
          font-size: 13px;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .sa-user-email {
          color: rgba(255,255,255,0.45);
          font-size: 11.5px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .sa-logout-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 8px;
          color: rgba(255,255,255,0.55);
          font-size: 13px;
          font-weight: 600;
          background: none;
          border: none;
          cursor: pointer;
          transition: all 0.15s;
        }
        .sa-logout-btn:hover {
          color: #f87171;
          background: rgba(248,113,113,0.08);
        }

        /* ── Main area ──────────────────────────────────────── */
        .sa-main {
          flex: 1;
          margin-left: 248px;
          display: flex;
          flex-direction: column;
          min-height: 100vh;
        }
        @media (max-width: 868px) {
          .sa-main { margin-left: 0; }
        }
        .sa-content {
          flex: 1;
          max-width: 1200px;
          width: 100%;
          margin: 0 auto;
          padding: 28px 28px 40px;
        }
        @media (max-width: 868px) {
          .sa-content { padding: 16px 14px 32px; }
        }

        /* ── Mobile header ──────────────────────────────────── */
        .sa-mobile-header {
          display: none;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          background: #052e5f;
          position: sticky;
          top: 0;
          z-index: 20;
        }
        @media (max-width: 868px) {
          .sa-mobile-header { display: flex; }
        }
        .sa-menu-btn {
          background: none;
          border: none;
          color: #fff;
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
        }
        .sa-mobile-title {
          color: #fff;
          font-weight: 700;
          font-size: 14px;
        }

        /* ── Mobile drawer ──────────────────────────────────── */
        .sa-overlay {
          position: fixed;
          inset: 0;
          z-index: 50;
          background: rgba(0,0,0,0.5);
          animation: saFadeIn 0.2s ease;
        }
        .sa-drawer {
          position: absolute;
          top: 0; left: 0; bottom: 0;
          width: 272px;
          background: #052e5f;
          display: flex;
          flex-direction: column;
          animation: saSlideIn 0.25s ease;
        }
        .sa-drawer-close {
          position: absolute;
          top: 18px; right: 14px;
          background: none;
          border: none;
          color: rgba(255,255,255,0.6);
          cursor: pointer;
          padding: 4px;
          display: flex;
        }

        @keyframes saFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes saSlideIn { from { transform: translateX(-100%); } to { transform: translateX(0); } }

        /* ── Toast ──────────────────────────────────────────── */
        .sa-toast {
          position: fixed;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 60;
          background: #052e5f;
          color: #fff;
          font-size: 13.5px;
          font-weight: 600;
          padding: 10px 20px;
          border-radius: 12px;
          box-shadow: 0 8px 32px -8px rgba(5,46,95,0.5);
          animation: saFadeIn 0.25s ease;
        }
      `}</style>
    </div>
  );
}
