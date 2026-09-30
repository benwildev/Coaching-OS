'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import FeesSubNav from '@/components/FeesSubNav';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatBDT, formatDhakaDate, toBanglaNumeral } from '@/lib/i18n';

interface RecentPayment {
  id: string;
  receiptNumber: string;
  amount: number;
  paymentMethod: string;
  paymentDate: string;
  student: {
    id: string;
    name: string;
    studentIdCode: string;
    phone: string | null;
  };
  invoice: {
    id: string;
    invoiceNumber: string;
  };
}

interface UrgentDue {
  id: string;
  invoiceNumber: string;
  dueAmount: number;
  totalAmount: number;
  dueDate: string | null;
  daysOverdue: number;
  status: string;
  student: {
    id: string;
    name: string;
    studentIdCode: string;
    batchName: string | null;
  };
}

interface ActiveStructure {
  id: string;
  name: string;
  banglaName: string | null;
  amount: number;
  feeType: string;
  frequency: string;
  assignmentsCount: number;
}

interface DashboardData {
  todayCollection: number;
  monthCollection: number;
  outstandingDue: number;
  overdueAmount: number;
  invoicesIssuedThisMonth: number;
  paymentsCountToday: number;
  studentsWithDueCount: number;
  recentPayments: RecentPayment[];
  urgentDues: UrgentDue[];
  activeStructures: ActiveStructure[];
  methodBreakdown: Record<string, number>;
}

function getMethodBadge(method: string, lang: 'en' | 'bn') {
  switch (method) {
    case 'BKASH':
      return {
        label: lang === 'bn' ? 'বিকাশ' : 'bKash',
        badgeClass: 'bg-[#fdecf2] text-[#d12053] border-[#f9ccd9]',
        icon: 'banknote',
      };
    case 'NAGAD':
      return {
        label: lang === 'bn' ? 'নগদ' : 'Nagad',
        badgeClass: 'bg-[#fff3eb] text-[#e65100] border-[#fed7aa]',
        icon: 'banknote',
      };
    case 'CASH':
      return {
        label: lang === 'bn' ? 'ক্যাশ' : 'Cash',
        badgeClass: 'bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]',
        icon: 'banknote',
      };
    case 'BANK':
      return {
        label: lang === 'bn' ? 'ব্যাংক' : 'Bank',
        badgeClass: 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]',
        icon: 'building',
      };
    case 'CARD':
      return {
        label: lang === 'bn' ? 'কার্ড' : 'Card',
        badgeClass: 'bg-[#f5f3ff] text-[#6d28d9] border-[#ddd6fe]',
        icon: 'wallet',
      };
    default:
      return {
        label: method,
        badgeClass: 'bg-[#f1f5f9] text-[#475569] border-[#cbd5e1]',
        icon: 'banknote',
      };
  }
}

