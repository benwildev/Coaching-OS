'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import FeesSubNav from '@/components/FeesSubNav';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatBDT } from '@/lib/i18n';

interface Dashboard {
  todayCollection: number;
  monthCollection: number;
  outstandingDue: number;
  overdueAmount: number;
  invoicesIssuedThisMonth: number;
  paymentsCountToday: number;
}

function Tile({ label, value, icon, tone }: { label: string; value: string; icon: string; tone: string }) {
  return (
    <div className="kpi h-full bg-white border border-[#d8e1ee] rounded-2xl p-4 flex flex-col gap-2.5 shadow-[0_1px_2px_rgba(0,31,77,.05)]">
      <div className="flex items-center gap-2">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${tone}`}>
          <Icon name={icon} size={15} />
        </span>
        <span className="text-[12.5px] font-semibold text-[#55637a] leading-tight">{label}</span>
      </div>
      <div className="dsp font-bold text-[#00296b] text-[22px] leading-none">{value}</div>
    </div>
  );
}

export default function FeesOverviewPage() {
  const { lang } = useApp();
  const dict = DICTIONARY[lang];
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/fees/dashboard')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success) setData(d.dashboard);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-[#063b78] tracking-tight">{dict.fees.title}</h1>
        <p className="text-[13.5px] text-[#64748b] mt-0.5 font-medium">{dict.fees.subtitle}</p>
      </div>

      <FeesSubNav />

      {loading ? (
        <div className="card p-12 rounded-2xl bg-white border border-[#dce5f0] text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Tile label={dict.fees.todayCollection} value={formatBDT(data?.todayCollection ?? 0, lang)} icon="banknote" tone="bg-[#e9eef7] text-[#00296b]" />
          <Tile label={dict.fees.monthCollection} value={formatBDT(data?.monthCollection ?? 0, lang)} icon="chart" tone="bg-[#e6effa] text-[#00509d]" />
          <Tile label={dict.fees.outstandingDue} value={formatBDT(data?.outstandingDue ?? 0, lang)} icon="wallet" tone="bg-[#fff6cc] text-[#7a5200]" />
          <Tile label={dict.fees.overdueAmount} value={formatBDT(data?.overdueAmount ?? 0, lang)} icon="alert" tone="bg-rose-50 text-rose-600" />
          <Tile label={dict.fees.invoicesIssued} value={String(data?.invoicesIssuedThisMonth ?? 0)} icon="file" tone="bg-[#e9eef7] text-[#00296b]" />
          <Tile label={dict.fees.paymentsCount} value={String(data?.paymentsCountToday ?? 0)} icon="check" tone="bg-emerald-50 text-emerald-600" />
        </div>
      )}

      <div className="card p-5 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
        <div className="text-[12px] font-bold text-[#55637a] uppercase tracking-wide mb-3">{dict.fees.quickLinks}</div>
        <div className="flex flex-wrap gap-2.5">
          <Link href="/fees/invoices/new" className="primary">
            <Icon name="plus" size={16} />
            <span>{dict.fees.newInvoice}</span>
          </Link>
          <Link href="/fees/structures/new" className="tb">
            <Icon name="plus" size={15} />
            <span>{dict.fees.newStructure}</span>
          </Link>
          <Link href="/fees/reports/due" className="tb">
            <Icon name="alert" size={15} />
            <span>{dict.fees.viewDue}</span>
          </Link>
          <Link href="/fees/reports/collection" className="tb">
            <Icon name="chart" size={15} />
            <span>{dict.fees.viewCollection}</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
