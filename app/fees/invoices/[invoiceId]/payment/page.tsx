'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatBDT } from '@/lib/i18n';
import { PAYMENT_METHODS } from '@/lib/validations/payment';

interface InvoiceSummary {
  id: string;
  invoiceNumber: string;
  totalAmount: string | number;
  paidAmount: string | number;
  dueAmount: string | number;
  status: string;
  student: { name: string; studentIdCode: string };
}

export default function RecordPaymentPage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params?.invoiceId as string;
  const { lang, showToast } = useApp();
  const dict = DICTIONARY[lang];

  const [invoice, setInvoice] = useState<InvoiceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<string>('CASH');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [transactionId, setTransactionId] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [senderMobile, setSenderMobile] = useState('');
  const [bankName, setBankName] = useState('');
  const [chequeNumber, setChequeNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/fees/invoices/${invoiceId}`);
      if (res.ok) {
        const data = await res.json();
        setInvoice(data.invoice);
        setAmount(String(data.invoice.dueAmount));
      }
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/fees/invoices/${invoiceId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(amount),
          paymentMethod: method,
          paymentDate: paymentDate || undefined,
          transactionId: transactionId || undefined,
          referenceNumber: referenceNumber || undefined,
          senderMobile: senderMobile || undefined,
          bankName: bankName || undefined,
          chequeNumber: chequeNumber || undefined,
          notes: notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to record payment');
        return;
      }
      showToast(dict.fees.paymentRecorded);
      router.push(`/fees/payments/${data.payment.id}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-[600px] mx-auto py-16 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
      </div>
    );
  }

  if (!invoice) return null;

  return (
    <div className="max-w-[600px] mx-auto flex flex-col gap-6">
      <Link href={`/fees/invoices/${invoiceId}`} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#063b78] hover:underline w-fit">
        <Icon name="chevleft" size={16} />
        <span>{invoice.invoiceNumber}</span>
      </Link>

      <div>
        <h1 className="text-2xl font-extrabold text-[#063b78] tracking-tight">{dict.fees.paymentTitle}</h1>
        <p className="text-[13.5px] text-[#64748b] mt-0.5">{invoice.student.name} · {invoice.student.studentIdCode}</p>
      </div>

      <div className="card p-4 rounded-2xl bg-[#eef3fa] border border-[#d8e1ee] flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[#063b78]">{dict.fees.outstandingBalance}</span>
        <span className="dsp text-xl font-extrabold text-[#00296b]">{formatBDT(invoice.dueAmount, lang)}</span>
      </div>

      <form onSubmit={submit} className="card p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-4">
        {error && <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[13px] px-3 py-2">{error}</div>}

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="fld">
            <label>{dict.fees.amount}</label>
            <input required type="number" min="0.01" max={Number(invoice.dueAmount)} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="fld">
            <label>{dict.fees.method}</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{(dict.paymentMethod as any)[m]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="fld">
          <label>{dict.fees.date}</label>
          <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="max-w-[220px]" />
        </div>

        {(method === 'BKASH' || method === 'NAGAD') && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="fld">
              <label>{dict.fees.transactionId}</label>
              <input value={transactionId} onChange={(e) => setTransactionId(e.target.value)} />
            </div>
            <div className="fld">
              <label>{dict.fees.senderMobile}</label>
              <input value={senderMobile} onChange={(e) => setSenderMobile(e.target.value)} />
            </div>
          </div>
        )}

        {method === 'BANK' && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="fld">
              <label>{dict.fees.bankName}</label>
              <input value={bankName} onChange={(e) => setBankName(e.target.value)} />
            </div>
            <div className="fld">
              <label>{dict.fees.referenceNumber}</label>
              <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
            </div>
          </div>
        )}

        {method === 'CARD' && (
          <div className="fld">
            <label>{dict.fees.referenceNumber}</label>
            <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
          </div>
        )}

        {method === 'OTHER' && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="fld">
              <label>{dict.fees.referenceNumber}</label>
              <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
            </div>
            <div className="fld">
              <label>{dict.fees.chequeNumber}</label>
              <input value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} />
            </div>
          </div>
        )}

        <div className="fld">
          <label>{dict.fees.notes}</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Link href={`/fees/invoices/${invoiceId}`} className="tb">{dict.actions.cancel}</Link>
          <button type="submit" className="primary" disabled={saving || !amount || Number(amount) <= 0}>
            {saving ? '…' : dict.fees.submitPayment}
          </button>
        </div>
      </form>
    </div>
  );
}
