'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import PayModal from '@/components/salary/PayModal';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatBDTExact, toBanglaNumeral } from '@/lib/i18n';

interface Named {
  id: string;
  name: string;
  banglaName?: string | null;
}
interface Overview {
  branch: Named;
  branches: Named[];
  year: number;
  month: number;
  period: { id: string; status: 'OPEN' | 'FINALIZED' | 'PAID' } | null;
  payables: Array<{
    id: string;
    teacher: Named & { teacherCode: string };
    types: Array<'MONTHLY_FIXED' | 'PER_BATCH' | 'PER_CLASS' | 'CUSTOM'>;
    baseAmount: number;
    additions: number;
    deductions: number;
    netAmount: number;
    paidAmount: number;
    remainingAmount: number;
    status: 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';
  }>;
  totals: { payable: number; paid: number; remaining: number };
}

const selectCls = 'rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-semibold outline-none focus:border-[#063b78]';
const pick = (lang: string, o?: Named | null) => (o ? (lang === 'bn' && o.banglaName ? o.banglaName : o.name) : '—');

export default function SalaryPage() {
  const { lang, currentUser, showToast } = useApp();
  const dict = DICTIONARY[lang];
  const s = dict.salary;
  const isManager = currentUser?.role === 'OWNER' || currentUser?.role === 'ADMIN';
  const money = (v: number) => formatBDTExact(v, lang);

  const nowYm = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
  const [year, setYear] = useState(Number(nowYm.slice(0, 4)));
  const [month, setMonth] = useState(Number(nowYm.slice(5, 7)));
  const [branchId, setBranchId] = useState('');
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [payFor, setPayFor] = useState<Overview['payables'][number] | null>(null);
  const [cancelFor, setCancelFor] = useState<Overview['payables'][number] | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');

  const errText = useCallback(
    (d: any) => (d?.error && (s.errors as Record<string, string>)[d.error]) || d?.message || s.loadFailed,
    [s]
  );

  // Month/year/branch can change faster than the server answers: only the latest request may update the page.
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ year: String(year), month: String(month) });
      if (branchId) qs.set('branch', branchId);
      const res = await fetch(`/api/salary?${qs}`);
      const d = await res.json().catch(() => null);
      if (requestId !== latestRequest.current) return;
      if (!res.ok || !d?.success) {
        setData(null);
        setError(d?.error === 'BRANCH_REQUIRED' ? '' : errText(d));
        if (d?.error === 'BRANCH_REQUIRED' && !branchId) {
          // Several branches and none chosen yet: fetch the list via a branch-less lookup.
          const b = await fetch('/api/batches/options').then((r) => r.json()).catch(() => null);
          const first = b?.branches?.[0]?.id;
          if (first) setBranchId(first);
        }
        return;
      }
      setError('');
      setData(d);
      if (!branchId) setBranchId(d.branch.id);
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [year, month, branchId, errText]);

  useEffect(() => {
    load();
  }, [load]);

  const generate = async () => {
    setBusy(true);
    setNotice('');
    try {
      const res = await fetch('/api/salary/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, branchId: branchId || undefined }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) {
        showToast(errText(d));
        return;
      }
      const n = (v: number) => (lang === 'bn' ? toBanglaNumeral(v) : String(v));
      const parts = [`${n(d.created)} ${s.generated}`];
      if (d.alreadyGenerated) parts.push(`${n(d.alreadyGenerated)} ${s.alreadyGenerated}`);
      const noRule = d.skipped.filter((x: any) => x.reason === 'NO_APPLICABLE_RULE').length;
      const zero = d.skipped.filter((x: any) => x.reason === 'ZERO_AMOUNT').length;
      if (noRule) parts.push(`${n(noRule)} ${s.skippedNoRule}`);
      if (zero) parts.push(`${n(zero)} ${s.skippedZero}`);
      if (d.monthInProgress) parts.push(s.inProgress);
      setNotice(parts.join(' · '));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const finalize = async () => {
    if (!data?.period || !window.confirm(s.finalizeConfirm)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/salary/periods/${data.period.id}/finalize`, { method: 'POST' });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) showToast(errText(d));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const doCancel = async () => {
    if (!cancelFor) return;
    setCancelError('');
    const res = await fetch(`/api/salary/${cancelFor.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: cancelReason }),
    });
    const d = await res.json().catch(() => null);
    if (!res.ok || !d?.success) {
      const first = d?.details ? (Object.values(d.details).flat()[0] as string) : '';
      setCancelError(first || errText(d));
      return;
    }
    setCancelFor(null);
    setCancelReason('');
    await load();
  };

  const monthLabel = (m: number) =>
    new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, m - 1, 1)));
  const thisYear = Number(nowYm.slice(0, 4));
  const years = [thisYear - 3, thisYear - 2, thisYear - 1, thisYear];

  const statusCls: Record<string, string> = {
    PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    PARTIAL: 'bg-amber-50 text-amber-700 border-amber-200',
    UNPAID: 'bg-rose-50 text-rose-700 border-rose-200',
    CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200',
  };
  const statusText: Record<string, string> = {
    PAID: s.statusPaid,
    PARTIAL: s.statusPartial,
    UNPAID: s.statusUnpaid,
    CANCELLED: s.statusCancelled,
  };
  const periodText = { OPEN: s.periodOpen, FINALIZED: s.periodFinalized, PAID: s.periodPaid };

  const canPay = (p: Overview['payables'][number]) => p.status === 'UNPAID' || p.status === 'PARTIAL';
  const canCancel = (p: Overview['payables'][number]) => isManager && p.status === 'UNPAID' && p.paidAmount === 0;

  const Actions = ({ p }: { p: Overview['payables'][number] }) => (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      <Link href={`/salary/${p.id}`} className="tb text-[12px]">
        {s.view}
      </Link>
      {canPay(p) && (
        <button className="primary text-[12px]" onClick={() => setPayFor(p)}>
          {s.pay}
        </button>
      )}
      {canCancel(p) && (
        <button className="tb text-[12px] text-rose-700" onClick={() => setCancelFor(p)}>
          {s.cancel}
        </button>
      )}
    </div>
  );

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-5 pb-10">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-xl bg-[#063b78] text-white flex items-center justify-center shrink-0">
              <Icon name="banknote" size={20} />
            </span>
            <h1 className="text-2xl md:text-3xl font-extrabold text-[#063b78] tracking-tight">{s.title}</h1>
          </div>
          <p className="text-[13.5px] text-[#55637a] mt-1.5 font-medium">{s.subtitle}</p>
        </div>
        {isManager && (
          <div className="flex items-center gap-2.5 flex-wrap">
            <button className="primary px-4 py-2.5" disabled={busy || !data} onClick={generate}>
              <Icon name="plus" size={16} />
              <span>{busy ? s.generating : s.generate}</span>
            </button>
            {data?.period?.status === 'OPEN' && data.payables.length > 0 && (
              <button className="tb px-4 py-2.5" disabled={busy} onClick={finalize}>
                {s.finalize}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="card p-4 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11.5px] font-bold text-[#8795ab] uppercase">{s.month}</label>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={selectCls}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11.5px] font-bold text-[#8795ab] uppercase">{s.year}</label>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={selectCls}>
            {years.map((y) => (
              <option key={y} value={y}>
                {lang === 'bn' ? toBanglaNumeral(y) : y}
              </option>
            ))}
          </select>
        </div>
        {data && data.branches.length > 1 && (
          <div className="flex flex-col gap-1">
            <label className="text-[11.5px] font-bold text-[#8795ab] uppercase">{s.branch}</label>
            <select value={branchId || data.branch.id} onChange={(e) => setBranchId(e.target.value)} className={selectCls}>
              {data.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {pick(lang, b)}
                </option>
              ))}
            </select>
          </div>
        )}
        {data?.period && (
          <span className="ml-auto text-[12px] font-bold px-3 py-1.5 rounded-full border bg-[#f4f8fd] text-[#063b78] border-[#dce5f0]">
            {s.period}: {periodText[data.period.status]}
          </span>
        )}
      </div>

      {notice && <div className="text-[12.5px] text-[#092f63] bg-[#f4f8fd] border border-[#dce5f0] rounded-xl px-4 py-3">{notice}</div>}
      {error && <div className="text-[13px] text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</div>}

      {loading && !data ? (
        <div className="card p-16 rounded-2xl bg-white border border-[#dce5f0] flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#063b78] border-t-transparent" />
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: s.totalPayable, value: data.totals.payable, cls: 'text-[#063b78]' },
              { label: s.paid, value: data.totals.paid, cls: 'text-emerald-700' },
              { label: s.remaining, value: data.totals.remaining, cls: 'text-rose-700' },
            ].map((k) => (
              <div key={k.label} className="card p-5 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
                <div className="text-[12px] font-bold text-[#8795ab] uppercase">{k.label}</div>
                <div className={`text-2xl font-extrabold mt-1 num ${k.cls}`}>{money(k.value)}</div>
              </div>
            ))}
          </div>

          {data.payables.length === 0 ? (
            <div className="card p-10 rounded-2xl bg-white border border-[#dce5f0] text-center shadow-2xs">
              <p className="text-[14px] font-semibold text-[#55637a]">{data.period ? s.noPayables : s.noPeriod}</p>
              {!data.period && <p className="text-[12.5px] text-[#8795ab] mt-1">{s.noPayables}</p>}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="card rounded-2xl bg-white border border-[#dce5f0] shadow-2xs overflow-hidden hidden md:block">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-[#f4f8fd] text-left text-[11.5px] uppercase text-[#8795ab]">
                      <th className="px-4 py-3">{s.teacher}</th>
                      <th className="px-3 py-3">{s.compType}</th>
                      <th className="px-3 py-3 text-right">{s.base}</th>
                      <th className="px-3 py-3 text-right">{s.additions}</th>
                      <th className="px-3 py-3 text-right">{s.deductions}</th>
                      <th className="px-3 py-3 text-right">{s.netPayable}</th>
                      <th className="px-3 py-3 text-right">{s.paid}</th>
                      <th className="px-3 py-3 text-right">{s.remaining}</th>
                      <th className="px-3 py-3">{s.status}</th>
                      <th className="px-4 py-3 text-right">{s.actions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf1f7]">
                    {data.payables.map((p) => (
                      <tr key={p.id} className={p.status === 'CANCELLED' ? 'opacity-60' : ''}>
                        <td className="px-4 py-3 font-bold text-[#063b78]">{pick(lang, p.teacher)}</td>
                        <td className="px-3 py-3 text-[12px] text-[#55637a]">{p.types.map((t) => dict.compensation[t]).join(', ')}</td>
                        <td className="px-3 py-3 text-right num">{money(p.baseAmount)}</td>
                        <td className="px-3 py-3 text-right num">{money(p.additions)}</td>
                        <td className="px-3 py-3 text-right num">{money(p.deductions)}</td>
                        <td className="px-3 py-3 text-right num font-bold">{money(p.netAmount)}</td>
                        <td className="px-3 py-3 text-right num text-emerald-700">{money(p.paidAmount)}</td>
                        <td className="px-3 py-3 text-right num text-rose-700">{money(p.remainingAmount)}</td>
                        <td className="px-3 py-3">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${statusCls[p.status]}`}>{statusText[p.status]}</span>
                        </td>
                        <td className="px-4 py-3">
                          <Actions p={p} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="flex flex-col gap-3 md:hidden">
                {data.payables.map((p) => (
                  <div key={p.id} className={`card p-4 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs ${p.status === 'CANCELLED' ? 'opacity-60' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-[#063b78] break-words">{pick(lang, p.teacher)}</div>
                        <div className="text-[11.5px] text-[#64748b]">{p.types.map((t) => dict.compensation[t]).join(', ')}</div>
                      </div>
                      <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full border ${statusCls[p.status]}`}>{statusText[p.status]}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3 text-[12px]">
                      <div>
                        <div className="text-[10.5px] font-bold text-[#8795ab] uppercase">{s.netPayable}</div>
                        <div className="font-extrabold num">{money(p.netAmount)}</div>
                      </div>
                      <div>
                        <div className="text-[10.5px] font-bold text-[#8795ab] uppercase">{s.paid}</div>
                        <div className="font-bold num text-emerald-700">{money(p.paidAmount)}</div>
                      </div>
                      <div>
                        <div className="text-[10.5px] font-bold text-[#8795ab] uppercase">{s.remaining}</div>
                        <div className="font-bold num text-rose-700">{money(p.remainingAmount)}</div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <Actions p={p} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      ) : null}

      {payFor && (
        <PayModal
          payableId={payFor.id}
          teacherName={pick(lang, payFor.teacher)}
          remaining={payFor.remainingAmount}
          onClose={() => setPayFor(null)}
          onPaid={() => {
            setPayFor(null);
            load();
          }}
        />
      )}

      {cancelFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card p-6 bg-white max-w-md w-full shadow-2xl space-y-4 rounded-2xl">
            <h3 className="font-extrabold text-base text-[#063b78]">
              {s.cancelSalary} — {pick(lang, cancelFor.teacher)}
            </h3>
            {cancelError && <div className="text-[12.5px] text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{cancelError}</div>}
            <div className="fld">
              <label className="text-[12.5px] font-bold text-[#334155]">{s.cancelReason} *</label>
              <textarea
                rows={2}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button className="tb" onClick={() => setCancelFor(null)}>
                {s.close}
              </button>
              <button className="primary" disabled={cancelReason.trim().length < 3} onClick={doCancel}>
                {s.cancelSalary}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
