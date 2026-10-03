'use client';

import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import FinanceSubNav from '@/components/FinanceSubNav';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatBDTExact, pickLocalized } from '@/lib/i18n';
import Icon from '@/components/Icon';

interface CashBoxData {
  branch: {
    id: string | null;
    locked: boolean;
    options: Array<{ id: string; name: string; banglaName: string | null }>;
  };
  date: string;
  session: {
    id: string;
    businessDate: string;
    branchId: string;
    branchName: string;
    branchBanglaName: string | null;
    status: 'OPEN' | 'CLOSED';
    openingCash: number;
    expectedCash: number | null;
    countedCash: number | null;
    difference: number | null;
    note: string | null;
    openedByName: string | null;
    closedByName: string | null;
    openedAt: string;
    closedAt: string | null;
  } | null;
  movements: {
    cashCollections: number;
    cashRefunds: number;
    cashExpenses: number;
    netMovement: number;
  };
  history: Array<{
    id: string;
    businessDate: string;
    branchId: string;
    branchName: string;
    branchBanglaName: string | null;
    status: 'OPEN' | 'CLOSED';
    openingCash: number;
    expectedCash: number | null;
    countedCash: number | null;
    difference: number | null;
    note: string | null;
    openedByName: string | null;
    closedByName: string | null;
    closedAt: string | null;
  }>;
}

