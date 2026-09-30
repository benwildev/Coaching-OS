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

export default function SuperAdminDashboardPage() {
  const { lang } = useApp();
  const t = DICTIONARY[lang].superAdmin;
  const [d, setD] = useState<Dashboard | null>(null);
  const num = (n: number) => localizeNumber(lang, n);

  useEffect(() => {
    saApi<{ dashboard: Dashboard }>('/api/super-admin/dashboard').then((r) => r.ok && setD(r.data.dashboard));
  }, []);

  if (!d) return <div className="py-16 flex justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#063b78] border-t-transparent" /></div>;

  // Every number comes from the database; each tile opens the tenant list already filtered to that state.
  const tiles: Array<[string, number, string]> = [
    [t.totalCenters, d.tenants.total, 'all'],
    [t.active, d.tenants.ACTIVE, 'ACTIVE'],
    [t.trial, d.tenants.TRIAL, 'TRIAL'],
    [t.pastDue, d.tenants.PAST_DUE, 'PAST_DUE'],
    [t.expired, d.tenants.EXPIRED, 'EXPIRED'],
    [t.cancelled, d.tenants.CANCELLED, 'CANCELLED'],
    [t.suspended, d.tenants.SUSPENDED, 'SUSPENDED'],
    [t.legacy, d.tenants.LEGACY, 'LEGACY'],
  ];
  const usage: Array<[string, number]> = [
    [DICTIONARY[lang].subscription.resources.students, d.usage.students],
    [DICTIONARY[lang].subscription.resources.teachers, d.usage.teachers],
    [DICTIONARY[lang].subscription.resources.staffUsers, d.usage.staff],
    [`${DICTIONARY[lang].subscription.resources.sms}`, d.usage.sms],
    [DICTIONARY[lang].subscription.resources.whatsapp, d.usage.whatsapp],
    [DICTIONARY[lang].subscription.resources.email, d.usage.email],
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-extrabold text-[#063b78]">{t.dashboard}</h1>

      {d.tenants.LEGACY > 0 && (
        <Link href="/super-admin/coaching-centers?category=LEGACY" className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[13px] text-amber-900 flex items-center justify-between gap-3">
          <span>{DICTIONARY[lang].subOps.noSubscriptionsBanner.replace('{n}', num(d.tenants.LEGACY))}</span>
          <span className="font-semibold">{DICTIONARY[lang].subOps.viewThem} ›</span>
        </Link>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tiles.map(([label, value, category]) => (
          <Link key={label} href={`/super-admin/coaching-centers?category=${category}`} className="card p-4 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs hover:border-[#063b78] transition-colors">
            <div className="text-[12px] font-semibold text-[#64748b]">{label}</div>
            <div className="text-3xl font-extrabold text-[#063b78] num mt-1">{num(value)}</div>
          </Link>
        ))}
      </div>

      <div className="card p-5 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
        <h2 className="text-lg font-bold text-[#063b78] mb-3">
          {t.usageTotals} <span className="text-[12px] font-medium text-[#64748b]">({t.messagesThisMonth}: {d.period})</span>
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {usage.map(([label, value]) => (
            <div key={label} className="rounded-xl bg-[#f5f8fc] border border-[#dce5f0] p-3">
              <div className="text-[12px] font-semibold text-[#64748b]">{label}</div>
              <div className="text-xl font-bold text-[#092f63] num">{num(value)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
        <h2 className="text-lg font-bold text-[#063b78] mb-3">{t.expiringSoon}</h2>
        {d.expiringSoon.length === 0 ? (
          <p className="text-[13px] text-[#94a3b8]">{t.nothingExpiring}</p>
        ) : (
          <div className="divide-y divide-[#edf1f7]">
            {d.expiringSoon.map((e) => (
              <Link key={e.id} href={`/super-admin/coaching-centers/${e.id}`} className="py-2.5 flex items-center justify-between gap-3 hover:bg-[#f8fafc] px-1 rounded-lg">
                <span className="font-semibold text-[#092f63]">{e.name} <span className="text-[#94a3b8] font-mono text-[12px]">({e.code})</span></span>
                <span className="text-[12.5px] text-[#64748b]">
                  {e.plan} · {formatDhakaDate(e.endDate)} ·{' '}
                  <strong className={e.daysLeft <= 3 ? 'text-rose-600' : 'text-amber-700'}>{num(Math.max(0, e.daysLeft))} {t.daysLeft}</strong>
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
