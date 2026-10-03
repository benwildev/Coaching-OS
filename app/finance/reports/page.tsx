'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import FinanceSubNav from '@/components/FinanceSubNav';
import { BarChart, HBarList } from '@/components/reports/charts';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatBDTExact, pickLocalized, localizeNumber } from '@/lib/i18n';
import Icon from '@/components/Icon';
import type { FinanceReportData } from '@/lib/services/finance-reports.service';

type Preset = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'allTime' | 'custom';
const PRESETS: Preset[] = ['today', 'yesterday', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'thisYear', 'allTime', 'custom'];

type ReportView = 'all' | 'income' | 'expenses' | 'profit' | 'cash' | 'salary';

// ---- Asia/Dhaka calendar math on YYYY-MM-DD strings (never the browser-local date) ----
const todayDhaka = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
const shift = (ymd: string, n: number) => new Date(new Date(`${ymd}T00:00:00.000Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

function computePresetRange(p: Preset, today = todayDhaka()): { from: string; to: string } {
  if (p === 'today') return { from: today, to: today };
  if (p === 'yesterday') {
    const y = shift(today, -1);
    return { from: y, to: y };
  }
  if (p === 'thisWeek') {
    const dt = new Date(`${today}T00:00:00.000Z`);
    const dow = (dt.getUTCDay() + 1) % 7; // Saturday = 0 in BD business week
    return { from: shift(today, -dow), to: today };
  }
  if (p === 'lastWeek') {
    const dt = new Date(`${today}T00:00:00.000Z`);
    const dow = (dt.getUTCDay() + 1) % 7;
    const end = shift(today, -dow - 1);
    return { from: shift(end, -6), to: end };
  }
  if (p === 'thisMonth') return { from: `${today.slice(0, 7)}-01`, to: today };
  if (p === 'lastMonth') {
    const year = Number(today.slice(0, 4));
    const month = Number(today.slice(5, 7));
    const prevM = month === 1 ? 12 : month - 1;
    const prevY = month === 1 ? year - 1 : year;
    const mm = String(prevM).padStart(2, '0');
    const lastDay = new Date(Date.UTC(prevY, prevM, 0)).getUTCDate();
    return { from: `${prevY}-${mm}-01`, to: `${prevY}-${mm}-${String(lastDay).padStart(2, '0')}` };
  }
  if (p === 'thisYear') return { from: `${today.slice(0, 4)}-01-01`, to: today };
  if (p === 'allTime') return { from: '2020-01-01', to: today };
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

export default function FinanceReportsPage() {
  const { lang } = useApp();
  const dict = DICTIONARY[lang].finance;

  const [preset, setPreset] = useState<Preset>('thisMonth');
  const [dateRange, setDateRange] = useState(() => computePresetRange('thisMonth'));
  const [customFrom, setCustomFrom] = useState(dateRange.from);
  const [customTo, setCustomTo] = useState(dateRange.to);
  const [branchId, setBranchId] = useState<string>('all');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [paymentMethod, setPaymentMethod] = useState<string>('all');
  const [comparison, setComparison] = useState(false);
  const [activeView, setActiveView] = useState<ReportView>('all');

  const [data, setData] = useState<FinanceReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p !== 'custom') {
      const r = computePresetRange(p);
      setDateRange(r);
      setCustomFrom(r.from);
      setCustomTo(r.to);
    }
  };

  const applyCustom = () => {
    if (customFrom > customTo) return;
    setPreset('custom');
    setDateRange({ from: customFrom, to: customTo });
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const q = new URLSearchParams({
          from: dateRange.from,
          to: dateRange.to,
          branchId,
          categoryId,
          paymentMethod,
          comparison: comparison ? 'true' : 'false',
        });
        const res = await fetch(`/api/finance/reports?${q.toString()}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success) {
          setError(json.message || dict.loadFailed);
          return;
        }
        setData(json);
      } catch {
        if (!cancelled) setError(dict.loadFailed);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [dateRange, branchId, categoryId, paymentMethod, comparison, dict.loadFailed]);

  const presetLabels: Record<Preset, string> = {
    today: dict.range.today,
    yesterday: dict.range.yesterday,
    thisWeek: dict.range.thisWeek,
    lastWeek: dict.lastWeek || (lang === 'bn' ? 'গত সপ্তাহ' : 'Last Week'),
    thisMonth: dict.range.thisMonth,
    lastMonth: dict.range.lastMonth,
    thisYear: dict.range.thisYear,
    allTime: dict.viewAllTime || (lang === 'bn' ? 'সকল সময়' : 'All Time'),
    custom: dict.range.custom,
  };

  const views: Array<{ id: ReportView; label: string; icon: string }> = [
    { id: 'all', label: lang === 'bn' ? 'সব রিপোর্ট' : 'All Reports', icon: 'dashboard' },
    { id: 'income', label: dict.reportIncome || (lang === 'bn' ? 'আয় সারসংক্ষেপ' : 'Income'), icon: 'wallet' },
    { id: 'expenses', label: dict.reportExpenses || (lang === 'bn' ? 'খরচ সারসংক্ষেপ' : 'Expenses'), icon: 'banknote' },
    { id: 'profit', label: dict.reportProfit || (lang === 'bn' ? 'লাভ ও ক্ষতি' : 'Profit & Loss'), icon: 'chart' },
    { id: 'cash', label: dict.reportCash || (lang === 'bn' ? 'ক্যাশ সারসংক্ষেপ' : 'Cash'), icon: 'cash' },
    { id: 'salary', label: dict.reportSalary || (lang === 'bn' ? 'শিক্ষক বেতন' : 'Salary'), icon: 'user' },
  ];

  return (
    <div className="space-y-5 pb-12 max-w-7xl mx-auto px-3 sm:px-6">
      {/* Header with SubNav */}
      <div>
        <PageHeader
          title={dict.reportsTitle || (lang === 'bn' ? 'আর্থিক রিপোর্ট' : 'Finance Reports')}
          subtitle={dict.reportsSubtitle || (lang === 'bn' ? 'আয়, খরচ, লাভ এবং ক্যাশ অবস্থানের বিস্তারিত রিপোর্ট' : 'Operational reports for income, expenses, profit and cash position')}
        />
        <div className="mt-3">
          <FinanceSubNav />
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
        {/* Preset pill bar */}
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto hs pb-1">
          {PRESETS.map((p) => {
            const active = preset === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => applyPreset(p)}
                className={`px-3 py-1.5 rounded-xl text-xs sm:text-[13px] font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-[#063b78] text-white shadow-xs font-bold'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {presetLabels[p]}
              </button>
            );
          })}
        </div>

        {/* Secondary filters row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2 border-t border-slate-100">
          {/* Custom Date Pickers */}
          {preset === 'custom' && (
            <div className="sm:col-span-2 flex items-center gap-2">
              <div className="flex-1">
                <label className="text-[11px] font-semibold text-slate-500 uppercase">{dict.from}</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-full text-xs font-semibold px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#063b78]"
                />
              </div>
              <div className="flex-1">
                <label className="text-[11px] font-semibold text-slate-500 uppercase">{dict.to}</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-full text-xs font-semibold px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#063b78]"
                />
              </div>
              <button
                type="button"
                onClick={applyCustom}
                className="mt-4 px-3 py-1.5 bg-[#063b78] text-white text-xs font-bold rounded-lg hover:bg-[#052e5e] cursor-pointer"
              >
                {dict.apply}
              </button>
            </div>
          )}

          {/* Branch Filter */}
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase">{dict.branch}</label>
            <select
              value={branchId}
              disabled={data?.branch.locked}
              onChange={(e) => setBranchId(e.target.value)}
              className="w-full text-xs font-semibold px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#063b78] disabled:bg-slate-50"
            >
              {!data?.branch.locked && <option value="all">{dict.allBranches}</option>}
              {data?.branch.options.map((b) => (
                <option key={b.id} value={b.id}>
                  {pickLocalized(lang, b.name, b.banglaName)}
                </option>
              ))}
            </select>
          </div>

          {/* Payment Method Filter */}
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase">{dict.colMethod}</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full text-xs font-semibold px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#063b78]"
            >
              <option value="all">{dict.allMethods || (lang === 'bn' ? 'সকল মাধ্যম' : 'All Methods')}</option>
              <option value="CASH">CASH (নগদ)</option>
              <option value="BKASH">bKash (বিকাশ)</option>
              <option value="NAGAD">Nagad (নগদ ওয়ালেট)</option>
              <option value="BANK">Bank (ব্যাংক)</option>
              <option value="CARD">Card (কার্ড)</option>
              <option value="OTHER">Other (অন্যান্য)</option>
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase">{lang === 'bn' ? 'ক্যাটাগরি' : 'Category'}</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full text-xs font-semibold px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#063b78]"
            >
              <option value="all">{lang === 'bn' ? 'সকল ক্যাটাগরি' : 'All Categories'}</option>
              {data?.expenses.byCategory.map((c) => (
                <option key={c.categoryId} value={c.categoryId}>
                  {pickLocalized(lang, c.name, c.banglaName)}
                </option>
              ))}
            </select>
          </div>

          {/* Previous Period Compare */}
          <div className="flex items-center gap-2 pt-4">
            <input
              type="checkbox"
              id="compareCheck"
              checked={comparison}
              onChange={(e) => setComparison(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-[#063b78] focus:ring-[#063b78] cursor-pointer"
            />
            <label htmlFor="compareCheck" className="text-xs font-medium text-slate-700 select-none cursor-pointer">
              {dict.compare}
            </label>
          </div>
        </div>

        {/* View Switcher Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
          {views.map((v) => {
            const active = activeView === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setActiveView(v.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  active
                    ? 'bg-slate-800 text-white font-bold'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{v.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading & Error States */}
      {loading && (
        <div className="py-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-200 border-t-[#063b78] mb-2" />
          <p className="text-sm font-semibold">{lang === 'bn' ? 'তথ্য লোড হচ্ছে...' : 'Loading report data...'}</p>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm font-semibold">
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Top Headline Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Net Collection */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">{dict.netIncome}</span>
                <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                  <Icon name="wallet" size={16} />
                </span>
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-2">
                {formatBDTExact(data.summary.netCollection, lang)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                <span>{dict.grossCollection}: {formatBDTExact(data.summary.grossCollection, lang)}</span>
                <span className="text-rose-600 font-medium">-{formatBDTExact(data.summary.refunds, lang)}</span>
              </div>
              {data.comparison && (
                <div className="mt-2 text-[11px] font-semibold">
                  {data.comparison.netCollection.changePct !== null ? (
                    <span className={data.comparison.netCollection.changePct >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                      {data.comparison.netCollection.changePct >= 0 ? '↑' : '↓'} {Math.abs(data.comparison.netCollection.changePct)}% {dict.vsPrevious}
                    </span>
                  ) : (
                    <span className="text-slate-400">{dict.noPrevious}</span>
                  )}
                </div>
              )}
            </div>

            {/* Total Expenses */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">{dict.expenses}</span>
                <span className="p-1.5 bg-rose-50 text-rose-600 rounded-lg">
                  <Icon name="banknote" size={16} />
                </span>
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-2">
                {formatBDTExact(data.summary.totalExpenses, lang)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                <span>{dict.cashExpensesLabel || (lang === 'bn' ? 'নগদ' : 'Cash')}: {formatBDTExact(data.summary.cashExpenses, lang)}</span>
                <span>{dict.nonCashExpensesLabel || (lang === 'bn' ? 'অন্যান্য' : 'Non-Cash')}: {formatBDTExact(data.summary.nonCashExpenses, lang)}</span>
              </div>
              {data.comparison && (
                <div className="mt-2 text-[11px] font-semibold">
                  {data.comparison.expenses.changePct !== null ? (
                    <span className={data.comparison.expenses.changePct <= 0 ? 'text-emerald-600' : 'text-amber-600'}>
                      {data.comparison.expenses.changePct >= 0 ? '↑' : '↓'} {Math.abs(data.comparison.expenses.changePct)}% {dict.vsPrevious}
                    </span>
                  ) : (
                    <span className="text-slate-400">{dict.noPrevious}</span>
                  )}
                </div>
              )}
            </div>

            {/* Net Profit (Cash Basis) */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">{dict.netProfit}</span>
                <span className={`p-1.5 rounded-lg ${data.summary.netProfit >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                  <Icon name="chart" size={16} />
                </span>
              </div>
              <div className={`text-2xl font-bold mt-2 ${data.summary.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {formatBDTExact(data.summary.netProfit, lang)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {dict.netMarginLabel || (lang === 'bn' ? 'মার্জিন' : 'Margin')}:{' '}
                <span className="font-semibold text-slate-800">
                  {data.summary.netMargin !== null ? `${localizeNumber(lang, data.summary.netMargin)}%` : '—'}
                </span>
              </div>
              {data.comparison && (
                <div className="mt-2 text-[11px] font-semibold">
                  {data.comparison.netProfit.changePct !== null ? (
                    <span className={data.comparison.netProfit.changePct >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                      {data.comparison.netProfit.changePct >= 0 ? '↑' : '↓'} {Math.abs(data.comparison.netProfit.changePct)}% {dict.vsPrevious}
                    </span>
                  ) : (
                    <span className="text-slate-400">{dict.noPrevious}</span>
                  )}
                </div>
              )}
            </div>

            {/* Cash Drawer In vs Out */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">{dict.cashMovement}</span>
                <span className="p-1.5 bg-blue-50 text-[#063b78] rounded-lg">
                  <Icon name="cash" size={16} />
                </span>
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-2">
                {formatBDTExact(data.cash.cashIn - data.cash.cashOut, lang)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                <span>{dict.cashCollected}: {formatBDTExact(data.cash.cashIn, lang)}</span>
                <span className="text-rose-600">-{formatBDTExact(data.cash.cashOut, lang)}</span>
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                {data.cash.sessions.length} {lang === 'bn' ? 'টি ক্যাশ সেশন' : 'recorded sessions'}
              </div>
            </div>
          </div>

          {/* Empty State when no data */}
          {data.summary.grossCollection === 0 && data.summary.totalExpenses === 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-500">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                <Icon name="doc" size={24} />
              </div>
              <h3 className="text-base font-bold text-slate-800">{dict.noReportData}</h3>
              <p className="text-xs text-slate-500 mt-1">
                {lang === 'bn'
                  ? 'এই সময়ের জন্য কোনো পেমেন্ট বা খরচ রেকর্ড করা হয়নি।'
                  : 'No payments or expenses have been recorded for the selected period.'}
              </p>
            </div>
          )}

          {/* Section A: Income Summary */}
          {(activeView === 'all' || activeView === 'income') && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {dict.reportIncome || (lang === 'bn' ? 'আয় সারসংক্ষেপ' : 'Income Summary')}
                  </h3>
                  <p className="text-xs text-slate-500">{dict.formulaNet}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold text-slate-500 uppercase">{dict.netIncome}</span>
                  <div className="text-lg font-bold text-emerald-700">
                    {formatBDTExact(data.summary.netCollection, lang)}
                  </div>
                </div>
              </div>

              {/* By Method & By Branch Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Method Breakdown */}
                <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50">
                  <h4 className="text-xs font-bold text-slate-700 uppercase mb-3">{dict.byMethod}</h4>
                  <div className="space-y-2">
                    {data.income.byMethod.map((m) => (
                      <div key={m.method} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-0">
                        <span className="font-semibold text-slate-700">{m.method}</span>
                        <div className="text-right">
                          <span className="font-bold text-slate-900">{formatBDTExact(m.net, lang)}</span>
                          {m.refunds > 0 && (
                            <span className="text-[10px] text-slate-400 block">
                              (Gross: {formatBDTExact(m.gross, lang)} - Ref: {formatBDTExact(m.refunds, lang)})
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Branch Breakdown (if multiple) */}
                {data.income.byBranch.length > 1 && (
                  <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50">
                    <h4 className="text-xs font-bold text-slate-700 uppercase mb-3">
                      {lang === 'bn' ? 'ব্রাঞ্চ অনুযায়ী আদায়' : 'Collection by Branch'}
                    </h4>
                    <div className="space-y-2">
                      {data.income.byBranch.map((b) => (
                        <div key={b.branchId} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-0">
                          <span className="font-semibold text-slate-700">{pickLocalized(lang, b.branchName, b.branchBanglaName)}</span>
                          <span className="font-bold text-slate-900">{formatBDTExact(b.net, lang)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Daily Income Breakdown Table */}
              {data.income.byDate.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-xs font-bold text-slate-700 uppercase mb-2">
                    {lang === 'bn' ? 'তারিখভিত্তিক বিস্তারিত' : 'Daily Income Log'}
                  </h4>
                  <div className="overflow-x-auto hs border border-slate-200 rounded-xl">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase text-[11px]">
                        <tr>
                          <th className="px-3 py-2.5">{dict.colDate}</th>
                          <th className="px-3 py-2.5 text-right">{dict.colGross}</th>
                          <th className="px-3 py-2.5 text-right">{dict.colRefunds}</th>
                          <th className="px-3 py-2.5 text-right">{dict.colNet}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.income.byDate.map((row) => (
                          <tr key={row.date} className="hover:bg-slate-50/50">
                            <td className="px-3 py-2 font-medium text-slate-800">{row.date}</td>
                            <td className="px-3 py-2 text-right text-slate-700">{formatBDTExact(row.gross, lang)}</td>
                            <td className="px-3 py-2 text-right text-rose-600">
                              {row.refunds > 0 ? `-${formatBDTExact(row.refunds, lang)}` : '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-emerald-700">
                              {formatBDTExact(row.net, lang)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Section B: Expense Summary */}
          {(activeView === 'all' || activeView === 'expenses') && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {dict.reportExpenses || (lang === 'bn' ? 'খরচ সারসংক্ষেপ' : 'Expense Summary')}
                  </h3>
                  <p className="text-xs text-slate-500">{dict.expensesHelp}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold text-slate-500 uppercase">{dict.expenses}</span>
                  <div className="text-lg font-bold text-rose-700">
                    {formatBDTExact(data.summary.totalExpenses, lang)}
                  </div>
                </div>
              </div>

              {/* Category Breakdown with HBarList */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50">
                  <h4 className="text-xs font-bold text-slate-700 uppercase mb-3">{dict.byCategory}</h4>
                  {data.expenses.byCategory.length === 0 ? (
                    <p className="text-xs text-slate-400 py-3">{lang === 'bn' ? 'কোনো খরচ নেই' : 'No expenses recorded'}</p>
                  ) : (
                    <div className="space-y-2">
                      <HBarList
                        ariaLabel={dict.byCategory}
                        rows={data.expenses.byCategory.map((c) => ({
                          key: c.categoryId,
                          label: pickLocalized(lang, c.name, c.banglaName),
                          value: c.amount,
                          display: formatBDTExact(c.amount, lang),
                        }))}
                      />
                    </div>
                  )}
                </div>

                {/* Payment Method Breakdown */}
                <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50">
                  <h4 className="text-xs font-bold text-slate-700 uppercase mb-3">
                    {lang === 'bn' ? 'পেমেন্ট মাধ্যম অনুযায়ী খরচ' : 'Expense by Payment Method'}
                  </h4>
                  <div className="space-y-2">
                    {data.expenses.byMethod.filter((m) => m.amount > 0).map((m) => (
                      <div key={m.method} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-0">
                        <span className="font-semibold text-slate-700">{m.method}</span>
                        <div className="text-right">
                          <span className="font-bold text-slate-900">{formatBDTExact(m.amount, lang)}</span>
                          {m.percentage !== null && (
                            <span className="text-[10px] text-slate-400 block">{localizeNumber(lang, m.percentage)}%</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Category Table */}
              {data.expenses.byCategory.length > 0 && (
                <div className="overflow-x-auto hs border border-slate-200 rounded-xl mt-3">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase text-[11px]">
                      <tr>
                        <th className="px-3 py-2.5">{dict.colCategory}</th>
                        <th className="px-3 py-2.5 text-right">{dict.colAmount}</th>
                        <th className="px-3 py-2.5 text-right">{dict.colShare}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.expenses.byCategory.map((c) => (
                        <tr key={c.categoryId} className="hover:bg-slate-50/50">
                          <td className="px-3 py-2 font-semibold text-slate-800">
                            {pickLocalized(lang, c.name, c.banglaName)}
                            {c.code === 'TEACHER_SALARY' && (
                              <span className="ml-2 text-[10px] bg-blue-50 text-[#063b78] px-1.5 py-0.5 rounded font-bold">
                                {dict.salaryExpense}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-slate-900">{formatBDTExact(c.amount, lang)}</td>
                          <td className="px-3 py-2 text-right text-slate-500">
                            {c.percentage !== null ? `${localizeNumber(lang, c.percentage)}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Section C: Profit Summary & Trend */}
          {(activeView === 'all' || activeView === 'profit') && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {dict.reportProfit || (lang === 'bn' ? 'লাভ ও ক্ষতির সারসংক্ষেপ' : 'Profit & Loss Summary')}
                  </h3>
                  <p className="text-xs text-slate-500">{dict.formulaProfit}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold text-slate-500 uppercase">{dict.netProfit}</span>
                  <div className={`text-lg font-bold ${data.summary.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {formatBDTExact(data.summary.netProfit, lang)}
                  </div>
                </div>
              </div>

              {/* BarChart of Trend */}
              {data.profit.trend.length > 0 && (
                <div className="p-3 border border-slate-100 rounded-xl bg-slate-50/50">
                  <h4 className="text-xs font-bold text-slate-700 uppercase mb-2">{dict.profitTrend}</h4>
                  <BarChart
                    ariaLabel={dict.profitTrend}
                    labels={data.profit.trend.map((t) => t.bucket)}
                    series={[
                      {
                        key: 'income',
                        label: dict.income,
                        values: data.profit.trend.map((t) => t.netCollection),
                        format: (v) => formatBDTExact(v ?? 0, lang),
                      },
                      {
                        key: 'expense',
                        label: dict.expense,
                        values: data.profit.trend.map((t) => t.expenses),
                        format: (v) => formatBDTExact(v ?? 0, lang),
                      },
                    ]}
                    axisFormat={(v) => formatBDTExact(v, lang)}
                  />
                </div>
              )}

              {/* Profit Table */}
              <div className="overflow-x-auto hs border border-slate-200 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase text-[11px]">
                    <tr>
                      <th className="px-3 py-2.5">{lang === 'bn' ? 'সময়কাল' : 'Period'}</th>
                      <th className="px-3 py-2.5 text-right">{dict.netIncome}</th>
                      <th className="px-3 py-2.5 text-right">{dict.expenses}</th>
                      <th className="px-3 py-2.5 text-right">{dict.profit}</th>
                      <th className="px-3 py-2.5 text-right">{dict.netMarginLabel || 'Margin'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.profit.trend.map((row) => (
                      <tr key={row.bucket} className="hover:bg-slate-50/50">
                        <td className="px-3 py-2 font-medium text-slate-800">{row.bucket}</td>
                        <td className="px-3 py-2 text-right text-emerald-700 font-semibold">{formatBDTExact(row.netCollection, lang)}</td>
                        <td className="px-3 py-2 text-right text-rose-600 font-semibold">{formatBDTExact(row.expenses, lang)}</td>
                        <td className={`px-3 py-2 text-right font-bold ${row.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {formatBDTExact(row.netProfit, lang)}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-500">
                          {row.margin !== null ? `${localizeNumber(lang, row.margin)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section D: Cash Summary */}
          {(activeView === 'all' || activeView === 'cash') && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {dict.reportCash || (lang === 'bn' ? 'ক্যাশ সারসংক্ষেপ' : 'Cash Summary')}
                  </h3>
                  <p className="text-xs text-slate-500">{dict.cashNote}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold text-slate-500 uppercase">{dict.cashNet}</span>
                  <div className="text-lg font-bold text-slate-900">
                    {formatBDTExact(data.cash.cashIn - data.cash.cashOut, lang)}
                  </div>
                </div>
              </div>

              {/* Stat tiles */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase">{dict.cashOpening}</span>
                  <div className="text-base font-bold text-slate-900 mt-1">
                    {formatBDTExact(data.cash.openingCashTotal, lang)}
                  </div>
                </div>
                <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100">
                  <span className="text-[11px] font-semibold text-emerald-700 uppercase">{dict.cashCollected}</span>
                  <div className="text-base font-bold text-emerald-800 mt-1">
                    {formatBDTExact(data.cash.cashIn, lang)}
                  </div>
                </div>
                <div className="bg-rose-50/50 p-3 rounded-xl border border-rose-100">
                  <span className="text-[11px] font-semibold text-rose-700 uppercase">{dict.cashExpenses}</span>
                  <div className="text-base font-bold text-rose-800 mt-1">
                    {formatBDTExact(data.cash.cashOut, lang)}
                  </div>
                </div>
                <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                  <span className="text-[11px] font-semibold text-blue-700 uppercase">{dict.cashExpected}</span>
                  <div className="text-base font-bold text-blue-900 mt-1">
                    {formatBDTExact(data.cash.expectedCashTotal, lang)}
                  </div>
                </div>
              </div>

              {/* Cash Sessions History Table */}
              <div className="mt-4">
                <h4 className="text-xs font-bold text-slate-700 uppercase mb-2">
                  {lang === 'bn' ? 'সংশ্লিষ্ট ক্যাশ সেশনসমূহ' : 'Cash Sessions in Period'}
                </h4>
                {data.cash.sessions.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3">{lang === 'bn' ? 'কোনো সেশন পাওয়া যায়নি' : 'No cash sessions found'}</p>
                ) : (
                  <div className="overflow-x-auto hs border border-slate-200 rounded-xl">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase text-[11px]">
                        <tr>
                          <th className="px-3 py-2.5">{dict.colDate}</th>
                          <th className="px-3 py-2.5">{dict.branch}</th>
                          <th className="px-3 py-2.5">{dict.sessionStatus || 'Status'}</th>
                          <th className="px-3 py-2.5 text-right">{dict.cashOpening}</th>
                          <th className="px-3 py-2.5 text-right">{dict.cashExpected}</th>
                          <th className="px-3 py-2.5 text-right">{dict.cashCounted}</th>
                          <th className="px-3 py-2.5 text-right">{dict.differenceLabel || 'Diff'}</th>
                          <th className="px-3 py-2.5">{dict.closedBy || 'Closed By'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.cash.sessions.map((s) => {
                          const isBalanced = s.difference === 0;
                          const isShort = s.difference !== null && s.difference < 0;
                          const isExtra = s.difference !== null && s.difference > 0;
                          return (
                            <tr key={s.id} className="hover:bg-slate-50/50">
                              <td className="px-3 py-2 font-medium text-slate-800">{s.businessDate}</td>
                              <td className="px-3 py-2 text-slate-600">{pickLocalized(lang, s.branchName, s.branchBanglaName)}</td>
                              <td className="px-3 py-2">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                    s.status === 'OPEN'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  {s.status === 'OPEN' ? dict.sessionOpen : dict.sessionClosed}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right text-slate-700">{formatBDTExact(s.openingCash, lang)}</td>
                              <td className="px-3 py-2 text-right font-semibold text-slate-900">
                                {s.expectedCash !== null ? formatBDTExact(s.expectedCash, lang) : '—'}
                              </td>
                              <td className="px-3 py-2 text-right font-semibold text-slate-900">
                                {s.countedCash !== null ? formatBDTExact(s.countedCash, lang) : '—'}
                              </td>
                              <td className="px-3 py-2 text-right font-bold">
                                {s.status === 'OPEN' ? (
                                  <span className="text-slate-400">—</span>
                                ) : isBalanced ? (
                                  <span className="text-emerald-600">{dict.balanced || 'Balanced'}</span>
                                ) : isShort ? (
                                  <span className="text-rose-600">
                                    {dict.short || 'Short'} {formatBDTExact(Math.abs(s.difference!), lang)}
                                  </span>
                                ) : isExtra ? (
                                  <span className="text-blue-600">
                                    {dict.extra || 'Extra'} {formatBDTExact(s.difference!, lang)}
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td className="px-3 py-2 text-slate-500">
                                {s.closedByName || s.openedByName || '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Section E: Salary Expense */}
          {(activeView === 'all' || activeView === 'salary') && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {dict.reportSalary || (lang === 'bn' ? 'শিক্ষক বেতন রিপোর্ট' : 'Teacher Salary Report')}
                  </h3>
                  <p className="text-xs text-slate-500">{dict.salaryReadOnly}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold text-slate-500 uppercase">{dict.salaryExpensesLabel || 'Total Salary'}</span>
                  <div className="text-lg font-bold text-blue-900">
                    {formatBDTExact(data.summary.salaryExpenses, lang)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <span className="text-xs font-semibold text-slate-500 uppercase">
                    {dict.salaryExpensesLabel || (lang === 'bn' ? 'মোট শিক্ষক বেতন' : 'Salary Expenses')}
                  </span>
                  <div className="text-xl font-bold text-slate-900 mt-1">
                    {formatBDTExact(data.summary.salaryExpenses, lang)}
                  </div>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <span className="text-xs font-semibold text-slate-500 uppercase">
                    {dict.salaryCount || (lang === 'bn' ? 'বেতন প্রদানের সংখ্যা' : 'Payment Count')}
                  </span>
                  <div className="text-xl font-bold text-slate-900 mt-1">
                    {localizeNumber(lang, data.summary.salaryExpensesCount)}
                  </div>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <span className="text-xs font-semibold text-slate-500 uppercase">
                    {dict.salaryShare || (lang === 'bn' ? 'মোট খরচের অনুপাত' : 'Share of Expenses')}
                  </span>
                  <div className="text-xl font-bold text-blue-700 mt-1">
                    {data.summary.totalExpenses > 0
                      ? `${localizeNumber(lang, Math.round((data.summary.salaryExpenses / data.summary.totalExpenses) * 1000) / 10)}%`
                      : '0%'}
                  </div>
                </div>
              </div>

              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 text-xs text-[#063b78] flex items-center gap-2">
                <Icon name="info" size={16} />
                <span>
                  {lang === 'bn'
                    ? 'শিক্ষক বেতন হিসাবের সময় বেতন প্রদানের সাথে যুক্ত খরচের হিসাব একবারই অন্তর্ভুক্ত করা হয়। ব্যক্তিগত শিক্ষক প্রোফাইল তথ্যের সুরক্ষা বজায় রাখা হয়েছে।'
                    : 'Salary expenses are linked directly to salary disbursement records and counted exactly once. Teacher individual privacy is strictly preserved in operational finance.'}
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