function getInitials(name: string) {
  if (!name) return 'ST';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function FeesOverviewPage() {
  const { lang } = useApp();
  const dict = DICTIONARY[lang];
  const [data, setData] = useState<DashboardData | null>(null);
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

  const totalMonthMethodSum = useMemo(() => {
    if (!data?.methodBreakdown) return 0;
    return Object.values(data.methodBreakdown).reduce((sum, val) => sum + (val || 0), 0);
  }, [data]);

  return (
    <div className="max-w-[1440px] mx-auto flex flex-col gap-6 pb-12 animate-in fade-in duration-300">
      {/* ============================================================ */}
      {/* 1. HEADER SECTION                                            */}
      {/* ============================================================ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/70 backdrop-blur-md p-6 rounded-2xl border border-[#dce5f0] shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-[#063b78] text-[#ffd200] flex items-center justify-center shadow-xs">
              <Icon name="banknote" size={20} />
            </span>
            <h1 className="text-2xl md:text-3xl font-extrabold text-[#063b78] tracking-tight">
              {dict.fees.title}
            </h1>
          </div>
          <p className="text-[13.5px] text-[#55637a] mt-1.5 font-medium">
            {dict.fees.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Link
            href="/fees/invoices/new"
            className="primary px-4 py-2.5 shadow-sm hover:shadow-md transition-all flex items-center gap-2"
          >
            <Icon name="plus" size={16} />
            <span>{dict.fees.newInvoice}</span>
          </Link>
          <Link
            href="/courses"
            className="tb bg-white hover:bg-slate-50 border-[#dce5f0] hover:border-[#063b78] transition-all flex items-center gap-2 shadow-2xs"
          >
            <Icon name="layers" size={15} />
            <span>{dict.coursePricing.manageFees}</span>
          </Link>
        </div>
      </div>

      {/* Sub Navigation Bar */}
      <FeesSubNav />

      {/* ============================================================ */}
      {/* 2. EXECUTIVE FINANCIAL KPI CARDS                             */}
      {/* ============================================================ */}
      {loading ? (
        <div className="card p-16 rounded-2xl bg-white border border-[#dce5f0] text-center shadow-2xs">
          <div className="inline-block h-9 w-9 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
          <p className="text-[13px] text-[#64748b] mt-3 font-medium">
            {lang === 'bn' ? 'আর্থিক তথ্য লোড হচ্ছে…' : 'Loading financial records…'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Today's Collection */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#063b78] to-[#042754] text-white p-5 shadow-sm border border-[#0b4b96] flex flex-col justify-between group hover:shadow-md transition-all">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[12px] font-semibold uppercase tracking-wider text-[#93c5fd]">
                    {dict.fees.todayCollection}
                  </span>
                  <div className="text-3xl font-extrabold mt-1 tracking-tight text-white num">
                    {formatBDT(data?.todayCollection ?? 0, lang)}
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-white/10 text-[#ffd200] flex items-center justify-center backdrop-blur-xs">
                  <Icon name="banknote" size={20} />
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[12.5px] text-blue-100">
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  {data?.paymentsCountToday
                    ? lang === 'bn'
                      ? `${toBanglaNumeral(data.paymentsCountToday)}টি পেমেন্ট সম্পন্ন`
                      : `${data.paymentsCountToday} payment(s) today`
                    : lang === 'bn'
                    ? 'আজ এখনো কোনো পেমেন্ট আসেনি'
                    : 'No payments yet today'}
                </span>
                <Link
                  href="/fees/payments"
                  className="text-[#ffd200] hover:text-white font-semibold transition-colors flex items-center gap-1 text-[12px]"
                >
                  {dict.fees.viewAllPayments} →
                </Link>
              </div>
            </div>

            {/* Card 2: This Month's Collection */}
            <div className="rounded-2xl bg-white border border-[#d8e1ee] p-5 shadow-2xs hover:shadow-sm transition-all flex flex-col justify-between group">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[12px] font-semibold uppercase tracking-wider text-[#55637a]">
                    {dict.fees.monthCollection}
                  </span>
                  <div className="text-3xl font-extrabold mt-1 tracking-tight text-[#00296b] num">
                    {formatBDT(data?.monthCollection ?? 0, lang)}
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-[#e6effa] text-[#00509d] flex items-center justify-center">
                  <Icon name="chart" size={20} />
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#edf1f7] flex items-center justify-between text-[12.5px] text-[#64748b]">
                <span className="font-medium">
                  {lang === 'bn'
                    ? `${toBanglaNumeral(data?.invoicesIssuedThisMonth ?? 0)}টি চালান ইস্যু`
                    : `${data?.invoicesIssuedThisMonth ?? 0} invoices issued`}
                </span>
                <Link
                  href="/fees/reports/collection"
                  className="text-[#063b78] hover:text-[#00296b] font-semibold transition-colors text-[12px]"
                >
                  {dict.fees.viewCollection} →
                </Link>
              </div>
            </div>

            {/* Card 3: Total Outstanding Due */}
            <div className="rounded-2xl bg-white border border-[#ffd500]/40 p-5 shadow-2xs hover:shadow-sm transition-all flex flex-col justify-between group">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[12px] font-semibold uppercase tracking-wider text-[#7a5200]">
                    {dict.fees.outstandingDue}
                  </span>
                  <div className="text-3xl font-extrabold mt-1 tracking-tight text-[#b45309] num">
                    {formatBDT(data?.outstandingDue ?? 0, lang)}
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-[#fef3c7] text-[#b45309] flex items-center justify-center">
                  <Icon name="wallet" size={20} />
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#fef3c7] flex items-center justify-between text-[12.5px] text-[#7a5200]">
                <span className="font-medium">
                  {data?.studentsWithDueCount
                    ? lang === 'bn'
                      ? `${toBanglaNumeral(data.studentsWithDueCount)} জন শিক্ষার্থীর বকেয়া`
                      : `${data.studentsWithDueCount} students with due`
                    : lang === 'bn'
                    ? 'কোনো বকেয়া নেই'
                    : 'Zero dues pending'}
                </span>
                <Link
                  href="/fees/reports/due"
                  className="text-[#b45309] hover:text-[#92400e] font-semibold transition-colors text-[12px]"
                >
                  {dict.fees.viewDue} →
                </Link>
              </div>
            </div>

            {/* Card 4: Overdue Amount Alert */}
            <div className="rounded-2xl bg-white border border-rose-200 p-5 shadow-2xs hover:shadow-sm transition-all flex flex-col justify-between group">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[12px] font-semibold uppercase tracking-wider text-rose-600">
                    {dict.fees.overdueAmount}
                  </span>
                  <div className="text-3xl font-extrabold mt-1 tracking-tight text-rose-700 num">
                    {formatBDT(data?.overdueAmount ?? 0, lang)}
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <Icon name="alert" size={20} />
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-rose-100 flex items-center justify-between text-[12.5px] text-rose-600">
                <span className="font-medium flex items-center gap-1">
                  <Icon name="clock" size={13} />
                  {lang === 'bn' ? 'দ্রুত তাগাদা প্রয়োজন' : 'Immediate follow-up'}
                </span>
                <Link
                  href="/fees/reports/due"
                  className="text-rose-700 hover:text-rose-900 font-semibold transition-colors text-[12px]"
                >
                  {dict.fees.viewDue} →
                </Link>
              </div>
            </div>
          </div>

          {/* ============================================================ */}
          {/* 3. HIGH-IMPACT QUICK ACTIONS GRID                            */}
          {/* ============================================================ */}
          <div className="rounded-2xl bg-white border border-[#dce5f0] p-6 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-[14px] font-bold uppercase tracking-wider text-[#063b78]">
                  {dict.fees.quickActionsTitle}
                </h3>
                <p className="text-[12.5px] text-[#64748b]">
                  {lang === 'bn'
                    ? 'ফি ব্যবস্থাপনা, চালান ইস্যু ও আদায় সংক্রান্ত দ্রুত শর্টকাট'
                    : 'Frequent workflows for invoicing, course fees, and collections'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* Action 1: New Invoice */}
              <Link
                href="/fees/invoices/new"
                className="group p-4 rounded-xl border border-[#dce5f0] bg-[#fafcff] hover:bg-[#fffdf0] hover:border-[#ffd200] transition-all flex flex-col justify-between gap-3 shadow-2xs hover:-translate-y-0.5"
              >
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-lg bg-[#ffd200] text-[#063b78] flex items-center justify-center font-bold shadow-xs">
                    <Icon name="file" size={17} />
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-[13.5px] font-bold text-[#063b78] group-hover:text-[#042754] flex items-center gap-1">
                      {dict.fees.newInvoice}
                      <Icon name="chevright" size={13} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </h4>
                  </div>
                </div>
                <p className="text-[12px] text-[#64748b] leading-relaxed">
                  {dict.fees.newInvoiceDesc}
                </p>
              </Link>

              {/* Action 2: Course Fees (course pricing lives on each course) */}
              <Link
                href="/courses"
                className="group p-4 rounded-xl border border-[#dce5f0] bg-[#fafcff] hover:bg-[#f3f7fc] hover:border-[#063b78] transition-all flex flex-col justify-between gap-3 shadow-2xs hover:-translate-y-0.5"
              >
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-lg bg-[#e9eef7] text-[#063b78] flex items-center justify-center font-bold">
                    <Icon name="layers" size={17} />
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-[13.5px] font-bold text-[#063b78] flex items-center gap-1">
                      {dict.coursePricing.manageFees}
                      <Icon name="chevright" size={13} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </h4>
                  </div>
                </div>
                <p className="text-[12px] text-[#64748b] leading-relaxed">
                  {dict.coursePricing.manageFeesDesc}
                </p>
              </Link>

              {/* Action 3: View Due Report */}
              <Link
                href="/fees/reports/due"
                className="group p-4 rounded-xl border border-[#dce5f0] bg-[#fafcff] hover:bg-[#fefce8] hover:border-[#ca8a04] transition-all flex flex-col justify-between gap-3 shadow-2xs hover:-translate-y-0.5"
              >
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-lg bg-[#fef3c7] text-[#b45309] flex items-center justify-center font-bold">
                    <Icon name="alert" size={17} />
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-[13.5px] font-bold text-[#063b78] flex items-center gap-1">
                      {dict.fees.viewDue}
                      <Icon name="chevright" size={13} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </h4>
                  </div>
                </div>
                <p className="text-[12px] text-[#64748b] leading-relaxed">
                  {dict.fees.viewDueDesc}
                </p>
              </Link>

              {/* Action 4: Collection Report */}
              <Link
                href="/fees/reports/collection"
                className="group p-4 rounded-xl border border-[#dce5f0] bg-[#fafcff] hover:bg-[#f0fdf4] hover:border-emerald-500 transition-all flex flex-col justify-between gap-3 shadow-2xs hover:-translate-y-0.5"
              >
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-lg bg-[#ecfdf5] text-[#047857] flex items-center justify-center font-bold">
                    <Icon name="chart" size={17} />
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-[13.5px] font-bold text-[#063b78] flex items-center gap-1">
                      {dict.fees.viewCollection}
                      <Icon name="chevright" size={13} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </h4>
                  </div>
                </div>
                <p className="text-[12px] text-[#64748b] leading-relaxed">
                  {dict.fees.viewCollectionDesc}
                </p>
              </Link>
            </div>
          </div>

          {/* ============================================================ */}
          {/* 4. MAIN BENTO TWO-COLUMN CONTENT AREA                        */}
          {/* ============================================================ */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* ---------------------------------------------------------- */}
            {/* LEFT COLUMN (7 / 12 COLS)                                 */}
            {/* ---------------------------------------------------------- */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              {/* Section: Recent Payments */}
              <div className="card rounded-2xl bg-white border border-[#dce5f0] p-6 shadow-2xs flex flex-col">
                <div className="flex items-center justify-between pb-4 border-b border-[#edf1f7]">
                  <div>
                    <h3 className="text-base font-bold text-[#063b78] flex items-center gap-2">
                      <Icon name="banknote" size={18} className="text-[#00509d]" />
                      {dict.fees.recentPayments}
                    </h3>
                    <p className="text-[12.5px] text-[#64748b] mt-0.5">
                      {dict.fees.recentPaymentsDesc}
                    </p>
                  </div>
                  <Link
                    href="/fees/payments"
                    className="text-[12.5px] font-bold text-[#063b78] hover:text-[#00509d] flex items-center gap-1"
                  >
                    <span>{dict.fees.viewAllPayments}</span>
                    <Icon name="chevright" size={13} />
                  </Link>
                </div>

                <div className="divide-y divide-[#edf1f7]">
                  {!data?.recentPayments || data.recentPayments.length === 0 ? (
                    <div className="py-12 text-center flex flex-col items-center justify-center">
                      <span className="w-12 h-12 rounded-2xl bg-[#f1f5f9] text-[#64748b] flex items-center justify-center mb-3">
                        <Icon name="banknote" size={24} />
                      </span>
                      <p className="text-[14px] font-semibold text-[#55637a]">
                        {dict.fees.noRecentPayments}
                      </p>
                      <p className="text-[12px] text-[#94a3b8] mt-1 max-w-sm">
                        {lang === 'bn'
                          ? 'চালান তৈরি করে পেমেন্ট গ্রহণ করলে এখানে সর্বশেষ মানি রিসিট ও লেনদেনের তালিকা দেখা যাবে।'
                          : 'Recorded student fee payments and receipts will automatically appear here in real time.'}
                      </p>
                      <Link href="/fees/invoices" className="primary mt-4 text-[12.5px]">
                        <Icon name="plus" size={15} />
                        <span>{lang === 'bn' ? 'চালান তালিকা থেকে পেমেন্ট নিন' : 'Collect via Invoices'}</span>
                      </Link>
                    </div>
                  ) : (
                    data.recentPayments.map((p) => {
                      const badge = getMethodBadge(p.paymentMethod, lang);
                      return (
                        <div
                          key={p.id}
                          className="py-3.5 flex items-center justify-between gap-3 hover:bg-[#fafcff] transition-colors rounded-xl px-2"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-9 h-9 rounded-full bg-[#e9eef7] text-[#063b78] font-bold text-xs flex items-center justify-center shrink-0 border border-[#d8e1ee]">
                              {getInitials(p.student?.name)}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Link
                                  href={`/fees/student/${p.student?.id}`}
                                  className="text-[13.5px] font-bold text-[#063b78] hover:underline truncate"
                                >
                                  {p.student?.name}
                                </Link>
                                <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-[#475569]">
                                  {p.student?.studentIdCode}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-[11.5px] text-[#64748b] mt-0.5">
                                <span>{p.receiptNumber}</span>
                                <span>•</span>
                                <span>{formatDhakaDate(p.paymentDate)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${badge.badgeClass}`}
                            >
                              {badge.label}
                            </span>
                            <div className="text-right">
                              <div className="text-[14.5px] font-extrabold text-emerald-700 num">
                                + {formatBDT(p.amount, lang)}
                              </div>
                            </div>
                            <Link
                              href={`/fees/payments/${p.id}`}
                              className="w-8 h-8 rounded-lg border border-[#dce5f0] text-[#063b78] hover:bg-[#e9eef7] flex items-center justify-center transition-colors"
                              title={dict.fees.viewReceipt}
                            >
                              <Icon name="file" size={14} />
                            </Link>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Section: Urgent Overdue Invoices */}
              <div className="card rounded-2xl bg-white border border-[#dce5f0] p-6 shadow-2xs flex flex-col">
                <div className="flex items-center justify-between pb-4 border-b border-[#edf1f7]">
                  <div>
                    <h3 className="text-base font-bold text-rose-800 flex items-center gap-2">
                      <Icon name="alert" size={18} className="text-rose-600" />
                      {dict.fees.urgentDuesTitle}
                    </h3>
                    <p className="text-[12.5px] text-[#64748b] mt-0.5">
                      {dict.fees.urgentDuesDesc}
                    </p>
                  </div>
                  <Link
                    href="/fees/reports/due"
                    className="text-[12.5px] font-bold text-rose-700 hover:text-rose-900 flex items-center gap-1"
                  >
                    <span>{dict.fees.viewAllInvoices}</span>
                    <Icon name="chevright" size={13} />
                  </Link>
                </div>

                <div className="divide-y divide-[#edf1f7]">
                  {!data?.urgentDues || data.urgentDues.length === 0 ? (
                    <div className="py-8 text-center flex flex-col items-center justify-center">
                      <span className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2">
                        <Icon name="check" size={20} />
                      </span>
                      <p className="text-[13.5px] font-semibold text-emerald-800">
                        {dict.fees.noUrgentDues}
                      </p>
                    </div>
                  ) : (
                    data.urgentDues.map((inv) => (
                      <div
                        key={inv.id}
                        className="py-3.5 flex items-center justify-between gap-3 hover:bg-[#fffbfb] transition-colors rounded-xl px-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link
                              href={`/fees/invoices/${inv.id}`}
                              className="text-[13.5px] font-bold text-[#063b78] hover:underline truncate"
                            >
                              {inv.student.name}
                            </Link>
                            <span className="text-[11px] font-semibold text-[#64748b] bg-slate-100 px-1.5 py-0.5 rounded">
                              {inv.student.studentIdCode}
                            </span>
                            {inv.student.batchName && (
                              <span className="text-[11px] text-[#00509d] font-medium">
                                ({inv.student.batchName})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11.5px] text-[#64748b] mt-0.5">
                            <span>{inv.invoiceNumber}</span>
                            <span>•</span>
                            <span className="text-rose-600 font-semibold">
                              {inv.daysOverdue > 0
                                ? lang === 'bn'
                                  ? `${toBanglaNumeral(inv.daysOverdue)} ${dict.fees.daysLate}`
                                  : `${inv.daysOverdue} ${dict.fees.daysLate}`
                                : inv.dueDate
                                ? `${lang === 'bn' ? 'মেয়াদ:' : 'Due:'} ${formatDhakaDate(inv.dueDate)}`
                                : ''}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <span className="text-[11px] font-semibold text-[#64748b] block">
                              {lang === 'bn' ? 'বকেয়া' : 'Due'}
                            </span>
                            <span className="text-[14px] font-extrabold text-rose-700 num">
                              {formatBDT(inv.dueAmount, lang)}
                            </span>
                          </div>
                          <Link
                            href={`/fees/invoices/${inv.id}/payment`}
                            className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[12px] border border-rose-200 transition-colors"
                          >
                            {dict.fees.collectPayment}
                          </Link>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* ---------------------------------------------------------- */}
            {/* RIGHT COLUMN (5 / 12 COLS)                                */}
            {/* ---------------------------------------------------------- */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              {/* Section: Payment Methods Breakdown */}
              <div className="card rounded-2xl bg-white border border-[#dce5f0] p-6 shadow-2xs flex flex-col">
                <div className="flex items-center justify-between pb-3 border-b border-[#edf1f7]">
                  <h3 className="text-base font-bold text-[#063b78] flex items-center gap-2">
                    <Icon name="chart" size={17} className="text-[#063b78]" />
                    {dict.fees.methodBreakdownTitle}
                  </h3>
                  <span className="text-[11.5px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    {formatBDT(totalMonthMethodSum, lang)}
                  </span>
                </div>

                <div className="flex flex-col gap-4 mt-4">
                  {[
                    { key: 'CASH', label: lang === 'bn' ? 'ক্যাশ (নগদ)' : 'Cash in Hand', color: 'bg-emerald-500' },
                    { key: 'BKASH', label: lang === 'bn' ? 'বিকাশ (bKash)' : 'bKash MFS', color: 'bg-[#e2136e]' },
                    { key: 'NAGAD', label: lang === 'bn' ? 'নগদ (Nagad)' : 'Nagad MFS', color: 'bg-[#f7941d]' },
                    { key: 'BANK', label: lang === 'bn' ? 'ব্যাংক ট্রান্সফার' : 'Bank Transfer', color: 'bg-[#00509d]' },
                    { key: 'CARD', label: lang === 'bn' ? 'কার্ড ও অন্যান্য' : 'Cards & Others', color: 'bg-[#7c3aed]' },
                  ].map((m) => {
                    const amount = data?.methodBreakdown?.[m.key] || 0;
                    const pct = totalMonthMethodSum > 0 ? Math.round((amount / totalMonthMethodSum) * 100) : 0;
                    return (
                      <div key={m.key} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-[12.5px]">
                          <span className="font-semibold text-[#55637a] flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${m.color}`} />
                            {m.label}
                          </span>
                          <span className="font-bold text-[#063b78] num">
                            {formatBDT(amount, lang)} ({pct}%)
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-[#f1f5f9] overflow-hidden">
                          <div
                            className={`h-full rounded-full ${m.color} transition-all duration-500`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 pt-4 border-t border-[#edf1f7] flex items-center justify-between">
                  <span className="text-[12px] text-[#64748b]">
                    {lang === 'bn' ? 'মোট লেনদেনের স্বচ্ছ অডিট' : 'Complete audit trail'}
                  </span>
                  <Link
                    href="/fees/reports/collection"
                    className="text-[12.5px] font-bold text-[#063b78] hover:underline"
                  >
                    {dict.fees.viewCollection} →
                  </Link>
                </div>
              </div>

              {/* Section: Course Fees — pricing is configured on each course, not as a separate fee catalog */}
              <div className="card rounded-2xl bg-white border border-[#dce5f0] p-6 shadow-2xs flex flex-col">
                <div className="flex items-center justify-between pb-3 border-b border-[#edf1f7]">
                  <h3 className="text-base font-bold text-[#063b78] flex items-center gap-2">
                    <Icon name="layers" size={17} className="text-[#063b78]" />
                    {dict.coursePricing.manageFees}
                  </h3>
                  <Link href="/courses" className="text-[12px] font-bold text-[#063b78] hover:underline">
                    {dict.courses.title} →
                  </Link>
                </div>
                <p className="text-[13px] text-[#64748b] mt-3 leading-relaxed">{dict.coursePricing.manageFeesDesc}</p>
                <div className="mt-auto pt-4">
                  <Link
                    href="/courses"
                    className="tb w-full justify-center text-[12.5px] font-bold bg-[#fafcff] hover:bg-[#eef4fc]"
                  >
                    <Icon name="layers" size={15} />
                    <span>{dict.coursePricing.manageFees}</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
