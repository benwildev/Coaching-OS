'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate, localizeNumber } from '@/lib/i18n';
import { saApi } from '@/lib/super-admin-client';
import SubscriptionOps from '@/components/SubscriptionOps';
import { FEATURE_KEYS, LIMIT_KEYS, usageLevel, usagePercent, type FeatureKey, type LimitKey, type Limits, type UsageLevel } from '@/lib/subscription';

interface Detail {
  overview: { id: string; name: string; banglaName?: string | null; code: string; phone: string; email?: string | null; city?: string | null; district?: string | null; status: string; createdAt: string; owner: { name: string; email: string } | null; category: string };
  subscription: {
    hasSubscription: boolean; status: string; storedStatus: string | null; startDate: string | null; endDate: string | null;
    planId: string | null; planName: string | null; planBanglaName: string | null; planVersion: number | null; currentPlanVersion: number | null; planArchived: boolean;
    overrides: { limits?: Partial<Record<LimitKey, number | null>>; features?: Partial<Record<FeatureKey, boolean>> } | null;
  };
  limits: Limits;
  features: Record<FeatureKey, boolean>;
  usage: Record<string, number | string>;
  branches: Array<{ id: string; name: string; code: string; status: string; isMain: boolean }>;
  users: Array<{ id: string; name: string; email: string; status: string; role: string | null; lastLoginAt: string | null }>;
  communication: { period: string; byChannelStatus: Array<{ channel: string; status: string; count: number }> };
  activity: { platform: Array<{ id: string; action: string; createdAt: string; platformAdmin?: { name: string } | null }>; tenant: Array<{ id: string; action: string; entity: string; createdAt: string }> };
}

const USAGE_KEY: Record<LimitKey, string> = {
  maxStudents: 'students', maxTeachers: 'teachers', maxStaffUsers: 'staffUsers', maxPortalAccounts: 'portalAccounts', maxBranches: 'branches',
  maxSms: 'sms', maxWhatsapp: 'whatsapp', maxEmail: 'email', maxStorageMb: 'storageMb',
};
const RES_KEY: Record<LimitKey, string> = USAGE_KEY;
const BAR: Record<UsageLevel, string> = { unlimited: 'bg-[#94a3b8]', normal: 'bg-emerald-500', near: 'bg-amber-400', critical: 'bg-orange-500', reached: 'bg-rose-500' };

/* ── Tab icons (inline SVGs) ──────────────────────────────────────────────── */
const TabIcons: Record<string, React.ReactNode> = {
  overview: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="5" height="5" rx="1.5" fill="currentColor"/><rect x="9" y="2" width="5" height="5" rx="1.5" fill="currentColor" opacity="0.5"/><rect x="2" y="9" width="5" height="5" rx="1.5" fill="currentColor" opacity="0.5"/><rect x="9" y="9" width="5" height="5" rx="1.5" fill="currentColor" opacity="0.3"/></svg>,
  subscription: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="4" width="12" height="8" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M2 7h12" stroke="currentColor" strokeWidth="1.2"/><rect x="4" y="9" width="4" height="1.5" rx="0.5" fill="currentColor" opacity="0.4"/></svg>,
  usage: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="9" width="3" height="5" rx="1" fill="currentColor" opacity="0.4"/><rect x="6.5" y="5" width="3" height="9" rx="1" fill="currentColor" opacity="0.6"/><rect x="11" y="2" width="3" height="12" rx="1" fill="currentColor"/></svg>,
  limits: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4"/><path d="M8 5v3l2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  features: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4"/><path d="M6 8l1.5 1.5L10.5 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  branches: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2L3 5.5v5L8 14l5-3.5v-5L8 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
  users: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.3"/><path d="M3.5 14a4.5 4.5 0 019 0" stroke="currentColor" strokeWidth="1.3"/></svg>,
  communication: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="8" rx="2" stroke="currentColor" strokeWidth="1.3"/><path d="M2 5l6 3.5L14 5" stroke="currentColor" strokeWidth="1.2"/></svg>,
  activity: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4"/><path d="M8 4.5v3.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
};

