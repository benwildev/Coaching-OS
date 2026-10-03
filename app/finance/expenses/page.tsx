'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import FinanceSubNav from '@/components/FinanceSubNav';
import ForbiddenState from '@/components/ForbiddenState';
import { useApp } from '@/lib/store';
import {
  DICTIONARY,
  formatBDTExact,
  pickLocalized,
} from '@/lib/i18n';
import { can } from '@/lib/auth/permissions';
import {
  Plus,
  Layers,
  Search,
  Filter,
  Calendar,
  AlertCircle,
  Eye,
  Edit2,
  Trash2,
  CheckCircle2,
  Lock,
  ArrowRight,
  TrendingDown,
  Wallet,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import {
  AddExpenseModal,
  EditExpenseModal,
  CancelExpenseModal,
  ExpenseDetailModal,
  ManageCategoriesModal,
  type ExpenseItem,
  type CategoryOption,
  type BranchOption,
} from '@/components/finance/ExpenseModals';

type Preset = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'all' | 'custom';
const PRESETS: Preset[] = ['today', 'yesterday', 'thisWeek', 'thisMonth', 'lastMonth', 'thisYear', 'all', 'custom'];

const todayDhaka = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
const shift = (ymd: string, n: number) =>
  new Date(new Date(`${ymd}T00:00:00.000Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

function presetRange(p: Exclude<Preset, 'custom' | 'all'>): { from: string; to: string } {
  const today = todayDhaka();
  if (p === 'today') return { from: today, to: today };
  if (p === 'yesterday') return { from: shift(today, -1), to: shift(today, -1) };
  if (p === 'thisWeek') {
    // Bangladesh week starts on Saturday
    const dow = new Date(`${today}T00:00:00.000Z`).getUTCDay();
    return { from: shift(today, -((dow + 1) % 7)), to: today };
  }
  if (p === 'thisMonth') return { from: `${today.slice(0, 8)}01`, to: today };
  if (p === 'lastMonth') {
    const firstThis = `${today.slice(0, 8)}01`;
    const lastPrev = shift(firstThis, -1);
    return { from: `${lastPrev.slice(0, 8)}01`, to: lastPrev };
  }
  return { from: `${today.slice(0, 4)}-01-01`, to: today };
}

export default function ExpensesPage() {
  const { lang, currentUser } = useApp();
  const dict = DICTIONARY[lang].expenseManagement;
  const financeDict = DICTIONARY[lang].finance;
  const pmDict = DICTIONARY[lang].paymentMethod as Record<string, string>;

  // Access check
  const hasReadPermission = can(currentUser, 'expenses.read');
  const canCreate = can(currentUser, 'expenses.create');
  const canManageCategories = can(currentUser, 'expenses.categories.manage');

  // Filter States
  const [preset, setPreset] = useState<Preset>('thisMonth');
  const [dateFrom, setDateFrom] = useState(() => presetRange('thisMonth').from);
  const [dateTo, setDateTo] = useState(() => presetRange('thisMonth').to);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('ACTIVE');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  // Data States
  const [items, setItems] = useState<ExpenseItem[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, totalCount: 0, totalPages: 1 });
  const [summary, setSummary] = useState({ totalExpenses: 0, cashExpenses: 0, nonCashExpenses: 0, activeCount: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Options States
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [todayDate, setTodayDate] = useState(() => todayDhaka());
  const [branchLocked, setBranchLocked] = useState(false);
  const [effectiveBranchId, setEffectiveBranchId] = useState<string | null>(null);

  // Modal States
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseItem | null>(null);
  const [cancellingExpense, setCancellingExpense] = useState<ExpenseItem | null>(null);
  const [detailExpense, setDetailExpense] = useState<ExpenseItem | null>(null);

  // Load Dropdown Options
  const loadOptions = useCallback(async () => {
    try {
      const res = await fetch('/api/expenses/options');
      const data = await res.json();
      if (res.ok) {
        setCategories(data.categories || []);
        setBranches(data.branches || []);
        setPaymentMethods(data.paymentMethods || []);
        if (data.today) setTodayDate(data.today);
        setBranchLocked(Boolean(data.branchLocked));
        setEffectiveBranchId(data.effectiveBranchId || null);
        if (data.branchLocked && data.effectiveBranchId) {
          setSelectedBranchId(data.effectiveBranchId);
        }
      }
    } catch {
      // silently ignore option load failure
    }
  }, []);

  useEffect(() => {
    if (hasReadPermission) {
      loadOptions();
    }
  }, [hasReadPermission, loadOptions]);

  // Handle Preset Change
  function handlePresetChange(p: Preset) {
    setPreset(p);
    setPage(1);
    if (p === 'all') {
      setDateFrom('');
      setDateTo('');
    } else if (p !== 'custom') {
      const r = presetRange(p);
      setDateFrom(r.from);
      setDateTo(r.to);
    }
  }

  // Load Expenses Data
  const loadExpenses = useCallback(async () => {
    if (!hasReadPermission) return;
    setIsLoading(true);
    setError(null);

    const queryParams = new URLSearchParams();
    if (dateFrom) queryParams.set('dateFrom', dateFrom);
    if (dateTo) queryParams.set('dateTo', dateTo);
    if (selectedBranchId && selectedBranchId !== 'all') queryParams.set('branchId', selectedBranchId);
    if (selectedCategoryId && selectedCategoryId !== 'all') queryParams.set('categoryId', selectedCategoryId);
    if (selectedPaymentMethod && selectedPaymentMethod !== 'all') queryParams.set('paymentMethod', selectedPaymentMethod);
    if (selectedStatus && selectedStatus !== 'ALL') queryParams.set('status', selectedStatus);
    if (searchQuery.trim()) queryParams.set('search', searchQuery.trim());
    queryParams.set('page', String(page));
    queryParams.set('pageSize', '20');

    try {
      const res = await fetch(`/api/expenses?${queryParams.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Failed to load expenses');
        return;
      }

      setItems(data.items || []);
      setPagination(data.pagination || { page: 1, pageSize: 20, totalCount: 0, totalPages: 1 });
      setSummary(data.summary || { totalExpenses: 0, cashExpenses: 0, nonCashExpenses: 0, activeCount: 0 });
    } catch {
      setError('Network error while loading expenses');
    } finally {
      setIsLoading(false);
    }
  }, [
    hasReadPermission,
    dateFrom,
    dateTo,
    selectedBranchId,
    selectedCategoryId,
    selectedPaymentMethod,
    selectedStatus,
    searchQuery,
    page,
  ]);

  useEffect(() => {
    if (hasReadPermission) {
      loadExpenses();
    }
  }, [hasReadPermission, loadExpenses]);

  // Reset Filters
  function handleResetFilters() {
    setPreset('thisMonth');
    const r = presetRange('thisMonth');
    setDateFrom(r.from);
    setDateTo(r.to);
    setSelectedBranchId(effectiveBranchId || 'all');
    setSelectedCategoryId('all');
    setSelectedPaymentMethod('all');
    setSelectedStatus('ACTIVE');
    setSearchQuery('');
    setPage(1);
  }

  if (!hasReadPermission) {
    return <ForbiddenState />;
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title={dict.title}
        subtitle={dict.subtitle}
      >
        <div className="flex items-center gap-2">
          {canManageCategories && (
            <button
              onClick={() => setIsCategoriesOpen(true)}
              className="h-9.5 px-3.5 rounded-xl border border-[#dce5f0] bg-white text-xs font-bold text-[#063b78] hover:bg-[#edf2f9] shadow-2xs transition-colors flex items-center gap-1.5"
            >
              <Layers size={15} />
              <span>{dict.manageCategories}</span>
            </button>
          )}
          {canCreate && (
            <button
              onClick={() => setIsAddOpen(true)}
              className="h-9.5 px-4 rounded-xl bg-[#063b78] text-white text-xs font-bold shadow-xs hover:bg-[#092f63] active:scale-98 transition-all flex items-center gap-1.5"
            >
              <Plus size={16} />
              <span>{dict.addExpense}</span>
            </button>
          )}
        </div>
      </PageHeader>

      {/* Sub Navigation */}
      <FinanceSubNav />

      {/* Operational Summary Cards (Requirement 14 & 29) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Expenses */}
        <div className="bg-white p-5 rounded-2xl border border-[#dce5f0] shadow-2xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#64748b]">
              {dict.totalExpenses}
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <TrendingDown size={18} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-[#063b78] block">
              {formatBDTExact(summary.totalExpenses, lang)}
            </span>
            <span className="text-[11px] font-medium text-[#64748b] mt-0.5 block">
              {summary.activeCount} {lang === 'bn' ? 'টি সক্রিয় খরচ' : 'active expenses'}
            </span>
          </div>
        </div>

        {/* Cash Expenses */}
        <div className="bg-white p-5 rounded-2xl border border-[#dce5f0] shadow-2xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#64748b]">
              {dict.cashExpenses}
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Wallet size={18} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-[#1e293b] block">
              {formatBDTExact(summary.cashExpenses, lang)}
            </span>
            <span className="text-[11px] font-medium text-[#64748b] mt-0.5 block">
              {lang === 'bn' ? 'ক্যাশ বক্স থেকে খরচ' : 'Affects cash box directly'}
            </span>
          </div>
        </div>

        {/* Non-Cash Expenses */}
        <div className="bg-white p-5 rounded-2xl border border-[#dce5f0] shadow-2xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#64748b]">
              {dict.nonCashExpenses}
            </span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <CreditCard size={18} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-[#1e293b] block">
              {formatBDTExact(summary.nonCashExpenses, lang)}
            </span>
            <span className="text-[11px] font-medium text-[#64748b] mt-0.5 block">
              {lang === 'bn' ? 'বিকাশ, নগদ, ব্যাংক ইত্যাদি' : 'bKash, Nagad, Bank, etc.'}
            </span>
          </div>
        </div>
      </div>

      {/* Filter Bar (Requirement 13) */}
      <div className="bg-white p-4.5 rounded-2xl border border-[#dce5f0] shadow-2xs space-y-3.5">
        {/* Date presets row */}
        <div className="flex items-center gap-1.5 overflow-x-auto hs pb-1">
          {PRESETS.map((p) => {
            const active = preset === p;
            const label = p === 'all' ? dict.filterAll : (financeDict.range as Record<string, string>)[p] ?? p;
            return (
              <button
                key={p}
                onClick={() => handlePresetChange(p)}
                className={`h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-[#063b78] text-white font-bold shadow-2xs'
                    : 'text-[#64748b] hover:bg-[#edf2f7] hover:text-[#063b78]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Custom date range if preset is custom */}
        {preset === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-[#edf2f7]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#64748b]">{financeDict.from}:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="h-8.5 px-2.5 rounded-lg border border-[#dce5f0] text-xs font-medium text-[#1e293b] focus:outline-hidden focus:border-[#063b78]"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#64748b]">{financeDict.to}:</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="h-8.5 px-2.5 rounded-lg border border-[#dce5f0] text-xs font-medium text-[#1e293b] focus:outline-hidden focus:border-[#063b78]"
              />
            </div>
          </div>
        )}

        {/* Dropdown Filters Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1 border-t border-[#edf2f7]">
          {/* Branch Filter */}
          <div>
            <select
              value={selectedBranchId}
              onChange={(e) => {
                setSelectedBranchId(e.target.value);
                setPage(1);
              }}
              disabled={branchLocked}
              className="w-full h-9 px-3 rounded-xl border border-[#dce5f0] bg-white text-xs font-semibold text-[#092f63] focus:outline-hidden focus:border-[#063b78] disabled:bg-[#f1f5f9]"
            >
              {!branchLocked && <option value="all">{financeDict.allBranches}</option>}
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {pickLocalized(lang, b.name, b.banglaName)}
                </option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={selectedCategoryId}
              onChange={(e) => {
                setSelectedCategoryId(e.target.value);
                setPage(1);
              }}
              className="w-full h-9 px-3 rounded-xl border border-[#dce5f0] bg-white text-xs font-semibold text-[#092f63] focus:outline-hidden focus:border-[#063b78]"
            >
              <option value="all">
                {lang === 'bn' ? 'সকল ক্যাটাগরি' : 'All Categories'}
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {pickLocalized(lang, c.name, c.banglaName)}
                </option>
              ))}
            </select>
          </div>

          {/* Payment Method Filter */}
          <div>
            <select
              value={selectedPaymentMethod}
              onChange={(e) => {
                setSelectedPaymentMethod(e.target.value);
                setPage(1);
              }}
              className="w-full h-9 px-3 rounded-xl border border-[#dce5f0] bg-white text-xs font-semibold text-[#092f63] focus:outline-hidden focus:border-[#063b78]"
            >
              <option value="all">
                {lang === 'bn' ? 'সকল মাধ্যম' : 'All Payment Methods'}
              </option>
              {paymentMethods.map((pm) => (
                <option key={pm} value={pm}>
                  {pmDict[pm] ?? pm}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
              className="w-full h-9 px-3 rounded-xl border border-[#dce5f0] bg-white text-xs font-semibold text-[#092f63] focus:outline-hidden focus:border-[#063b78]"
            >
              <option value="ACTIVE">{dict.statusActive}</option>
              <option value="CANCELLED">{dict.statusCancelled}</option>
              <option value="ALL">{dict.allExpenses}</option>
            </select>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-[#64748b]" />
            <input
              type="text"
              placeholder={dict.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full h-9 pl-8 pr-3 rounded-xl border border-[#dce5f0] bg-white text-xs text-[#1e293b] focus:outline-hidden focus:border-[#063b78]"
            />
          </div>
        </div>
      </div>

      {/* Main Expense List & Table Area (Requirement 12, 31, 32) */}
      <div className="bg-white rounded-2xl border border-[#dce5f0] shadow-2xs overflow-hidden">
        {/* Table/Card Header */}
        <div className="px-5 py-3.5 bg-[#f8fafc] border-b border-[#e2e8f0] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#063b78]">
              {dict.title} ({pagination.totalCount})
            </h3>
            {isLoading && (
              <RefreshCw size={13} className="animate-spin text-[#063b78]" />
            )}
          </div>
          {(selectedCategoryId !== 'all' ||
            selectedPaymentMethod !== 'all' ||
            selectedStatus !== 'ACTIVE' ||
            searchQuery.trim() !== '') && (
            <button
              onClick={handleResetFilters}
              className="text-xs font-semibold text-[#063b78] hover:underline"
            >
              {lang === 'bn' ? 'ফিল্টার মুছুন' : 'Clear Filters'}
            </button>
          )}
        </div>

        {error ? (
          <div className="p-8 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <AlertCircle size={20} />
            </div>
            <p className="text-xs text-rose-700 font-semibold">{error}</p>
            <button
              onClick={loadExpenses}
              className="text-xs text-[#063b78] underline font-bold"
            >
              Retry
            </button>
          </div>
        ) : isLoading && items.length === 0 ? (
          <div className="py-16 text-center text-xs text-[#64748b]">
            <RefreshCw size={24} className="animate-spin text-[#063b78] mx-auto mb-2" />
            <span>Loading expenses...</span>
          </div>
        ) : items.length === 0 ? (
          /* Empty States (Requirement 31) */
          <div className="py-16 px-4 text-center max-w-md mx-auto space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#edf2f9] text-[#063b78] flex items-center justify-center mx-auto">
              <TrendingDown size={22} />
            </div>
            <h4 className="text-base font-bold text-[#063b78]">
              {searchQuery || selectedCategoryId !== 'all' || selectedPaymentMethod !== 'all'
                ? dict.noMatch
                : dict.noExpensesYet}
            </h4>
            <p className="text-xs text-[#64748b] leading-relaxed">
              {searchQuery || selectedCategoryId !== 'all' || selectedPaymentMethod !== 'all'
                ? (lang === 'bn' ? 'অনুগ্রহ করে ভিন্ন ফিল্টার বা অনুসন্ধান শব্দ ব্যবহার করুন।' : 'Please try adjusting your filters or search keywords.')
                : dict.noExpensesSub}
            </p>
            {canCreate && !(searchQuery || selectedCategoryId !== 'all') && (
              <button
                onClick={() => setIsAddOpen(true)}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#063b78] text-white text-xs font-bold shadow-xs hover:bg-[#092f63] transition-colors"
              >
                <Plus size={15} />
                <span>{dict.addExpense}</span>
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-[#edf2f7] bg-[#fcfdfe] text-[11px] font-bold uppercase tracking-wider text-[#64748b]">
                    <th className="px-5 py-3">{dict.colDate}</th>
                    <th className="px-4 py-3">{dict.colCategory}</th>
                    <th className="px-4 py-3">{dict.colPaidTo}</th>
                    <th className="px-4 py-3">{dict.colMethod}</th>
                    <th className="px-4 py-3 text-right">{dict.colAmount}</th>
                    <th className="px-4 py-3">{dict.colBranch}</th>
                    <th className="px-4 py-3 text-center">{dict.colStatus}</th>
                    <th className="px-5 py-3 text-right">{dict.colActions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf2f7]">
                  {items.map((exp) => {
                    const isCancelled = exp.status === 'CANCELLED';

                    return (
                      <tr
                        key={exp.id}
                        className={`hover:bg-[#f8fafc] transition-colors ${
                          isCancelled ? 'bg-rose-50/20 opacity-70' : ''
                        }`}
                      >
                        {/* Date */}
                        <td className="px-5 py-3 font-medium text-[#334155] whitespace-nowrap">
                          {exp.date}
                        </td>

                        {/* Category */}
                        <td className="px-4 py-3 font-semibold text-[#1e293b]">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>
                              {pickLocalized(lang, exp.category.name, exp.category.banglaName)}
                            </span>
                            {exp.isSalary && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                {dict.salaryExpenseBadge}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Paid To */}
                        <td className="px-4 py-3 text-[#334155]">
                          <div>
                            <span className="font-medium block">{exp.paidTo || '—'}</span>
                            {exp.invoiceNo && (
                              <span className="text-[10.5px] font-mono text-[#64748b] block">
                                #{exp.invoiceNo}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Method */}
                        <td className="px-4 py-3">
                          <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#f1f5f9] text-[#334155]">
                            {pmDict[exp.paymentMethod] ?? exp.paymentMethod}
                          </span>
                        </td>

                        {/* Amount */}
                        <td className="px-4 py-3 text-right font-extrabold text-[#063b78] text-[13px] whitespace-nowrap">
                          <span className={isCancelled ? 'line-through text-rose-600/70' : ''}>
                            {formatBDTExact(exp.amount, lang)}
                          </span>
                        </td>

                        {/* Branch */}
                        <td className="px-4 py-3 text-[#64748b] whitespace-nowrap">
                          {pickLocalized(lang, exp.branch.name, exp.branch.banglaName)}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          {isCancelled ? (
                            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              {dict.statusCancelled}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {dict.statusActive}
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Detail Button */}
                            <button
                              onClick={() => setDetailExpense(exp)}
                              className="p-1.5 rounded-lg text-[#64748b] hover:bg-[#edf2f7] hover:text-[#063b78] transition-colors"
                              title={dict.viewDetail}
                            >
                              <Eye size={15} />
                            </button>

                            {/* Edit Button (active manual only) */}
                            {!isCancelled && !exp.isSalary && can(currentUser, 'expenses.update') && (
                              <button
                                onClick={() => setEditingExpense(exp)}
                                className="p-1.5 rounded-lg text-[#64748b] hover:bg-[#edf2f7] hover:text-[#063b78] transition-colors"
                                title={dict.editExpense}
                              >
                                <Edit2 size={15} />
                              </button>
                            )}

                            {/* Cancel Button (active manual only) */}
                            {!isCancelled && !exp.isSalary && can(currentUser, 'expenses.cancel') && (
                              <button
                                onClick={() => setCancellingExpense(exp)}
                                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors"
                                title={dict.cancelExpense}
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View (Requirement 32) */}
            <div className="md:hidden divide-y divide-[#edf2f7]">
              {items.map((exp) => {
                const isCancelled = exp.status === 'CANCELLED';

                return (
                  <div
                    key={exp.id}
                    onClick={() => setDetailExpense(exp)}
                    className={`p-4 space-y-2.5 active:bg-[#f8fafc] transition-colors ${
                      isCancelled ? 'bg-rose-50/20' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#64748b]">{exp.date}</span>
                      <div className="flex items-center gap-1.5">
                        {exp.isSalary && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700">
                            {dict.salaryExpenseBadge}
                          </span>
                        )}
                        {isCancelled ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700">
                            {dict.statusCancelled}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
                            {dict.statusActive}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-bold text-[#1e293b]">
                          {pickLocalized(lang, exp.category.name, exp.category.banglaName)}
                        </h4>
                        {exp.paidTo && (
                          <p className="text-xs text-[#64748b] mt-0.5">
                            {dict.colPaidTo}: <span className="font-medium text-[#334155]">{exp.paidTo}</span>
                          </p>
                        )}
                        {exp.invoiceNo && (
                          <p className="text-[11px] font-mono text-[#64748b]">
                            #{exp.invoiceNo}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <span
                          className={`text-base font-black text-[#063b78] ${
                            isCancelled ? 'line-through text-rose-600/70' : ''
                          }`}
                        >
                          {formatBDTExact(exp.amount, lang)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-[#edf2f7] text-[11px] text-[#64748b]">
                      <span className="px-2 py-0.5 rounded bg-[#f1f5f9] font-medium text-[#334155]">
                        {pmDict[exp.paymentMethod] ?? exp.paymentMethod}
                      </span>
                      <span>{pickLocalized(lang, exp.branch.name, exp.branch.banglaName)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <div className="px-5 py-3.5 bg-[#f8fafc] border-t border-[#edf2f7] flex items-center justify-between text-xs text-[#64748b]">
                <span>
                  Page {pagination.page} of {pagination.totalPages} ({pagination.totalCount} items)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={pagination.page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg border border-[#dce5f0] bg-white text-[#063b78] hover:bg-[#edf2f7] disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                    className="p-1.5 rounded-lg border border-[#dce5f0] bg-white text-[#063b78] hover:bg-[#edf2f7] disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      <AddExpenseModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSuccess={() => {
          loadExpenses();
          loadOptions();
        }}
        categories={categories}
        branches={branches}
        paymentMethods={paymentMethods}
        today={todayDate}
        branchLocked={branchLocked}
        effectiveBranchId={effectiveBranchId}
        lang={lang}
      />

      <EditExpenseModal
        isOpen={Boolean(editingExpense)}
        expense={editingExpense}
        onClose={() => setEditingExpense(null)}
        onSuccess={() => {
          loadExpenses();
        }}
        categories={categories}
        paymentMethods={paymentMethods}
        today={todayDate}
        lang={lang}
      />

      <CancelExpenseModal
        isOpen={Boolean(cancellingExpense)}
        expense={cancellingExpense}
        onClose={() => setCancellingExpense(null)}
        onSuccess={() => {
          loadExpenses();
        }}
        lang={lang}
      />

      <ExpenseDetailModal
        isOpen={Boolean(detailExpense)}
        expense={detailExpense}
        onClose={() => setDetailExpense(null)}
        onEdit={(exp) => setEditingExpense(exp)}
        onCancel={(exp) => setCancellingExpense(exp)}
        lang={lang}
        currentUser={currentUser}
      />

      <ManageCategoriesModal
        isOpen={isCategoriesOpen}
        onClose={() => setIsCategoriesOpen(false)}
        onSuccess={() => {
          loadOptions();
          loadExpenses();
        }}
        lang={lang}
      />
    </div>
  );
}
