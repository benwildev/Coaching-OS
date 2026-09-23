'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatBDT, formatDhakaDate } from '@/lib/i18n';

interface FeeAssignment {
  id: string;
  name: string;
  originalAmount: string | number;
  discountAmount: string | number;
  waiverAmount: string | number;
  finalAmount: string | number;
  dueDate?: string | null;
  status: string;
  feeStructure?: { id: string; name: string } | null;
  batch?: { id: string; name: string } | null;
}

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: string | number;
  paidAmount: string | number;
  dueAmount: string | number;
  status: string;
}

interface PaymentRow {
  id: string;
  receiptNumber: string;
  amount: string | number;
  paymentMethod: string;
  paymentDate: string;
  status: string;
  invoice: { id: string; invoiceNumber: string };
}

interface ProfileData {
  student: { id: string; studentIdCode: string; name: string; banglaName?: string | null; branch?: { name: string } | null; studentBatches: Array<{ batch: { id: string; name: string } }> };
  assignments: FeeAssignment[];
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  summary: { totalAssigned: number; totalDiscount: number; totalWaiver: number; totalBilled: number; totalPaid: number; totalDue: number };
}

interface StructureOption {
  id: string;
  name: string;
  banglaName?: string | null;
  amount: string | number;
  feeType: string;
}

