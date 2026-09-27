'use client';

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatBDT } from '@/lib/i18n';

interface StudentOption {
  id: string;
  name: string;
  banglaName?: string | null;
  studentIdCode: string;
  studentBatches?: Array<{ batch: { id: string; name: string } }>;
  enrollments?: Array<{ academicClass: { name: string }; academicProgram: { name: string } }>;
}

interface PendingAssignment {
  id: string;
  name: string;
  finalAmount: string | number;
  status: string;
}

interface FeeStructureOption {
  id: string;
  name: string;
  banglaName?: string | null;
  feeType: string;
  amount: string | number;
  frequency: string;
  branchId?: string | null;
}

interface InvoiceItemRow {
  studentFeeAssignmentId?: string;
  description: string;
  quantity: number;
  unitAmount: number;
  discountAmount: number;
}

export default function NewInvoicePage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-[900px] mx-auto py-16 text-center text-[#64748b]">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
        </div>
      }
    >
      <NewInvoiceForm />
    </Suspense>
  );
}

function NewInvoiceForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramStudentId = searchParams.get('studentId');
  const paramStructureId = searchParams.get('structureId');

  const { lang, showToast } = useApp();
  const dict = DICTIONARY[lang];

  const [studentQuery, setStudentQuery] = useState('');
  const [studentResults, setStudentResults] = useState<StudentOption[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);
  const [pendingAssignments, setPendingAssignments] = useState<PendingAssignment[]>([]);
  const [activeStructures, setActiveStructures] = useState<FeeStructureOption[]>([]);
  const [appliedParamStructure, setAppliedParamStructure] = useState(false);

  const [items, setItems] = useState<InvoiceItemRow[]>([]);
  const [discountAmount, setDiscountAmount] = useState('0');
  const [waiverAmount, setWaiverAmount] = useState('0');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [issueNow, setIssueNow] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Fetch active fee structures for 1-click addition
  useEffect(() => {
    fetch('/api/fees/options')
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.activeStructures) {
          setActiveStructures(data.activeStructures);
        }
      })
      .catch(() => {});
  }, []);

  // Search students
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

  // Pre-load student if studentId param is provided
  useEffect(() => {
    if (!paramStudentId || selectedStudent) return;
    fetch(`/api/fees/students/${paramStudentId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.student) {
          setSelectedStudent(data.student);
          const pending = (data.assignments || []).filter((a: any) => a.status === 'PENDING');
          setPendingAssignments(pending);
        }
      })
      .catch(() => {});
  }, [paramStudentId, selectedStudent]);

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

  function addStructureItem(structure: FeeStructureOption) {
    const itemName = lang === 'bn' && structure.banglaName ? structure.banglaName : structure.name;
    setItems((prev) => [
      ...prev,
      {
        description: itemName,
        quantity: 1,
        unitAmount: Number(structure.amount) || 0,
        discountAmount: 0,
      },
    ]);
  }

  // Pre-add structure if structureId param is provided
  useEffect(() => {
    if (!paramStructureId || appliedParamStructure || activeStructures.length === 0) return;
    const found = activeStructures.find((s) => s.id === paramStructureId);
    if (found) {
      addStructureItem(found);
      setAppliedParamStructure(true);
    }
  }, [paramStructureId, appliedParamStructure, activeStructures]);

  function toggleAssignment(a: PendingAssignment) {
    setItems((prev) => {
      const exists = prev.find((i) => i.studentFeeAssignmentId === a.id);
      if (exists) return prev.filter((i) => i.studentFeeAssignmentId !== a.id);
      return [
        ...prev,
        {
          studentFeeAssignmentId: a.id,
          description: a.name,
          quantity: 1,
          unitAmount: Number(a.finalAmount),
          discountAmount: 0,
        },
      ];
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
    <div className="max-w-[920px] mx-auto flex flex-col gap-6">
      <Link href="/fees/invoices" className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#063b78] hover:underline w-fit">
        <Icon name="chevleft" size={16} />
        <span>{dict.fees.back}</span>
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#063b78] tracking-tight">{dict.fees.createInvoice}</h1>
          <p className="text-[13.5px] text-[#64748b] mt-0.5">
            {lang === 'bn'
              ? 'শিক্ষার্থী নির্বাচন করে নির্ধারিত ফি কাঠামো বা কাস্টম ফি দিয়ে চালান প্রস্তুত করুন'
              : 'Select student and add items from fee structures or custom rows to generate invoice'}
          </p>
        </div>
      </div>

      {/* Student Selector Card */}
      <div className="card p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-4">
        <div className="fld">
          <label className="text-sm font-bold text-[#092f63]">{dict.fees.selectStudent}</label>
          {selectedStudent ? (
            <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50/50 p-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full bg-[#063b78] text-white flex items-center justify-center font-bold text-base">
                  {selectedStudent.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-extrabold text-[#092f63] text-[15px]">
                    {selectedStudent.name}
                    {selectedStudent.banglaName && <span className="ml-2 text-[13px] font-normal text-[#64748b]">({selectedStudent.banglaName})</span>}
                  </div>
                  <div className="text-[12px] text-[#063b78] font-mono font-medium">{selectedStudent.studentIdCode}</div>
                </div>
              </div>
              <button
                type="button"
                className="tb text-rose-600 hover:bg-rose-50 border border-rose-200 text-xs px-3 py-1.5 rounded-lg"
                onClick={() => {
                  setSelectedStudent(null);
                  setItems([]);
                  setPendingAssignments([]);
                }}
              >
                {lang === 'bn' ? 'শিক্ষার্থী পরিবর্তন' : 'Change Student'}
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                value={studentQuery}
                onChange={(e) => setStudentQuery(e.target.value)}
                placeholder={dict.students.searchPlaceholder}
                className="w-full rounded-xl border border-[#dce5f0] bg-white px-4 py-2.5 text-[14px] text-[#092f63] focus:border-[#063b78] outline-none"
              />
              {studentResults.length > 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-xl border border-[#dce5f0] bg-white shadow-xl max-h-64 overflow-y-auto">
                  {studentResults.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => selectStudent(s)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-blue-50/60 border-b border-[#f1f5f9] last:border-b-0 transition-colors"
                    >
                      <div>
                        <div className="font-bold text-[#092f63] text-[14px]">{s.name}</div>
                        <div className="text-[11.5px] text-[#64748b] font-mono">{s.studentIdCode}</div>
                      </div>
                      {s.enrollments?.[0] && (
                        <span className="text-[11.5px] font-medium text-[#063b78] bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                          {s.enrollments[0].academicClass?.name}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {selectedStudent && (
          <div className="flex items-center gap-3 text-[13px] text-[#64748b] bg-[#f8fafc] px-3.5 py-2 rounded-lg border border-[#e2e8f0]">
            {selectedStudent.enrollments?.[0] && (
              <span>
                {selectedStudent.enrollments[0].academicProgram?.name} · {selectedStudent.enrollments[0].academicClass?.name}
              </span>
            )}
            {selectedStudent.studentBatches?.[0] && (
              <span className="font-semibold text-[#063b78] before:content-['•'] before:mr-2">
                {selectedStudent.studentBatches[0].batch.name}
              </span>
            )}
          </div>
        )}
      </div>

      {selectedStudent && (
        <>
          {/* Pending Fee Assignments (if any) */}
          {pendingAssignments.length > 0 && (
            <div className="card p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-3">
              <div className="font-bold text-[#063b78] flex items-center justify-between">
                <span>{dict.fees.pendingFees}</span>
                <span className="text-xs font-normal text-[#64748b]">
                  {lang === 'bn' ? 'চালানে অন্তর্ভুক্ত করতে টিক দিন' : 'Check to include in invoice'}
                </span>
              </div>
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

          {/* Invoice Items Card with Fee Structures Quick-Picker */}
          <div className="card p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="font-bold text-[#063b78] text-base">{dict.fees.items}</div>
                <div className="text-[12px] text-[#64748b]">
                  {lang === 'bn'
                    ? 'ফি কাঠামো থেকে ১-ক্লিকে যোগ করুন অথবা কাস্টম আইটেম লিখুন'
                    : 'Add directly from fee structures or add custom line items'}
                </div>
              </div>
              <button className="tb flex items-center gap-1.5" onClick={addCustomItem} type="button">
                <Icon name="plus" size={14} />
                <span>{dict.fees.addCustomItem}</span>
              </button>
            </div>

            {/* Quick-Pick Active Fee Structures */}
            {activeStructures.length > 0 && (
              <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50/60 to-indigo-50/40 border border-blue-200/80 flex flex-col gap-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#063b78]">
                    <Icon name="wallet" size={15} className="text-blue-600" />
                    <span>{dict.fees.availableStructures} — {dict.fees.clickToAddToInvoice}</span>
                  </div>
                  <span className="text-[11px] text-[#64748b] font-medium">
                    {activeStructures.length} {lang === 'bn' ? 'টি ফি কাঠামো সক্রিয়' : 'structures available'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 pt-0.5">
                  {activeStructures.map((s) => {
                    const sName = lang === 'bn' && s.banglaName ? s.banglaName : s.name;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => addStructureItem(s)}
                        className="group inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-blue-300 bg-white hover:bg-blue-600 hover:text-white text-[#092f63] text-[13px] font-bold transition-all shadow-2xs active:scale-95 cursor-pointer"
                        title={lang === 'bn' ? `${sName} যোগ করুন` : `Add ${sName}`}
                      >
                        <Icon name="plus" size={14} className="text-blue-600 group-hover:text-white transition-colors" />
                        <span>{sName}</span>
                        <span className="font-mono text-[#063b78] group-hover:text-blue-600 bg-blue-100 group-hover:bg-white px-2 py-0.5 rounded-md text-[11.5px] font-extrabold transition-colors">
                          {formatBDT(s.amount, lang)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Items Table / Empty State */}
            {items.length === 0 ? (
              <div className="py-8 px-4 rounded-xl border border-dashed border-[#cbd5e1] text-center bg-[#fbfcfe] flex flex-col items-center">
                <div className="h-12 w-12 rounded-full bg-blue-50 text-[#063b78] flex items-center justify-center mb-2.5">
                  <Icon name="receipt" size={24} />
                </div>
                <p className="text-[14px] font-bold text-[#092f63]">
                  {lang === 'bn' ? 'চালানে এখনো কোনো আইটেম যোগ করা হয়নি' : 'No items added to invoice yet'}
                </p>
                <p className="text-[12.5px] text-[#64748b] max-w-md mt-1">
                  {lang === 'bn'
                    ? 'উপরের "উপলব্ধ ফি কাঠামো" বাটনে ক্লিক করে সরাসরি ফি যোগ করুন, অথবা ডানপাশের "+ কাস্টম আইটেম যোগ করুন" বাটনে ক্লিক করুন।'
                    : 'Click any fee structure above to add it with one click, or click "+ Add Custom Item" to write details manually.'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5 pt-1">
                <div className="grid grid-cols-12 gap-2 text-[11px] font-bold text-[#64748b] uppercase px-1">
                  <span className="col-span-5">{dict.fees.itemDescription}</span>
                  <span className="col-span-1">{dict.fees.quantity}</span>
                  <span className="col-span-2">{dict.fees.unitAmount}</span>
                  <span className="col-span-2">{dict.fees.itemDiscount}</span>
                  <span className="col-span-1 text-right">{dict.fees.lineTotal}</span>
                  <span className="col-span-1"></span>
                </div>
                {items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-[#f8fafc] p-2.5 rounded-xl border border-[#e2e8f0]">
                    <input
                      className="col-span-5 rounded-lg border border-[#dce5f0] bg-white px-3 py-2 text-[13px] font-semibold text-[#092f63] focus:border-[#063b78] outline-none"
                      placeholder={dict.fees.itemDescription}
                      value={item.description}
                      disabled={!!item.studentFeeAssignmentId}
                      onChange={(e) => updateItem(idx, { description: e.target.value })}
                    />
                    <input
                      type="number"
                      min={1}
                      className="col-span-1 rounded-lg border border-[#dce5f0] bg-white px-2 py-2 text-[13px] font-semibold text-[#092f63] text-center focus:border-[#063b78] outline-none"
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) || 1 })}
                    />
                    <input
                      type="number"
                      min={0}
                      className="col-span-2 rounded-lg border border-[#dce5f0] bg-white px-3 py-2 text-[13px] font-mono font-bold text-[#092f63] focus:border-[#063b78] outline-none"
                      placeholder={dict.fees.unitAmount}
                      value={item.unitAmount}
                      disabled={!!item.studentFeeAssignmentId}
                      onChange={(e) => updateItem(idx, { unitAmount: Number(e.target.value) || 0 })}
                    />
                    <input
                      type="number"
                      min={0}
                      className="col-span-2 rounded-lg border border-[#dce5f0] bg-white px-3 py-2 text-[13px] font-mono font-semibold text-[#092f63] focus:border-[#063b78] outline-none"
                      placeholder={dict.fees.itemDiscount}
                      value={item.discountAmount}
                      onChange={(e) => updateItem(idx, { discountAmount: Number(e.target.value) || 0 })}
                    />
                    <span className="col-span-1 font-mono font-extrabold text-[13px] text-[#063b78] text-right">
                      {formatBDT(Math.max(0, item.unitAmount * item.quantity - item.discountAmount), lang)}
                    </span>
                    <button
                      className="col-span-1 h-9 w-9 mx-auto rounded-lg text-rose-500 hover:bg-rose-50 flex items-center justify-center transition-colors"
                      onClick={() => removeItem(idx)}
                      type="button"
                      title={dict.fees.removeItem}
                    >
                      <Icon name="x" size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Invoice Summary and Submission */}
          <div className="card p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-4">
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="fld">
                <label className="text-xs font-bold text-[#092f63]">{dict.fees.discount}</label>
                <input
                  type="number"
                  min="0"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                  className="rounded-xl border border-[#dce5f0] px-3.5 py-2 text-sm font-mono"
                />
              </div>
              <div className="fld">
                <label className="text-xs font-bold text-[#092f63]">{dict.fees.waiver}</label>
                <input
                  type="number"
                  min="0"
                  value={waiverAmount}
                  onChange={(e) => setWaiverAmount(e.target.value)}
                  className="rounded-xl border border-[#dce5f0] px-3.5 py-2 text-sm font-mono"
                />
              </div>
              <div className="fld">
                <label className="text-xs font-bold text-[#092f63]">{dict.fees.dueDate}</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="rounded-xl border border-[#dce5f0] px-3.5 py-2 text-sm"
                />
              </div>
            </div>
            <div className="fld">
              <label className="text-xs font-bold text-[#092f63]">{dict.fees.notes}</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={lang === 'bn' ? 'চালানের বিশেষ কোনো নির্দেশনা বা মন্তব্য থাকলে লিখুন…' : 'Add any notes for this invoice…'}
                className="rounded-xl border border-[#dce5f0] px-3.5 py-2 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-[13.5px] font-semibold text-[#092f63] cursor-pointer">
              <input type="checkbox" checked={issueNow} onChange={(e) => setIssueNow(e.target.checked)} className="rounded" />
              <span>{dict.fees.issueNow}</span>
            </label>

            <div className="border-t border-[#edf1f7] pt-4 flex flex-col gap-1.5 items-end text-[13.5px]">
              <div className="flex justify-between w-64">
                <span className="text-[#64748b]">{dict.fees.subtotal}</span>
                <span className="font-mono font-semibold">{formatBDT(subtotal, lang)}</span>
              </div>
              <div className="flex justify-between w-64">
                <span className="text-[#64748b]">{dict.fees.discount}</span>
                <span className="font-mono font-semibold text-amber-600">-{formatBDT(itemDiscounts + Number(discountAmount || 0), lang)}</span>
              </div>
              <div className="flex justify-between w-64">
                <span className="text-[#64748b]">{dict.fees.waiver}</span>
                <span className="font-mono font-semibold text-emerald-600">-{formatBDT(Number(waiverAmount || 0), lang)}</span>
              </div>
              <div className="flex justify-between w-64 text-lg font-extrabold text-[#092f63] border-t border-[#e2e8f0] pt-2 mt-1">
                <span>{dict.fees.total}</span>
                <span className="font-mono text-[#063b78]">{formatBDT(total, lang)}</span>
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[13px] px-4 py-2.5 flex items-center gap-2">
                <Icon name="x" size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-end gap-2.5 pt-2">
              <Link href="/fees/invoices" className="tb px-4 py-2 text-sm rounded-xl">
                {dict.actions.cancel}
              </Link>
              <button
                className="inline-flex items-center gap-2 rounded-xl bg-[#063b78] hover:bg-[#052e5e] text-white font-bold px-6 py-2.5 text-sm transition-colors shadow-sm disabled:opacity-50"
                disabled={saving || items.length === 0}
                onClick={submit}
              >
                {saving ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />
                    <span>{lang === 'bn' ? 'সংরক্ষণ হচ্ছে…' : 'Generating…'}</span>
                  </>
                ) : (
                  <>
                    <Icon name="receipt" size={16} />
                    <span>{dict.fees.generateInvoice}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
