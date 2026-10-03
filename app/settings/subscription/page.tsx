'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate, localizeNumber } from '@/lib/i18n';
import { FEATURE_KEYS, usageLevel, usagePercent, type FeatureKey, type LimitKey, type Limits, type UsageLevel } from '@/lib/subscription';

interface SubscriptionView {
  subscription: {
    hasSubscription: boolean;
    status: string;
    suspended: boolean;
    planName: string | null;
    planBanglaName: string | null;
    startDate: string | null;
    endDate: string | null;
    canGrow: boolean;
    isTrial?: boolean;
  };
  notice?: { kind: string; endDate?: string; daysLeft?: number };
  overLimits?: Array<{ key: string; used: number; limit: number; over: number }>;
  limits: Limits;
  usage: Record<string, number | string>;
  features: Record<FeatureKey, boolean>;
}

const ROWS: Array<{ key: string; usage: string; limit: LimitKey; monthly?: boolean }> = [
  { key: 'students', usage: 'students', limit: 'maxStudents' },
  { key: 'teachers', usage: 'teachers', limit: 'maxTeachers' },
  { key: 'staffUsers', usage: 'staffUsers', limit: 'maxStaffUsers' },
  { key: 'portalAccounts', usage: 'portalAccounts', limit: 'maxPortalAccounts' },
  { key: 'branches', usage: 'branches', limit: 'maxBranches' },
  { key: 'sms', usage: 'sms', limit: 'maxSms', monthly: true },
  { key: 'whatsapp', usage: 'whatsapp', limit: 'maxWhatsapp', monthly: true },
  { key: 'email', usage: 'email', limit: 'maxEmail', monthly: true },
  { key: 'storageMb', usage: 'storageMb', limit: 'maxStorageMb' },
];

const LEVEL_STYLE: Record<UsageLevel, { bar: string; text: string }> = {
  unlimited: { bar: 'bg-[#94a3b8]', text: 'text-[#64748b]' },
  normal: { bar: 'bg-emerald-500', text: 'text-emerald-700' },
  near: { bar: 'bg-amber-400', text: 'text-amber-700' },
  critical: { bar: 'bg-orange-500', text: 'text-orange-700' },
  reached: { bar: 'bg-rose-500', text: 'text-rose-700' },
};

