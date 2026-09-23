'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatBDT } from '@/lib/i18n';

interface StudentOption {
  id: string;
  name: string;
  banglaName?: string | null;
  studentIdCode: string;
  studentBatches: Array<{ batch: { id: string; name: string } }>;
  enrollments: Array<{ academicClass: { name: string }; academicProgram: { name: string } }>;
}

interface PendingAssignment {
  id: string;
  name: string;
  finalAmount: string | number;
  status: string;
}

interface InvoiceItemRow {
  studentFeeAssignmentId?: string;
  description: string;
  quantity: number;
  unitAmount: number;
  discountAmount: number;
}

export default function NewInvoicePage() {
  const router = useRouter();
  const { lang, showToast } = useApp();
  const dict = DICTIONARY[lang];

  const [studentQuery, setStudentQuery] = useState('');
  const [studentResults, setStudentResults] = useState<StudentOption[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);
  const [pendingAssignments, setPendingAssignments] = useState<PendingAssignment[]>([]);
  const [items, setItems] = useState<InvoiceItemRow[]>([]);
  const [discountAmount, setDiscountAmount] = useState('0');
  const [waiverAmount, setWaiverAmount] = useState('0');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [issueNow, setIssueNow] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!studentQuery.trim() || selectedStudent) {
      setStudentResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/students?search=${encodeURIComponent(studentQuery)}&pageSize=8`);
      if (res.ok) {
        const data = await res.json();
        setStudentResults(data.students || []);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [studentQuery, selectedStudent]);

  const selectStudent = useCallback(async (s: StudentOption) => {
    setSelectedStudent(s);
    setStudentResults([]);
    setStudentQuery('');
    const res = await fetch(`/api/fees/students/${s.id}`);
    if (res.ok) {
      const data = await res.json();
      const pending = (data.assignments || []).filter((a: any) => a.status === 'PENDING');
      setPendingAssignments(pending);
    }
  }, []);

  function toggleAssignment(a: PendingAssignment) {
    setItems((prev) => {
      const exists = prev.find((i) => i.studentFeeAssignmentId === a.id);
      if (exists) return prev.filter((i) => i.studentFeeAssignmentId !== a.id);
      return [...prev, { studentFeeAssignmentId: a.id, description: a.name, quantity: 1, unitAmount: Number(a.finalAmount), discountAmount: 0 }];
    });
  }

  function addCustomItem() {
    setItems((prev) => [...prev, { description: '', quantity: 1, unitAmount: 0, discountAmount: 0 }]);
  }

  function updateItem(idx: number, patch: Partial<InvoiceItemRow>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  const subtotal = useMemo(() => items.reduce((s, i) => s + i.unitAmount * i.quantity, 0), [items]);
  const itemDiscounts = useMemo(() => items.reduce((s, i) => s + i.discountAmount, 0), [items]);
  const total = Math.max(0, subtotal - itemDiscounts - Number(discountAmount || 0) - Number(waiverAmount || 0));

  async function submit() {
    if (!selectedStudent || items.length === 0) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/fees/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selectedStudent.id,
          items,
          discountAmount: Number(discountAmount || 0),
          waiverAmount: Number(waiverAmount || 0),
          dueDate: dueDate || undefined,
          notes: notes || undefined,
          issueNow,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create invoice');
        return;
      }
      showToast(dict.fees.invoiceCreated);
      router.push(`/fees/invoices/${data.invoice.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-[900px] mx-auto flex flex-col gap-6">
      <Link href="/fees/invoices" className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#063b78] hover:underline w-fit">
        <Icon name="chevleft" size={16} />
        <span>{dict.fees.back}</span>
      </Link>

      <h1 className="text-2xl md:text-3xl font-extrabold text-[#063b78] tracking-tight">{dict.fees.createInvoice}</h1>

      <div className="card p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-4">
        <div className="fld">
          <label>{dict.fees.selectStudent}</label>
          {selectedStudent ? (
            <div className="flex items-center justify-between rounded-xl border border-[#dce5f0] bg-[#f8fafc] px-3.5 py-2.5">
              <div>
                <div className="font-bold text-[#092f63]">{selectedStudent.name}</div>
                <div className="text-[11.5px] text-[#8795ab] font-mono">{selectedStudent.studentIdCode}</div>
              </div>
              <button className="tb" onClick={() => { setSelectedStudent(null); setItems([]); setPendingAssignments([]); }}>{dict.actions.cancel}</button>
            </div>
          ) : (
            <div className="relative">
              <input value={studentQuery} onChange={(e) => setStudentQuery(e.target.value)} placeholder={dict.students.searchPlaceholder} />
              {studentResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-xl border border-[#dce5f0] bg-white shadow-lg max-h-64 overflow-y-auto">
                  {studentResults.map((s) => (
                    <button key={s.id} type="button" onClick={() => selectStudent(s)} className="flex w-full items-center justify-between px-3.5 py-2.5 text-left hover:bg-[#f8fafc]">
                      <div>
                        <div className="font-semibold text-[#092f63] text-[13.5px]">{s.name}</div>
                        <div className="text-[11px] text-[#8795ab] font-mono">{s.studentIdCode}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {selectedStudent && (
          <div className="flex items-center gap-3 text-[13px] text-[#64748b]">
            {selectedStudent.enrollments?.[0] && (
              <span>{selectedStudent.enrollments[0].academicProgram.name} · {selectedStudent.enrollments[0].academicClass.name}</span>
            )}
            {selectedStudent.studentBatches?.[0] && (
              <span className="font-semibold text-[#063b78]">{selectedStudent.studentBatches[0].batch.name}</span>
            )}
          </div>
        )}
      </div>

      {selectedStudent && (
        <>
          {pendingAssignments.length > 0 && (
            <div className="card p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-3">
              <div className="font-bold text-[#063b78]">{dict.fees.pendingFees}</div>
              <div className="flex flex-col gap-2">
                {pendingAssignments.map((a) => {
                  const checked = items.some((i) => i.studentFeeAssignmentId === a.id);
                  return (
                    <label key={a.id} className="flex items-center justify-between rounded-xl border border-[#dce5f0] px-3.5 py-2.5 cursor-pointer hover:bg-[#f8fafc]">
                      <div className="flex items-center gap-2.5">
                        <input type="checkbox" checked={checked} onChange={() => toggleAssignment(a)} />
                        <span className="font-semibold text-[#092f63] text-[13.5px]">{a.name}</span>
                      </div>
                      <span className="font-mono font-bold text-[#092f63]">{formatBDT(a.finalAmount, lang)}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="card p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="font-bold text-[#063b78]">{dict.fees.items}</div>
              <button className="tb" onClick={addCustomItem} type="button"><Icon name="plus" size={14} />{dict.fees.addCustomItem}</button>
            </div>
            {items.length === 0 ? (
              <p className="text-[13px] text-[#64748b] italic">{dict.fees.noPendingFees}</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      className="col-span-5 rounded-lg border border-[#dce5f0] px-2.5 py-2 text-[13px]"
                      placeholder={dict.fees.itemDescription}
                      value={item.description}
                      disabled={!!item.studentFeeAssignmentId}
                      onChange={(e) => updateItem(idx, { description: e.target.value })}
                    />
                    <input
                      type="number"
                      min={1}
                      className="col-span-1 rounded-lg border border-[#dce5f0] px-2 py-2 text-[13px]"
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) || 1 })}
                    />
                    <input
                      type="number"
                      min={0}
                      className="col-span-2 rounded-lg border border-[#dce5f0] px-2.5 py-2 text-[13px]"
                      placeholder={dict.fees.unitAmount}
                      value={item.unitAmount}
                      disabled={!!item.studentFeeAssignmentId}
                      onChange={(e) => updateItem(idx, { unitAmount: Number(e.target.value) || 0 })}
                    />
                    <input
                      type="number"
                      min={0}
                      className="col-span-2 rounded-lg border border-[#dce5f0] px-2.5 py-2 text-[13px]"
                      placeholder={dict.fees.itemDiscount}
                      value={item.discountAmount}
                      onChange={(e) => updateItem(idx, { discountAmount: Number(e.target.value) || 0 })}
                    />
                    <span className="col-span-1 font-mono text-[12.5px] text-right">{formatBDT(Math.max(0, item.unitAmount * item.quantity - item.discountAmount), lang)}</span>
                    <button className="col-span-1 ibtn" onClick={() => removeItem(idx)} type="button"><Icon name="x" size={15} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-4">
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="fld">
                <label>{dict.fees.discount}</label>
                <input type="number" min="0" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} />
              </div>
              <div className="fld">
                <label>{dict.fees.waiver}</label>
                <input type="number" min="0" value={waiverAmount} onChange={(e) => setWaiverAmount(e.target.value)} />
              </div>
              <div className="fld">
                <label>{dict.fees.dueDate}</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>
            <div className="fld">
              <label>{dict.fees.notes}</label>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-[13.5px] font-semibold text-[#092f63]">
              <input type="checkbox" checked={issueNow} onChange={(e) => setIssueNow(e.target.checked)} />
              {dict.fees.issueNow}
            </label>

            <div className="border-t border-[#edf1f7] pt-4 flex flex-col gap-1.5 items-end text-[13.5px]">
              <div className="flex justify-between w-56"><span className="text-[#64748b]">{dict.fees.subtotal}</span><span className="font-mono">{formatBDT(subtotal, lang)}</span></div>
              <div className="flex justify-between w-56"><span className="text-[#64748b]">{dict.fees.discount}</span><span className="font-mono">{formatBDT(itemDiscounts + Number(discountAmount || 0), lang)}</span></div>
              <div className="flex justify-between w-56"><span className="text-[#64748b]">{dict.fees.waiver}</span><span className="font-mono">{formatBDT(Number(waiverAmount || 0), lang)}</span></div>
              <div className="flex justify-between w-56 text-lg font-extrabold text-[#092f63]"><span>{dict.fees.total}</span><span className="font-mono">{formatBDT(total, lang)}</span></div>
            </div>

            {error && <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[13px] px-3 py-2">{error}</div>}

            <div className="flex justify-end gap-2">
              <Link href="/fees/invoices" className="tb">{dict.actions.cancel}</Link>
              <button className="primary" disabled={saving || items.length === 0} onClick={submit}>
                {saving ? '…' : dict.fees.generateInvoice}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