const BackIcon = <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const StarIcon = <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1l1.8 3.7 4 .6-2.9 2.8.7 4L7 10.3 3.4 12.1l.7-4-2.9-2.8 4-.6L7 1z" fill="#fbbf24" stroke="#f59e0b" strokeWidth="0.8"/></svg>;

const TABS = ['overview', 'subscription', 'usage', 'limits', 'features', 'branches', 'users', 'communication', 'activity'] as const;

const ROLE_BADGE: Record<string, string> = {
  OWNER: 'bg-amber-50 text-amber-800',
  ADMIN: 'bg-blue-50 text-blue-700',
  STAFF: 'bg-slate-100 text-slate-600',
};

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  ACTIVE:    { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  SUSPENDED: { bg: 'bg-rose-50', text: 'text-rose-700' },
  INACTIVE:  { bg: 'bg-slate-100', text: 'text-slate-500' },
};

function DetailInner() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const { lang } = useApp();
  const t = DICTIONARY[lang].superAdmin;
  const sd = DICTIONARY[lang].subscription;
  const [d, setD] = useState<Detail | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>((TABS as readonly string[]).includes(sp.get('tab') || '') ? (sp.get('tab') as (typeof TABS)[number]) : 'overview');
  const num = (n: number) => localizeNumber(lang, n);

  const load = useCallback(async () => {
    const r = await saApi<Detail>(`/api/super-admin/coaching-centers/${id}`);
    if (r.ok) {
      setD(r.data);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (!d) return (
    <div className="py-20 flex justify-center">
      <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-[#063b78] border-t-transparent" />
    </div>
  );

  const o = d.overview;
  const stName = (s: string) => (sd.statusNames as Record<string, string>)[s] || s;
  const card = 'card p-6 rounded-2xl';
  const categoryBadge = STATUS_BADGE[o.category] || STATUS_BADGE.ACTIVE;

  return (
    <div className="flex flex-col gap-6 fade-in">
      {/* ── Back link ──────────────────────────────────────────────── */}
      <Link href="/super-admin/coaching-centers" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#063b78] hover:text-[#052e5f] transition-colors w-fit">
        {BackIcon} {t.centers}
      </Link>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-extrabold text-[#052e5f] tracking-tight">
            {lang === 'bn' && o.banglaName ? o.banglaName : o.name}
          </h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-[12px] font-mono text-[#94a3b8] bg-[#f1f5f9] px-2 py-0.5 rounded-md">{o.code}</span>
            <span className="text-[13px] font-medium text-[#64748b]">
              {d.subscription.planName ? (lang === 'bn' && d.subscription.planBanglaName ? d.subscription.planBanglaName : d.subscription.planName) : stName('LEGACY')}
            </span>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11.5px] font-semibold ${categoryBadge.bg} ${categoryBadge.text}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
              {stName(o.category)}
            </span>
          </div>
        </div>
        <button type="button" onClick={() => setTab('subscription')} className="primary">{t.manage}</button>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <div role="tablist" className="flex gap-0.5 border-b border-[#e2e8f0] overflow-x-auto -mx-1 px-1">
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-[13px] font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
              tab === k
                ? 'border-[#063b78] text-[#063b78]'
                : 'border-transparent text-[#94a3b8] hover:text-[#64748b]'
            }`}
          >
            <span className="opacity-70">{TabIcons[k]}</span>
            {(t as Record<string, string>)[k]}
          </button>
        ))}
      </div>

      {/* ── Overview ───────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className={card}>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              [t.name, o.name],
              [t.owner, o.owner ? `${o.owner.name} (${o.owner.email})` : '—'],
              ['Phone', o.phone],
              ['Email', o.email || '—'],
              [t.status, o.status === 'SUSPENDED' ? stName('SUSPENDED') : stName('ACTIVE')],
              [t.created, formatDhakaDate(o.createdAt)],
              ...(o.city ? [['City', o.city]] : []),
              ...(o.district ? [['District', o.district]] : []),
            ].map(([label, value]) => (
              <div key={String(label)} className="flex flex-col gap-0.5">
                <span className="text-[11.5px] font-semibold uppercase tracking-wide text-[#94a3b8]">{label}</span>
                <span className="text-[14px] font-medium text-[#1e293b]">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Usage / Limits ─────────────────────────────────────────── */}
      {(tab === 'usage' || tab === 'limits') && (
        <div className={`${card} flex flex-col gap-5`}>
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-[#052e5f]">{tab === 'usage' ? t.usage : t.limits}</h3>
            <span className="text-[12px] text-[#94a3b8] bg-[#f1f5f9] px-3 py-1 rounded-full">{String(d.usage.period)}</span>
          </div>
          <div className="grid gap-4">
            {LIMIT_KEYS.map((k) => {
              const used = Number(d.usage[USAGE_KEY[k]] ?? 0);
              const limit = d.limits[k];
              const level = usageLevel(used, limit);
              const pct = limit === null ? 0 : usagePercent(used, limit);
              return (
                <div key={k} className="rounded-xl bg-[#f8fafc] border border-[#eef2f7] p-4">
                  <div className="flex justify-between items-baseline text-[13.5px] mb-2">
                    <span className="font-semibold text-[#1e293b]">{(sd.resources as Record<string, string>)[RES_KEY[k]]}</span>
                    <span className="font-mono font-bold text-[#052e5f] text-[14px]">
                      {num(used)} <span className="text-[#94a3b8] font-normal">/ {limit === null ? sd.unlimited : num(limit)}</span>
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-[#e2e8f0] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${BAR[level]} transition-all duration-500`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  {level === 'reached' && (
                    <div className="text-[11.5px] text-rose-600 font-semibold mt-1.5">Limit reached</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Features ───────────────────────────────────────────────── */}
      {tab === 'features' && (
        <div className={`${card} grid sm:grid-cols-2 gap-3`}>
          {FEATURE_KEYS.map((k) => (
            <div
              key={k}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                d.features[k]
                  ? 'bg-emerald-50/50 border-emerald-100'
                  : 'bg-slate-50/50 border-slate-100'
              }`}
            >
              <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[13px] font-bold ${
                d.features[k] ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'
              }`}>
                {d.features[k] ? '✓' : '✕'}
              </span>
              <span className="text-[13.5px] font-medium text-[#1e293b]">
                {(sd.featureNames as Record<string, string>)[k]}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Branches ───────────────────────────────────────────────── */}
      {tab === 'branches' && (
        <div className={`${card} divide-y divide-[#eef2f7]`}>
          {d.branches.length === 0 ? (
            <p className="text-[13px] text-[#94a3b8] py-4 text-center">{t.noData}</p>
          ) : d.branches.map((b) => (
            <div key={b.id} className="flex items-center justify-between py-3 gap-3">
              <div className="flex items-center gap-2.5">
                {b.isMain && <span className="flex-shrink-0">{StarIcon}</span>}
                <div>
                  <span className="font-semibold text-[14px] text-[#1e293b]">{b.name}</span>
                  <span className="text-[11.5px] font-mono text-[#94a3b8] ml-2">{b.code}</span>
                </div>
              </div>
              <span className={`text-[12px] font-semibold px-2.5 py-0.5 rounded-lg ${
                b.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {b.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Users ──────────────────────────────────────────────────── */}
      {tab === 'users' && (
        <div className={`${card} divide-y divide-[#eef2f7]`}>
          {d.users.length === 0 ? (
            <p className="text-[13px] text-[#94a3b8] py-4 text-center">{t.noData}</p>
          ) : d.users.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-3 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#eef3fa] text-[#063b78] font-bold text-[12px] flex items-center justify-center flex-shrink-0">
                  {u.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-[14px] text-[#1e293b] truncate">{u.name}</div>
                  <div className="text-[12px] text-[#94a3b8] truncate">{u.email}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {u.role && (
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${ROLE_BADGE[u.role] || 'bg-slate-100 text-slate-600'}`}>
                    {u.role}
                  </span>
                )}
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                  u.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}>{u.status}</span>
                {u.lastLoginAt && (
                  <span className="text-[11px] text-[#94a3b8] hidden sm:inline">{formatDhakaDate(u.lastLoginAt)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Communication ──────────────────────────────────────────── */}
      {tab === 'communication' && (
        <div className={card}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-[#052e5f]">{t.communication}</h3>
            <span className="text-[12px] text-[#94a3b8] bg-[#f1f5f9] px-3 py-1 rounded-full">{d.communication.period}</span>
          </div>
          {d.communication.byChannelStatus.length === 0 ? (
            <p className="text-[13px] text-[#94a3b8] py-6 text-center">{t.noData}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="border-b border-[#eef2f7]">
                    <th className="text-left py-2 pr-6 text-[11.5px] font-semibold uppercase tracking-wide text-[#94a3b8]">Channel</th>
                    <th className="text-left py-2 pr-6 text-[11.5px] font-semibold uppercase tracking-wide text-[#94a3b8]">{t.status}</th>
                    <th className="text-right py-2 text-[11.5px] font-semibold uppercase tracking-wide text-[#94a3b8]">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {d.communication.byChannelStatus.map((r) => (
                    <tr key={`${r.channel}-${r.status}`} className="border-b border-[#f5f7fa]">
                      <td className="py-2.5 pr-6 font-semibold text-[#1e293b]">{r.channel}</td>
                      <td className="py-2.5 pr-6 text-[#64748b]">{r.status}</td>
                      <td className="py-2.5 text-right font-bold num text-[#052e5f]">{num(r.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Activity ───────────────────────────────────────────────── */}
      {tab === 'activity' && (
        <div className={`${card} flex flex-col gap-6`}>
          {/* Platform audit */}
          <div>
            <h3 className="font-bold text-[#052e5f] mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#063b78]" />
              {t.platform}
            </h3>
            {d.activity.platform.length === 0 ? (
              <p className="text-[13px] text-[#94a3b8]">{t.noData}</p>
            ) : (
              <div className="relative pl-5 border-l-2 border-[#eef2f7] space-y-0">
                {d.activity.platform.map((a) => (
                  <div key={a.id} className="relative py-2">
                    <div className="absolute -left-[7px] top-[14px] w-3 h-3 rounded-full bg-[#dce5f0] border-2 border-white" />
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                      <span className="text-[13px] font-mono font-semibold text-[#052e5f]">{a.action}</span>
                      <span className="text-[12px] text-[#94a3b8]">{a.platformAdmin?.name || '—'} · {formatDhakaDate(a.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tenant audit */}
          <div>
            <h3 className="font-bold text-[#052e5f] mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#94a3b8]" />
              {t.centers}
            </h3>
            {d.activity.tenant.length === 0 ? (
              <p className="text-[13px] text-[#94a3b8]">{t.noData}</p>
            ) : (
              <div className="relative pl-5 border-l-2 border-[#eef2f7] space-y-0">
                {d.activity.tenant.map((a) => (
                  <div key={a.id} className="relative py-2">
                    <div className="absolute -left-[7px] top-[14px] w-3 h-3 rounded-full bg-[#eef2f7] border-2 border-white" />
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                      <span className="text-[13px] font-mono font-semibold text-[#475569]">{a.action}</span>
                      <span className="text-[12px] text-[#94a3b8]">{formatDhakaDate(a.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Subscription ops ───────────────────────────────────────── */}
      {tab === 'subscription' && <SubscriptionOps tenantId={id} onChanged={load} />}
    </div>
  );
}

export default function CoachingCenterDetailPage() {
  return (<Suspense fallback={null}><DetailInner /></Suspense>);
}
