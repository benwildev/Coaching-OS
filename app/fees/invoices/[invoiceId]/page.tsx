'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatBDT, formatDhakaDate } from '@/lib/i18n';

interface InvoiceDetail {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string | null;
  subtotalAmount: string | number;
  discountAmount: string | number;
  waiverAmount: string | number;
  totalAmount: string | number;
  paidAmount: string | number;
  dueAmount: string | number;
  status: string;
  notes?: string | null;
  student: {
    id: string;
    name: string;
    banglaName?: string | null;
    studentIdCode: string;
    phone?: string | null;
    branch?: { name: string } | null;
    studentGuardians: Array<{ guardian: { name: string; phone: string } }>;
  };
  branch?: { name: string } | null;
  items: Array<{ id: string; description: string; quantity: number; unitAmount: string | number; discountAmount: string | number; amount: string | number }>;
  payments: Array<{ id: string; receiptNumber: string; amount: string | number; paymentMethod: string; paymentDate: string; status: string }>;
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const invoiceId = params?.invoiceId as string;
  const { lang, showToast } = useApp();
  const dict = DICTIONARY[lang];

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/fees/invoices/${invoiceId}`);
      if (res.ok) {
        const data = await res.json();
        setInvoice(data.invoice);
      }
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCancel() {
    if (!confirm(dict.fees.confirmCancelInvoice)) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/fees/invoices/${invoiceId}/cancel`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to cancel');
        return;
      }
      showToast(dict.fees.invoiceCancelled);
      load();
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-[900px] mx-auto py-16 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
      </div>
    );
  }

  if (!invoice) {
    return <div className="max-w-[700px] mx-auto py-12 text-center text-[#64748b]">{dict.fees.emptyInvoicesTitle}</div>;
  }

  const primaryGuardian = invoice.student.studentGuardians?.[0]?.guardian;
  const canPay = invoice.status !== 'PAID' && invoice.status !== 'CANCELLED';
  const canCancel = invoice.status !== 'CANCELLED' && Number(invoice.paidAmount) === 0;

  return (
    <div className="max-w-[900px] mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/fees/invoices" className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#063b78] hover:underline">
          <Icon name="chevleft" size={16} />
          <span>{dict.fees.back}</span>
        </Link>
        <div className="flex items-center gap-2">
          {canPay && (
            <Link href={`/fees/invoices/${invoiceId}/payment`} className="primary">
              <Icon name="banknote" size={16} />
              <span>{dict.fees.recordPayment}</span>
            </Link>
          )}
          <button className="tb" onClick={() => window.print()}>
            <Icon name="file" size={15} />
            <span>{dict.fees.printInvoice}</span>
          </button>
          {canCancel && (
            <button className="tb" disabled={cancelling} onClick={handleCancel}>
              {dict.fees.cancelInvoice}
            </button>
          )}
        </div>
      </div>

      <div className="card p-6 md:p-8 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="font-mono text-lg font-extrabold text-[#063b78]">{invoice.invoiceNumber}</div>
            <div className="text-[13px] text-[#64748b] mt-1">{dict.fees.date}: {formatDhakaDate(invoice.invoiceDate)}</div>
            {invoice.dueDate && <div className="text-[13px] text-[#64748b]">{dict.fees.dueDate}: {formatDhakaDate(invoice.dueDate)}</div>}
          </div>
          <StatusBadge status={invoice.status} dictKey="invoiceStatus" />
        </div>

        <div className="grid sm:grid-cols-2 gap-4 border-t border-b border-[#edf1f7] py-4">
          <div>
            <div className="text-[11px] font-bold text-[#64748b] uppercase tracking-wide">{dict.fees.student}</div>
            <div className="font-bold text-[#092f63]">{invoice.student.name}</div>
            <div className="text-[12px] text-[#8795ab] font-mono">{invoice.student.studentIdCode}</div>
            {invoice.branch?.name && <div className="text-[12px] text-[#64748b]">{invoice.branch.name}</div>}
          </div>
          {primaryGuardian && (
            <div>
              <div className="text-[11px] font-bold text-[#64748b] uppercase tracking-wide">{dict.fees.guardianContact}</div>
              <div className="font-semibold text-[#092f63]">{primaryGuardian.name}</div>
              <div className="text-[12px] text-[#64748b] font-mono">{primaryGuardian.phone}</div>
            </div>
          )}
        </div>

        <div>
          <div className="font-bold text-[#063b78] mb-2">{dict.fees.items}</div>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr><th>{dict.fees.itemDescription}</th><th>{dict.fees.quantity}</th><th>{dict.fees.unitAmount}</th><th>{dict.fees.itemDiscount}</th><th>{dict.fees.lineTotal}</th></tr>
              </thead>
              <tbody>
                {invoice.items.map((item) => (
                  <tr key={item.id} className="trow">
                    <td className="text-left">{item.description}</td>
                    <td>{item.quantity}</td>
                    <td className="font-mono">{formatBDT(item.unitAmount, lang)}</td>
                    <td className="font-mono">{formatBDT(item.discountAmount, lang)}</td>
                    <td className="font-mono font-bold">{formatBDT(item.amount, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 text-[13.5px]">
          <div className="flex justify-between w-64"><span className="text-[#64748b]">{dict.fees.subtotal}</span><span className="font-mono">{formatBDT(invoice.subtotalAmount, lang)}</span></div>
          <div className="flex justify-between w-64"><span className="text-[#64748b]">{dict.fees.discount}</span><span className="font-mono">{formatBDT(invoice.discountAmount, lang)}</span></div>
          <div className="flex justify-between w-64"><span className="text-[#64748b]">{dict.fees.waiver}</span><span className="font-mono">{formatBDT(invoice.waiverAmount, lang)}</span></div>
          <div className="flex justify-between w-64 text-lg font-extrabold text-[#092f63]"><span>{dict.fees.total}</span><span className="font-mono">{formatBDT(invoice.totalAmount, lang)}</span></div>
          <div className="flex justify-between w-64 text-emerald-700 font-semibold"><span>{dict.fees.paid}</span><span className="font-mono">{formatBDT(invoice.paidAmount, lang)}</span></div>
          <div className="flex justify-between w-64 text-rose-700 font-bold"><span>{dict.fees.due}</span><span className="font-mono">{formatBDT(invoice.dueAmount, lang)}</span></div>
        </div>

        {invoice.notes && (
          <div className="rounded-xl bg-[#f8fafc] border border-[#edf1f7] p-3 text-[13px] text-[#64748b]">{invoice.notes}</div>
        )}
      </div>

      <div className="card rounded-2xl bg-white border border-[#dce5f0] shadow-2xs overflow-hidden print:hidden">
        <div className="px-5 py-3.5 border-b border-[#edf1f7] font-bold text-[#063b78]">{dict.fees.paymentHistory}</div>
        {invoice.payments.length === 0 ? (
          <div className="p-8 text-center text-[13.5px] text-[#64748b]">{dict.fees.noPayments}</div>
        ) : (
          <div className="overflow-x-auto scroll">
            <table className="tbl">
              <thead><tr><th>{dict.fees.receiptNumber}</th><th>{dict.fees.amount}</th><th>{dict.fees.method}</th><th>{dict.fees.date}</th><th>{dict.fees.status}</th></tr></thead>
              <tbody>
                {invoice.payments.map((p) => (
                  <tr key={p.id} className="trow">
                    <td className="text-left"><Link href={`/fees/payments/${p.id}`} className="font-mono font-bold text-[#063b78] hover:underline">{p.receiptNumber}</Link></td>
                    <td className="font-mono font-bold">{formatBDT(p.amount, lang)}</td>
                    <td>{(dict.paymentMethod as any)[p.paymentMethod]}</td>
                    <td>{formatDhakaDate(p.paymentDate)}</td>
                    <td><StatusBadge status={p.status} size="sm" dictKey="paymentStatus" /></td>
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
