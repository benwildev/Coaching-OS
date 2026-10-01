'use client';

import { useState } from 'react';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatBDTExact } from '@/lib/i18n';
import { PAYMENT_METHODS } from '@/lib/validations/payment';

const inputCls = 'w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78]';

export default function PayModal({
  payableId,
  teacherName,
  remaining,
  onClose,
  onPaid,
}: {
  payableId: string;
  teacherName: string;
  remaining: number;
  onClose: () => void;
  onPaid: () => void;
}) {
  const { lang, showToast } = useApp();
  const dict = DICTIONARY[lang];
  const s = dict.salary;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });

  // One key per opened modal: a double-click or a retried request is a no-op on the server.
  const [idempotencyKey] = useState(() => globalThis.crypto.randomUUID());
  const [form, setForm] = useState({
    amount: String(remaining),
    paymentMethod: 'CASH' as (typeof PAYMENT_METHODS)[number],
    paymentDate: today,
    transactionId: '',
    referenceNumber: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/salary/${payableId}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: Number(form.amount), idempotencyKey }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) {
        const first = d?.details ? (Object.values(d.details).flat()[0] as string) : '';
        setError(first || (d?.error && (s.errors as Record<string, string>)[d.error]) || d?.message || s.loadFailed);
        return;
      }
      showToast(s.paymentRecorded);
      onPaid();
    } finally {
      setSaving(false);
    }
  };

  const showTxn = form.paymentMethod !== 'CASH' && form.paymentMethod !== 'OTHER';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card p-6 bg-white max-w-md w-full shadow-2xl space-y-4 rounded-2xl max-h-[90vh] overflow-y-auto scroll">
        <div className="flex items-center justify-between pb-3 border-b border-[#edf2f7]">
          <div>
            <h3 className="font-extrabold text-base text-[#063b78]">{s.payTitle}</h3>
            <p className="text-[12px] text-[#64748b] mt-0.5">
              {teacherName} · {s.remaining}: <strong>{formatBDTExact(remaining, lang)}</strong>
            </p>
          </div>
          <button onClick={onClose} className="text-[#64748b] hover:text-black p-1 rounded-lg" aria-label={s.close}>
            <Icon name="x" size={18} />
          </button>
        </div>

        {error && <div className="text-[12.5px] text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</div>}

        <div className="fld">
          <label className="text-[12.5px] font-bold text-[#334155]">{s.amount} *</label>
          <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputCls} />
          <button type="button" className="text-[11.5px] font-bold text-[#00509d] mt-1" onClick={() => setForm({ ...form, amount: String(remaining) })}>
            {s.payRemaining}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="fld">
            <label className="text-[12.5px] font-bold text-[#334155]">{s.method} *</label>
            <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as typeof form.paymentMethod })} className={inputCls}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {dict.paymentMethod[m]}
                </option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label className="text-[12.5px] font-bold text-[#334155]">{s.paymentDate} *</label>
            <input type="date" max={today} value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} className={inputCls} />
          </div>
        </div>
        {form.paymentMethod === 'CASH' && <p className="text-[11.5px] text-[#64748b]">{s.cashNote}</p>}

        {showTxn && (
          <div className="fld">
            <label className="text-[12.5px] font-bold text-[#334155]">{s.transactionId}</label>
            <input type="text" value={form.transactionId} onChange={(e) => setForm({ ...form, transactionId: e.target.value })} className={inputCls} />
          </div>
        )}
        <div className="fld">
          <label className="text-[12.5px] font-bold text-[#334155]">{s.reference}</label>
          <input type="text" value={form.referenceNumber} onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })} className={inputCls} />
        </div>
        <div className="fld">
          <label className="text-[12.5px] font-bold text-[#334155]">{s.notes}</label>
          <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-[#edf2f7]">
          <button className="tb" onClick={onClose}>
            {s.cancel}
          </button>
          <button className="primary" disabled={saving || !(Number(form.amount) > 0)} onClick={submit}>
            {saving ? s.saving : s.confirmPay}
          </button>
        </div>
      </div>
    </div>
  );
}
