'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import { useApp } from '@/lib/store';
import { takaWords } from '@/lib/format';
import { DICTIONARY as DICT2, formatBDT as fmtBDT, formatDhakaDate as fmtDate } from '@/lib/i18n';

interface PaymentDetail {
  id: string;
  receiptNumber: string;
  amount: string | number;
  paymentMethod: string;
  paymentDate: string;
  status: string;
  transactionId?: string | null;
  referenceNumber?: string | null;
  senderMobile?: string | null;
  bankName?: string | null;
  chequeNumber?: string | null;
  notes?: string | null;
  student: { id: string; name: string; banglaName?: string | null; studentIdCode: string; branch?: { name: string } | null };
  invoice: { id: string; invoiceNumber: string; totalAmount: string | number; dueAmount: string | number };
  branch?: { name: string } | null;
  collectedBy?: { id: string; name: string } | null;
  refunds: Array<{ id: string; amount: string | number; reason: string; refundDate: string; refundedBy?: { name: string } | null }>;
}

export default function PaymentReceiptPage() {
  const params = useParams();
  const paymentId = params?.paymentId as string;
  const { lang, currentUser } = useApp();
  const dict = DICT2[lang];

  const [payment, setPayment] = useState<PaymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRefund, setShowRefund] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/fees/payments/${paymentId}`);
      if (res.ok) {
        const data = await res.json();
        setPayment(data.payment);
      }
    } finally {
      setLoading(false);
    }
  }, [paymentId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="max-w-[700px] mx-auto py-16 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
      </div>
    );
  }

  if (!payment) return null;

  const totalRefunded = payment.refunds.reduce((s, r) => s + Number(r.amount), 0);
  const refundable = Number(payment.amount) - totalRefunded;
  const canRefund = (currentUser?.role === 'OWNER' || currentUser?.role === 'ADMIN') && payment.status !== 'REFUNDED' && refundable > 0;

  return (
    <div className="max-w-[700px] mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/fees/payments" className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#063b78] hover:underline">
          <Icon name="chevleft" size={16} />
          <span>{dict.fees.paymentsTitle}</span>
        </Link>
        <div className="flex items-center gap-2">
          <button className="tb" onClick={() => window.print()}>
            <Icon name="file" size={15} />
            <span>{dict.fees.printReceipt}</span>
          </button>
          {canRefund && (
            <button className="tb" onClick={() => setShowRefund(true)}>{dict.fees.refundPayment}</button>
          )}
        </div>
      </div>

      <div className="card p-6 md:p-8 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-5">
        <div className="text-center border-b border-dashed border-[#dce5f0] pb-4">
          <div className="font-extrabold text-[#063b78] text-lg">{dict.fees.receiptTitle}</div>
          <div className="font-mono text-[13px] text-[#64748b] mt-1">{payment.receiptNumber}</div>
          <div className="mt-2"><StatusBadge status={payment.status} dictKey="paymentStatus" /></div>
        </div>

        <div className="grid grid-cols-2 gap-y-3 text-[13.5px]">
          <div className="text-[#64748b]">{dict.fees.student}</div>
          <div className="text-right font-semibold text-[#092f63]">{payment.student.name} ({payment.student.studentIdCode})</div>

          <div className="text-[#64748b]">{dict.fees.invoiceNumber}</div>
          <div className="text-right font-mono"><Link href={`/fees/invoices/${payment.invoice.id}`} className="text-[#063b78] hover:underline">{payment.invoice.invoiceNumber}</Link></div>

          <div className="text-[#64748b]">{dict.fees.date}</div>
          <div className="text-right">{fmtDate(payment.paymentDate)}</div>

          <div className="text-[#64748b]">{dict.fees.method}</div>
          <div className="text-right">{(dict.paymentMethod as any)[payment.paymentMethod]}</div>

          {payment.transactionId && (<><div className="text-[#64748b]">{dict.fees.transactionId}</div><div className="text-right font-mono">{payment.transactionId}</div></>)}
          {payment.referenceNumber && (<><div className="text-[#64748b]">{dict.fees.referenceNumber}</div><div className="text-right font-mono">{payment.referenceNumber}</div></>)}
          {payment.senderMobile && (<><div className="text-[#64748b]">{dict.fees.senderMobile}</div><div className="text-right font-mono">{payment.senderMobile}</div></>)}
          {payment.bankName && (<><div className="text-[#64748b]">{dict.fees.bankName}</div><div className="text-right">{payment.bankName}</div></>)}
          {payment.chequeNumber && (<><div className="text-[#64748b]">{dict.fees.chequeNumber}</div><div className="text-right font-mono">{payment.chequeNumber}</div></>)}

          <div className="text-[#64748b]">{dict.fees.collectedBy}</div>
          <div className="text-right font-semibold">{payment.collectedBy?.name || '—'}</div>
        </div>

        <div className="border-t border-dashed border-[#dce5f0] pt-4 flex items-center justify-between">
          <span className="font-bold text-[#063b78]">{dict.fees.amount}</span>
          <span className="dsp text-2xl font-extrabold text-[#00296b]">{fmtBDT(payment.amount, lang)}</span>
        </div>
        {lang === 'en' && (
          <div className="text-[11.5px] text-[#94a3b8] italic text-right">{takaWords(Number(payment.amount))}</div>
        )}

        {payment.notes && <div className="rounded-xl bg-[#f8fafc] border border-[#edf1f7] p-3 text-[13px] text-[#64748b]">{payment.notes}</div>}
      </div>

      {payment.refunds.length > 0 && (
        <div className="card rounded-2xl bg-white border border-[#dce5f0] shadow-2xs overflow-hidden print:hidden">
          <div className="px-5 py-3.5 border-b border-[#edf1f7] font-bold text-[#063b78]">{dict.fees.refundHistory}</div>
          <div className="overflow-x-auto scroll">
            <table className="tbl">
              <thead><tr><th>{dict.fees.date}</th><th>{dict.fees.amount}</th><th>{dict.fees.reason}</th><th>{lang === 'bn' ? 'দ্বারা' : 'By'}</th></tr></thead>
              <tbody>
                {payment.refunds.map((r) => (
                  <tr key={r.id} className="trow">
                    <td>{fmtDate(r.refundDate)}</td>
                    <td className="font-mono font-bold text-rose-700">{fmtBDT(r.amount, lang)}</td>
                    <td className="text-left">{r.reason}</td>
                    <td>{r.refundedBy?.name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showRefund && (
        <RefundModal
          paymentId={paymentId}
          refundable={refundable}
          onClose={() => setShowRefund(false)}
          onSaved={() => {
            setShowRefund(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function RefundModal({
  paymentId,
  refundable,
  onClose,
  onSaved,
}: {
  paymentId: string;
  refundable: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { lang, showToast } = useApp();
  const dict = DICT2[lang];
  const [amount, setAmount] = useState(String(refundable));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/fees/payments/${paymentId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(amount), reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to process refund');
        return;
      }
      showToast(dict.fees.refundRecorded);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-md rounded-2xl bg-white p-6 flex flex-col gap-3.5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#063b78]">{dict.fees.refundTitle}</h2>
          <button className="ibtn" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        {error && <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[13px] px-3 py-2">{error}</div>}
        <div className="text-[13px] text-[#64748b]">{dict.fees.refundable}: <strong className="text-[#092f63]">{fmtBDT(refundable, lang)}</strong></div>
        <div className="fld">
          <label>{dict.fees.refundAmount}</label>
          <input type="number" min="0.01" max={refundable} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="fld">
          <label>{dict.fees.refundReason}</label>
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="tb" onClick={onClose}>{dict.actions.cancel}</button>
          <button className="primary" disabled={saving || !reason || Number(amount) <= 0} onClick={submit}>
            {saving ? '…' : dict.fees.confirmRefund}
          </button>
        </div>
      </div>
    </div>
  );
}
