'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import FinanceSubNav from '@/components/FinanceSubNav';
import { Section } from '@/components/reports/ReportShell';
import { BarChart, HBarList, SERIES_COLORS } from '@/components/reports/charts';
import { makeFormat, periodLabel } from '@/components/reports/format';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatBDTExact, pickLocalized, localizeNumber } from '@/lib/i18n';

interface Overview {
  period: { from: string; to: string; days: number; granularity: 'day' | 'month' };
  branch: { id: string | null; locked: boolean; options: Array<{ id: string; name: string; banglaName: string | null }> };
  collection: { gross: number; refunds: number; net: number };
  expenses: { total: number };
  profit: { netProfit: number; margin: number | null };
  paymentMethods: Array<{ method: string; gross: number; refunds: number; net: number }>;
  expenseCategories: Array<{ categoryId: string; name: string; banglaName: string | null; code: string | null; amount: number; percent: number | null }>;
  topExpenses: Array<{
    id: string;
    date: string;
    categoryName: string;
    categoryBanglaName: string | null;
    paidTo: string | null;
    paymentMethod: string;
    amount: number;
    status: string;
    isSalary: boolean;
    branchName: string;
  }>;
  trend: Array<{ bucket: string; gross: number; refunds: number; income: number; expenses: number; profit: number }>;
  cash: {
    movement: { collected: number; refunded: number; expenses: number; net: number };
    today: string;
    sessions: Array<{
      id: string;
      branchName: string;
      branchBanglaName: string | null;
      status: 'OPEN' | 'CLOSED';
      openingCash: number;
      expectedCash: number | null;
      countedCash: number | null;
    }>;
  };
  comparison: null | {
    hasPrevious: boolean;
    netCollection: { current: number; previous: number; changePct: number | null };
    expenses: { current: number; previous: number; changePct: number | null };
    netProfit: { current: number; previous: number; changePct: number | null };
  };
}

type Preset = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom';
const PRESETS: Preset[] = ['today', 'yesterday', 'thisWeek', 'thisMonth', 'lastMonth', 'thisYear', 'custom'];