export default function StudentFeeProfilePage() {
  const params = useParams();
  const studentId = params?.studentId as string;
  const { lang, showToast } = useApp();
  const dict = DICTIONARY[lang];

  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [structures, setStructures] = useState<StructureOption[]>([]);
  const [showAssign, setShowAssign] = useState(false);
  const [editing, setEditing] = useState<FeeAssignment | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/fees/students/${studentId}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    load();
    fetch('/api/fees/options')
      .then((r) => r.json())
      .then((d) => d.success && setStructures(d.activeStructures || []));
  }, [load]);

  async function cancelAssignment(a: FeeAssignment) {
    if (!confirm(dict.fees.confirmCancelAssignment)) return;
    const res = await fetch(`/api/fees/assignments/${a.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CANCELLED' }),
    });
    const d = await res.json();
    if (!res.ok) {
      showToast(d.error || 'Failed to cancel');
      return;
    }
    showToast('Fee assignment cancelled');
    load();
  }

  if (loading) {
    return (
      <div className="max-w-[1200px] mx-auto py-16 text-center text-[#64748b]">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-[800px] mx-auto py-12 text-center text-[#64748b]">
        {lang === 'bn' ? 'শিক্ষার্থী পাওয়া যায়নি' : 'Student not found'}
      </div>
    );
  }

  const { student, assignments, invoices, payments, summary } = data;
  const currentBatch = student.studentBatches?.[0]?.batch;

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link href={`/students/${studentId}`} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#063b78] hover:underline">
          <Icon name="chevleft" size={16} />
          <span>{lang === 'bn' ? 'শিক্ষার্থী প্রোফাইলে ফিরুন' : 'Back to Student Profile'}</span>
        </Link>
        <button className="primary" onClick={() => setShowAssign(true)}>
          <Icon name="plus" size={16} />
          <span>{dict.fees.assignFee}</span>
        </button>
      </div>

      <div className="card p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold text-[#092f63]">{student.name}</h1>
          {student.banglaName && <div className="text-[13.5px] text-[#64748b]">{student.banglaName}</div>}
          <div className="flex items-center gap-2 mt-1.5 text-[13px]">
            <span className="font-mono font-bold text-[#063b78] bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">{student.studentIdCode}</span>
            {currentBatch && <span className="text-[#64748b]">{currentBatch.name}</span>}
          </div>
        </div>
      </div>

      <div>
        <div className="text-[12px] font-bold text-[#55637a] uppercase tracking-wide mb-2">{dict.fees.financialSummary}</div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            [dict.fees.totalAssigned, summary.totalAssigned],
            [dict.fees.totalDiscount, summary.totalDiscount],
            [dict.fees.totalWaiver, summary.totalWaiver],
            [dict.fees.totalBilled, summary.totalBilled],
            [dict.fees.totalPaid, summary.totalPaid],
            [dict.fees.totalDue, summary.totalDue],
          ].map(([label, val]) => (
            <div key={label as string} className="card p-3.5 rounded-xl bg-white border border-[#d8e1ee]">
              <div className="text-[11px] font-semibold text-[#55637a] uppercase">{label}</div>
              <div className="dsp text-lg font-extrabold text-[#00296b]">{formatBDT(val as number, lang)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card rounded-2xl bg-white border border-[#dce5f0] shadow-2xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#edf1f7] font-bold text-[#063b78]">{dict.fees.feeAssignments}</div>
        {assignments.length === 0 ? (
          <div className="p-8 text-center text-[13.5px] text-[#64748b]">{dict.fees.noFeeAssignments}</div>
        ) : (
          <div className="overflow-x-auto scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{dict.fees.name}</th>
                  <th>{dict.fees.originalAmount}</th>
                  <th>{dict.fees.discount}</th>
                  <th>{dict.fees.waiver}</th>
                  <th>{dict.fees.finalAmount}</th>
                  <th>{dict.fees.dueDate}</th>
                  <th>{dict.fees.status}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id} className="trow">
                    <td className="text-left font-semibold text-[#092f63]">{a.name}{a.batch && <div className="text-[11px] text-[#8795ab] font-normal">{a.batch.name}</div>}</td>
                    <td className="font-mono">{formatBDT(a.originalAmount, lang)}</td>
                    <td className="font-mono text-amber-700">{formatBDT(a.discountAmount, lang)}</td>
                    <td className="font-mono text-indigo-700">{formatBDT(a.waiverAmount, lang)}</td>
                    <td className="font-mono font-bold text-[#092f63]">{formatBDT(a.finalAmount, lang)}</td>
                    <td>{a.dueDate ? formatDhakaDate(a.dueDate) : '—'}</td>
                    <td><StatusBadge status={a.status} size="sm" dictKey="feeAssignmentStatus" /></td>
                    <td>
                      {a.status === 'PENDING' && (
                        <div className="flex items-center justify-end gap-1.5">
                          <button className="tb" onClick={() => setEditing(a)}>{dict.actions.edit}</button>
                          <button className="tb" onClick={() => cancelAssignment(a)}>{dict.fees.cancelAssignment}</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card rounded-2xl bg-white border border-[#dce5f0] shadow-2xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#edf1f7] font-bold text-[#063b78]">{dict.fees.invoicesTitle}</div>
        {invoices.length === 0 ? (
          <div className="p-8 text-center text-[13.5px] text-[#64748b]">{dict.fees.emptyInvoicesTitle}</div>
        ) : (
          <div className="overflow-x-auto scroll">
            <table className="tbl">
              <thead>
                <tr><th>{dict.fees.invoiceNumber}</th><th>{dict.fees.date}</th><th>{dict.fees.total}</th><th>{dict.fees.paid}</th><th>{dict.fees.due}</th><th>{dict.fees.status}</th></tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="trow">
                    <td className="text-left"><Link href={`/fees/invoices/${inv.id}`} className="font-mono font-bold text-[#063b78] hover:underline">{inv.invoiceNumber}</Link></td>
                    <td>{formatDhakaDate(inv.invoiceDate)}</td>
                    <td className="font-mono">{formatBDT(inv.totalAmount, lang)}</td>
                    <td className="font-mono text-emerald-700">{formatBDT(inv.paidAmount, lang)}</td>
                    <td className="font-mono text-rose-700">{formatBDT(inv.dueAmount, lang)}</td>
                    <td><StatusBadge status={inv.status} size="sm" dictKey="invoiceStatus" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card rounded-2xl bg-white border border-[#dce5f0] shadow-2xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#edf1f7] font-bold text-[#063b78]">{dict.fees.paymentHistory}</div>
        {payments.length === 0 ? (
          <div className="p-8 text-center text-[13.5px] text-[#64748b]">{dict.fees.noPayments}</div>
        ) : (
          <div className="overflow-x-auto scroll">
            <table className="tbl">
              <thead>
                <tr><th>{dict.fees.receiptNumber}</th><th>{dict.fees.invoiceNumber}</th><th>{dict.fees.amount}</th><th>{dict.fees.method}</th><th>{dict.fees.date}</th><th>{dict.fees.status}</th></tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="trow">
                    <td className="text-left"><Link href={`/fees/payments/${p.id}`} className="font-mono font-bold text-[#063b78] hover:underline">{p.receiptNumber}</Link></td>
                    <td className="font-mono">{p.invoice.invoiceNumber}</td>
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

      {showAssign && (
        <AssignFeeModal
          studentId={studentId}
          structures={structures}
          onClose={() => setShowAssign(false)}
          onSaved={() => {
            setShowAssign(false);
            load();
          }}
        />
      )}
      {editing && (
        <EditAssignmentModal
          assignment={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function AssignFeeModal({
  studentId,
  structures,
  onClose,
  onSaved,
}: {
  studentId: string;
  structures: StructureOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { lang, showToast } = useApp();
  const dict = DICTIONARY[lang];
  const [feeStructureId, setFeeStructureId] = useState('');
  const [name, setName] = useState('');
  const [originalAmount, setOriginalAmount] = useState('');
  const [discountAmount, setDiscountAmount] = useState('0');
  const [waiverAmount, setWaiverAmount] = useState('0');
  const [dueDate, setDueDate] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function pickStructure(id: string) {
    setFeeStructureId(id);
    const s = structures.find((x) => x.id === id);
    if (s) {
      setName(lang === 'bn' && s.banglaName ? s.banglaName : s.name);
      setOriginalAmount(String(s.amount));
    }
  }

  async function submit() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/fees/students/${studentId}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feeStructureId: feeStructureId || undefined,
          name,
          originalAmount: Number(originalAmount),
          discountAmount: Number(discountAmount || 0),
          waiverAmount: Number(waiverAmount || 0),
          dueDate: dueDate || undefined,
          reason: reason || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to assign fee');
        return;
      }
      showToast('Fee assigned');
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg rounded-2xl bg-white p-6 flex flex-col gap-3.5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#063b78]">{dict.fees.assignFee}</h2>
          <button className="ibtn" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        {error && <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[13px] px-3 py-2">{error}</div>}

        <div className="fld">
          <label>{dict.fees.structuresTitle}</label>
          <select value={feeStructureId} onChange={(e) => pickStructure(e.target.value)}>
            <option value="">{lang === 'bn' ? 'কাস্টম ফি' : 'Custom fee (no structure)'}</option>
            {structures.map((s) => (
              <option key={s.id} value={s.id}>{lang === 'bn' && s.banglaName ? s.banglaName : s.name} — {formatBDT(s.amount, lang)}</option>
            ))}
          </select>
        </div>
        <div className="fld">
          <label>{dict.fees.name}</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="fld">
          <label>{dict.fees.originalAmount}</label>
          <input required type="number" min="0" step="0.01" value={originalAmount} onChange={(e) => setOriginalAmount(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="fld">
            <label>{dict.fees.applyDiscount}</label>
            <input type="number" min="0" step="0.01" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} />
          </div>
          <div className="fld">
            <label>{dict.fees.applyWaiver}</label>
            <input type="number" min="0" step="0.01" value={waiverAmount} onChange={(e) => setWaiverAmount(e.target.value)} />
          </div>
        </div>
        {(Number(discountAmount || 0) > 0 || Number(waiverAmount || 0) > 0) && (
          <div className="fld">
            <label>{dict.fees.reason}</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
        <div className="fld">
          <label>{dict.fees.dueDate}</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="tb" onClick={onClose}>{dict.actions.cancel}</button>
          <button className="primary" disabled={saving || !name || !originalAmount} onClick={submit}>
            {saving ? '…' : dict.actions.save}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditAssignmentModal({
  assignment,
  onClose,
  onSaved,
}: {
  assignment: FeeAssignment;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { lang, showToast } = useApp();
  const dict = DICTIONARY[lang];
  const [discountAmount, setDiscountAmount] = useState(String(assignment.discountAmount));
  const [waiverAmount, setWaiverAmount] = useState(String(assignment.waiverAmount));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/fees/assignments/${assignment.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discountAmount: Number(discountAmount || 0),
          waiverAmount: Number(waiverAmount || 0),
          reason: reason || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to update');
        return;
      }
      showToast('Fee assignment updated');
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-md rounded-2xl bg-white p-6 flex flex-col gap-3.5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#063b78]">{assignment.name}</h2>
          <button className="ibtn" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        {error && <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[13px] px-3 py-2">{error}</div>}
        <div className="text-[13px] text-[#64748b]">{dict.fees.originalAmount}: <strong className="text-[#092f63]">{formatBDT(assignment.originalAmount, lang)}</strong></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="fld">
            <label>{dict.fees.applyDiscount}</label>
            <input type="number" min="0" step="0.01" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} />
          </div>
          <div className="fld">
            <label>{dict.fees.applyWaiver}</label>
            <input type="number" min="0" step="0.01" value={waiverAmount} onChange={(e) => setWaiverAmount(e.target.value)} />
          </div>
        </div>
        <div className="fld">
          <label>{dict.fees.reason}</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="tb" onClick={onClose}>{dict.actions.cancel}</button>
          <button className="primary" disabled={saving} onClick={submit}>{saving ? '…' : dict.actions.save}</button>
        </div>
      </div>
    </div>
  );
}
