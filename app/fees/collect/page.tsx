'use client';

import { useState } from 'react';
import Link from 'next/link';
import FeesSubNav from '@/components/FeesSubNav';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';

interface StudentResult {
  id: string;
  name: string;
  banglaName?: string | null;
  studentIdCode: string;
  phone?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  courseName?: string | null;
  courseBanglaName?: string | null;
  batchName?: string | null;
  batchCode?: string | null;
  branchName?: string | null;
  totalDue: number;
  payableInvoiceCount: number;
}

interface InvoiceItem {
  id: string;
  description: string;
  amount: number | string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  subtotalAmount: number | string;
  discountAmount: number | string;
  waiverAmount: number | string;
  totalAmount: number | string;
  paidAmount: number | string;
  dueAmount: number | string;
  status: string;
  notes?: string | null;
  items?: InvoiceItem[];
}

const PAYMENT_METHODS = [
  { id: 'CASH', labelEn: 'Cash', labelBn: 'নগদ', icon: 'banknote' },
  { id: 'BKASH', labelEn: 'bKash', labelBn: 'বিকাশ', icon: 'wallet' },
  { id: 'NAGAD', labelEn: 'Nagad', labelBn: 'নগদ (ডিজিটাল)', icon: 'wallet' },
  { id: 'BANK', labelEn: 'Bank', labelBn: 'ব্যাংক ট্রান্সফার', icon: 'building' },
  { id: 'CARD', labelEn: 'Card', labelBn: 'কার্ড', icon: 'credit-card' },
  { id: 'OTHER', labelEn: 'Other', labelBn: 'অন্যান্য', icon: 'tag' },
] as const;

