'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePortal } from '@/components/portal/PortalProvider';
import { DICTIONARY, formatDhakaDate } from '@/lib/i18n';

interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  status: string;
}

const STATUS_STYLE: Record<string, string> = {
  PAID: 'bg-emerald-50 text-emerald-700',
  PARTIAL: 'bg-amber-50 text-amber-700',
  ISSUED: 'bg-blue-50 text-blue-700',
  OVERDUE: 'bg-rose-50 text-rose-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
  DRAFT: 'bg-slate-100 text-slate-500',
};

export default function StudentPortalFeesPage() {
  const { lang } = usePortal();
  const t = DICTIONARY[lang];
  const f = t.portalFees;

  const [summary, setSummary] = useState<{ totalBilled: number; totalDiscount: number; totalWaiver: number; totalPaid: number; totalDue: number } | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/portal/student/fees')
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setSummary(res.summary);
          setInvoices(res.invoices);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-16 text-center text-[13px] text-[#64748b]">{t.common.loading}</div>;

  return (
    <div className="max-w-[900px] mx-auto flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-[#092f63]">{f.title}</h1>
        <Link href="/portal/student/payments" className="text-[12.5px] font-bold text-[#063b78] hover:underline">{f.viewPayments}</Link>
      </div>

      {summary && (
        <div className="card p-5 rounded-2xl bg-white border border-[#dce5f0] grid grid-cols-2 sm:grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-lg font-black text-[#092f63]">৳{Number(summary.totalBilled).toLocaleString('en-BD')}</div>
            <div className="text-[11px] text-[#64748b]">{f.totalBilled}</div>
          </div>
          <div>
            <div className="text-lg font-black text-emerald-600">৳{Number(summary.totalPaid).toLocaleString('en-BD')}</div>
            <div className="text-[11px] text-[#64748b]">{f.totalPaid}</div>
          </div>
          <div>
            <div className="text-lg font-black text-rose-600">৳{Number(summary.totalDue).toLocaleString('en-BD')}</div>
            <div className="text-[11px] text-[#64748b]">{f.totalDue}</div>
          </div>
        </div>
      )}

      <div className="card rounded-2xl bg-white border border-[#dce5f0] overflow-hidden">
        {invoices.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-[#64748b]">{f.empty}</div>
        ) : (
          <ul className="divide-y divide-[#edf1f7]">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="font-semibold text-[#092f63] text-[13px] font-mono">{inv.invoiceNumber}</div>
                  <div className="text-[12px] text-[#64748b]">
                    {formatDhakaDate(inv.invoiceDate)}
                    {inv.dueDate && ` · ${f.dueDate}: ${formatDhakaDate(inv.dueDate)}`}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-[#092f63] text-[13px]">৳{Number(inv.totalAmount).toLocaleString('en-BD')}</div>
                  <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10.5px] font-bold ${STATUS_STYLE[inv.status] || 'bg-slate-100 text-slate-600'}`}>
                    {(t.invoiceStatus as Record<string, string>)?.[inv.status] || inv.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11.5px] text-[#94a3b8] text-center">{f.readOnlyNote}</p>
    </div>
  );
}
