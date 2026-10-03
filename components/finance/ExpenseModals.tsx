'use client';

import { useState, useEffect } from 'react';
import {
  DICTIONARY,
  formatBDTExact,
  pickLocalized,
} from '@/lib/i18n';
import type { SessionUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import {
  X,
  AlertTriangle,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  Lock,
  Layers,
} from 'lucide-react';

export interface CategoryOption {
  id: string;
  name: string;
  banglaName: string | null;
  code?: string | null;
  isActive?: boolean;
  isProtected?: boolean;
  expenseCount?: number;
}

export interface BranchOption {
  id: string;
  name: string;
  banglaName: string | null;
  isMain?: boolean;
}

export interface ExpenseItem {
  id: string;
  amount: number;
  paymentMethod: string;
  paidTo: string | null;
  invoiceNo: string | null;
  date: string;
  notes: string | null;
  status: string;
  createdAt: string;
  cancelledAt: string | null;
  cancelledById?: string | null;
  cancelReason: string | null;
  isSalary: boolean;
  branch: { id: string; name: string; banglaName: string | null };
  category: { id: string; name: string; banglaName: string | null; code: string | null; isActive?: boolean };
  createdBy?: { id: string; name: string } | null;
  cancelledBy?: { id: string; name: string } | null;
}

// ==========================================
// 1. ADD EXPENSE MODAL
// ==========================================
export function AddExpenseModal({
  isOpen,
  onClose,
  onSuccess,
  categories,
  branches,
  paymentMethods,
  today,
  branchLocked,
  effectiveBranchId,
  lang,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  categories: CategoryOption[];
  branches: BranchOption[];
  paymentMethods: string[];
  today: string;
  branchLocked: boolean;
  effectiveBranchId: string | null;
  lang: 'en' | 'bn';
}) {
  const dict = DICTIONARY[lang].expenseManagement;
  const f = dict.form;
  const pmDict = DICTIONARY[lang].paymentMethod as Record<string, string>;

  const [date, setDate] = useState(today);
  const [branchId, setBranchId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paidTo, setPaidTo] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDate(today);
      setBranchId(effectiveBranchId || (branches.length > 0 ? branches[0].id : ''));
      setCategoryId(categories.length > 0 ? categories[0].id : '');
      setAmount('');
      setPaymentMethod('CASH');
      setPaidTo('');
      setInvoiceNo('');
      setNotes('');
      setError(null);
      // Auto-generate fresh idempotency key to prevent double submits
      setIdempotencyKey(`exp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
    }
  }, [isOpen, today, effectiveBranchId, branches, categories]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError(dict.errors.invalidAmount);
      return;
    }

    if (date > today) {
      setError(dict.errors.futureDate);
      return;
    }

    if (!branchId) {
      setError(dict.errors.required);
      return;
    }

    if (!categoryId) {
      setError(dict.errors.required);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          branchId,
          categoryId,
          amount: Math.round(numAmount * 100) / 100,
          paymentMethod,
          paidTo: paidTo.trim() || null,
          invoiceNo: invoiceNo.trim() || null,
          notes: notes.trim() || null,
          idempotencyKey,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'CASH_SESSION_CLOSED') {
          setError(dict.errors.cashClosed);
        } else {
          setError(data.message || data.error || 'Failed to save expense');
        }
        return;
      }

      onSuccess();
      onClose();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-[#dce5f0] w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#f8fafc] border-b border-[#e2e8f0] flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#063b78]">{dict.addExpense}</h2>
            <p className="text-xs text-[#64748b]">{dict.subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#64748b] hover:bg-[#edf2f7] hover:text-[#063b78] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-4 flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Date */}
            <div>
              <label className="block text-xs font-semibold text-[#092f63] mb-1">
                {f.date} <span className="text-rose-600">*</span>
              </label>
              <input
                type="date"
                max={today}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-xl border border-[#dce5f0] bg-white text-xs font-medium text-[#1e293b] focus:outline-hidden focus:border-[#063b78] focus:ring-1 focus:ring-[#063b78]"
              />
            </div>

            {/* Branch */}
            <div>
              <label className="block text-xs font-semibold text-[#092f63] mb-1">
                {f.branch} <span className="text-rose-600">*</span>
              </label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                disabled={branchLocked}
                required
                className="w-full h-10 px-3 rounded-xl border border-[#dce5f0] bg-white text-xs font-medium text-[#1e293b] focus:outline-hidden focus:border-[#063b78] focus:ring-1 focus:ring-[#063b78] disabled:bg-[#f1f5f9] disabled:text-[#64748b]"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {pickLocalized(lang, b.name, b.banglaName)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Category */}
            <div>
              <label className="block text-xs font-semibold text-[#092f63] mb-1">
                {f.category} <span className="text-rose-600">*</span>
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-xl border border-[#dce5f0] bg-white text-xs font-medium text-[#1e293b] focus:outline-hidden focus:border-[#063b78] focus:ring-1 focus:ring-[#063b78]"
              >
                {categories.length === 0 ? (
                  <option value="">No categories available</option>
                ) : (
                  categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {pickLocalized(lang, c.name, c.banglaName)}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-xs font-semibold text-[#092f63] mb-1">
                {f.amount} <span className="text-rose-600">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs font-bold text-[#64748b]">৳</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  className="w-full h-10 pl-7 pr-3 rounded-xl border border-[#dce5f0] bg-white text-xs font-bold text-[#1e293b] focus:outline-hidden focus:border-[#063b78] focus:ring-1 focus:ring-[#063b78]"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Payment Method */}
            <div>
              <label className="block text-xs font-semibold text-[#092f63] mb-1">
                {f.paymentMethod} <span className="text-rose-600">*</span>
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-xl border border-[#dce5f0] bg-white text-xs font-medium text-[#1e293b] focus:outline-hidden focus:border-[#063b78] focus:ring-1 focus:ring-[#063b78]"
              >
                {paymentMethods.map((pm) => (
                  <option key={pm} value={pm}>
                    {pmDict[pm] ?? pm}
                  </option>
                ))}
              </select>
            </div>

            {/* Paid To */}
            <div>
              <label className="block text-xs font-semibold text-[#092f63] mb-1">
                {f.paidTo}
              </label>
              <input
                type="text"
                placeholder={f.paidToPlaceholder}
                value={paidTo}
                onChange={(e) => setPaidTo(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-[#dce5f0] bg-white text-xs text-[#1e293b] focus:outline-hidden focus:border-[#063b78] focus:ring-1 focus:ring-[#063b78]"
              />
            </div>
          </div>

          {/* Invoice / Voucher No */}
          <div>
            <label className="block text-xs font-semibold text-[#092f63] mb-1">
              {f.invoiceNo}
            </label>
            <input
              type="text"
              placeholder={f.invoicePlaceholder}
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-[#dce5f0] bg-white text-xs text-[#1e293b] focus:outline-hidden focus:border-[#063b78] focus:ring-1 focus:ring-[#063b78]"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-[#092f63] mb-1">
              {f.notes}
            </label>
            <textarea
              rows={2}
              placeholder={f.notesPlaceholder}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-3 rounded-xl border border-[#dce5f0] bg-white text-xs text-[#1e293b] focus:outline-hidden focus:border-[#063b78] focus:ring-1 focus:ring-[#063b78] resize-none"
            />
          </div>

          {/* Footer Buttons */}
          <div className="pt-3 border-t border-[#edf2f7] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[#64748b] hover:bg-[#edf2f7] transition-colors"
            >
              {dict.keepExpenseBtn}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-[#063b78] text-white text-xs font-bold shadow-xs hover:bg-[#092f63] active:scale-98 transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center gap-1.5"
            >
              {isSubmitting ? dict.saving : dict.saveExpense}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// 2. EDIT EXPENSE MODAL
// ==========================================
export function EditExpenseModal({
  isOpen,
  expense,
  onClose,
  onSuccess,
  categories,
  paymentMethods,
  today,
  lang,
}: {
  isOpen: boolean;
  expense: ExpenseItem | null;
  onClose: () => void;
  onSuccess: () => void;
  categories: CategoryOption[];
  paymentMethods: string[];
  today: string;
  lang: 'en' | 'bn';
}) {
  const dict = DICTIONARY[lang].expenseManagement;
  const f = dict.form;
  const pmDict = DICTIONARY[lang].paymentMethod as Record<string, string>;

  const [date, setDate] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paidTo, setPaidTo] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (expense) {
      setDate(expense.date);
      setCategoryId(expense.category.id);
      setAmount(String(expense.amount));
      setPaymentMethod(expense.paymentMethod);
      setPaidTo(expense.paidTo || '');
      setInvoiceNo(expense.invoiceNo || '');
      setNotes(expense.notes || '');
      setError(null);
    }
  }, [expense]);

  if (!isOpen || !expense) return null;

  if (expense.isSalary) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
        <div className="bg-white rounded-2xl shadow-xl border border-[#dce5f0] w-full max-w-md p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
            <Lock size={24} />
          </div>
          <h3 className="text-base font-bold text-[#063b78]">{dict.salaryExpenseBadge}</h3>
          <p className="text-xs text-[#64748b] leading-relaxed">{dict.salaryLockedNotice}</p>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-[#063b78] text-white text-xs font-bold"
          >
            {dict.keepExpenseBtn}
          </button>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!expense) return;
    setError(null);

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError(dict.errors.invalidAmount);
      return;
    }

    if (date > today) {
      setError(dict.errors.futureDate);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/expenses/${expense.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          categoryId,
          amount: Math.round(numAmount * 100) / 100,
          paymentMethod,
          paidTo: paidTo.trim() || null,
          invoiceNo: invoiceNo.trim() || null,
          notes: notes.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'CASH_SESSION_CLOSED') {
          setError(dict.errors.cashClosed);
        } else {
          setError(data.message || data.error || 'Failed to update expense');
        }
        return;
      }

      onSuccess();
      onClose();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-[#dce5f0] w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#f8fafc] border-b border-[#e2e8f0] flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#063b78]">{dict.editExpense}</h2>
            <p className="text-xs text-[#64748b]">
              {pickLocalized(lang, expense.branch.name, expense.branch.banglaName)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#64748b] hover:bg-[#edf2f7] hover:text-[#063b78] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-4 flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Date */}
            <div>
              <label className="block text-xs font-semibold text-[#092f63] mb-1">
                {f.date} <span className="text-rose-600">*</span>
              </label>
              <input
                type="date"
                max={today}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-xl border border-[#dce5f0] bg-white text-xs font-medium text-[#1e293b] focus:outline-hidden focus:border-[#063b78]"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-semibold text-[#092f63] mb-1">
                {f.category} <span className="text-rose-600">*</span>
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-xl border border-[#dce5f0] bg-white text-xs font-medium text-[#1e293b] focus:outline-hidden focus:border-[#063b78]"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {pickLocalized(lang, c.name, c.banglaName)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Amount */}
            <div>
              <label className="block text-xs font-semibold text-[#092f63] mb-1">
                {f.amount} <span className="text-rose-600">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs font-bold text-[#64748b]">৳</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  className="w-full h-10 pl-7 pr-3 rounded-xl border border-[#dce5f0] bg-white text-xs font-bold text-[#1e293b] focus:outline-hidden focus:border-[#063b78]"
                />
              </div>
            </div>

            {/* Payment Method */}
            <div>
              <label className="block text-xs font-semibold text-[#092f63] mb-1">
                {f.paymentMethod} <span className="text-rose-600">*</span>
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-xl border border-[#dce5f0] bg-white text-xs font-medium text-[#1e293b] focus:outline-hidden focus:border-[#063b78]"
              >
                {paymentMethods.map((pm) => (
                  <option key={pm} value={pm}>
                    {pmDict[pm] ?? pm}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Paid To */}
          <div>
            <label className="block text-xs font-semibold text-[#092f63] mb-1">{f.paidTo}</label>
            <input
              type="text"
              value={paidTo}
              onChange={(e) => setPaidTo(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-[#dce5f0] bg-white text-xs text-[#1e293b] focus:outline-hidden focus:border-[#063b78]"
            />
          </div>

          {/* Invoice / Voucher No */}
          <div>
            <label className="block text-xs font-semibold text-[#092f63] mb-1">{f.invoiceNo}</label>
            <input
              type="text"
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-[#dce5f0] bg-white text-xs text-[#1e293b] focus:outline-hidden focus:border-[#063b78]"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-[#092f63] mb-1">{f.notes}</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-3 rounded-xl border border-[#dce5f0] bg-white text-xs text-[#1e293b] focus:outline-hidden focus:border-[#063b78] resize-none"
            />
          </div>

          {/* Footer Buttons */}
          <div className="pt-3 border-t border-[#edf2f7] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[#64748b] hover:bg-[#edf2f7] transition-colors"
            >
              {dict.keepExpenseBtn}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-[#063b78] text-white text-xs font-bold shadow-xs hover:bg-[#092f63] active:scale-98 transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              {isSubmitting ? dict.saving : dict.updateExpenseBtn}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// 3. CANCEL EXPENSE CONFIRMATION MODAL
// ==========================================
export function CancelExpenseModal({
  isOpen,
  expense,
  onClose,
  onSuccess,
  lang,
}: {
  isOpen: boolean;
  expense: ExpenseItem | null;
  onClose: () => void;
  onSuccess: () => void;
  lang: 'en' | 'bn';
}) {
  const dict = DICTIONARY[lang].expenseManagement;
  const pmDict = DICTIONARY[lang].paymentMethod as Record<string, string>;

  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen || !expense) return null;

  if (expense.isSalary) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
        <div className="bg-white rounded-2xl shadow-xl border border-[#dce5f0] w-full max-w-md p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <Lock size={24} />
          </div>
          <h3 className="text-base font-bold text-[#063b78]">{dict.salaryExpenseBadge}</h3>
          <p className="text-xs text-[#64748b] leading-relaxed">{dict.salaryLockedNotice}</p>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-[#063b78] text-white text-xs font-bold"
          >
            {dict.keepExpenseBtn}
          </button>
        </div>
      </div>
    );
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!expense) return;
    setError(null);

    const cleanReason = reason.trim();
    if (cleanReason.length < 3) {
      setError(dict.errors.reasonTooShort);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/expenses/${expense.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cleanReason }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'CASH_SESSION_CLOSED') {
          setError(dict.errors.cashClosed);
        } else {
          setError(data.message || data.error || 'Failed to cancel expense');
        }
        return;
      }

      onSuccess();
      onClose();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-rose-100 w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 bg-rose-50/70 border-b border-rose-100 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold text-rose-900">{dict.cancelConfirmTitle}</h2>
            <p className="text-xs text-rose-700/80 mt-0.5">{dict.cancelConfirmSub}</p>
          </div>
        </div>

        {/* Content */}
        <form onSubmit={handleConfirm} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-100/70 text-rose-900 text-xs flex items-center gap-2">
              <AlertTriangle size={15} className="shrink-0 text-rose-700" />
              <span>{error}</span>
            </div>
          )}

          {/* Expense Snapshot Box */}
          <div className="p-3.5 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-[#64748b]">{dict.colAmount}:</span>
              <span className="font-extrabold text-[#063b78] text-sm">
                {formatBDTExact(expense.amount, lang)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748b]">{dict.colCategory}:</span>
              <span className="font-semibold text-[#1e293b]">
                {pickLocalized(lang, expense.category.name, expense.category.banglaName)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748b]">{dict.colDate}:</span>
              <span className="text-[#1e293b] font-medium">{expense.date}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748b]">{dict.colMethod}:</span>
              <span className="text-[#1e293b] font-medium">
                {pmDict[expense.paymentMethod] ?? expense.paymentMethod}
              </span>
            </div>
            {expense.paidTo && (
              <div className="flex justify-between">
                <span className="text-[#64748b]">{dict.colPaidTo}:</span>
                <span className="text-[#1e293b] font-medium">{expense.paidTo}</span>
              </div>
            )}
          </div>

          {/* Cancellation Reason */}
          <div>
            <label className="block text-xs font-bold text-[#092f63] mb-1">
              {dict.cancelReasonLabel} <span className="text-rose-600">*</span>
            </label>
            <textarea
              rows={3}
              required
              placeholder={dict.cancelReasonPlaceholder}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full p-3 rounded-xl border border-rose-200 bg-rose-50/20 text-xs text-[#1e293b] focus:outline-hidden focus:border-rose-500 focus:ring-1 focus:ring-rose-500 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[#64748b] hover:bg-[#edf2f7] transition-colors"
            >
              {dict.keepExpenseBtn}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || reason.trim().length < 3}
              className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold shadow-xs hover:bg-rose-700 active:scale-98 transition-all disabled:opacity-50"
            >
              {isSubmitting ? dict.cancelling : dict.confirmCancelBtn}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// 4. EXPENSE DETAIL MODAL
// ==========================================
export function ExpenseDetailModal({
  isOpen,
  expense,
  onClose,
  onEdit,
  onCancel,
  lang,
  currentUser,
}: {
  isOpen: boolean;
  expense: ExpenseItem | null;
  onClose: () => void;
  onEdit: (exp: ExpenseItem) => void;
  onCancel: (exp: ExpenseItem) => void;
  lang: 'en' | 'bn';
  currentUser: SessionUser | null;
}) {
  const dict = DICTIONARY[lang].expenseManagement;
  const pmDict = DICTIONARY[lang].paymentMethod as Record<string, string>;

  if (!isOpen || !expense) return null;

  const canEdit =
    can(currentUser, 'expenses.update') &&
    !expense.isSalary &&
    expense.status === 'ACTIVE';

  const canCancel =
    can(currentUser, 'expenses.cancel') &&
    !expense.isSalary &&
    expense.status === 'ACTIVE';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-[#dce5f0] w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#f8fafc] border-b border-[#e2e8f0] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-[#063b78]">{dict.viewDetail}</h2>
              {expense.isSalary && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {dict.salaryExpenseBadge}
                </span>
              )}
              {expense.status === 'CANCELLED' ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                  {dict.statusCancelled}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {dict.statusActive}
                </span>
              )}
            </div>
            <p className="text-xs text-[#64748b] mt-0.5">
              {pickLocalized(lang, expense.branch.name, expense.branch.banglaName)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#64748b] hover:bg-[#edf2f7] hover:text-[#063b78] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="overflow-y-auto p-6 space-y-4 text-xs">
          {/* Amount Hero */}
          <div className="p-4 rounded-xl bg-[#f5f8fc] border border-[#dce5f0] text-center">
            <span className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider block">
              {dict.colAmount}
            </span>
            <span className="text-2xl font-black text-[#063b78]">
              {formatBDTExact(expense.amount, lang)}
            </span>
          </div>

          {/* Salary Link Notice */}
          {expense.isSalary && (
            <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-800 text-xs flex items-center gap-2">
              <Lock size={16} className="shrink-0 text-indigo-600" />
              <span>{dict.salaryLockedNotice}</span>
            </div>
          )}

          {/* Cancelled Notice */}
          {expense.status === 'CANCELLED' && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 space-y-1.5 text-rose-900">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle size={15} className="text-rose-600" />
                <span>{dict.statusCancelled}</span>
              </div>
              <p className="text-xs">
                <span className="font-semibold text-rose-700">{dict.cancelReasonLabel}: </span>
                {expense.cancelReason || '—'}
              </p>
              {expense.cancelledAt && (
                <p className="text-[11px] text-rose-600">
                  {new Date(expense.cancelledAt).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US')}
                </p>
              )}
            </div>
          )}

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-white border border-[#edf2f7]">
            <div>
              <span className="text-[#64748b] block mb-0.5">{dict.colCategory}</span>
              <span className="font-bold text-[#1e293b]">
                {pickLocalized(lang, expense.category.name, expense.category.banglaName)}
              </span>
            </div>
            <div>
              <span className="text-[#64748b] block mb-0.5">{dict.colDate}</span>
              <span className="font-bold text-[#1e293b]">{expense.date}</span>
            </div>
            <div>
              <span className="text-[#64748b] block mb-0.5">{dict.colMethod}</span>
              <span className="font-semibold text-[#1e293b]">
                {pmDict[expense.paymentMethod] ?? expense.paymentMethod}
              </span>
            </div>
            <div>
              <span className="text-[#64748b] block mb-0.5">{dict.colPaidTo}</span>
              <span className="font-semibold text-[#1e293b]">{expense.paidTo || '—'}</span>
            </div>
            <div>
              <span className="text-[#64748b] block mb-0.5">{dict.colInvoice}</span>
              <span className="font-mono text-[#1e293b]">{expense.invoiceNo || '—'}</span>
            </div>
            <div>
              <span className="text-[#64748b] block mb-0.5">{dict.colCreatedBy}</span>
              <span className="text-[#1e293b]">{expense.createdBy?.name || '—'}</span>
            </div>
          </div>

          {/* Notes */}
          {expense.notes && (
            <div className="p-3.5 rounded-xl bg-[#f8fafc] border border-[#edf2f7]">
              <span className="text-[#64748b] font-semibold block mb-1">{dict.colNotes}</span>
              <p className="text-[#334155] whitespace-pre-wrap">{expense.notes}</p>
            </div>
          )}

          {/* Action Footer */}
          <div className="pt-3 border-t border-[#edf2f7] flex items-center justify-between">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[#64748b] hover:bg-[#edf2f7] transition-colors"
            >
              Close
            </button>
            <div className="flex items-center gap-2">
              {canCancel && (
                <button
                  onClick={() => {
                    onClose();
                    onCancel(expense);
                  }}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors"
                >
                  {dict.cancelExpense}
                </button>
              )}
              {canEdit && (
                <button
                  onClick={() => {
                    onClose();
                    onEdit(expense);
                  }}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-[#063b78] bg-[#edf2f9] hover:bg-[#e0ecfa] border border-[#cde0f5] transition-colors"
                >
                  {dict.editExpense}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 5. MANAGE CATEGORIES MODAL
// ==========================================
export function ManageCategoriesModal({
  isOpen,
  onClose,
  onSuccess,
  lang,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  lang: 'en' | 'bn';
}) {
  const dict = DICTIONARY[lang].expenseManagement.categories;
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form state
  const [newName, setNewName] = useState('');
  const [newBanglaName, setNewBanglaName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Edit form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editBanglaName, setEditBanglaName] = useState('');

  async function loadCategories() {
    setIsLoading(true);
    try {
      const res = await fetch('/api/expenses/categories?includeInactive=true');
      const data = await res.json();
      if (res.ok) {
        setCategories(data.categories);
      } else {
        setError(data.message || 'Failed to load categories');
      }
    } catch {
      setError('Network error');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadCategories();
      setError(null);
      setNewName('');
      setNewBanglaName('');
      setEditingId(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setIsAdding(true);
    setError(null);
    try {
      const res = await fetch('/api/expenses/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          banglaName: newBanglaName.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Failed to add category');
        return;
      }
      setNewName('');
      setNewBanglaName('');
      await loadCategories();
      onSuccess();
    } catch {
      setError('Network error');
    } finally {
      setIsAdding(false);
    }
  }

  async function handleToggleActive(cat: CategoryOption) {
    if (cat.isProtected) return;
    setError(null);
    try {
      const res = await fetch(`/api/expenses/categories/${cat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !cat.isActive }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.message || 'Failed to update category');
        return;
      }
      await loadCategories();
      onSuccess();
    } catch {
      setError('Network error');
    }
  }

  async function handleSaveEdit(catId: string) {
    if (!editName.trim()) return;
    setError(null);
    try {
      const res = await fetch(`/api/expenses/categories/${catId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          banglaName: editBanglaName.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.message || 'Failed to update category');
        return;
      }
      setEditingId(null);
      await loadCategories();
      onSuccess();
    } catch {
      setError('Network error');
    }
  }

  async function handleDelete(cat: CategoryOption) {
    if ((cat.expenseCount ?? 0) > 0 || cat.isProtected) {
      setError(dict.cannotDeleteHasExpenses);
      return;
    }
    if (!confirm(`Delete category "${cat.name}"?`)) return;

    setError(null);
    try {
      const res = await fetch(`/api/expenses/categories/${cat.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.message || 'Failed to delete category');
        return;
      }
      await loadCategories();
      onSuccess();
    } catch {
      setError('Network error');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-[#dce5f0] w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#f8fafc] border-b border-[#e2e8f0] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#edf2f9] text-[#063b78] flex items-center justify-center">
              <Layers size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#063b78]">{dict.title}</h2>
              <p className="text-xs text-[#64748b]">{dict.subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#64748b] hover:bg-[#edf2f7] hover:text-[#063b78] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-6 space-y-5 flex-1 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertTriangle size={15} className="shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Add Category Form */}
          <form
            onSubmit={handleAddCategory}
            className="p-4 rounded-xl bg-[#f5f8fc] border border-[#dce5f0] space-y-3"
          >
            <h4 className="text-xs font-bold text-[#063b78] flex items-center gap-1.5">
              <Plus size={14} />
              <span>{dict.addCategory}</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <input
                  type="text"
                  placeholder={dict.name}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  className="w-full h-9 px-3 rounded-xl border border-[#dce5f0] bg-white text-xs text-[#1e293b] focus:outline-hidden focus:border-[#063b78]"
                />
              </div>
              <div>
                <input
                  type="text"
                  placeholder={dict.banglaName}
                  value={newBanglaName}
                  onChange={(e) => setNewBanglaName(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-[#dce5f0] bg-white text-xs text-[#1e293b] focus:outline-hidden focus:border-[#063b78]"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isAdding || !newName.trim()}
                className="px-4 py-1.5 rounded-xl bg-[#063b78] text-white text-xs font-bold hover:bg-[#092f63] disabled:opacity-50 transition-colors"
              >
                {isAdding ? 'Adding...' : dict.addCategory}
              </button>
            </div>
          </form>

          {/* Categories List */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-[#64748b] uppercase tracking-wider">
              Available Categories ({categories.length})
            </h4>

            {isLoading ? (
              <div className="py-8 text-center text-xs text-[#64748b]">Loading categories...</div>
            ) : categories.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#64748b]">No categories found.</div>
            ) : (
              <div className="divide-y divide-[#edf2f7] border border-[#edf2f7] rounded-xl overflow-hidden">
                {categories.map((cat) => {
                  const isEditing = editingId === cat.id;

                  return (
                    <div
                      key={cat.id}
                      className={`p-3 flex items-center justify-between gap-3 ${
                        cat.isActive ? 'bg-white' : 'bg-[#f8fafc] opacity-75'
                      }`}
                    >
                      {/* Name area */}
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="h-8 px-2 border rounded-lg text-xs w-1/2"
                            />
                            <input
                              type="text"
                              value={editBanglaName}
                              onChange={(e) => setEditBanglaName(e.target.value)}
                              className="h-8 px-2 border rounded-lg text-xs w-1/2"
                            />
                            <button
                              onClick={() => handleSaveEdit(cat.id)}
                              className="px-2.5 py-1 bg-[#063b78] text-white rounded-lg text-xs font-bold"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="px-2 py-1 text-[#64748b] text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-[#1e293b]">
                              {cat.name}
                            </span>
                            {cat.banglaName && (
                              <span className="text-[#64748b] text-[11px]">
                                ({cat.banglaName})
                              </span>
                            )}
                            {cat.isProtected && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                {dict.systemProtected}
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#f1f5f9] text-[#64748b]">
                              {cat.expenseCount ?? 0} {dict.expensesCount}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      {!isEditing && (
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Active / Inactive Toggle */}
                          {cat.isProtected ? (
                            <span className="text-[11px] font-medium text-emerald-700 flex items-center gap-1">
                              <CheckCircle2 size={13} /> {dict.active}
                            </span>
                          ) : (
                            <button
                              onClick={() => handleToggleActive(cat)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                                cat.isActive
                                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                              }`}
                            >
                              {cat.isActive ? dict.active : dict.inactive}
                            </button>
                          )}

                          {/* Edit button */}
                          <button
                            onClick={() => {
                              setEditingId(cat.id);
                              setEditName(cat.name);
                              setEditBanglaName(cat.banglaName || '');
                            }}
                            className="p-1.5 rounded-lg text-[#64748b] hover:bg-[#edf2f7] hover:text-[#063b78] transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={14} />
                          </button>

                          {/* Delete button (only if 0 expenses and not system protected) */}
                          {!cat.isProtected && (cat.expenseCount ?? 0) === 0 && (
                            <button
                              onClick={() => handleDelete(cat)}
                              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
