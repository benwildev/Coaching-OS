'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import FeesSubNav from '@/components/FeesSubNav';
import StatusBadge from '@/components/StatusBadge';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatBDT, formatDhakaDate } from '@/lib/i18n';
import { PAYMENT_METHODS } from '@/lib/validations/payment';

interface PaymentRow {
  id: string;
  receiptNumber: string;
  amount: string | number;
  paymentMethod: string;
  paymentDate: string;
  status: string;
  student: { id: string; name: string; studentIdCode: string };
  invoice: { id: string; invoiceNumber: string };
  collectedBy?: { id: string; name: string } | null;
}

export default function PaymentsPage() {
  const { lang } = useApp();
  const dict = DICTIONARY[lang];

  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('all');
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set('search', search.trim());
      if (method !== 'all') q.set('method', method);
      q.set('pageSize', '100');
      const res = await fetch(`/api/fees/payments?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setPayments(data.payments || []);
      }
    } finally {
      setLoading(false);
    }
  }, [search, method]);

  useEffect(() => {
    const t = setTimeout(fetchList, 250);
    return () => clearTimeout(t);
  }, [fetchList]);

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-[#063b78] tracking-tight">{dict.fees.paymentsTitle}</h1>
        <p className="text-[13.5px] text-[#64748b] mt-0.5 font-medium">{dict.fees.paymentsSubtitle}</p>
      </div>

      <FeesSubNav />

      <div className="card p-4 md:p-5 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-3.5">
        <div className="flex items-center gap-2.5 rounded-xl border border-[#dce5f0] px-3.5 py-2.5 bg-[#f8fafc] max-w-lg focus-within:border-[#063b78] focus-within:bg-white transition-colors">
          <Icon name="search" size={17} className="text-[#64748b]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={dict.fees.searchPayments} className="bg-transparent outline-none w-full text-[13.5px] text-[#092f63] placeholder:text-[#94a3b8]" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="chip" aria-pressed={method === 'all'} onClick={() => setMethod('all')}>{dict.fees.allTypes}</button>
          {PAYMENT_METHODS.map((m) => (
            <button key={m} className="chip" aria-pressed={method === m} onClick={() => setMethod(m)}>{(dict.paymentMethod as any)[m]}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="card p-12 rounded-2xl bg-white border border-[#dce5f0] text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
        </div>
      ) : payments.length === 0 ? (
        <div className="card p-12 md:p-16 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs text-center flex flex-col items-center">
          <div className="h-16 w-16 rounded-2xl bg-blue-50 text-[#063b78] flex items-center justify-center mb-4">
            <Icon name="banknote" size={32} />
          </div>
          <h2 className="text-xl font-bold text-[#063b78]">{dict.fees.emptyPaymentsTitle}</h2>
          <p className="text-[14px] text-[#64748b] max-w-md mt-1.5 font-normal">{dict.fees.emptyPaymentsDesc}</p>
        </div>
      ) : (
        <div className="card rounded-2xl bg-white border border-[#dce5f0] shadow-2xs overflow-hidden">
          <div className="overflow-x-auto scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{dict.fees.receiptNumber}</th>
                  <th>{dict.fees.invoiceNumber}</th>
                  <th>{dict.fees.student}</th>
                  <th>{dict.fees.amount}</th>
                  <th>{dict.fees.method}</th>
                  <th>{dict.fees.date}</th>
                  <th>{dict.fees.collectedBy}</th>
                  <th>{dict.fees.status}</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="trow">
                    <td className="text-left"><Link href={`/fees/payments/${p.id}`} className="font-mono font-bold text-[#063b78] hover:underline">{p.receiptNumber}</Link></td>
                    <td className="font-mono">{p.invoice.invoiceNumber}</td>
                    <td className="text-left">
                      <div className="font-semibold text-[#092f63]">{p.student.name}</div>
                      <div className="text-[11px] text-[#8795ab]">{p.student.studentIdCode}</div>
                    </td>
                    <td className="font-mono font-bold">{formatBDT(p.amount, lang)}</td>
                    <td>{(dict.paymentMethod as any)[p.paymentMethod]}</td>
                    <td>{formatDhakaDate(p.paymentDate)}</td>
                    <td>{p.collectedBy?.name || '—'}</td>
                    <td><StatusBadge status={p.status} size="sm" dictKey="paymentStatus" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
