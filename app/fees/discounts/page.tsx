'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import FeesSubNav from '@/components/FeesSubNav';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';

interface DiscountItem {
  id: string;
  type: 'DISCOUNT' | 'WAIVER';
  amount: number;
  rawReason: string;
  reason: string;
  reviewerNote: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  createdByName: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceDueAmount: number | null;
  invoiceStatus: string | null;
  studentId: string | null;
  studentIdCode: string;
  studentName: string;
  studentBanglaName: string | null;
}

interface StudentSearchResult {
  id: string;
  name: string;
  banglaName?: string | null;
  studentIdCode: string;
  phone?: string | null;
  totalDue: number;
  payableInvoiceCount: number;
}

interface StudentInvoice {
  id: string;
  invoiceNumber: string;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  status: string;
}

export default function DiscountsAndWaiversPage() {
  const { lang, currentUser, showToast, can } = useApp();
  const isOwner = can('fees.discount.approve');

  const [loading, setLoading] = useState(true);
  const [discounts, setDiscounts] = useState<DiscountItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'DISCOUNT' | 'WAIVER'>('ALL');

  // Modals state
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedDiscount, setSelectedDiscount] = useState<DiscountItem | null>(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Approve/Reject notes
  const [ownerNote, setOwnerNote] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  // Request form state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchingStudents, setSearchingStudents] = useState(false);
  const [searchResults, setSearchResults] = useState<StudentSearchResult[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentSearchResult | null>(null);
  const [studentInvoices, setStudentInvoices] = useState<StudentInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [requestType, setRequestType] = useState<'DISCOUNT' | 'WAIVER'>('DISCOUNT');
  const [requestAmount, setRequestAmount] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [formError, setFormError] = useState('');

  // Fetch discounts list
  const fetchDiscounts = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (typeFilter !== 'ALL') params.set('type', typeFilter);

      const res = await fetch(`/api/fees/discounts?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setDiscounts(data.discounts || []);
      } else {
        showToast(data.error || 'Failed to load adjustments');
      }
    } catch {
      showToast('Network error loading discounts and waivers');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, showToast]);

  useEffect(() => {
    fetchDiscounts();
  }, [fetchDiscounts]);

  // Student search for requesting concession
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingStudents(true);
      try {
        const res = await fetch(`/api/fees/collect/students?q=${encodeURIComponent(searchQuery.trim())}`);
        const data = await res.json();
        if (data.success) {
          setSearchResults(data.students || []);
        }
      } catch {
        // Search error suppressed
      } finally {
        setSearchingStudents(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // When student is selected, fetch their unpaid invoices
  const handleSelectStudent = async (student: StudentSearchResult) => {
    setSelectedStudent(student);
    setSearchResults([]);
    setSearchQuery('');
    setLoadingInvoices(true);
    setSelectedInvoiceId('');
    try {
      const res = await fetch(`/api/fees/invoices?studentId=${student.id}`);
      const data = await res.json();
      if (data.success) {
        const validInvoices = (data.invoices || []).filter(
          (inv: any) => inv.status !== 'PAID' && inv.status !== 'CANCELLED' && Number(inv.dueAmount) > 0
        );
        setStudentInvoices(validInvoices);
        if (validInvoices.length > 0) {
          setSelectedInvoiceId(validInvoices[0].id);
        }
      }
    } catch {
      showToast('Failed to load student invoices');
    } finally {
      setLoadingInvoices(false);
    }
  };

  // Submit Concession Request
  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!selectedInvoiceId) {
      setFormError('Please select an invoice with an outstanding balance.');
      return;
    }
    const amountNum = parseFloat(requestAmount);
    if (!amountNum || amountNum <= 0) {
      setFormError('Please enter a valid positive adjustment amount.');
      return;
    }
    const targetInvoice = studentInvoices.find((i) => i.id === selectedInvoiceId);
    if (targetInvoice && amountNum > Number(targetInvoice.dueAmount)) {
      setFormError(`Amount cannot exceed the invoice current due of ৳${targetInvoice.dueAmount.toLocaleString('en-IN')}.`);
      return;
    }
    if (!requestReason.trim() || requestReason.trim().length < 3) {
      setFormError('Please enter a valid reason (at least 3 characters).');
      return;
    }

    try {
      setActionLoading(true);
      const res = await fetch('/api/fees/discounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: selectedInvoiceId,
          type: requestType,
          amount: amountNum,
          reason: requestReason.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Concession submitted successfully');
        setShowRequestModal(false);
        // Reset form
        setSelectedStudent(null);
        setStudentInvoices([]);
        setSelectedInvoiceId('');
        setRequestAmount('');
        setRequestReason('');
        fetchDiscounts();
      } else {
        setFormError(data.error || 'Failed to submit concession request');
      }
    } catch {
      setFormError('Network error submitting concession');
    } finally {
      setActionLoading(false);
    }
  };

  // Approve Concession (Owner only)
  const handleApprove = async () => {
    if (!selectedDiscount) return;
    try {
      setActionLoading(true);
      const res = await fetch(`/api/fees/discounts/${selectedDiscount.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: ownerNote.trim() || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Concession approved');
        setShowApproveModal(false);
        setSelectedDiscount(null);
        setOwnerNote('');
        fetchDiscounts();
      } else {
        showToast(data.error || 'Failed to approve');
      }
    } catch {
      showToast('Network error during approval');
    } finally {
      setActionLoading(false);
    }
  };

  // Reject Concession (Owner only)
  const handleReject = async () => {
    if (!selectedDiscount) return;
    try {
      setActionLoading(true);
      const res = await fetch(`/api/fees/discounts/${selectedDiscount.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectionReason.trim() || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Concession request rejected');
        setShowRejectModal(false);
        setSelectedDiscount(null);
        setRejectionReason('');
        fetchDiscounts();
      } else {
        showToast(data.error || 'Failed to reject');
      }
    } catch {
      showToast('Network error during rejection');
    } finally {
      setActionLoading(false);
    }
  };

  // Compute summary stats from current discounts list
  const pendingCount = discounts.filter((d) => d.status === 'PENDING').length;
  const approvedDiscounts = discounts.filter((d) => d.status === 'APPROVED' && d.type === 'DISCOUNT');
  const approvedWaivers = discounts.filter((d) => d.status === 'APPROVED' && d.type === 'WAIVER');
  const totalApprovedDiscountSum = approvedDiscounts.reduce((sum, d) => sum + d.amount, 0);
  const totalApprovedWaiverSum = approvedWaivers.reduce((sum, d) => sum + d.amount, 0);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {lang === 'bn' ? 'ছাড় ও মওকুফ ব্যবস্থাপনা' : 'Discounts & Waivers'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {lang === 'bn'
              ? 'শিক্ষার্থীদের ফির ওপর বিশেষ ছাড় এবং পূর্ণ মওকুফের অনুরোধ পরিচালনা ও অনুমোদন করুন'
              : 'Manage student fee concessions, review staff requests, and track approved adjustments'}
          </p>
        </div>

        <button
          onClick={() => {
            setFormError('');
            setShowRequestModal(true);
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-teal-600 text-white font-medium hover:bg-teal-700 shadow-xs transition-colors cursor-pointer"
        >
          <Icon name="plus" size={18} />
          <span>{lang === 'bn' ? '+ নতুন ছাড়/মওকুফ অনুরোধ' : '+ Request Discount / Waiver'}</span>
        </button>
      </div>

      {/* Navigation Sub-Tabs */}
      <FeesSubNav />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-600">
              {lang === 'bn' ? 'অনুমোদনের অপেক্ষায়' : 'Pending Requests'}
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Icon name="clock" size={16} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{pendingCount}</span>
            <span className="text-xs text-slate-400">{lang === 'bn' ? 'টি অনুরোধ' : 'requests'}</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {isOwner
              ? lang === 'bn' ? 'আপনার পর্যালোচনার অপেক্ষায়' : 'Awaiting your review'
              : lang === 'bn' ? 'মালিকের অনুমোদনের অপেক্ষায়' : 'Pending Owner review'}
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
              {lang === 'bn' ? 'অনুমোদিত সাধারণ ছাড়' : 'Approved Discounts'}
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Icon name="tag" size={16} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-2xl font-bold text-slate-900">৳{totalApprovedDiscountSum.toLocaleString('en-IN')}</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {approvedDiscounts.length} {lang === 'bn' ? 'টি ছাড় অনুমোদিত' : 'granted'}
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-600">
              {lang === 'bn' ? 'অনুমোদিত মওকুফ' : 'Approved Waivers'}
            </span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Icon name="award" size={16} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-2xl font-bold text-slate-900">৳{totalApprovedWaiverSum.toLocaleString('en-IN')}</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {approvedWaivers.length} {lang === 'bn' ? 'টি বিশেষ মওকুফ' : 'granted'}
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {lang === 'bn' ? 'অনুমোদন ভূমিকা' : 'Your Role'}
            </span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
              <Icon name="shield" size={16} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-lg font-bold text-slate-900">{currentUser?.role || 'STAFF'}</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {isOwner
              ? lang === 'bn' ? 'অনুমোদন ও প্রত্যাখ্যানের ক্ষমতা আছে' : 'Authorized to approve/reject'
              : lang === 'bn' ? 'শুধুমাত্র অনুরোধ পাঠাতে পারবেন' : 'Can submit requests only'}
          </p>
        </div>
      </div>

      {/* Filter and Tab Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Status Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100/80 rounded-lg">
          {(
            [
              { id: 'PENDING' as const, labelEn: 'Pending Approval', labelBn: 'অপেক্ষমাণ', count: pendingCount },
              { id: 'APPROVED' as const, labelEn: 'Approved', labelBn: 'অনুমোদিত', count: undefined },
              { id: 'REJECTED' as const, labelEn: 'Rejected', labelBn: 'বাতিলকৃত', count: undefined },
              { id: 'ALL' as const, labelEn: 'All History', labelBn: 'সকল ইতিহাস', count: undefined },
            ]
          ).map((tab) => {
            const isActive = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <span>{lang === 'bn' ? tab.labelBn : tab.labelEn}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Type Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">{lang === 'bn' ? 'ধরন:' : 'Type:'}</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
          >
            <option value="ALL">{lang === 'bn' ? 'সব ধরন' : 'All Types'}</option>
            <option value="DISCOUNT">{lang === 'bn' ? 'সাধারণ ছাড় (Discount)' : 'Discounts'}</option>
            <option value="WAIVER">{lang === 'bn' ? 'সম্পূর্ণ মওকুফ (Waiver)' : 'Waivers'}</option>
          </select>

          <button
            onClick={fetchDiscounts}
            title="Refresh"
            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
          >
            <Icon name="refresh" size={15} />
          </button>
        </div>
      </div>

      {/* Main List */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mb-2"></div>
            <p className="text-sm">{lang === 'bn' ? 'তথ্য লোড হচ্ছে...' : 'Loading adjustments...'}</p>
          </div>
        ) : discounts.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Icon name="tag" size={24} />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">
              {lang === 'bn' ? 'কোনো ছাড় বা মওকুফ রেকর্ড পাওয়া যায়নি' : 'No discount or waiver records found'}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              {statusFilter === 'PENDING'
                ? lang === 'bn'
                  ? 'বর্তমানে কোনো ছাড়ের অনুরোধ অনুমোদনের জন্য অপেক্ষমাণ নেই।'
                  : 'There are currently no pending concession requests awaiting approval.'
                : lang === 'bn'
                  ? 'এই ফিল্টারে কোনো ফলাফল নেই।'
                  : 'No records match the current filter selection.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 border-collapse">
              <thead className="bg-slate-50/75 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">{lang === 'bn' ? 'শিক্ষার্থী' : 'Student'}</th>
                  <th className="py-3 px-4">{lang === 'bn' ? 'ইনভয়েস' : 'Invoice'}</th>
                  <th className="py-3 px-4">{lang === 'bn' ? 'ধরন' : 'Type'}</th>
                  <th className="py-3 px-4">{lang === 'bn' ? 'পরিমাণ' : 'Amount'}</th>
                  <th className="py-3 px-4">{lang === 'bn' ? 'অনুরোধের কারণ ও বিশদ' : 'Reason & Requester'}</th>
                  <th className="py-3 px-4">{lang === 'bn' ? 'অবস্থা' : 'Status'}</th>
                  <th className="py-3 px-4 text-right">{lang === 'bn' ? 'পদক্ষেপ' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {discounts.map((item) => {
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Student info */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-medium text-slate-900">
                          {item.studentName}
                          {item.studentBanglaName && (
                            <span className="text-xs text-slate-500 font-normal ml-1">({item.studentBanglaName})</span>
                          )}
                        </div>
                        <div className="text-xs text-teal-600 font-mono mt-0.5">
                          {item.studentId ? (
                            <Link href={`/students/${item.studentId}`} className="hover:underline">
                              {item.studentIdCode}
                            </Link>
                          ) : (
                            item.studentIdCode
                          )}
                        </div>
                      </td>

                      {/* Invoice info */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {item.invoiceNumber ? (
                          <>
                            <div className="font-mono text-xs font-medium text-slate-800">
                              {item.invoiceNumber}
                            </div>
                            {item.invoiceDueAmount !== null && (
                              <div className="text-[11px] text-slate-500">
                                {lang === 'bn' ? 'বকেয়া: ' : 'Due: '}
                                <span className="font-semibold text-rose-600">
                                  ৳{item.invoiceDueAmount.toLocaleString('en-IN')}
                                </span>
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      {/* Concession Type */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {item.type === 'DISCOUNT' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            <Icon name="tag" size={11} />
                            {lang === 'bn' ? 'ছাড়' : 'Discount'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
                            <Icon name="award" size={11} />
                            {lang === 'bn' ? 'মওকুফ' : 'Waiver'}
                          </span>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="font-bold text-slate-900 text-base">
                          ৳{item.amount.toLocaleString('en-IN')}
                        </span>
                      </td>

                      {/* Reason & Submitter */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="text-xs text-slate-800 font-medium truncate" title={item.reason}>
                          {item.reason}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {lang === 'bn' ? 'অনুরোধকারী: ' : 'By: '}
                          <span className="text-slate-600">{item.createdByName}</span> •{' '}
                          {new Date(item.createdAt).toLocaleDateString()}
                        </div>
                        {item.reviewerNote && (
                          <div className="text-[11px] text-amber-700 bg-amber-50/80 px-2 py-0.5 rounded-md mt-1 border border-amber-200/50">
                            <span className="font-semibold">{lang === 'bn' ? 'নোট: ' : 'Note: '}</span>
                            {item.reviewerNote}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {item.status === 'PENDING' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                            {lang === 'bn' ? 'অপেক্ষমাণ' : 'Pending'}
                          </span>
                        )}
                        {item.status === 'APPROVED' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Icon name="check" size={12} />
                            {lang === 'bn' ? 'অনুমোদিত' : 'Approved'}
                          </span>
                        )}
                        {item.status === 'REJECTED' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
                            <Icon name="x" size={12} />
                            {lang === 'bn' ? 'বাতিল' : 'Rejected'}
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-right">
                        {item.status === 'PENDING' ? (
                          isOwner ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                onClick={() => {
                                  setSelectedDiscount(item);
                                  setOwnerNote('');
                                  setShowApproveModal(true);
                                }}
                                className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium shadow-xs transition-colors cursor-pointer"
                              >
                                {lang === 'bn' ? 'অনুমোদন' : 'Approve'}
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedDiscount(item);
                                  setRejectionReason('');
                                  setShowRejectModal(true);
                                }}
                                className="px-2.5 py-1 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-medium transition-colors cursor-pointer"
                              >
                                {lang === 'bn' ? 'প্রত্যাখ্যান' : 'Reject'}
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 italic">
                              {lang === 'bn' ? 'অনুমোদনাধীন' : 'Under Review'}
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-slate-400 font-mono">
                            {new Date(item.createdAt).toLocaleDateString()}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Request Concession */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">
                {lang === 'bn' ? 'ছাড় বা মওকুফের অনুরোধ করুন' : 'Request Discount or Waiver'}
              </h3>
              <button
                onClick={() => setShowRequestModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <Icon name="x" size={20} />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                <Icon name="alert-circle" size={16} />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitRequest} className="space-y-4">
              {/* Step 1: Select Student */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {lang === 'bn' ? '১. শিক্ষার্থী নির্বাচন করুন' : '1. Select Student'}
                </label>
                {selectedStudent ? (
                  <div className="p-3 rounded-lg border border-teal-200 bg-teal-50/50 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-sm text-slate-900">
                        {selectedStudent.name}{' '}
                        {selectedStudent.banglaName && (
                          <span className="text-xs text-slate-500 font-normal">({selectedStudent.banglaName})</span>
                        )}
                      </div>
                      <div className="text-xs text-teal-700 font-mono">
                        {selectedStudent.studentIdCode} • {lang === 'bn' ? 'মোট বকেয়া: ' : 'Total Due: '}
                        <span className="font-bold text-rose-600">৳{selectedStudent.totalDue.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStudent(null);
                        setStudentInvoices([]);
                        setSelectedInvoiceId('');
                      }}
                      className="text-xs text-rose-600 hover:underline cursor-pointer"
                    >
                      {lang === 'bn' ? 'পরিবর্তন' : 'Change'}
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={lang === 'bn' ? 'শিক্ষার্থীর নাম, আইডি বা ফোন নম্বর লিখুন...' : 'Search student by name, ID or phone...'}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                    />
                    {searchingStudents && (
                      <div className="absolute right-3 top-2.5 text-slate-400 animate-spin">
                        <Icon name="refresh" size={16} />
                      </div>
                    )}
                    {searchResults.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 max-h-52 overflow-y-auto">
                        {searchResults.map((s) => (
                          <div
                            key={s.id}
                            onClick={() => handleSelectStudent(s)}
                            className="p-2.5 hover:bg-teal-50 cursor-pointer border-b border-slate-100 last:border-0 flex items-center justify-between"
                          >
                            <div>
                              <div className="text-sm font-medium text-slate-900">{s.name}</div>
                              <div className="text-xs text-slate-500 font-mono">{s.studentIdCode}</div>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-bold text-rose-600">
                                ৳{s.totalDue.toLocaleString('en-IN')}
                              </span>
                              <div className="text-[10px] text-slate-400">
                                {s.payableInvoiceCount} {lang === 'bn' ? 'বকেয়া বিল' : 'due invoices'}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Step 2: Select Invoice */}
              {selectedStudent && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {lang === 'bn' ? '২. ইনভয়েস নির্বাচন করুন' : '2. Select Invoice'}
                  </label>
                  {loadingInvoices ? (
                    <div className="text-xs text-slate-400 py-2">{lang === 'bn' ? 'ইনভয়েস লোড হচ্ছে...' : 'Loading invoices...'}</div>
                  ) : studentInvoices.length === 0 ? (
                    <div className="p-3 rounded-lg bg-amber-50 text-amber-800 text-xs">
                      {lang === 'bn' ? 'এই শিক্ষার্থীর কোনো বকেয়া ইনভয়েস নেই।' : 'This student has no outstanding due invoices.'}
                    </div>
                  ) : (
                    <select
                      value={selectedInvoiceId}
                      onChange={(e) => setSelectedInvoiceId(e.target.value)}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                    >
                      {studentInvoices.map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.invoiceNumber} — {lang === 'bn' ? 'বকেয়া: ' : 'Due: '}৳{Number(inv.dueAmount).toLocaleString('en-IN')} (মোট: ৳{Number(inv.totalAmount).toLocaleString('en-IN')})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Step 3: Type & Amount */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {lang === 'bn' ? 'সমন্বয়ের ধরন' : 'Adjustment Type'}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRequestType('DISCOUNT')}
                      className={`py-2 text-xs font-medium rounded-lg border text-center transition-colors cursor-pointer ${
                        requestType === 'DISCOUNT'
                          ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {lang === 'bn' ? 'ছাড় (Discount)' : 'Discount'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRequestType('WAIVER')}
                      className={`py-2 text-xs font-medium rounded-lg border text-center transition-colors cursor-pointer ${
                        requestType === 'WAIVER'
                          ? 'bg-purple-50 border-purple-500 text-purple-700 font-bold'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {lang === 'bn' ? 'মওকুফ (Waiver)' : 'Waiver'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {lang === 'bn' ? 'পরিমাণ (৳)' : 'Amount (৳)'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    placeholder="e.g. 500"
                    value={requestAmount}
                    onChange={(e) => setRequestAmount(e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                    required
                  />
                </div>
              </div>

              {/* Step 4: Reason */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {lang === 'bn' ? 'কারণ বা মন্তব্য' : 'Reason / Justification'}
                </label>
                <textarea
                  rows={2}
                  placeholder={lang === 'bn' ? 'ছাড়ের কারণ উল্লেখ করুন (যেমন: মেধা বৃত্তি, আর্থিক অসচ্ছলতা...)' : 'Reason for concession (e.g. Merit scholarship, financial hardship...)'}
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  required
                />
              </div>

              {/* Info notice based on role */}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-2">
                <Icon name="info" size={16} className="text-teal-600 shrink-0 mt-0.5" />
                <span>
                  {isOwner
                    ? lang === 'bn'
                      ? 'মালিক (Owner) হিসেবে এটি সংরক্ষণ করলে সরাসরি অনুমোদিত হয়ে ইনভয়েস ব্যালেন্স থেকে বাদ যাবে।'
                      : 'As Owner, submitting this will immediately approve and deduct the balance from the invoice.'
                    : lang === 'bn'
                      ? 'স্টাফ/অ্যাডমিন হিসেবে আপনার এই অনুরোধটি মালিকের অনুমোদনের জন্য অপেক্ষমাণ থাকবে।'
                      : 'As Staff/Admin, your request will be queued in "Pending Approval" for Owner review.'}
                </span>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 cursor-pointer"
                >
                  {lang === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !selectedInvoiceId}
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {actionLoading && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  <span>{isOwner ? (lang === 'bn' ? 'সরাসরি প্রয়োগ করুন' : 'Apply Concession') : (lang === 'bn' ? 'অনুরোধ জমা দিন' : 'Submit Request')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Owner Approve */}
      {showApproveModal && selectedDiscount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">
                {lang === 'bn' ? 'অনুরোধ অনুমোদন নিশ্চিতকরণ' : 'Approve Concession Request'}
              </h3>
              <button
                onClick={() => setShowApproveModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <Icon name="x" size={20} />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">{lang === 'bn' ? 'শিক্ষার্থী:' : 'Student:'}</span>
                <span className="font-semibold text-slate-900">{selectedDiscount.studentName} ({selectedDiscount.studentIdCode})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{lang === 'bn' ? 'ইনভয়েস:' : 'Invoice:'}</span>
                <span className="font-mono text-slate-800">{selectedDiscount.invoiceNumber || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{lang === 'bn' ? 'ধরন:' : 'Type:'}</span>
                <span className="font-semibold text-blue-700">{selectedDiscount.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{lang === 'bn' ? 'পরিমাণ:' : 'Amount:'}</span>
                <span className="font-bold text-slate-900 text-sm">৳{selectedDiscount.amount.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{lang === 'bn' ? 'অনুরোধের কারণ:' : 'Reason:'}</span>
                <span className="text-slate-800 italic">{selectedDiscount.reason}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'bn' ? 'মালিকের মন্তব্য / অনুমোদন নোট (ঐচ্ছিক)' : 'Owner Approval Note (Optional)'}
              </label>
              <input
                type="text"
                placeholder={lang === 'bn' ? 'যেমন: বিশেষ বিবেচনায় অনুমোদিত' : 'e.g. Approved under director discretion'}
                value={ownerNote}
                onChange={(e) => setOwnerNote(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowApproveModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 cursor-pointer"
              >
                {lang === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleApprove}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                {actionLoading && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                <span>{lang === 'bn' ? 'অনুমোদন নিশ্চিত করুন' : 'Confirm Approval'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Owner Reject */}
      {showRejectModal && selectedDiscount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">
                {lang === 'bn' ? 'অনুরোধ প্রত্যাখ্যান' : 'Reject Concession Request'}
              </h3>
              <button
                onClick={() => setShowRejectModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <Icon name="x" size={20} />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              {lang === 'bn'
                ? 'এই অনুরোধটি প্রত্যাখ্যান করলে ইনভয়েসের বকেয়া অপরিবর্তিত থাকবে এবং স্টাফকে অবহিত করা হবে।'
                : 'Rejecting this request leaves the invoice balance unchanged and marks the concession as rejected.'}
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'bn' ? 'প্রত্যাখ্যানের কারণ' : 'Rejection Reason'}
              </label>
              <textarea
                rows={2}
                placeholder={lang === 'bn' ? 'প্রত্যাখ্যানের কারণ লিখুন...' : 'Enter rejection reason...'}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 cursor-pointer"
              >
                {lang === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleReject}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                {actionLoading && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                <span>{lang === 'bn' ? 'প্রত্যাখ্যান করুন' : 'Confirm Rejection'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