export default function CashBoxPage() {
  const { lang } = useApp();
  const dict = DICTIONARY[lang].finance;

  const [data, setData] = useState<CashBoxData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');

  // Modals state
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [openAmount, setOpenAmount] = useState<string>('0');
  const [openSubmitting, setOpenSubmitting] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const [showCloseModal, setShowCloseModal] = useState(false);
  const [countedAmount, setCountedAmount] = useState<string>('');
  const [closeNote, setCloseNote] = useState<string>('');
  const [closeSubmitting, setCloseSubmitting] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (selectedBranchId) q.set('branchId', selectedBranchId);
      if (selectedDate) q.set('date', selectedDate);
      const res = await fetch(`/api/finance/cash-box?${q.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.message || dict.loadFailed);
        return;
      }
      setData(json);
      if (!selectedBranchId && json.branch.id) {
        setSelectedBranchId(json.branch.id);
      }
      if (!selectedDate && json.date) {
        setSelectedDate(json.date);
      }
    } catch {
      setError(dict.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [selectedBranchId, selectedDate, dict.loadFailed]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleOpenSession(e: React.FormEvent) {
    e.preventDefault();
    setOpenSubmitting(true);
    setOpenError(null);
    try {
      const amt = Number(openAmount);
      if (isNaN(amt) || amt < 0) {
        setOpenError(lang === 'bn' ? 'শুরুর ক্যাশ শূন্য বা তার বেশি হতে হবে' : 'Opening cash must be 0 or greater');
        setOpenSubmitting(false);
        return;
      }
      const branchToUse = selectedBranchId || data?.branch.id;
      if (!branchToUse) {
        setOpenError(lang === 'bn' ? 'ব্রাঞ্চ নির্বাচন করুন' : 'Select a branch');
        setOpenSubmitting(false);
        return;
      }
      const res = await fetch('/api/finance/cash-box', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: branchToUse,
          openingCash: amt,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setOpenError(json.message || json.error || (lang === 'bn' ? 'সেশন খুলতে ব্যর্থ হয়েছে' : 'Failed to open session'));
        setOpenSubmitting(false);
        return;
      }
      setShowOpenModal(false);
      setOpenAmount('0');
      await loadData();
    } catch {
      setOpenError(lang === 'bn' ? 'নেটওয়ার্ক ত্রুটি' : 'Network error');
    } finally {
      setOpenSubmitting(false);
    }
  }

  async function handleCloseSession(e: React.FormEvent) {
    e.preventDefault();
    if (!data?.session) return;
    setCloseSubmitting(true);
    setCloseError(null);

    const counted = Number(countedAmount);
    if (isNaN(counted) || counted < 0) {
      setCloseError(lang === 'bn' ? 'গুনে পাওয়া ক্যাশ ০ বা তার বেশি হতে হবে' : 'Counted cash must be 0 or greater');
      setCloseSubmitting(false);
      return;
    }

    const expected = data.session.expectedCash ?? 0;
    const diff = Math.round((counted - expected) * 100) / 100;
    if (Math.abs(diff) > 0.005 && !closeNote.trim()) {
      setCloseError(dict.discrepancyNoteRequired || (lang === 'bn' ? 'ক্যাশের অমিল থাকলে নোট লেখা আবশ্যক' : 'A note is required when there is a cash difference'));
      setCloseSubmitting(false);
      return;
    }

    try {
      const res = await fetch('/api/finance/cash-box/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: data.session.id,
          countedCash: counted,
          note: closeNote.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setCloseError(json.message || json.error || (lang === 'bn' ? 'সেশন বন্ধ করতে ব্যর্থ হয়েছে' : 'Failed to close session'));
        setCloseSubmitting(false);
        return;
      }
      setShowCloseModal(false);
      setCountedAmount('');
      setCloseNote('');
      await loadData();
    } catch {
      setCloseError(lang === 'bn' ? 'নেটওয়ার্ক ত্রুটি' : 'Network error');
    } finally {
      setCloseSubmitting(false);
    }
  }

  // Real-time difference in close modal
  const liveCounted = Number(countedAmount);
  const liveExpected = data?.session?.expectedCash ?? 0;
  const hasLiveCounted = countedAmount.trim() !== '' && !isNaN(liveCounted);
  const liveDiff = hasLiveCounted ? Math.round((liveCounted - liveExpected) * 100) / 100 : 0;

  return (
    <div className="space-y-5 pb-12 max-w-7xl mx-auto px-3 sm:px-6">
      {/* Header with SubNav */}
      <div>
        <PageHeader
          title={dict.cashBoxTitle || (lang === 'bn' ? 'ক্যাশ বক্স' : 'Cash Box')}
          subtitle={dict.cashBoxSubtitle || (lang === 'bn' ? 'দৈনিক ক্যাশ শুরু, জমা, খরচ, গণনা ও ক্যাশ মেলানো' : 'Daily cash opening, collections, expenses, count and reconciliation')}
        />
        <div className="mt-3">
          <FinanceSubNav />
        </div>
      </div>

      {/* Control Bar: Branch & Date selection */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Branch Picker */}
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">{dict.branch}</label>
            <select
              value={selectedBranchId}
              disabled={data?.branch.locked}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="text-xs font-semibold px-3 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#063b78] disabled:bg-slate-50"
            >
              {data?.branch.options.map((b) => (
                <option key={b.id} value={b.id}>
                  {pickLocalized(lang, b.name, b.banglaName)}
                </option>
              ))}
            </select>
          </div>

          {/* Date Picker */}
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">{dict.colDate}</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs font-semibold px-3 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#063b78]"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={loadData}
          className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
        >
          <Icon name="refresh" size={14} />
          <span>{lang === 'bn' ? 'রিফ্রেশ' : 'Refresh'}</span>
        </button>
      </div>

      {/* Loading & Error States */}
      {loading && (
        <div className="py-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-200 border-t-[#063b78] mb-2" />
          <p className="text-sm font-semibold">{lang === 'bn' ? 'তথ্য লোড হচ্ছে...' : 'Loading cash box data...'}</p>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm font-semibold">
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Main Today's Drawer Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="text-lg font-bold text-slate-900">
                    {dict.todaySessionTitle || (lang === 'bn' ? 'আজকের ড্রয়ার' : "Today's Drawer")}
                  </h3>
                  {data.session ? (
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${
                        data.session.status === 'OPEN'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {data.session.status === 'OPEN' ? dict.sessionOpen : dict.sessionClosed}
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                      {dict.noSessionTitle || (lang === 'bn' ? 'চালু নেই' : 'Not Open')}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {lang === 'bn' ? 'তারিখ:' : 'Date:'} <span className="font-semibold text-slate-700">{data.date}</span>
                  {data.session && (
                    <span className="ml-3">
                      {lang === 'bn' ? 'খোলা হয়েছে:' : 'Opened by:'}{' '}
                      <span className="font-semibold text-slate-700">{data.session.openedByName || '—'}</span>
                    </span>
                  )}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                {!data.session && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpenAmount('0');
                      setShowOpenModal(true);
                    }}
                    className="px-4 py-2 bg-[#063b78] hover:bg-[#052e5e] text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <Icon name="plus" size={16} />
                    <span>{dict.openCashBox || (lang === 'bn' ? 'ক্যাশ বক্স খুলুন' : 'Open Cash Box')}</span>
                  </button>
                )}

                {data.session && data.session.status === 'OPEN' && (
                  <button
                    type="button"
                    onClick={() => {
                      setCountedAmount(data.session?.expectedCash?.toString() || '');
                      setShowCloseModal(true);
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <Icon name="check" size={16} />
                    <span>{dict.countAndClose || (lang === 'bn' ? 'ক্যাশ গুনে বন্ধ করুন' : 'Count & Close Drawer')}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Case 1: No Session Open */}
            {!data.session && (
              <div className="py-8 text-center bg-slate-50 rounded-xl border border-slate-100 p-6 space-y-2">
                <div className="w-12 h-12 rounded-full bg-blue-50 text-[#063b78] flex items-center justify-center mx-auto mb-2">
                  <Icon name="wallet" size={24} />
                </div>
                <h4 className="text-sm font-bold text-slate-800">
                  {dict.noSessionTitle || (lang === 'bn' ? 'আজ কোনো ক্যাশ সেশন খোলা হয়নি' : 'No Cash Session Open')}
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {dict.noSessionPrompt || (lang === 'bn' ? 'নগদ লেনদেন নির্ভুলভাবে ট্র্যাক করতে দিনের শুরুতে ক্যাশ বক্স খুলুন।' : 'Open the cash box drawer at the start of the day to begin recording cash transactions.')}
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenAmount('0');
                      setShowOpenModal(true);
                    }}
                    className="px-4 py-2 bg-[#063b78] hover:bg-[#052e5e] text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
                  >
                    {dict.openCashBox || (lang === 'bn' ? 'এখনই ক্যাশ বক্স খুলুন' : 'Open Cash Box Now')}
                  </button>
                </div>
              </div>
            )}

            {/* Case 2: Session OPEN */}
            {data.session && data.session.status === 'OPEN' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <span className="text-xs font-semibold text-slate-500 uppercase">{dict.openingCashLabel || 'Opening Cash'}</span>
                    <div className="text-xl font-bold text-slate-900 mt-1">
                      {formatBDTExact(data.session.openingCash, lang)}
                    </div>
                  </div>

                  <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-200">
                    <span className="text-xs font-semibold text-emerald-700 uppercase">{dict.cashCollected}</span>
                    <div className="text-xl font-bold text-emerald-800 mt-1">
                      +{formatBDTExact(data.movements.cashCollections, lang)}
                    </div>
                  </div>

                  <div className="bg-rose-50/50 p-4 rounded-xl border border-rose-200">
                    <span className="text-xs font-semibold text-rose-700 uppercase">{dict.cashExpenses}</span>
                    <div className="text-xl font-bold text-rose-800 mt-1">
                      -{formatBDTExact(data.movements.cashExpenses + data.movements.cashRefunds, lang)}
                    </div>
                  </div>

                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
                    <span className="text-xs font-semibold text-[#063b78] uppercase">{dict.expectedCashLabel || 'Expected Cash'}</span>
                    <div className="text-xl font-bold text-[#063b78] mt-1">
                      {formatBDTExact(data.session.expectedCash ?? 0, lang)}
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
                  <span>
                    {lang === 'bn'
                      ? 'সেশনটি বর্তমানে চালু রয়েছে। দিনের শেষে টাকা গুনে ড্রয়ার বন্ধ করুন।'
                      : 'Session is currently active. At the end of the day, count physical cash and close the drawer.'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCountedAmount(data.session?.expectedCash?.toString() || '');
                      setShowCloseModal(true);
                    }}
                    className="font-bold text-[#063b78] hover:underline cursor-pointer"
                  >
                    {dict.countAndClose || 'Count & Close Drawer →'}
                  </button>
                </div>
              </div>
            )}

            {/* Case 3: Session CLOSED */}
            {data.session && data.session.status === 'CLOSED' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase">{dict.openingCashLabel || 'Opening Cash'}</span>
                    <div className="text-lg font-bold text-slate-900 mt-1">
                      {formatBDTExact(data.session.openingCash, lang)}
                    </div>
                  </div>

                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase">{dict.cashCollected}</span>
                    <div className="text-lg font-bold text-emerald-700 mt-1">
                      +{formatBDTExact(data.movements.cashCollections, lang)}
                    </div>
                  </div>

                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase">{dict.cashExpenses}</span>
                    <div className="text-lg font-bold text-rose-700 mt-1">
                      -{formatBDTExact(data.movements.cashExpenses + data.movements.cashRefunds, lang)}
                    </div>
                  </div>

                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase">{dict.expectedCashLabel || 'Expected Cash'}</span>
                    <div className="text-lg font-bold text-slate-900 mt-1">
                      {data.session.expectedCash !== null ? formatBDTExact(data.session.expectedCash, lang) : '—'}
                    </div>
                  </div>

                  <div className="bg-blue-50 p-3.5 rounded-xl border border-blue-200 col-span-2 sm:col-span-1">
                    <span className="text-[11px] font-semibold text-[#063b78] uppercase">{dict.countedCashLabel || 'Counted Cash'}</span>
                    <div className="text-lg font-bold text-[#063b78] mt-1">
                      {data.session.countedCash !== null ? formatBDTExact(data.session.countedCash, lang) : '—'}
                    </div>
                  </div>
                </div>

                {/* Reconciliation Banner */}
                <div
                  className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
                    data.session.difference === 0
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                      : data.session.difference! < 0
                        ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                        : 'bg-blue-50/70 border-blue-200 text-blue-900'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-base ${
                        data.session.difference === 0
                          ? 'bg-emerald-200 text-emerald-800'
                          : data.session.difference! < 0
                            ? 'bg-rose-200 text-rose-800'
                            : 'bg-blue-200 text-blue-800'
                      }`}
                    >
                      {data.session.difference === 0 ? '✓' : '!'}
                    </div>
                    <div>
                      <div className="font-bold text-sm">
                        {data.session.difference === 0 ? (
                          <span>{dict.balanced || 'Balanced (মিলেছে)'}</span>
                        ) : data.session.difference! < 0 ? (
                          <span>
                            {dict.short || 'Short'}: {formatBDTExact(Math.abs(data.session.difference!), lang)} {lang === 'bn' ? 'কম' : 'Short'}
                          </span>
                        ) : (
                          <span>
                            {dict.extra || 'Extra'}: {formatBDTExact(data.session.difference!, lang)} {lang === 'bn' ? 'অতিরিক্ত' : 'Extra'}
                          </span>
                        )}
                      </div>
                      {data.session.note && (
                        <p className="text-xs mt-0.5 opacity-80">
                          {dict.discrepancyNote || 'Note'}: {data.session.note}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-right opacity-80">
                    <div>{dict.closedBy || 'Closed By'}: <span className="font-semibold">{data.session.closedByName || '—'}</span></div>
                    {data.session.closedAt && (
                      <div className="text-[10px] mt-0.5">
                        {new Date(data.session.closedAt).toLocaleTimeString('en-US', { timeZone: 'Asia/Dhaka' })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-slate-100 rounded-xl text-xs text-slate-600 flex items-center gap-2">
                  <Icon name="lock" size={14} />
                  <span>{dict.sessionClosedNotice || 'This cash session is closed. Historical records for this day are sealed.'}</span>
                </div>
              </div>
            )}
          </div>

          {/* Session History Table */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {dict.sessionHistory || (lang === 'bn' ? 'ক্যাশ সেশন ইতিহাস' : 'Session History')}
              </h3>
              <span className="text-xs text-slate-500 font-medium">
                {data.history.length} {lang === 'bn' ? 'টি সেশন' : 'sessions'}
              </span>
            </div>

            {data.history.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">{lang === 'bn' ? 'কোনো পূর্ববর্তী সেশন নেই' : 'No past sessions recorded'}</p>
            ) : (
              <div className="overflow-x-auto hs border border-slate-200 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase text-[11px]">
                    <tr>
                      <th className="px-3 py-2.5">{dict.colDate}</th>
                      <th className="px-3 py-2.5">{dict.branch}</th>
                      <th className="px-3 py-2.5">{dict.sessionStatus || 'Status'}</th>
                      <th className="px-3 py-2.5 text-right">{dict.cashOpening}</th>
                      <th className="px-3 py-2.5 text-right">{dict.cashExpected}</th>
                      <th className="px-3 py-2.5 text-right">{dict.cashCounted}</th>
                      <th className="px-3 py-2.5 text-right">{dict.differenceLabel || 'Difference'}</th>
                      <th className="px-3 py-2.5">{dict.closedBy || 'Closed By'}</th>
                      <th className="px-3 py-2.5">{dict.discrepancyNote || 'Note'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.history.map((s) => {
                      const isBalanced = s.difference === 0;
                      const isShort = s.difference !== null && s.difference < 0;
                      const isExtra = s.difference !== null && s.difference > 0;
                      return (
                        <tr key={s.id} className="hover:bg-slate-50/50">
                          <td className="px-3 py-2 font-medium text-slate-800">{s.businessDate}</td>
                          <td className="px-3 py-2 text-slate-600">{pickLocalized(lang, s.branchName, s.branchBanglaName)}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                s.status === 'OPEN'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {s.status === 'OPEN' ? dict.sessionOpen : dict.sessionClosed}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-slate-700">{formatBDTExact(s.openingCash, lang)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-900">
                            {s.expectedCash !== null ? formatBDTExact(s.expectedCash, lang) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-900">
                            {s.countedCash !== null ? formatBDTExact(s.countedCash, lang) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-bold">
                            {s.status === 'OPEN' ? (
                              <span className="text-slate-400">—</span>
                            ) : isBalanced ? (
                              <span className="text-emerald-600">{dict.balanced || 'Balanced'}</span>
                            ) : isShort ? (
                              <span className="text-rose-600">
                                {dict.short || 'Short'} {formatBDTExact(Math.abs(s.difference!), lang)}
                              </span>
                            ) : isExtra ? (
                              <span className="text-blue-600">
                                {dict.extra || 'Extra'} {formatBDTExact(s.difference!, lang)}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-500">{s.closedByName || s.openedByName || '—'}</td>
                          <td className="px-3 py-2 text-slate-500 max-w-xs truncate" title={s.note || ''}>
                            {s.note || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal: Open Cash Box */}
      {showOpenModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {dict.openCashBox || (lang === 'bn' ? 'ক্যাশ বক্স খুলুন' : 'Open Cash Box')}
              </h3>
              <button
                type="button"
                onClick={() => setShowOpenModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleOpenSession} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  {dict.openingCashLabel || (lang === 'bn' ? 'শুরুর ক্যাশ (টাকা)' : 'Opening Cash (BDT)')}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-sm">৳</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={openAmount}
                    onChange={(e) => setOpenAmount(e.target.value)}
                    placeholder={dict.openingCashPlaceholder || '0.00'}
                    className="w-full pl-8 pr-3 py-2 text-sm font-bold border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#063b78]"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {lang === 'bn'
                    ? 'দিনের শুরুতে ড্রয়ারে থাকা শুরুর টাকা প্রবেশ করান।'
                    : 'Enter the cash amount present in the drawer at the start of the day.'}
                </p>
              </div>

              {openError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold">
                  {openError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowOpenModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 cursor-pointer"
                >
                  {dict.cancel || (lang === 'bn' ? 'বাতিল' : 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={openSubmitting}
                  className="px-5 py-2 bg-[#063b78] hover:bg-[#052e5e] text-white rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  {openSubmitting
                    ? dict.openingDrawer || (lang === 'bn' ? 'খোলা হচ্ছে...' : 'Opening...')
                    : dict.openCashBox || (lang === 'bn' ? 'ক্যাশ বক্স খুলুন' : 'Open Drawer')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Count & Close Cash Box */}
      {showCloseModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {dict.countAndClose || (lang === 'bn' ? 'ক্যাশ গুনে ড্রয়ার বন্ধ করুন' : 'Count & Close Drawer')}
              </h3>
              <button
                type="button"
                onClick={() => setShowCloseModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCloseSession} className="space-y-4">
              {/* Expected Cash Display */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase block">
                    {dict.expectedCashLabel || 'System Expected Cash'}
                  </span>
                  <div className="text-lg font-bold text-slate-900">
                    {formatBDTExact(liveExpected, lang)}
                  </div>
                </div>
                <div className="text-right text-[11px] text-slate-500">
                  <div>+ আদায়: {formatBDTExact(data?.movements.cashCollections ?? 0, lang)}</div>
                  <div>- খরচ: {formatBDTExact((data?.movements.cashExpenses ?? 0) + (data?.movements.cashRefunds ?? 0), lang)}</div>
                </div>
              </div>

              {/* Counted Cash Input */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  {dict.countedCashLabel || (lang === 'bn' ? 'গুনে পাওয়া টাকা (প্রকৃত ক্যাশ)' : 'Counted Physical Cash')}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-sm">৳</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={countedAmount}
                    onChange={(e) => setCountedAmount(e.target.value)}
                    placeholder={dict.enterCountedCash || '0.00'}
                    className="w-full pl-8 pr-3 py-2 text-sm font-bold border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#063b78]"
                  />
                </div>
              </div>

              {/* Live Reconciliation Difference indicator */}
              {hasLiveCounted && (
                <div
                  className={`p-3 rounded-xl border flex items-center justify-between text-xs font-bold ${
                    liveDiff === 0
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : liveDiff < 0
                        ? 'bg-rose-50 border-rose-200 text-rose-800'
                        : 'bg-blue-50 border-blue-200 text-blue-800'
                  }`}
                >
                  <span>{dict.differenceLabel || 'Difference'}:</span>
                  <span className="text-sm">
                    {liveDiff === 0
                      ? dict.balanced || 'Balanced (মিলেছে)'
                      : liveDiff < 0
                        ? `${dict.short || 'Short'} -${formatBDTExact(Math.abs(liveDiff), lang)}`
                        : `${dict.extra || 'Extra'} +${formatBDTExact(liveDiff, lang)}`}
                  </span>
                </div>
              )}

              {/* Discrepancy Note (Required if difference != 0) */}
              {hasLiveCounted && Math.abs(liveDiff) > 0.005 && (
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    {dict.discrepancyNote || (lang === 'bn' ? 'পার্থক্যের কারণ / নোট (আবশ্যক)' : 'Discrepancy Note (Required)')}{' '}
                    <span className="text-rose-600">*</span>
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={closeNote}
                    onChange={(e) => setCloseNote(e.target.value)}
                    placeholder={dict.enterDiscrepancyReason || 'Explain difference...'}
                    className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#063b78]"
                  />
                </div>
              )}

              {closeError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold">
                  {closeError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCloseModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 cursor-pointer"
                >
                  {dict.cancel || (lang === 'bn' ? 'বাতিল' : 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={closeSubmitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  {closeSubmitting
                    ? dict.closingDrawer || (lang === 'bn' ? 'বন্ধ করা হচ্ছে...' : 'Closing...')
                    : dict.confirmClose || (lang === 'bn' ? 'নিশ্চিত করুন ও বন্ধ করুন' : 'Confirm & Close')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
