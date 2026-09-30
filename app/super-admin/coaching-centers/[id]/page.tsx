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
  overview: { id: string; name: string; banglaName?: string | null; code: string; phone: string; email?: string | null; city?: string | null; status: string; createdAt: string; owner: { name: string; email: string } | null; category: string };
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
const TABS = ['overview', 'subscription', 'usage', 'limits', 'features', 'branches', 'users', 'communication', 'activity'] as const;

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

  if (!d) return <div className="py-16 flex justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#063b78] border-t-transparent" /></div>;

  const o = d.overview;
  const stName = (s: string) => (sd.statusNames as Record<string, string>)[s] || s;
  const card = 'card p-5 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs';

  return (
    <div className="flex flex-col gap-5">
      <Link href="/super-admin/coaching-centers" className="text-[13px] font-semibold text-[#063b78] hover:underline">‹ {t.centers}</Link>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-[#063b78]">{lang === 'bn' && o.banglaName ? o.banglaName : o.name}</h1>
          <div className="text-[13px] text-[#64748b] mt-0.5">
            <span className="font-mono">{o.code}</span> · {d.subscription.planName ? (lang === 'bn' && d.subscription.planBanglaName ? d.subscription.planBanglaName : d.subscription.planName) : stName('LEGACY')} · <strong>{stName(o.category)}</strong>
          </div>
        </div>
        <button type="button" onClick={() => setTab('subscription')} className="tb">{t.manage}</button>
      </div>

      <div role="tablist" className="flex gap-1 border-b border-[#dce5f0] overflow-x-auto">
        {TABS.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`px-3.5 py-2.5 text-[13.5px] font-semibold border-b-2 -mb-px whitespace-nowrap ${tab === k ? 'border-[#063b78] text-[#063b78]' : 'border-transparent text-[#64748b] hover:text-[#063b78]'}`}>
            {(t as Record<string, string>)[k]}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className={`${card} grid sm:grid-cols-2 gap-3 text-[13.5px]`}>
          <div><b>{t.name}:</b> {o.name}</div>
          <div><b>{t.owner}:</b> {o.owner ? `${o.owner.name} (${o.owner.email})` : '—'}</div>
          <div><b>Phone:</b> {o.phone}</div>
          <div><b>Email:</b> {o.email || '—'}</div>
          <div><b>{t.status}:</b> {o.status === 'SUSPENDED' ? stName('SUSPENDED') : stName('ACTIVE')}</div>
          <div><b>{t.created}:</b> {formatDhakaDate(o.createdAt)}</div>
        </div>
      )}

      {(tab === 'usage' || tab === 'limits') && (
        <div className={`${card} flex flex-col gap-4`}>
          <div className="text-[12px] text-[#64748b]">{t.period}: {String(d.usage.period)}</div>
          {LIMIT_KEYS.map((k) => {
            const used = Number(d.usage[USAGE_KEY[k]] ?? 0);
            const limit = d.limits[k];
            const level = usageLevel(used, limit);
            return (
              <div key={k}>
                <div className="flex justify-between text-[13.5px]">
                  <span className="font-semibold text-[#092f63]">{(sd.resources as Record<string, string>)[RES_KEY[k]]}</span>
                  <span className="font-mono font-bold">{num(used)} / {limit === null ? sd.unlimited : num(limit)}</span>
                </div>
                <div className="h-2 mt-1 rounded-full bg-[#eef2f7] overflow-hidden"><div className={`h-full ${BAR[level]}`} style={{ width: `${limit === null ? 0 : usagePercent(used, limit)}%` }} /></div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'features' && (
        <div className={`${card} grid sm:grid-cols-2 gap-2`}>
          {FEATURE_KEYS.map((k) => (
            <div key={k} className="flex items-center gap-2 text-[13.5px]">
              <span className={d.features[k] ? 'text-emerald-600 font-bold' : 'text-rose-500 font-bold'}>{d.features[k] ? '✓' : '✕'}</span>
              {(sd.featureNames as Record<string, string>)[k]}
            </div>
          ))}
        </div>
      )}

      {tab === 'branches' && (
        <div className={`${card} divide-y divide-[#edf1f7]`}>
          {d.branches.map((b) => (<div key={b.id} className="py-2 flex justify-between text-[13.5px]"><span>{b.name} <span className="font-mono text-[#94a3b8]">({b.code})</span>{b.isMain ? ' ★' : ''}</span><span>{b.status}</span></div>))}
        </div>
      )}

      {tab === 'users' && (
        <div className={`${card} divide-y divide-[#edf1f7]`}>
          {d.users.map((u) => (<div key={u.id} className="py-2 flex justify-between gap-3 text-[13.5px]"><span>{u.name} <span className="text-[#94a3b8]">{u.email}</span></span><span className="whitespace-nowrap">{u.role || '—'} · {u.status}{u.lastLoginAt ? ` · ${formatDhakaDate(u.lastLoginAt)}` : ''}</span></div>))}
        </div>
      )}

      {tab === 'communication' && (
        <div className={card}>
          <div className="text-[12px] text-[#64748b] mb-2">{t.period}: {d.communication.period}</div>
          {d.communication.byChannelStatus.length === 0 ? <p className="text-[13px] text-[#94a3b8]">{t.noData}</p> : (
            <table className="text-[13.5px]"><tbody>
              {d.communication.byChannelStatus.map((r) => (<tr key={`${r.channel}-${r.status}`}><td className="pr-6 py-1 font-semibold">{r.channel}</td><td className="pr-6">{r.status}</td><td className="num">{num(r.count)}</td></tr>))}
            </tbody></table>
          )}
        </div>
      )}

      {tab === 'activity' && (
        <div className={`${card} flex flex-col gap-4`}>
          <div>
            <h3 className="font-bold text-[#063b78] mb-1">{t.platform}</h3>
            {d.activity.platform.length === 0 ? <p className="text-[13px] text-[#94a3b8]">{t.noData}</p> : d.activity.platform.map((a) => (
              <div key={a.id} className="text-[13px] py-1 flex justify-between gap-3"><span className="font-mono">{a.action}</span><span className="text-[#64748b]">{a.platformAdmin?.name || '—'} · {formatDhakaDate(a.createdAt)}</span></div>
            ))}
          </div>
          <div>
            <h3 className="font-bold text-[#063b78] mb-1">{t.centers}</h3>
            {d.activity.tenant.map((a) => (<div key={a.id} className="text-[13px] py-1 flex justify-between gap-3"><span className="font-mono">{a.action}</span><span className="text-[#64748b]">{formatDhakaDate(a.createdAt)}</span></div>))}
          </div>
        </div>
      )}

      {tab === 'subscription' && <SubscriptionOps tenantId={id} onChanged={load} />}
    </div>
  );
}

export default function CoachingCenterDetailPage() {
  return (<Suspense fallback={null}><DetailInner /></Suspense>);
}