function mintIdempotencyKey(): string {
  return `PAY-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export default function CollectPaymentPage() {
  const { lang } = useApp();

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<StudentResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Selection state
  const [selectedStudent, setSelectedStudent] = useState<StudentResult | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  // Payment form state
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BKASH' | 'NAGAD' | 'BANK' | 'CARD' | 'OTHER'>('CASH');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [senderMobile, setSenderMobile] = useState('');
  const [bankName, setBankName] = useState('');
  const [chequeNumber, setChequeNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState<{
    receiptNumber: string;
    amount: number;
    invoiceNumber: string;
    studentName: string;
    paymentMethod: string;
    paymentId: string;
  } | null>(null);

  // Handle student search
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;

    setSearching(true);
    setHasSearched(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/fees/collect/students?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setSearchResults(data.students || []);
      } else {
        setSearchResults([]);
        setErrorMessage(data.error || 'Failed to search students');
      }
    } catch (err: any) {
      setSearchResults([]);
      setErrorMessage(err?.message || 'Error occurred while searching');
    } finally {
      setSearching(false);
    }
  };

  // When a student is selected
  const handleSelectStudent = async (student: StudentResult) => {
    setSelectedStudent(student);
    setSelectedInvoice(null);
    setPaymentSuccess(null);
    setErrorMessage(null);
    setLoadingInvoices(true);

    try {
      const res = await fetch(`/api/fees/invoices?student=${student.id}&pageSize=50`);
      const data = await res.json();
      if (res.ok && data.success) {
        // Filter only payable invoices: ISSUED, PARTIAL, OVERDUE with dueAmount > 0
        const payable = (data.invoices || []).filter(
          (inv: Invoice) =>
            ['ISSUED', 'PARTIAL', 'OVERDUE'].includes(inv.status) && Number(inv.dueAmount) > 0
        );
        setInvoices(payable);
        if (payable.length === 1) {
          handleSelectInvoice(payable[0]);
        }
      } else {
        setInvoices([]);
      }
    } catch (err: any) {
      console.error('Failed to load invoices', err);
      setInvoices([]);
    } finally {
      setLoadingInvoices(false);
    }
  };

  // When an invoice is selected
  const handleSelectInvoice = (inv: Invoice) => {
    setSelectedInvoice(inv);
    setPaymentAmount(String(Number(inv.dueAmount)));
    setIdempotencyKey(mintIdempotencyKey());
    setErrorMessage(null);
  };

  // Clear student selection
  const handleResetStudent = () => {
    setSelectedStudent(null);
    setSelectedInvoice(null);
    setInvoices([]);
    setPaymentSuccess(null);
    setErrorMessage(null);
  };

  // Reset entire flow for another collection
  const handleCollectAnother = () => {
    setSelectedStudent(null);
    setSelectedInvoice(null);
    setInvoices([]);
    setPaymentSuccess(null);
    setErrorMessage(null);
    setSearchQuery('');
    setSearchResults([]);
    setHasSearched(false);
  };

  // Submit payment
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice || !selectedStudent) return;

    const amountNum = Number(paymentAmount);
    const dueNum = Number(selectedInvoice.dueAmount);

    if (isNaN(amountNum) || amountNum <= 0) {
      setErrorMessage(lang === 'bn' ? 'সঠিক পেমেন্টের পরিমাণ লিখুন (০ এর বেশি হতে হবে)' : 'Enter a valid payment amount greater than 0');
      return;
    }

    if (amountNum > dueNum) {
      setErrorMessage(
        lang === 'bn'
          ? `পেমেন্টের পরিমাণ বকেয়া (৳${dueNum.toLocaleString()}) এর চেয়ে বেশি হতে পারে না`
          : `Payment amount cannot exceed the due amount (৳${dueNum.toLocaleString()})`
      );
      return;
    }

    if ((paymentMethod === 'BKASH' || paymentMethod === 'NAGAD') && !referenceNumber.trim()) {
      setErrorMessage(lang === 'bn' ? 'অনুগ্রহ করে ট্রানজেকশন আইডি (TrxID) লিখুন' : 'Please provide Transaction ID');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const payload = {
        amount: amountNum,
        paymentMethod,
        transactionId: referenceNumber.trim() || undefined,
        referenceNumber: referenceNumber.trim() || undefined,
        senderMobile: senderMobile.trim() || undefined,
        bankName: bankName.trim() || undefined,
        chequeNumber: chequeNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        idempotencyKey: idempotencyKey || mintIdempotencyKey(),
      };

      const res = await fetch(`/api/fees/invoices/${selectedInvoice.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Payment collection failed');
      }

      const receiptNo = data.payment?.receiptNumber || data.receiptNumber || 'REC-ISSUED';
      setPaymentSuccess({
        receiptNumber: receiptNo,
        amount: amountNum,
        invoiceNumber: selectedInvoice.invoiceNumber,
        studentName: selectedStudent.name,
        paymentMethod,
        paymentId: data.payment?.id || '',
      });
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to collect payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-[1000px] mx-auto flex flex-col gap-6">
      {/* Fees SubNav */}
      <FeesSubNav />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-[#dce5f0] shadow-2xs">
        <div>
          <h1 className="text-xl font-bold text-[#063b78] flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-[#edf2f9] text-[#063b78] flex items-center justify-center">
              <Icon name="wallet" size={18} />
            </span>
            <span>{lang === 'bn' ? 'পেমেন্ট সংগ্রহ' : 'Collect Payment'}</span>
          </h1>
          <p className="text-[13px] text-[#64748b] mt-1">
            {lang === 'bn'
              ? 'শিক্ষার্থী নির্বাচন করুন, বকেয়া ইনভয়েস পরীক্ষা করুন এবং তাৎক্ষণিক পেমেন্ট গ্রহণ করে রশিদ প্রদান করুন'
              : 'Search student, view outstanding invoices, and collect full or partial payment instantly'}
          </p>
        </div>
      </div>

      {/* SUCCESS SCREEN */}
      {paymentSuccess && (
        <div className="card p-8 rounded-2xl bg-white border border-emerald-200 shadow-xs text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
            <Icon name="check" size={32} />
          </div>
          <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider mb-2">
            {lang === 'bn' ? 'পেমেন্ট সফল হয়েছে' : 'Payment Successful'}
          </span>
          <h2 className="text-2xl font-bold text-[#092f63] mb-1">
            ৳{paymentSuccess.amount.toLocaleString()}
          </h2>
          <p className="text-[13.5px] text-[#64748b] mb-4">
            {paymentSuccess.studentName} — {paymentSuccess.invoiceNumber}
          </p>

          <div className="bg-[#f8fafc] border border-[#dce5f0] rounded-xl p-4 w-full max-w-sm mb-6 text-left text-[13px] space-y-2">
            <div className="flex justify-between">
              <span className="text-[#64748b]">{lang === 'bn' ? 'রশিদ নম্বর' : 'Receipt Number'}:</span>
              <span className="font-mono font-bold text-[#063b78]">{paymentSuccess.receiptNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748b]">{lang === 'bn' ? 'পেমেন্ট পদ্ধতি' : 'Payment Method'}:</span>
              <span className="font-semibold text-[#1e293b]">{paymentSuccess.paymentMethod}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748b]">{lang === 'bn' ? 'তারিখ' : 'Date'}:</span>
              <span className="text-[#1e293b]">{new Date().toLocaleDateString('en-GB')}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            {paymentSuccess.paymentId && (
              <Link
                href={`/fees/payments?receipt=${encodeURIComponent(paymentSuccess.receiptNumber)}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#063b78] text-white text-[13px] font-semibold hover:bg-[#092f63] transition-colors"
              >
                <Icon name="file" size={16} />
                <span>{lang === 'bn' ? 'রশিদ দেখুন' : 'View Receipt'}</span>
              </Link>
            )}
            <button
              type="button"
              onClick={handleCollectAnother}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[#dce5f0] bg-white text-[#092f63] text-[13px] font-semibold hover:bg-[#f8fafc] transition-colors"
            >
              <Icon name="refresh" size={16} />
              <span>{lang === 'bn' ? 'আরেকটি পেমেন্ট সংগ্রহ করুন' : 'Collect Another Payment'}</span>
            </button>
          </div>
        </div>
      )}

      {/* MAIN WORKFLOW: SEARCH & COLLECT */}
      {!paymentSuccess && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT: STUDENT & INVOICE SELECTION */}
          <div className="lg:col-span-6 flex flex-col gap-6">
            {/* STEP 1: STUDENT SEARCH */}
            {!selectedStudent ? (
              <div className="card p-5 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-6 h-6 rounded-full bg-[#063b78] text-white text-xs font-bold flex items-center justify-center">1</span>
                  <h2 className="text-base font-bold text-[#063b78]">
                    {lang === 'bn' ? 'শিক্ষার্থী খুঁজুন' : 'Search Student'}
                  </h2>
                </div>
                <form onSubmit={handleSearch} className="flex gap-2 mb-4">
                  <div className="relative grow">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={lang === 'bn' ? 'শিক্ষার্থীর নাম, আইডি বা ফোন নম্বর লিখুন…' : 'Enter student name, ID or phone…'}
                      className="w-full h-10 pl-9 pr-3 rounded-xl border border-[#dce5f0] bg-white text-[13px] focus:outline-none focus:border-[#063b78]"
                    />
                    <span className="absolute left-3 top-2.5 text-[#94a3b8]">
                      <Icon name="search" size={16} />
                    </span>
                  </div>
                  <button
                    type="submit"
                    disabled={searching || !searchQuery.trim()}
                    className="h-10 px-4 rounded-xl bg-[#063b78] text-white text-[13px] font-semibold hover:bg-[#092f63] disabled:opacity-40 transition-colors"
                  >
                    {searching ? '…' : lang === 'bn' ? 'খুঁজুন' : 'Search'}
                  </button>
                </form>

                {/* SEARCH RESULTS */}
                {searching && (
                  <div className="text-center py-6 text-[#64748b]">
                    <div className="inline-block animate-spin w-5 h-5 border-2 border-[#063b78] border-t-transparent rounded-full mb-1" />
                    <p className="text-[12.5px]">{lang === 'bn' ? 'অনুসন্ধান চলছে…' : 'Searching…'}</p>
                  </div>
                )}

                {!searching && hasSearched && searchResults.length === 0 && (
                  <div className="text-center py-6 text-[#64748b] bg-[#f8fafc] rounded-xl border border-[#edf2f7]">
                    <p className="text-[13px] font-medium">{lang === 'bn' ? 'কোনো শিক্ষার্থী পাওয়া যায়নি' : 'No students found matching your search'}</p>
                    <p className="text-[11.5px] text-[#94a3b8] mt-0.5">{lang === 'bn' ? 'বানান অথবা ফোন নম্বর সঠিকভাবে যাচাই করুন' : 'Verify spelling or student ID'}</p>
                  </div>
                )}

                {!searching && searchResults.length > 0 && (
                  <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                    {searchResults.map((stu) => (
                      <div
                        key={stu.id}
                        className="p-3.5 rounded-xl border border-[#dce5f0] bg-white hover:border-[#063b78] transition-all flex items-center justify-between gap-3 shadow-2xs"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-[#092f63] text-[13.5px] truncate">
                            {stu.name}
                            {stu.banglaName && <span className="ml-1.5 text-[12px] font-normal text-[#64748b] font-bangla">({stu.banglaName})</span>}
                          </div>
                          <div className="text-[12px] text-[#64748b] flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                            <span className="font-mono text-[#063b78] font-semibold">{stu.studentIdCode}</span>
                            {stu.courseName && <span>• {stu.courseName}</span>}
                            {stu.batchName && <span>• {stu.batchName}</span>}
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-[11.5px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                              {lang === 'bn' ? 'বকেয়া' : 'Due'}: ৳{stu.totalDue.toLocaleString()}
                            </span>
                            {stu.payableInvoiceCount > 0 && (
                              <span className="text-[11px] text-[#64748b]">
                                ({stu.payableInvoiceCount} {lang === 'bn' ? 'টি ইনভয়েস' : 'invoice(s)'})
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSelectStudent(stu)}
                          className="px-3.5 py-1.5 rounded-lg bg-[#063b78] text-white text-[12px] font-semibold hover:bg-[#092f63] shrink-0 transition-colors"
                        >
                          {lang === 'bn' ? 'নির্বাচন' : 'Select'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* SELECTED STUDENT CARD */
              <div className="card p-5 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
                <div className="flex items-center justify-between mb-3 border-b border-[#edf2f7] pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">✓</span>
                    <h2 className="text-base font-bold text-[#063b78]">
                      {lang === 'bn' ? 'নির্বাচিত শিক্ষার্থী' : 'Selected Student'}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetStudent}
                    className="text-[12px] font-semibold text-[#063b78] hover:underline"
                  >
                    {lang === 'bn' ? 'পরিবর্তন করুন' : 'Change'}
                  </button>
                </div>

                <div className="space-y-2 text-[13px]">
                  <div className="flex justify-between">
                    <span className="text-[#64748b]">{lang === 'bn' ? 'নাম' : 'Name'}:</span>
                    <span className="font-bold text-[#092f63]">{selectedStudent.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#64748b]">{lang === 'bn' ? 'আইডি' : 'Student ID'}:</span>
                    <span className="font-mono font-semibold text-[#063b78]">{selectedStudent.studentIdCode}</span>
                  </div>
                  {selectedStudent.courseName && (
                    <div className="flex justify-between">
                      <span className="text-[#64748b]">{lang === 'bn' ? 'কোর্স' : 'Course'}:</span>
                      <span className="font-medium text-[#1e293b]">{selectedStudent.courseName}</span>
                    </div>
                  )}
                  {selectedStudent.batchName && (
                    <div className="flex justify-between">
                      <span className="text-[#64748b]">{lang === 'bn' ? 'ব্যাচ' : 'Batch'}:</span>
                      <span className="font-medium text-[#1e293b]">{selectedStudent.batchName}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-[#edf2f7] pt-2">
                    <span className="text-[#64748b] font-medium">{lang === 'bn' ? 'সর্বমোট বকেয়া' : 'Total Due'}:</span>
                    <span className="font-bold text-amber-700 text-sm">৳{selectedStudent.totalDue.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: INVOICE SELECTION */}
            {selectedStudent && (
              <div className="card p-5 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-6 h-6 rounded-full bg-[#063b78] text-white text-xs font-bold flex items-center justify-center">2</span>
                  <h2 className="text-base font-bold text-[#063b78]">
                    {lang === 'bn' ? 'বকেয়া ইনভয়েস নির্বাচন' : 'Outstanding Invoices'}
                  </h2>
                </div>

                {loadingInvoices && (
                  <div className="text-center py-6 text-[#64748b]">
                    <div className="inline-block animate-spin w-5 h-5 border-2 border-[#063b78] border-t-transparent rounded-full mb-1" />
                    <p className="text-[12.5px]">{lang === 'bn' ? 'ইনভয়েস লোড হচ্ছে…' : 'Loading invoices…'}</p>
                  </div>
                )}

                {!loadingInvoices && invoices.length === 0 && (
                  <div className="text-center py-8 text-[#64748b] bg-[#f8fafc] rounded-xl border border-[#edf2f7]">
                    <Icon name="check" size={28} className="mx-auto text-emerald-500 mb-2" />
                    <p className="text-[13.5px] font-bold text-[#092f63]">
                      {lang === 'bn' ? 'কোনো বকেয়া ইনভয়েস নেই' : 'No Outstanding Invoices'}
                    </p>
                    <p className="text-[12px] text-[#64748b] mt-0.5">
                      {lang === 'bn' ? 'এই শিক্ষার্থীর সমস্ত বকেয়া পরিশোধিত আছে।' : 'All billings for this student have been cleared.'}
                    </p>
                  </div>
                )}

                {!loadingInvoices && invoices.length > 0 && (
                  <div className="space-y-2.5">
                    {invoices.map((inv) => {
                      const isSelected = selectedInvoice?.id === inv.id;
                      const totalNum = Number(inv.totalAmount);
                      const paidNum = Number(inv.paidAmount);
                      const dueNum = Number(inv.dueAmount);

                      return (
                        <div
                          key={inv.id}
                          onClick={() => handleSelectInvoice(inv)}
                          className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                            isSelected
                              ? 'border-[#063b78] bg-[#f0f6ff] shadow-xs ring-2 ring-[#063b78]/20'
                              : 'border-[#dce5f0] bg-white hover:border-[#063b78]'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-mono font-bold text-[#063b78] text-[13px]">
                              {inv.invoiceNumber}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                                inv.status === 'PARTIAL'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {inv.status}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-[12px] text-center bg-white/80 p-2 rounded-lg border border-[#e2e8f0]">
                            <div>
                              <span className="block text-[#94a3b8] text-[11px]">{lang === 'bn' ? 'মোট' : 'Total'}</span>
                              <span className="font-semibold text-[#1e293b]">৳{totalNum.toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="block text-[#94a3b8] text-[11px]">{lang === 'bn' ? 'পরিশোধিত' : 'Paid'}</span>
                              <span className="font-semibold text-emerald-700">৳{paidNum.toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="block text-[#94a3b8] text-[11px]">{lang === 'bn' ? 'বকেয়া' : 'Due'}</span>
                              <span className="font-bold text-rose-700">৳{dueNum.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT: PAYMENT FORM */}
          <div className="lg:col-span-6">
            <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
              <div className="flex items-center gap-2 mb-4 border-b border-[#edf2f7] pb-3">
                <span className="w-6 h-6 rounded-full bg-[#063b78] text-white text-xs font-bold flex items-center justify-center">3</span>
                <h2 className="text-base font-bold text-[#063b78]">
                  {lang === 'bn' ? 'পেমেন্ট ফরম' : 'Payment Form'}
                </h2>
              </div>

              {!selectedInvoice ? (
                <div className="text-center py-12 text-[#94a3b8]">
                  <Icon name="banknote" size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-[13px]">
                    {lang === 'bn'
                      ? 'পেমেন্ট গ্রহণ করতে বাম পাশ থেকে একটি ইনভয়েস নির্বাচন করুন'
                      : 'Select an outstanding invoice from the left to collect payment'}
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmitPayment} className="space-y-4">
                  {errorMessage && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[12.5px] font-medium">
                      {errorMessage}
                    </div>
                  )}

                  {/* Summary Bar */}
                  <div className="p-3 rounded-xl bg-[#f8fafc] border border-[#dce5f0] flex items-center justify-between text-[13px]">
                    <div>
                      <span className="text-[#64748b] text-[11.5px] block">{lang === 'bn' ? 'ইনভয়েস' : 'Invoice'}</span>
                      <span className="font-mono font-bold text-[#063b78]">{selectedInvoice.invoiceNumber}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[#64748b] text-[11.5px] block">{lang === 'bn' ? 'বর্তমান বকেয়া' : 'Current Due'}</span>
                      <span className="font-bold text-rose-700 text-sm">৳{Number(selectedInvoice.dueAmount).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Payment Amount */}
                  <div className="fld">
                    <label className="text-[12.5px] font-semibold text-[#1e293b] flex items-center justify-between">
                      <span>{lang === 'bn' ? 'পেমেন্টের পরিমাণ (৳)' : 'Payment Amount (৳)'}</span>
                      <button
                        type="button"
                        onClick={() => setPaymentAmount(String(Number(selectedInvoice.dueAmount)))}
                        className="text-[11.5px] text-[#063b78] font-bold hover:underline"
                      >
                        {lang === 'bn' ? 'সম্পূর্ণ বকেয়া (Full)' : 'Full Due'}
                      </button>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 font-bold text-[#64748b]">৳</span>
                      <input
                        type="number"
                        min="1"
                        max={Number(selectedInvoice.dueAmount)}
                        step="any"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full h-10 pl-8 pr-3 rounded-xl border border-[#dce5f0] bg-white font-bold text-[#092f63] text-[15px] focus:outline-none focus:border-[#063b78]"
                        required
                      />
                    </div>
                    {Number(paymentAmount) < Number(selectedInvoice.dueAmount) && Number(paymentAmount) > 0 && (
                      <p className="text-[11.5px] text-amber-700 mt-1">
                        {lang === 'bn' ? 'আংশিক পেমেন্ট: অবশিষ্ট বকেয়া থাকবে' : 'Partial payment: Remaining due will be'} ৳{(Number(selectedInvoice.dueAmount) - Number(paymentAmount)).toLocaleString()}
                      </p>
                    )}
                  </div>

                  {/* Payment Method Selector */}
                  <div className="fld">
                    <label className="text-[12.5px] font-semibold text-[#1e293b]">
                      {lang === 'bn' ? 'পেমেন্ট পদ্ধতি' : 'Payment Method'}
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {PAYMENT_METHODS.map((pm) => {
                        const active = paymentMethod === pm.id;
                        return (
                          <button
                            key={pm.id}
                            type="button"
                            onClick={() => setPaymentMethod(pm.id)}
                            className={`h-9.5 px-2 rounded-xl text-[12px] font-semibold border flex items-center justify-center gap-1.5 transition-all ${
                              active
                                ? 'bg-[#063b78] text-white border-[#063b78] shadow-xs'
                                : 'bg-[#f8fafc] text-[#55637a] border-[#dce5f0] hover:bg-white'
                            }`}
                          >
                            <Icon name={pm.icon} size={14} />
                            <span>{lang === 'bn' ? pm.labelBn : pm.labelEn}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Dynamic Fields for Digital / Bank Payments */}
                  {(paymentMethod === 'BKASH' || paymentMethod === 'NAGAD' || paymentMethod === 'CARD' || paymentMethod === 'OTHER') && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-[#f8fafc] p-3 rounded-xl border border-[#edf2f7]">
                      <div className="fld">
                        <label className="text-[11.5px] font-semibold text-[#475569]">
                          {lang === 'bn' ? 'ট্রানজেকশন আইডি (TrxID)' : 'Transaction ID'}
                          {(paymentMethod === 'BKASH' || paymentMethod === 'NAGAD') && <span className="text-rose-600">*</span>}
                        </label>
                        <input
                          type="text"
                          value={referenceNumber}
                          onChange={(e) => setReferenceNumber(e.target.value)}
                          placeholder="e.g. 9J4K7LM2"
                          className="w-full h-9 px-3 rounded-lg border border-[#dce5f0] bg-white text-[12.5px]"
                        />
                      </div>
                      {(paymentMethod === 'BKASH' || paymentMethod === 'NAGAD') && (
                        <div className="fld">
                          <label className="text-[11.5px] font-semibold text-[#475569]">
                            {lang === 'bn' ? 'প্রেরক মোবাইল নম্বর' : 'Sender Mobile'}
                          </label>
                          <input
                            type="text"
                            value={senderMobile}
                            onChange={(e) => setSenderMobile(e.target.value)}
                            placeholder="017XXXXXXXX"
                            className="w-full h-9 px-3 rounded-lg border border-[#dce5f0] bg-white text-[12.5px]"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {paymentMethod === 'BANK' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-[#f8fafc] p-3 rounded-xl border border-[#edf2f7]">
                      <div className="fld">
                        <label className="text-[11.5px] font-semibold text-[#475569]">
                          {lang === 'bn' ? 'ব্যাংকের নাম' : 'Bank Name'}
                        </label>
                        <input
                          type="text"
                          value={bankName}
                          onChange={(e) => setBankName(e.target.value)}
                          placeholder="e.g. Dutch Bangla Bank"
                          className="w-full h-9 px-3 rounded-lg border border-[#dce5f0] bg-white text-[12.5px]"
                        />
                      </div>
                      <div className="fld">
                        <label className="text-[11.5px] font-semibold text-[#475569]">
                          {lang === 'bn' ? 'চেক বা রেফারেন্স নম্বর' : 'Cheque / Ref Number'}
                        </label>
                        <input
                          type="text"
                          value={chequeNumber}
                          onChange={(e) => setChequeNumber(e.target.value)}
                          placeholder="e.g. CHQ-10492"
                          className="w-full h-9 px-3 rounded-lg border border-[#dce5f0] bg-white text-[12.5px]"
                        />
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  <div className="fld">
                    <label className="text-[12px] font-semibold text-[#475569]">
                      {lang === 'bn' ? 'মন্তব্য (ঐচ্ছিক)' : 'Notes (Optional)'}
                    </label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={lang === 'bn' ? 'কোনো বিশেষ তথ্য থাকলে লিখুন…' : 'Internal notes or remarks…'}
                      className="w-full h-9 px-3 rounded-xl border border-[#dce5f0] bg-white text-[12.5px]"
                    />
                  </div>

                  {/* Submit Button */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={submitting || !paymentAmount || Number(paymentAmount) <= 0}
                      className="w-full h-11 rounded-xl bg-[#063b78] text-white font-bold text-[14px] hover:bg-[#092f63] disabled:opacity-40 transition-all flex items-center justify-center gap-2 shadow-sm"
                    >
                      {submitting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>{lang === 'bn' ? 'পেমেন্ট প্রক্রিয়াধীন…' : 'Processing Payment…'}</span>
                        </>
                      ) : (
                        <>
                          <Icon name="check" size={17} />
                          <span>
                            {lang === 'bn'
                              ? `৳${Number(paymentAmount || 0).toLocaleString()} পেমেন্ট সংগ্রহ করুন`
                              : `Collect Payment (৳${Number(paymentAmount || 0).toLocaleString()})`}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
