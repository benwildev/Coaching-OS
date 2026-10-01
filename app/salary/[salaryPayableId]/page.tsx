'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import PayModal from '@/components/salary/PayModal';
import { lineScope, type SalaryLineView } from '@/components/salary/SalaryLineText';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatBDTExact, formatDhakaDate, toBanglaNumeral } from '@/lib/i18n';

interface Detail {
  id: string;
  teacher: { id: string; name: string; banglaName?: string | null; teacherCode: string };
  branch: { name: string; banglaName?: string | null };
  period: { year: number; month: number; status: string };
  baseAmount: number;
  additions: number;
  deductions: number;
  netAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';
  cancelReason: string | null;
  lines: Array<SalaryLineView & { compensationId: string; from: string; to: string }>;
  payments: Array<{
    id: string;
    amount: number;
    paymentMethod: string;
    paymentDate: string;
    transactionId: string | null;
    referenceNumber: string | null;
    notes: string | null;
    expenseId: string | null;
    recordedBy: string | null;
  }>;
}

function Stat({ label, value, cls = '' }: { label: string; value: string; cls?: string }) {
  return (
    <div>
      <div className="text-[11px] font-bold text-[#8795ab] uppercase">{label}</div>
      <div className={`text-[15px] font-extrabold num mt-0.5 ${cls}`}>{value}</div>
    </div>
  );
}

export default function SalaryDetailPage() {
  const { salaryPayableId } = useParams<{ salaryPayableId: string }>();
  const { lang } = useApp();
  const dict = DICTIONARY[lang];
  const s = dict.salary;
  const c = dict.compensation;
  const money = (v: number) => formatBDTExact(v, lang);
  const num = (v: number) => (lang === 'bn' ? toBanglaNumeral(v) : String(v));

  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/salary/${salaryPayableId}`);
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.success) {
      setError((body?.error && (s.errors as Record<string, string>)[body.error]) || body?.message || s.loadFailed);
      return;
    }
    setD(body.salary);
  }, [salaryPayableId, s]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="max-w-[900px] mx-auto flex flex-col gap-3">
        <Link href="/salary" className="tb self-start text-[12.5px]">
          {s.back}
        </Link>
        <div className="text-[13px] text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</div>
      </div>
    );
  }
  if (!d) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#063b78] border-t-transparent" />
      </div>
    );
  }

  const monthText = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(d.period.year, d.period.month - 1, 1))
  );
  const teacherName = lang === 'bn' && d.teacher.banglaName ? d.teacher.banglaName : d.teacher.name;
  const statusCls: Record<string, string> = {
    PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    PARTIAL: 'bg-amber-50 text-amber-700 border-amber-200',
    UNPAID: 'bg-rose-50 text-rose-700 border-rose-200',
    CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200',
  };
  const statusText = { PAID: s.statusPaid, PARTIAL: s.statusPartial, UNPAID: s.statusUnpaid, CANCELLED: s.statusCancelled };

  return (
    <div className="max-w-[900px] mx-auto flex flex-col gap-4 pb-10">
      <Link href="/salary" className="tb self-start text-[12.5px]">
        <Icon name="chevleft" size={14} />
        <span>{s.back}</span>
      </Link>

      <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-extrabold text-[#063b78]">{teacherName}</h1>
            <p className="text-[13px] text-[#55637a] mt-0.5">
              {s.detailTitle} · {monthText} · {lang === 'bn' && d.branch.banglaName ? d.branch.banglaName : d.branch.name}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[11.5px] font-bold px-2.5 py-1 rounded-full border ${statusCls[d.status]}`}>{statusText[d.status]}</span>
            {(d.status === 'UNPAID' || d.status === 'PARTIAL') && (
              <button className="primary text-[12.5px]" onClick={() => setPaying(true)}>
                {s.pay}
              </button>
            )}
          </div>
        </div>
        {d.status === 'CANCELLED' && d.cancelReason && (
          <p className="text-[12.5px] text-slate-600 mt-3">
            {s.cancelReason}: {d.cancelReason}
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-5 pt-4 border-t border-[#edf1f7]">
          <Stat label={s.gross} value={money(d.baseAmount)} />
          <Stat label={s.additions} value={money(d.additions)} />
          <Stat label={s.deductions} value={money(d.deductions)} />
          <Stat label={s.netPayable} value={money(d.netAmount)} cls="text-[#063b78]" />
          <Stat label={s.remaining} value={money(d.remainingAmount)} cls="text-rose-700" />
        </div>
      </div>

      <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
        <h2 className="text-base font-bold text-[#063b78] mb-3">{s.breakdown}</h2>
        <div className="flex flex-col gap-3">
          {d.lines.map((l, i) => {
            const scope = lineScope(l, lang);
            return (
              <div key={i} className="rounded-xl border border-[#e4ebf5] p-3.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="font-bold text-[#092f63] text-[13.5px]">{c[l.type]}</div>
                  <div className="font-extrabold text-emerald-700 num">{money(l.amount)}</div>
                </div>
                {scope && <div className="text-[12.5px] text-[#55637a] mt-1 break-words">{scope}</div>}
                {l.type === 'PER_CLASS' ? (
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[12.5px]">
                    <Stat label={s.eligibleClasses} value={num(l.quantity)} />
                    <Stat label={s.ratePerClass} value={money(l.rate)} />
                    <Stat label={s.calculated} value={`${num(l.quantity)} × ${money(l.rate)} = ${money(l.amount)}`} />
                  </div>
                ) : (
                  <div className="mt-2 text-[12.5px] text-[#55637a]">
                    {l.type === 'PER_BATCH' ? s.perBatchRate : l.type === 'CUSTOM' ? s.customAmount : s.monthlyAmount}: <strong className="num">{money(l.rate)}</strong>
                  </div>
                )}
                {l.type === 'CUSTOM' && l.notes && <div className="text-[12px] text-[#64748b] mt-1">{l.notes}</div>}
                <div className="text-[11.5px] text-[#8795ab] mt-2">
                  {s.applied}: {formatDhakaDate(l.from)} – {formatDhakaDate(l.to)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
        <h2 className="text-base font-bold text-[#063b78] mb-3">{s.paymentHistory}</h2>
        {d.payments.length === 0 ? (
          <p className="text-[13px] text-[#64748b]">{s.noPayments}</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {d.payments.map((p) => (
              <div key={p.id} className="rounded-xl border border-[#e4ebf5] p-3.5 text-[12.5px]">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="font-extrabold text-emerald-700 num text-[14px]">{money(p.amount)}</div>
                  <div className="text-[#55637a] font-semibold">
                    {(dict.paymentMethod as Record<string, string>)[p.paymentMethod] || p.paymentMethod} · {formatDhakaDate(p.paymentDate)}
                  </div>
                </div>
                <div className="text-[#64748b] mt-1 break-words">
                  {[p.transactionId, p.referenceNumber, p.notes].filter(Boolean).join(' · ')}
                  {p.recordedBy ? `${p.transactionId || p.referenceNumber || p.notes ? ' · ' : ''}${s.recordedBy}: ${p.recordedBy}` : ''}
                  {p.expenseId ? ` · ${s.expenseLinked}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {paying && (
        <PayModal
          payableId={d.id}
          teacherName={teacherName}
          remaining={d.remainingAmount}
          onClose={() => setPaying(false)}
          onPaid={() => {
            setPaying(false);
            load();
          }}
        />
      )}
    </div>
  );
}
