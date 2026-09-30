'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate, localizeNumber } from '@/lib/i18n';
import { saApi } from '@/lib/super-admin-client';

interface Dashboard {
  period: string;
  tenants: Record<string, number>;
  usage: { students: number; teachers: number; staff: number; sms: number; whatsapp: number; email: number };
  expiringSoon: Array<{ id: string; name: string; code: string; plan: string; endDate: string; daysLeft: number; status: string }>;
}

/* ─── Inline icons ─────────────────────────────────────────────────────────── */
const I = {
  total:     <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="3" y="3" width="7" height="7" rx="2" fill="currentColor"/><rect x="12" y="3" width="7" height="7" rx="2" fill="currentColor" opacity="0.5"/><rect x="3" y="12" width="7" height="7" rx="2" fill="currentColor" opacity="0.5"/><rect x="12" y="12" width="7" height="7" rx="2" fill="currentColor" opacity="0.3"/></svg>,
  active:    <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/><path d="M8 11l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  trial:     <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/><path d="M11 7v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  pastdue:   <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M11 4l7.5 13H3.5L11 4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M11 10v2M11 14.5v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  expired:   <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/><path d="M8.5 8.5l5 5M13.5 8.5l-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  cancelled: <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/><path d="M7.5 11h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  suspended: <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/><rect x="9" y="8" width="1.8" height="6" rx="0.9" fill="currentColor"/><rect x="11.5" y="8" width="1.8" height="6" rx="0.9" fill="currentColor"/></svg>,
  legacy:    <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="4" y="4" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.8"/><path d="M9 11h4M11 9v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  students:  <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.6"/><path d="M3.5 17a6.5 6.5 0 0113 0" stroke="currentColor" strokeWidth="1.6"/></svg>,
  teachers:  <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="6.5" r="3" stroke="currentColor" strokeWidth="1.6"/><path d="M4 16.5a6 6 0 0112 0" stroke="currentColor" strokeWidth="1.6"/><path d="M15 8l2 1.5-2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  staff:     <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="4" y="3" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.6"/><circle cx="10" cy="8" r="2" stroke="currentColor" strokeWidth="1.4"/><path d="M7 14a3 3 0 016 0" stroke="currentColor" strokeWidth="1.4"/></svg>,
  sms:       <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.6"/><path d="M6 15l2-2h5l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>,
  whatsapp:  <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.6"/><path d="M7 12l-.5 2 2-.5M7 12a4 4 0 005-5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  email:     <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="5" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.6"/><path d="M3 7l7 4 7-4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>,
  clock:     <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.5"/><path d="M9 5.5V9l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  arrow:     <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

const TILE_STYLES: Record<string, { bg: string; text: string; iconColor: string; accent: string }> = {
  total:     { bg: '#eef3fa', text: '#063b78', iconColor: '#063b78', accent: '#063b78' },
  ACTIVE:    { bg: '#ecfdf5', text: '#065f46', iconColor: '#059669', accent: '#059669' },
  TRIAL:     { bg: '#eff6ff', text: '#1e40af', iconColor: '#3b82f6', accent: '#3b82f6' },
  PAST_DUE:  { bg: '#fff7ed', text: '#9a3412', iconColor: '#ea580c', accent: '#ea580c' },
  EXPIRED:   { bg: '#fffbeb', text: '#92400e', iconColor: '#d97706', accent: '#d97706' },
  CANCELLED: { bg: '#f1f5f9', text: '#475569', iconColor: '#64748b', accent: '#64748b' },
  SUSPENDED: { bg: '#fef2f2', text: '#991b1b', iconColor: '#dc2626', accent: '#dc2626' },
  LEGACY:    { bg: '#f8fafc', text: '#64748b', iconColor: '#94a3b8', accent: '#94a3b8' },
};

const TILE_ICONS: Record<string, React.ReactNode> = {
  total: I.total, ACTIVE: I.active, TRIAL: I.trial, PAST_DUE: I.pastdue,
  EXPIRED: I.expired, CANCELLED: I.cancelled, SUSPENDED: I.suspended, LEGACY: I.legacy,
};

export default function SuperAdminDashboardPage() {
  const { lang } = useApp();
  const t = DICTIONARY[lang].superAdmin;
  const [d, setD] = useState<Dashboard | null>(null);
  const num = (n: number) => localizeNumber(lang, n);

  useEffect(() => {
    saApi<{ dashboard: Dashboard }>('/api/super-admin/dashboard').then((r) => r.ok && setD(r.data.dashboard));
  }, []);

  if (!d) return (
    <div className="py-20 flex justify-center">
      <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-[#063b78] border-t-transparent" />
    </div>
  );

  const tiles: Array<[string, number, string]> = [
    [t.totalCenters, d.tenants.total, 'total'],
    [t.active, d.tenants.ACTIVE, 'ACTIVE'],
    [t.trial, d.tenants.TRIAL, 'TRIAL'],
    [t.pastDue, d.tenants.PAST_DUE, 'PAST_DUE'],
    [t.expired, d.tenants.EXPIRED, 'EXPIRED'],
    [t.cancelled, d.tenants.CANCELLED, 'CANCELLED'],
    [t.suspended, d.tenants.SUSPENDED, 'SUSPENDED'],
    [t.legacy, d.tenants.LEGACY, 'LEGACY'],
  ];

  const usageItems: Array<{ label: string; value: number; icon: React.ReactNode }> = [
    { label: DICTIONARY[lang].subscription.resources.students, value: d.usage.students, icon: I.students },
    { label: DICTIONARY[lang].subscription.resources.teachers, value: d.usage.teachers, icon: I.teachers },
    { label: DICTIONARY[lang].subscription.resources.staffUsers, value: d.usage.staff, icon: I.staff },
    { label: `${DICTIONARY[lang].subscription.resources.sms}`, value: d.usage.sms, icon: I.sms },
    { label: DICTIONARY[lang].subscription.resources.whatsapp, value: d.usage.whatsapp, icon: I.whatsapp },
    { label: DICTIONARY[lang].subscription.resources.email, value: d.usage.email, icon: I.email },
  ];

  return (
    <div className="flex flex-col gap-7 fade-in">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <div>
        <h1 className="text-[22px] font-extrabold text-[#052e5f] tracking-tight">{t.dashboard}</h1>
        <p className="text-[13px] text-[#64748b] mt-0.5">{t.platform} — {d.period}</p>
      </div>

      {/* ── Legacy banner ───────────────────────────────────────────── */}
      {d.tenants.LEGACY > 0 && (
        <Link
          href="/super-admin/coaching-centers?category=LEGACY"
          className="group flex items-center justify-between gap-4 p-4 rounded-2xl bg-amber-50 border border-amber-200/60 transition-all hover:border-amber-300 hover:shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
              {I.legacy}
            </div>
            <span className="text-[13.5px] text-amber-900 font-medium">
              {DICTIONARY[lang].subOps.noSubscriptionsBanner.replace('{n}', num(d.tenants.LEGACY))}
            </span>
          </div>
          <span className="text-amber-700 font-semibold text-[13px] flex items-center gap-1 group-hover:gap-2 transition-all">
            {DICTIONARY[lang].subOps.viewThem} {I.arrow}
          </span>
        </Link>
      )}

      {/* ── Status tiles ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tiles.map(([label, value, category]) => {
          const s = TILE_STYLES[category] || TILE_STYLES.total;
          const filterQ = category === 'total' ? 'all' : category;
          return (
            <Link
              key={category}
              href={`/super-admin/coaching-centers?category=${filterQ}`}
              className="group relative p-4 rounded-2xl border transition-all hover:shadow-md hover:-translate-y-[1px]"
              style={{ background: s.bg, borderColor: 'transparent' }}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="text-[11.5px] font-semibold uppercase tracking-wide" style={{ color: s.iconColor, opacity: 0.7 }}>
                    {label}
                  </div>
                  <div className="text-[28px] font-extrabold num mt-1 leading-none" style={{ color: s.text }}>
                    {num(value)}
                  </div>
                </div>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 opacity-40" style={{ color: s.iconColor }}>
                  {TILE_ICONS[category]}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* ── Platform usage ──────────────────────────────────────────── */}
      <div className="card p-6 rounded-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[16px] font-bold text-[#052e5f]">{t.usageTotals}</h2>
          <span className="text-[12px] font-medium text-[#94a3b8] bg-[#f1f5f9] px-3 py-1 rounded-full">{d.period}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {usageItems.map((item) => (
            <div key={item.label} className="rounded-xl bg-[#f8fafc] border border-[#edf1f7] p-4 transition-colors hover:bg-[#f1f5f9]">
              <div className="text-[#94a3b8] mb-2">{item.icon}</div>
              <div className="text-[11.5px] font-semibold text-[#64748b] uppercase tracking-wide">{item.label}</div>
              <div className="text-[22px] font-extrabold text-[#052e5f] num mt-1 leading-tight">{num(item.value)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Expiring soon ───────────────────────────────────────────── */}
      <div className="card p-6 rounded-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
            {I.clock}
          </div>
          <h2 className="text-[16px] font-bold text-[#052e5f]">{t.expiringSoon}</h2>
        </div>
        {d.expiringSoon.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-[#94a3b8] mb-2">{I.active}</div>
            <p className="text-[13px] text-[#94a3b8] font-medium">{t.nothingExpiring}</p>
          </div>
        ) : (
          <div className="divide-y divide-[#eef2f7]">
            {d.expiringSoon.map((e) => (
              <Link
                key={e.id}
                href={`/super-admin/coaching-centers/${e.id}`}
                className="group flex items-center justify-between gap-4 py-3.5 px-2 -mx-2 rounded-xl hover:bg-[#f8fafc] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${e.daysLeft <= 3 ? 'bg-rose-500' : 'bg-amber-400'}`} />
                  <div className="min-w-0">
                    <span className="font-bold text-[14px] text-[#052e5f] group-hover:text-[#063b78]">{e.name}</span>
                    <span className="text-[#94a3b8] font-mono text-[11.5px] ml-2">{e.code}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-[12.5px] text-[#64748b] flex-shrink-0">
                  <span className="hidden sm:inline">{e.plan}</span>
                  <span className="hidden sm:inline">·</span>
                  <span>{formatDhakaDate(e.endDate)}</span>
                  <span
                    className={`font-bold px-2.5 py-0.5 rounded-lg text-[11.5px] ${
                      e.daysLeft <= 3
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {num(Math.max(0, e.daysLeft))} {t.daysLeft}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