export default function SubscriptionPage() {
  const { lang, currentUser, can } = useApp();
  const dict = DICTIONARY[lang].subscription;
  const so = DICTIONARY[lang].subOps;
  const [data, setData] = useState<SubscriptionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    fetch('/api/settings/subscription')
      .then(async (res) => {
        if (res.status === 403) return setForbidden(true);
        const json = await res.json();
        if (json.success) setData(json);
      })
      .finally(() => setLoading(false));
  }, []);

  const levelText = (l: UsageLevel) =>
    l === 'reached' ? dict.limitReached : l === 'critical' ? dict.criticalLimit : l === 'near' ? dict.nearLimit : '';
  const statusName = (s: string) => (dict.statusNames as Record<string, string>)[s] || s;
  const num = (n: number) => localizeNumber(lang, n);

  if (loading) {
    return (
      <div className="max-w-[900px] mx-auto flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#063b78] border-t-transparent" />
      </div>
    );
  }

  if (forbidden || (currentUser && !can('settings.subscription.read')) || !data) {
    return <div className="max-w-[900px] mx-auto p-6 rounded-2xl bg-white border border-[#dce5f0] text-[14px] text-[#64748b]">{dict.ownerOnly}</div>;
  }

  const { subscription: sub, limits, usage, features } = data;
  const noticeText =
    data.notice && data.notice.kind !== 'NONE'
      ? ((so.notices as Record<string, string>)[data.notice.kind] || '')
          .replace('{date}', data.notice.endDate ? formatDhakaDate(data.notice.endDate) : '')
          .replace('{days}', localizeNumber(lang, data.notice.daysLeft ?? 0))
      : '';
  const overBy = new Map((data.overLimits || []).map((o) => [o.key, o.over]));
  const planLabel = sub.hasSubscription ? (lang === 'bn' && sub.planBanglaName ? sub.planBanglaName : sub.planName) : dict.noPlan;
  const inactive = sub.hasSubscription && !sub.canGrow;

  return (
    <div className="max-w-[900px] mx-auto flex flex-col gap-5">
      <div>
        <Link href="/settings" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#063b78] hover:underline">
          <Icon name="chevleft" size={16} />
          <span>{lang === 'bn' ? 'সেটিংসে ফিরুন' : 'Back to Settings'}</span>
        </Link>
        <h1 className="text-2xl font-extrabold text-[#063b78] mt-2">{dict.title}</h1>
        <p className="text-[13.5px] text-[#64748b]">{dict.subtitle}</p>
      </div>

      {noticeText && (
        <div role="status" className={`p-4 rounded-2xl border text-[13.5px] font-semibold ${data.notice && ['EXPIRED', 'CANCELLED', 'SUSPENDED', 'PAST_DUE'].includes(data.notice.kind) ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
          {noticeText}
        </div>
      )}

      {inactive && (
        <div role="alert" className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900">
          <div className="font-bold">{dict.expiredTitle}</div>
          <p className="text-[13px] mt-1">{dict.expiredBody}</p>
        </div>
      )}

      <div className="card p-5 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs grid sm:grid-cols-3 gap-4">
        <div>
          <div className="text-[11.5px] font-semibold uppercase tracking-wider text-[#64748b]">{dict.currentPlan}</div>
          <div className="text-lg font-bold text-[#092f63]">{planLabel}</div>
        </div>
        <div>
          <div className="text-[11.5px] font-semibold uppercase tracking-wider text-[#64748b]">{dict.status}</div>
          <div className="text-lg font-bold text-[#092f63]">{statusName(sub.status)}{sub.isTrial ? ` · ${so.trialType}` : ''}</div>
        </div>
        <div>
          <div className="text-[11.5px] font-semibold uppercase tracking-wider text-[#64748b]">{dict.renewalDate}</div>
          <div className="text-lg font-bold text-[#092f63]">{sub.endDate ? formatDhakaDate(sub.endDate) : '—'}</div>
        </div>
      </div>

      <div className="card p-5 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
        <h2 className="text-lg font-bold text-[#063b78] mb-3">
          {dict.usage} <span className="text-[12px] font-medium text-[#64748b]">({dict.thisMonth}: {String(usage.period)})</span>
        </h2>
        <div className="flex flex-col gap-4">
          {ROWS.map((r) => {
            const used = Number(usage[r.usage] ?? 0);
            const limit = limits[r.limit];
            const level = usageLevel(used, limit);
            const style = LEVEL_STYLE[level];
            return (
              <div key={r.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13.5px] font-semibold text-[#092f63]">{(dict.resources as Record<string, string>)[r.key]}</span>
                  <span className={`text-[13px] font-mono font-bold ${style.text}`}>
                    {num(used)} / {limit === null ? dict.unlimited : num(limit)}
                  </span>
                </div>
                <div className="h-2 mt-1.5 rounded-full bg-[#eef2f7] overflow-hidden" role="progressbar" aria-valuenow={usagePercent(used, limit)} aria-valuemin={0} aria-valuemax={100}>
                  <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${limit === null ? 0 : usagePercent(used, limit)}%` }} />
                </div>
                {levelText(level) && <div className={`text-[11.5px] mt-1 font-semibold ${style.text}`}>{levelText(level)}</div>}
                {(overBy.get(r.limit) ?? 0) > 0 && (
                  <div className="text-[11.5px] mt-0.5 font-semibold text-rose-600">{so.overBy.replace('{n}', num(overBy.get(r.limit) ?? 0))} — {so.overLimitNote}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card p-5 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
        <h2 className="text-lg font-bold text-[#063b78] mb-3">{dict.features}</h2>
        <div className="grid sm:grid-cols-2 gap-2">
          {FEATURE_KEYS.map((k) => (
            <div key={k} className="flex items-center gap-2 text-[13.5px]">
              <span className={features[k] ? 'text-emerald-600 font-bold' : 'text-rose-500 font-bold'}>{features[k] ? '✓' : '✕'}</span>
              <span className={features[k] ? 'text-[#092f63]' : 'text-[#94a3b8]'}>{(dict.featureNames as Record<string, string>)[k]}</span>
              <span className="text-[11.5px] text-[#94a3b8]">{features[k] ? '' : `(${dict.notIncluded})`}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[12.5px] text-[#64748b]">{dict.contactAdmin}</p>
    </div>
  );
}
