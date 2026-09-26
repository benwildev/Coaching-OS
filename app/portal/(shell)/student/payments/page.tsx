'use client';

import { useEffect, useState } from 'react';
import { usePortal } from '@/components/portal/PortalProvider';
import { DICTIONARY, formatDhakaDate } from '@/lib/i18n';

interface Payment {
  id: string;
  receiptNumber: string;
  amount: number;
  paymentMethod: string;
  paymentDate: string;
  status: string;
  invoice: { invoiceNumber: string } | null;
}

export default function StudentPortalPaymentsPage() {
  const { lang } = usePortal();
  const t = DICTIONARY[lang];
  const p = t.portalPayments;

  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/portal/student/payments')
      .then((r) => r.json())
      .then((res) => res.success && setPayments(res.payments))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-[900px] mx-auto flex flex-col gap-5">
      <h1 className="text-lg font-bold text-[#092f63]">{p.title}</h1>

      <div className="card rounded-2xl bg-white border border-[#dce5f0] overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-[13px] text-[#64748b]">{t.common.loading}</div>
        ) : payments.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-[#64748b]">{p.empty}</div>
        ) : (
          <ul className="divide-y divide-[#edf1f7]">
            {payments.map((pay) => (
              <li key={pay.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="font-semibold text-[#092f63] text-[13px] font-mono">{pay.receiptNumber}</div>
                  <div className="text-[12px] text-[#64748b]">
                    {formatDhakaDate(pay.paymentDate)} · {(t.paymentMethod as Record<string, string>)?.[pay.paymentMethod] || pay.paymentMethod}
                    {pay.invoice && ` · ${pay.invoice.invoiceNumber}`}
                  </div>
                </div>
                <div className="font-bold text-emerald-600 text-[13px] shrink-0">৳{Number(pay.amount).toLocaleString('en-BD')}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