// ---- Asia/Dhaka calendar math on YYYY-MM-DD strings (never the browser-local date) ----
const todayDhaka = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
const shift = (ymd: string, n: number) => new Date(new Date(`${ymd}T00:00:00.000Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

function presetRange(p: Exclude<Preset, 'custom'>): { from: string; to: string } {
  const today = todayDhaka();
  if (p === 'today') return { from: today, to: today };
  if (p === 'yesterday') return { from: shift(today, -1), to: shift(today, -1) };
  if (p === 'thisWeek') {
    // Bangladesh week starts on Saturday.
    const dow = new Date(`${today}T00:00:00.000Z`).getUTCDay();
    return { from: shift(today, -((dow + 1) % 7)), to: today };
  }
  if (p === 'thisMonth') return { from: `${today.slice(0, 8)}01`, to: today };
  if (p === 'lastMonth') {
    const firstThis = `${today.slice(0, 8)}01`;
    const lastPrev = shift(firstThis, -1);
    return { from: `${lastPrev.slice(0, 8)}01`, to: lastPrev };
  }
  return { from: `${today.slice(0, 4)}-01-01`, to: today };
}

const fieldCls = 'rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-semibold outline-none focus:border-[#063b78] min-w-0';

function SignedBars({ points, labelOf, format, ariaLabel }: { points: Array<{ key: string; value: number }>; labelOf: (k: string) => string; format: (v: number) => string; ariaLabel: string }) {
  const W = 720;
  const H = 220;
  const L = 8;
  const R = 8;
  const T = 14;
  const B = 30;
  const max = Math.max(0, ...points.map((p) => p.value));
  const min = Math.min(0, ...points.map((p) => p.value));
  const span = max - min || 1;
  const y = (v: number) => T + ((max - v) / span) * (H - T - B);
  const slot = (W - L - R) / Math.max(1, points.length);
  const bw = Math.max(2, Math.min(slot * 0.7, 40));
  const every = Math.ceil(points.length / 10);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={ariaLabel}>
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="#c9d6e6" strokeWidth={1} />
      {points.map((p, i) => {
        const x = L + slot * i + (slot - bw) / 2;
        const top = Math.min(y(p.value), y(0));
        const h = Math.max(1, Math.abs(y(p.value) - y(0)));
        return (
          <g key={p.key}>
            <rect x={x} y={top} width={bw} height={h} rx={2} fill={p.value >= 0 ? '#1baf7a' : '#d9485f'}>
              <title>{`${labelOf(p.key)}: ${format(p.value)}`}</title>
            </rect>
            {i % every === 0 && (
              <text x={x + bw / 2} y={H - 10} textAnchor="middle" fontSize={10} fill="#64748b">
                {labelOf(p.key)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default function FinancePage() {
  const { lang } = useApp();
  const dict = DICTIONARY[lang];
  const f = dict.finance;
  const fmt = useMemo(() => makeFormat(lang), [lang]);
  const money = (v: number) => formatBDTExact(v, lang);

  const [preset, setPreset] = useState<Preset>('thisMonth');
  const [range, setRange] = useState(() => presetRange('thisMonth'));
  const [branchId, setBranchId] = useState('');
  const [compare, setCompare] = useState(false);
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError('');
    const qs = new URLSearchParams({ from: range.from, to: range.to });
    if (branchId) qs.set('branchId', branchId);
    if (compare) qs.set('comparison', 'true');
    fetch(`/api/finance/overview?${qs}`, { signal: ctrl.signal })
      .then(async (res) => {
        const d = await res.json().catch(() => null);
        if (!res.ok || !d?.success) {
          setData(null);
          setError((d?.error && (f.errors as Record<string, string>)[d.error]) || d?.message || f.loadFailed);
        } else setData(d as Overview);
        setLoading(false);
      })
      .catch((e) => {
        if (e?.name !== 'AbortError') {
          setError(f.loadFailed);
          setLoading(false);
        }
      });
    return () => ctrl.abort();
  }, [range, branchId, compare, f]);

  const pickPreset = (p: Preset) => {
    setPreset(p);
    if (p !== 'custom') setRange(presetRange(p));
  };
  const setCustom = (key: 'from' | 'to', value: string) => {
    setPreset('custom');
    setRange((r) => {
      const next = { ...r, [key]: value };
      return /^\d{4}-\d{2}-\d{2}$/.test(next.from) && /^\d{4}-\d{2}-\d{2}$/.test(next.to) ? next : r;
    });
  };

  const branchName = (o: { name: string; banglaName: string | null }) => pickLocalized(lang, o.name, o.banglaName);
  const delta = (c: { changePct: number | null } | undefined, goodWhenUp: boolean) => {
    if (!data?.comparison) return null;
    if (!data.comparison.hasPrevious || !c || c.changePct === null) return <span className="text-[11px] text-[#64748b]">{f.noPrevious}</span>;
    const up = c.changePct >= 0;
    const good = up === goodWhenUp;
    return (
      <span className={`text-[12px] font-bold num ${good ? 'text-emerald-700' : 'text-rose-700'}`}>
        {up ? '+' : '−'}
        {localizeNumber(lang, Math.abs(c.changePct))}% <span className="font-medium text-[#64748b]">{f.vsPrevious}</span>
      </span>
    );
  };

  const kpis = data
    ? [
        { key: 'gross', label: f.grossCollection, value: money(data.collection.gross), help: f.grossHelp, tone: 'text-[#063b78]', extra: null },
        { key: 'refunds', label: f.refunds, value: money(data.collection.refunds), help: f.refundsHelp, tone: 'text-amber-700', extra: null },
        { key: 'net', label: f.netIncome, value: money(data.collection.net), help: f.netIncomeHelp, tone: 'text-[#063b78]', extra: delta(data.comparison?.netCollection, true) },
        { key: 'exp', label: f.expenses, value: money(data.expenses.total), help: f.expensesHelp, tone: 'text-rose-700', extra: delta(data.comparison?.expenses, false) },
        { key: 'profit', label: f.netProfit, value: money(data.profit.netProfit), help: f.netProfitHelp, tone: data.profit.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700', extra: delta(data.comparison?.netProfit, true) },
      ]
    : [];

  const trendLabel = (k: string) => (data ? periodLabel(fmt, k, data.period.granularity, lang) : k);
  const methodTotal = data ? data.paymentMethods.reduce((a, m) => a + m.net, 0) : 0;
  const hasAnyData = data ? data.collection.gross > 0 || data.collection.refunds > 0 || data.expenses.total > 0 : false;

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-4 pb-10">
      <PageHeader title={f.title} subtitle={f.subtitle} />
      <FinanceSubNav />

      <div className="bg-white p-4 rounded-2xl border border-[#dce5f0] flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={f.range.custom}>
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => pickPreset(p)}
              aria-pressed={preset === p}
              className={`px-3 h-9 rounded-xl text-[12.5px] font-bold border transition-colors ${
                preset === p ? 'bg-[#063b78] text-white border-[#063b78]' : 'bg-white text-[#55637a] border-[#dce5f0] hover:border-[#063b78] hover:text-[#063b78]'
              }`}
            >
              {f.range[p]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-wide text-[#64748b]">
            {f.from}
            <input type="date" className={fieldCls} value={range.from} max={range.to} onChange={(e) => setCustom('from', e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-wide text-[#64748b]">
            {f.to}
            <input type="date" className={fieldCls} value={range.to} min={range.from} onChange={(e) => setCustom('to', e.target.value)} />
          </label>
          {data && (data.branch.options.length > 1 || !data.branch.locked) && (
            <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-wide text-[#64748b]">
              {f.branch}
              <select className={fieldCls} value={data.branch.locked ? (data.branch.id ?? '') : branchId} disabled={data.branch.locked} onChange={(e) => setBranchId(e.target.value)}>
                {!data.branch.locked && <option value="">{f.allBranches}</option>}
                {data.branch.options.map((b) => (
                  <option key={b.id} value={b.id}>
                    {branchName(b)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex items-center gap-2 text-[13px] font-semibold text-[#092f63] h-9.5 select-none">
            <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="w-4 h-4 accent-[#063b78]" />
            {f.compare}
          </label>
          <div className="text-[12px] text-[#64748b] pb-2 num">
            {fmt.ymd(range.from)} – {fmt.ymd(range.to)}
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-4 text-[13px] font-semibold">
          {error}
        </div>
      )}
      {loading && !data && (
        <div className="p-10 text-center text-sm text-[#64748b]" role="status">
          …
        </div>
      )}

      {data && (
        <div className={`flex flex-col gap-4 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {kpis.map((k) => (
              <div key={k.key} className="bg-white p-4 rounded-2xl border border-[#dce5f0] shadow-xs min-w-0 flex flex-col gap-1">
                <div className="text-[11.5px] font-bold uppercase tracking-wide text-[#64748b] leading-snug">{k.label}</div>
                <div className={`text-[22px] font-black num break-words ${k.tone}`}>{k.value}</div>
                <div className="text-[11.5px] text-[#64748b]">{k.help}</div>
                {k.extra}
              </div>
            ))}
          </div>

          {!hasAnyData && <div className="bg-white p-6 rounded-2xl border border-[#dce5f0] text-center text-[13px] text-[#64748b]">{f.noData}</div>}

          <Section title={f.summary} note={f.cashBasisNote}>
            <div className="p-4 md:p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
              <dl className="flex flex-col text-[13.5px]">
                {[
                  [f.grossCollection, money(data.collection.gross), false],
                  [`− ${f.refunds}`, money(data.collection.refunds), false],
                  [f.netIncome, money(data.collection.net), true],
                  [`− ${f.expenses}`, money(data.expenses.total), false],
                  [f.netProfit, money(data.profit.netProfit), true],
                ].map(([label, value, strong]) => (
                  <div key={String(label)} className={`flex justify-between gap-3 py-2 border-b border-[#edf1f7] ${strong ? 'font-black text-[#063b78]' : 'text-[#334155]'}`}>
                    <dt>{label}</dt>
                    <dd className="num">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-col gap-2 text-[12.5px] text-[#55637a]">
                <p className="font-semibold">{f.formulaNet}</p>
                <p className="font-semibold">{f.formulaProfit}</p>
                <div className="mt-2 rounded-xl bg-[#f5f8fc] border border-[#dce5f0] p-3">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-[#64748b]">{f.netMargin}</div>
                  <div className="text-[22px] font-black num text-[#063b78]">{data.profit.margin === null ? '—' : `${localizeNumber(lang, data.profit.margin)}%`}</div>
                </div>
              </div>
            </div>
          </Section>

          <Section title={f.incomeVsExpenses}>
            <div className="p-4 md:p-5">
              <BarChart
                labels={data.trend.map((t) => trendLabel(t.bucket))}
                ariaLabel={f.incomeVsExpenses}
                axisFormat={(v) => fmt.money(v)}
                series={[
                  { key: 'income', label: f.income, values: data.trend.map((t) => t.income), format: (v) => (v === null ? '—' : money(v)) },
                  { key: 'expense', label: f.expense, values: data.trend.map((t) => t.expenses), format: (v) => (v === null ? '—' : money(v)) },
                ]}
              />
              <div className="flex gap-4 mt-2 text-[12px] text-[#55637a]">
                {[f.income, f.expense].map((l, i) => (
                  <span key={l} className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: SERIES_COLORS[i] }} />
                    {l}
                  </span>
                ))}
              </div>
            </div>
          </Section>

          <Section title={f.profitTrend} note={`${f.formulaProfit}`}>
            <div className="p-4 md:p-5">
              <SignedBars
                points={data.trend.map((t) => ({ key: t.bucket, value: t.profit }))}
                labelOf={trendLabel}
                format={money}
                ariaLabel={f.profitTrend}
              />
            </div>
            <div className="overflow-x-auto border-t border-[#edf1f7]">
              <table className="w-full text-[12.5px] min-w-[460px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-[#64748b]">
                    <th className="px-4 py-2">{f.colDate}</th>
                    <th className="px-4 py-2 text-right">{f.income}</th>
                    <th className="px-4 py-2 text-right">{f.expense}</th>
                    <th className="px-4 py-2 text-right">{f.profit}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.trend.map((t) => (
                    <tr key={t.bucket} className="border-t border-[#edf1f7]">
                      <td className="px-4 py-1.5">{trendLabel(t.bucket)}</td>
                      <td className="px-4 py-1.5 text-right num">{money(t.income)}</td>
                      <td className="px-4 py-1.5 text-right num">{money(t.expenses)}</td>
                      <td className={`px-4 py-1.5 text-right num font-bold ${t.profit < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{money(t.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section title={f.byMethod} note={f.byMethodNote}>
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px] min-w-[360px]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-[#64748b]">
                      <th className="px-4 py-2">{f.colMethod}</th>
                      <th className="px-4 py-2 text-right">{f.colGross}</th>
                      <th className="px-4 py-2 text-right">{f.colRefunds}</th>
                      <th className="px-4 py-2 text-right">{f.colNet}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.paymentMethods.map((m) => (
                      <tr key={m.method} className="border-t border-[#edf1f7]">
                        <td className="px-4 py-1.5 font-semibold">{(dict.paymentMethod as Record<string, string>)[m.method] ?? m.method}</td>
                        <td className="px-4 py-1.5 text-right num">{money(m.gross)}</td>
                        <td className="px-4 py-1.5 text-right num">{money(m.refunds)}</td>
                        <td className="px-4 py-1.5 text-right num font-bold">{money(m.net)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-[#dce5f0] font-black text-[#063b78]">
                      <td className="px-4 py-2">{f.total}</td>
                      <td className="px-4 py-2 text-right num">{money(data.collection.gross)}</td>
                      <td className="px-4 py-2 text-right num">{money(data.collection.refunds)}</td>
                      <td className="px-4 py-2 text-right num" data-testid="method-net-total">
                        {money(methodTotal)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Section>

            <Section title={f.byCategory}>
              <div className="p-4 flex flex-col gap-4">
                {data.expenseCategories.length === 0 ? (
                  <p className="text-[13px] text-[#64748b]">{f.noData}</p>
                ) : (
                  <>
                    <HBarList
                      ariaLabel={f.byCategory}
                      rows={data.expenseCategories.map((c) => ({
                        key: c.categoryId,
                        label: pickLocalized(lang, c.name, c.banglaName),
                        value: c.amount,
                        display: `${money(c.amount)} · ${c.percent === null ? '—' : `${localizeNumber(lang, c.percent)}%`}`,
                      }))}
                    />
                    <div className="flex justify-between text-[13px] font-black text-[#063b78] border-t border-[#edf1f7] pt-2">
                      <span>{f.total}</span>
                      <span className="num" data-testid="category-total">
                        {money(data.expenseCategories.reduce((a, c) => a + c.amount, 0))}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </Section>
          </div>

          <Section title={f.topExpenses}>
            {data.topExpenses.length === 0 ? (
              <p className="p-4 text-[13px] text-[#64748b]">{f.noData}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px] min-w-[640px]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-[#64748b]">
                      <th className="px-4 py-2">{f.colDate}</th>
                      <th className="px-4 py-2">{f.colCategory}</th>
                      <th className="px-4 py-2">{f.colPaidTo}</th>
                      <th className="px-4 py-2">{f.colMethod}</th>
                      <th className="px-4 py-2 text-right">{f.colAmount}</th>
                      <th className="px-4 py-2">{f.colStatus}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topExpenses.map((e) => (
                      <tr key={e.id} className="border-t border-[#edf1f7]">
                        <td className="px-4 py-1.5 num">{fmt.ymd(e.date)}</td>
                        <td className="px-4 py-1.5 font-semibold">
                          {e.isSalary ? f.salaryExpense : pickLocalized(lang, e.categoryName, e.categoryBanglaName)}
                          {e.isSalary && <span className="block text-[10.5px] font-medium text-[#64748b]">{f.salaryReadOnly}</span>}
                        </td>
                        <td className="px-4 py-1.5">{e.paidTo || '—'}</td>
                        <td className="px-4 py-1.5">{(dict.paymentMethod as Record<string, string>)[e.paymentMethod] ?? e.paymentMethod}</td>
                        <td className="px-4 py-1.5 text-right num font-bold">{money(e.amount)}</td>
                        <td className="px-4 py-1.5">{e.status === 'ACTIVE' ? f.statusActive : f.statusCancelled}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title={f.cashPosition} note={f.cashNote}>
            <div className="p-4 md:p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#64748b] mb-2">{f.cashMovement}</h3>
                <dl className="flex flex-col text-[13px]">
                  {[
                    [f.cashCollected, data.cash.movement.collected],
                    [`− ${f.cashRefunded}`, data.cash.movement.refunded],
                    [`− ${f.cashExpenses}`, data.cash.movement.expenses],
                    [f.cashNet, data.cash.movement.net],
                  ].map(([l, v], i) => (
                    <div key={String(l)} className={`flex justify-between py-1.5 border-b border-[#edf1f7] ${i === 3 ? 'font-black text-[#063b78]' : ''}`}>
                      <dt>{l}</dt>
                      <dd className="num">{money(Number(v))}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div>
                <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#64748b] mb-2">
                  {f.cashToday} · <span className="num">{fmt.ymd(data.cash.today)}</span>
                </h3>
                {data.cash.sessions.length === 0 ? (
                  <p className="text-[13px] text-[#64748b]">{f.noSession}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {data.cash.sessions.map((s) => (
                      <li key={s.id} className="rounded-xl border border-[#dce5f0] p-3 text-[12.5px]">
                        <div className="flex justify-between font-bold text-[#092f63]">
                          <span>{branchName({ name: s.branchName, banglaName: s.branchBanglaName })}</span>
                          <span className={s.status === 'OPEN' ? 'text-emerald-700' : 'text-slate-500'}>{s.status === 'OPEN' ? f.sessionOpen : f.sessionClosed}</span>
                        </div>
                        <div className="flex justify-between mt-1">
                          <span>{f.cashOpening}</span>
                          <span className="num">{money(s.openingCash)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>{f.cashExpected}</span>
                          <span className="num font-bold">{s.expectedCash === null ? '—' : money(s.expectedCash)}</span>
                        </div>
                        {s.status === 'CLOSED' && (
                          <div className="flex justify-between">
                            <span>{f.cashCounted}</span>
                            <span className="num">{s.countedCash === null ? '—' : money(s.countedCash)}</span>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Section>

          <div className="bg-white p-4 rounded-2xl border border-[#dce5f0] flex flex-wrap items-center gap-2">
            <span className="text-[11.5px] font-bold uppercase tracking-wide text-[#64748b] mr-1">{f.quickLinks}</span>
            {[
              ['/fees', f.viewFees],
              ['/salary', f.viewSalary],
              ['/finance/expenses', f.expenses],
              ['/reports/finance', f.viewReports],
            ].map(([href, label]) => (
              <Link key={href} href={href} className="px-3 h-9 inline-flex items-center rounded-xl border border-[#dce5f0] text-[12.5px] font-bold text-[#063b78] hover:bg-[#f5f8fc]">
                {label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
