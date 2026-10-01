'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import FeesSubNav from '@/components/FeesSubNav';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatBDT } from '@/lib/i18n';

interface MethodRow {
  method: string;
  count: number;
  gross: number;
  refunded: number;
  net: number;
}

interface CashSessionInfo {
  id: string;
  status: 'OPEN' | 'CLOSED';
  openingCash: number;
  cashExpenses?: number;
  countedCash: number | null;
  expectedCash: number | null;
  difference: number | null;
  openedBy: { id: string; name: string } | null;
  closedBy: { id: string; name: string } | null;
}

interface DailySummary {
  date: string;
  branchId: string | null;
  totalCollection: number;
  refundedAmount: number;
  netCollection: number;
  paymentsCount: number;
  receiptsCount: number;
  methods: MethodRow[];
  cashSession: CashSessionInfo | null;
}

interface CollectorRow {
  collectorId: string | null;
  collectorName: string;
  paymentsCount: number;
  cash: string;
  digital: string;
  total: string;
}

interface BranchOption {
  id: string;
  name: string;
  banglaName: string | null;
  isMain: boolean;
}

export default function DailyCollectionPage() {
  const { lang, currentUser, showToast } = useApp();
  const dict = DICTIONARY[lang];
  const f = dict.fees;
  const canPickBranch = currentUser?.role === 'OWNER' || currentUser?.role === 'ADMIN';

  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [branchId, setBranchId] = useState<string>('');
  const [date, setDate] = useState<string>('');
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [collectors, setCollectors] = useState<CollectorRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [cashModal, setCashModal] = useState<'open' | 'close' | null>(null);

  useEffect(() => {
    if (!canPickBranch) return;
    fetch('/api/fees/options')
      .then((r) => r.json())
      .then((d) => d.success && setBranches(d.branches || []))
      .catch(() => {});
  }, [canPickBranch]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (date) sp.set('date', date);
      if (branchId) sp.set('branch', branchId);
      const [summaryRes, collectorsRes] = await Promise.all([
        fetch(`/api/fees/collection?${sp}`).then((r) => r.json()),
        fetch(`/api/reports/finance?view=collectors&dateFrom=${date || ''}&dateTo=${date || ''}${branchId ? `&branchId=${branchId}` : ''}`).then((r) => r.json()),
      ]);
      if (summaryRes.success) {
        setSummary(summaryRes.summary);
        if (!date) setDate(summaryRes.summary.date);
      }
      if (collectorsRes.success) setCollectors(collectorsRes.data.rows);
    } finally {
      setLoading(false);
    }
  }, [date, branchId]);

  useEffect(() => {
    load();
  }, [load]);

  const effectiveBranchId = branchId || currentUser?.branchId || '';
  const isToday = summary && date === summary.date;

  return (
    <div className="max-w-[1300px] mx-auto flex flex-col gap-5">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-[#063b78] tracking-tight">{f.dailyCollectionTitle}</h1>
        <p className="text-[13.5px] text-[#64748b] mt-0.5 font-medium">{f.dailyCollectionSubtitle}</p>
      </div>

      <FeesSubNav />

      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[12px] font-semibold text-[#64748b]">{f.selectDate}</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10 rounded-xl border border-[#dce5f0] px-3 text-[13.5px]" />
        </div>
        {canPickBranch && branches.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-semibold text-[#64748b]">{f.branch}</label>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="h-10 rounded-xl border border-[#dce5f0] px-3 text-[13.5px]">
              <option value="">{f.allBranches}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{lang === 'bn' && b.banglaName ? b.banglaName : b.name}</option>
              ))}
            </select>
          </div>
        )}
        <Link href={`/fees/payments?dateFrom=${date}&dateTo=${date}${branchId ? `&branch=${branchId}` : ''}`} className="tb ml-auto">
          <Icon name="file" size={15} />
          <span>{f.viewFullReport}</span>
        </Link>
      </div>

      {loading || !summary ? (
        <div className="card p-16 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard label={f.totalCollection} value={formatBDT(summary.totalCollection, lang)} tone="navy" />
            <SummaryCard label={f.paymentsCount} value={String(summary.paymentsCount)} tone="slate" />
            <SummaryCard label={dict.reports.col.refunded} value={formatBDT(summary.refundedAmount, lang)} tone="rose" />
            <SummaryCard label={f.netCollection} value={formatBDT(summary.netCollection, lang)} tone="green" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="text-[14px] font-bold text-[#063b78] mb-3">{f.dailyMethodBreakdownTitle}</h3>
              <div className="flex flex-col gap-2">
                {summary.methods.map((m) => (
                  <div key={m.method} className="flex items-center justify-between text-[13px] py-1.5 border-b border-[#edf1f7] last:border-0">
                    <span className="font-semibold text-[#334155]">{(dict.paymentMethod as Record<string, string>)[m.method]}</span>
                    <span className="text-[#64748b]">{m.count}</span>
                    <span className="font-bold text-[#063b78] num">{formatBDT(m.net, lang)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[14px] font-bold text-[#063b78]">{f.cashSessionTitle}</h3>
              </div>
              <CashSessionCard
                summary={summary}
                isToday={!!isToday}
                effectiveBranchId={effectiveBranchId}
                f={f}
                lang={lang}
                showToast={showToast}
                onChanged={load}
                modal={cashModal}
                setModal={setCashModal}
              />
            </div>
          </div>

          <div className="card rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#edf1f7] font-bold text-[#063b78]">{f.collectorSummaryTitle}</div>
            {!collectors || collectors.length === 0 ? (
              <div className="py-10 text-center text-[13px] text-[#64748b]">{f.noCollectorsToday}</div>
            ) : (
              <div className="overflow-x-auto scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>{dict.reports.col.collector}</th>
                      <th>{dict.reports.col.payments}</th>
                      <th>{dict.reports.col.cash}</th>
                      <th>{dict.reports.col.digital}</th>
                      <th>{dict.reports.col.amount}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {collectors.map((c) => (
                      <tr key={c.collectorId ?? 'unassigned'} className="trow">
                        <td style={{ textAlign: 'left' }} className="font-semibold text-[#092f63]">{c.collectorName}</td>
                        <td>{c.paymentsCount}</td>
                        <td className="font-mono">{formatBDT(c.cash, lang)}</td>
                        <td className="font-mono">{formatBDT(c.digital, lang)}</td>
                        <td className="font-mono font-bold">{formatBDT(c.total, lang)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: 'navy' | 'slate' | 'rose' | 'green' }) {
  const toneClass = {
    navy: 'bg-gradient-to-br from-[#063b78] to-[#042754] text-white',
    slate: 'bg-white border border-[#d8e1ee] text-[#00296b]',
    rose: 'bg-white border border-rose-200 text-rose-700',
    green: 'bg-white border border-emerald-200 text-emerald-700',
  }[tone];
  return (
    <div className={`rounded-2xl p-5 shadow-2xs ${toneClass}`}>
      <div className={`text-[12px] font-semibold uppercase tracking-wider ${tone === 'navy' ? 'text-[#93c5fd]' : 'opacity-70'}`}>{label}</div>
      <div className="text-2xl font-extrabold mt-1 num">{value}</div>
    </div>
  );
}

function CashSessionCard({
  summary,
  isToday,
  effectiveBranchId,
  f,
  lang,
  showToast,
  onChanged,
  modal,
  setModal,
}: {
  summary: DailySummary;
  isToday: boolean;
  effectiveBranchId: string;
  f: any;
  lang: 'en' | 'bn';
  showToast: (msg: string) => void;
  onChanged: () => void;
  modal: 'open' | 'close' | null;
  setModal: (m: 'open' | 'close' | null) => void;
}) {
  const [openingCash, setOpeningCash] = useState('0');
  const [countedCash, setCountedCash] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const session = summary.cashSession;
  const cashRow = summary.methods.find((m) => m.method === 'CASH');
  const previewExpected = session ? session.openingCash + (cashRow?.net ?? 0) - (session.cashExpenses ?? 0) : 0;

  if (!isToday) {
    return <p className="text-[13px] text-[#64748b] py-4">{f.noSessionToday}</p>;
  }

  async function open() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/fees/cash-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId: effectiveBranchId, openingCash: Number(openingCash) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || 'Failed');
        return;
      }
      showToast(f.sessionOpenedToast);
      setModal(null);
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function close() {
    if (!session) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/fees/cash-sessions/${session.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countedCash: Number(countedCash), note: note.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || 'Failed');
        return;
      }
      showToast(f.sessionClosedToast);
      setModal(null);
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  if (!session) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-[#64748b]">{f.noSessionToday}</p>
        {modal === 'open' ? (
          <div className="flex flex-col gap-2">
            {error && <div className="text-[12px] text-rose-700">{error}</div>}
            <label className="text-[12px] font-semibold text-[#64748b]">{f.openingCashLabel}</label>
            <input type="number" min="0" step="0.01" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} className="h-9 rounded-xl border border-[#dce5f0] px-3 text-[13px]" />
            <div className="flex gap-2">
              <button className="tb" onClick={() => setModal(null)}>{DICTIONARY[lang].common.cancel}</button>
              <button className="primary" disabled={saving} onClick={open}>{saving ? '…' : f.openSession}</button>
            </div>
          </div>
        ) : (
          <button className="primary self-start" onClick={() => setModal('open')}>{f.openSession}</button>
        )}
      </div>
    );
  }

  if (session.status === 'OPEN') {
    return (
      <div className="flex flex-col gap-3">
        <div className="text-[13px] text-[#64748b]">
          {f.sessionOpenedBy}: <strong>{session.openedBy?.name || '—'}</strong>
        </div>
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-[#64748b]">{f.openingCashLabel}</span>
          <span className="font-mono font-bold">{formatBDT(session.openingCash, lang)}</span>
        </div>
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-[#64748b]">{f.cashExpensesLabel}</span>
          <span className="font-mono font-bold">{formatBDT(session.cashExpenses ?? 0, lang)}</span>
        </div>
        {modal === 'close' ? (
          <div className="flex flex-col gap-2 pt-2 border-t border-[#edf1f7]">
            {error && <div className="text-[12px] text-rose-700">{error}</div>}
            <div className="text-[12px] text-[#64748b]">{f.expectedCashLabel} (~): <strong>{formatBDT(previewExpected, lang)}</strong></div>
            <label className="text-[12px] font-semibold text-[#64748b]">{f.countedCashLabel}</label>
            <input type="number" min="0" step="0.01" value={countedCash} onChange={(e) => setCountedCash(e.target.value)} className="h-9 rounded-xl border border-[#dce5f0] px-3 text-[13px]" />
            <label className="text-[12px] font-semibold text-[#64748b]">{f.noteLabel}</label>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={f.notePlaceholder} className="rounded-xl border border-[#dce5f0] px-3 py-2 text-[13px]" />
            <div className="flex gap-2">
              <button className="tb" onClick={() => setModal(null)}>{DICTIONARY[lang].common.cancel}</button>
              <button className="primary" disabled={saving || countedCash === ''} onClick={close}>{saving ? '…' : f.confirmClose}</button>
            </div>
          </div>
        ) : (
          <button className="primary self-start" onClick={() => setModal('close')}>{f.closeSession}</button>
        )}
      </div>
    );
  }

  const balanced = (session.difference ?? 0) === 0;
  return (
    <div className="flex flex-col gap-2 text-[13px]">
      <Row label={f.openingCashLabel} value={formatBDT(session.openingCash, lang)} />
      <Row label={f.expectedCashLabel} value={formatBDT(session.expectedCash ?? 0, lang)} />
      <Row label={f.actualCashLabel} value={formatBDT(session.countedCash ?? 0, lang)} />
      <Row label={f.differenceLabel} value={formatBDT(session.difference ?? 0, lang)} strong className={balanced ? 'text-emerald-700' : 'text-rose-700'} />
      <div className={`text-[12px] font-bold mt-1 ${balanced ? 'text-emerald-700' : 'text-rose-700'}`}>
        {balanced ? f.balanced : f.discrepancy}
      </div>
      <div className="text-[11.5px] text-[#94a3b8] mt-1">{f.sessionClosedBy}: {session.closedBy?.name || '—'}</div>
    </div>
  );
}

function Row({ label, value, strong, className }: { label: string; value: string; strong?: boolean; className?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#64748b]">{label}</span>
      <span className={`font-mono ${strong ? 'font-bold' : ''} ${className || ''}`}>{value}</span>
    </div>
  );
}
