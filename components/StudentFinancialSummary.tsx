'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from './Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatBDT } from '@/lib/i18n';

interface Summary {
  totalAssigned: number;
  totalDiscount: number;
  totalWaiver: number;
  totalBilled: number;
  totalPaid: number;
  totalDue: number;
}

export default function StudentFinancialSummary({ studentId }: { studentId: string }) {
  const { lang } = useApp();
  const dict = DICTIONARY[lang];
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/fees/students/${studentId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.success) setSummary(data.summary);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  return (
    <div className="card p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
      <div className="flex items-center justify-between border-b border-[#edf2f7] pb-3 mb-4">
        <div className="flex items-center gap-2 text-[#063b78]">
          <Icon name="wallet" size={19} />
          <h2 className="text-lg font-bold text-[#063b78]">{dict.fees.financialSummary}</h2>
        </div>
        <Link href={`/fees/student/${studentId}`} className="text-[12.5px] font-semibold text-[#063b78] hover:underline">
          {dict.fees.viewFullProfile}
        </Link>
      </div>

      {loading ? (
        <div className="py-6 text-center">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-[#063b78] border-r-transparent" />
        </div>
      ) : !summary ? (
        <p className="text-[13px] text-[#64748b] italic">{dict.fees.noFeeAssignments}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          <div className="p-3 rounded-xl bg-[#f8fafc] text-center">
            <div className="text-[10.5px] font-bold text-[#64748b] uppercase">{dict.fees.totalBilled}</div>
            <div className="text-[15px] font-extrabold text-[#092f63]">{formatBDT(summary.totalBilled, lang)}</div>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50 text-center">
            <div className="text-[10.5px] font-bold text-emerald-700 uppercase">{dict.fees.totalPaid}</div>
            <div className="text-[15px] font-extrabold text-emerald-600">{formatBDT(summary.totalPaid, lang)}</div>
          </div>
          <div className="p-3 rounded-xl bg-rose-50 text-center col-span-2">
            <div className="text-[10.5px] font-bold text-rose-700 uppercase">{dict.fees.totalDue}</div>
            <div className="text-[17px] font-extrabold text-rose-600">{formatBDT(summary.totalDue, lang)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
