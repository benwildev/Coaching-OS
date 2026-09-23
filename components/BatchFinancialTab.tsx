'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import StatusBadge from './StatusBadge';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatBDT } from '@/lib/i18n';

interface StudentFin {
  student: { id: string; name: string; studentIdCode: string };
  totalBilled: number;
  totalPaid: number;
  totalDue: number;
  collectionCount: number;
  status: string;
}

interface FinancialData {
  students: StudentFin[];
  totals: { totalBilled: number; totalCollected: number; totalDue: number; collectionCount: number };
}

const FILTERS = ['ALL', 'PAID', 'PARTIAL', 'DUE', 'OVERDUE'] as const;

export default function BatchFinancialTab({ batchId }: { batchId: string }) {
  const { lang } = useApp();
  const dict = DICTIONARY[lang];
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('ALL');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/batches/${batchId}/financial`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success) setData({ students: d.students, totals: d.totals });
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [batchId]);

  if (loading) {
    return (
      <div className="card p-12 rounded-2xl bg-white border border-[#dce5f0] text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
      </div>
    );
  }

  if (!data) return null;

  const filtered = filter === 'ALL' ? data.students : data.students.filter((s) => s.status === filter);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4 rounded-xl bg-[#eef3fa] border border-[#d8e1ee]">
          <div className="text-[11px] font-bold text-[#063b78] uppercase">{dict.fees.totalBilled}</div>
          <div className="dsp text-lg font-extrabold text-[#00296b]">{formatBDT(data.totals.totalBilled, lang)}</div>
        </div>
        <div className="card p-4 rounded-xl bg-emerald-50 border border-emerald-100">
          <div className="text-[11px] font-bold text-emerald-700 uppercase">{dict.fees.totalPaid}</div>
          <div className="dsp text-lg font-extrabold text-emerald-600">{formatBDT(data.totals.totalCollected, lang)}</div>
        </div>
        <div className="card p-4 rounded-xl bg-rose-50 border border-rose-100">
          <div className="text-[11px] font-bold text-rose-700 uppercase">{dict.fees.totalDue}</div>
          <div className="dsp text-lg font-extrabold text-rose-600">{formatBDT(data.totals.totalDue, lang)}</div>
        </div>
        <div className="card p-4 rounded-xl bg-white border border-[#d8e1ee]">
          <div className="text-[11px] font-bold text-[#55637a] uppercase">{dict.fees.collectionCount}</div>
          <div className="dsp text-lg font-extrabold text-[#092f63]">{data.totals.collectionCount}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'ALL' ? dict.fees.allStatuses : (dict.invoiceStatus as any)[f] || f}
          </button>
        ))}
      </div>

      <div className="card rounded-2xl bg-white border border-[#dce5f0] shadow-2xs overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-[13.5px] text-[#64748b]">{dict.fees.emptyDueTitle}</div>
        ) : (
          <div className="overflow-x-auto scroll">
            <table className="tbl">
              <thead>
                <tr><th>{dict.fees.student}</th><th>{dict.fees.totalBilled}</th><th>{dict.fees.paid}</th><th>{dict.fees.due}</th><th>{dict.fees.status}</th></tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.student.id} className="trow">
                    <td className="text-left">
                      <Link href={`/fees/student/${s.student.id}`} className="font-semibold text-[#063b78] hover:underline">{s.student.name}</Link>
                      <div className="text-[11px] text-[#8795ab]">{s.student.studentIdCode}</div>
                    </td>
                    <td className="font-mono">{formatBDT(s.totalBilled, lang)}</td>
                    <td className="font-mono text-emerald-700">{formatBDT(s.totalPaid, lang)}</td>
                    <td className="font-mono text-rose-700">{formatBDT(s.totalDue, lang)}</td>
                    <td>{s.status !== 'NONE' && <StatusBadge status={s.status} size="sm" dictKey="invoiceStatus" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
