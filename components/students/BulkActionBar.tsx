'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';
import { STUDENT_STATUSES } from '@/lib/validations/student';

interface BulkOpResult {
  studentId: string;
  success: boolean;
  skipped?: boolean;
  reason?: string;
}

interface BatchOption {
  id: string;
  name: string;
  code: string;
}

type Action = 'status' | 'transfer' | null;

interface StudentLookupItem {
  id: string;
  name: string;
  studentIdCode: string;
}

export default function BulkActionBar({
  selectedIds,
  students,
  onClearSelection,
  onActionComplete,
}: {
  selectedIds: string[];
  students: StudentLookupItem[];
  onClearSelection: () => void;
  onActionComplete: () => void;
}) {
  const router = useRouter();
  const { lang, showToast } = useApp();
  const dict = DICTIONARY[lang];
  const b = dict.bulkOps;

  const [action, setAction] = useState<Action>(null);
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<BulkOpResult[] | null>(null);

  // Status modal state
  const [newStatus, setNewStatus] = useState<string>(STUDENT_STATUSES[0]);
  const [reason, setReason] = useState('');

  // Transfer modal state
  const [batches, setBatches] = useState<BatchOption[] | null>(null);
  const [destinationBatchId, setDestinationBatchId] = useState('');
  const [overrideCapacity, setOverrideCapacity] = useState(false);
  const [overrideConflict, setOverrideConflict] = useState(false);

  const loadBatches = async () => {
    if (batches) return;
    const res = await fetch('/api/batches?pageSize=200');
    const data = await res.json();
    if (data.success) setBatches(data.batches.map((x: any) => ({ id: x.id, name: x.name, code: x.code })));
  };

  const count = selectedIds.length;

  const submitStatusChange = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/students/bulk/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: selectedIds, newStatus, reason: reason.trim() || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        setResults(data.results);
        onActionComplete();
      } else {
        showToast(data.message || 'Failed');
      }
    } finally {
      setSaving(false);
    }
  };

  const submitTransfer = async () => {
    if (!destinationBatchId) return;
    setSaving(true);
    try {
      const res = await fetch('/api/students/bulk/batch-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: selectedIds, destinationBatchId, overrideCapacity, overrideConflict }),
      });
      const data = await res.json();
      if (data.success) {
        setResults(data.results);
        onActionComplete();
      } else {
        showToast(data.message || 'Failed');
      }
    } finally {
      setSaving(false);
    }
  };

  const startPromotion = () => {
    sessionStorage.setItem('bulkPromoteStudentIds', JSON.stringify(selectedIds));
    router.push('/students/promote');
  };

  const startIdCards = () => {
    sessionStorage.setItem('bulkIdCardStudentIds', JSON.stringify(selectedIds));
    router.push('/students/id-cards/print');
  };

  const exportSelected = () => {
    const params = new URLSearchParams({ view: 'directory', format: 'csv', studentIds: selectedIds.join(',') });
    window.open(`/api/reports/students?${params.toString()}`, '_blank');
  };

  const closeAll = () => {
    setAction(null);
    setResults(null);
    setReason('');
    setDestinationBatchId('');
    setOverrideCapacity(false);
    setOverrideConflict(false);
  };

  if (count === 0) return null;

  return (
    <div className="card p-4 rounded-2xl bg-[#063b78] text-white shadow-md flex flex-wrap items-center gap-3">
      <span className="font-bold text-[14px]">
        {lang === 'bn' ? `${count} জন নির্বাচিত` : `${count} selected`}
      </span>
      <div className="flex flex-wrap items-center gap-2 ml-auto">
        <button type="button" className="rounded-lg bg-white/10 hover:bg-white/20 px-3 py-1.5 text-[12.5px] font-semibold transition-colors" onClick={() => setAction('status')}>
          {b.changeStatus}
        </button>
        <button
          type="button"
          className="rounded-lg bg-white/10 hover:bg-white/20 px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
          onClick={() => {
            setAction('transfer');
            loadBatches();
          }}
        >
          {b.transferBatch}
        </button>
        <button type="button" className="rounded-lg bg-white/10 hover:bg-white/20 px-3 py-1.5 text-[12.5px] font-semibold transition-colors" onClick={startPromotion}>
          {dict.students.promoteBtn}
        </button>
        <button type="button" className="rounded-lg bg-white/10 hover:bg-white/20 px-3 py-1.5 text-[12.5px] font-semibold transition-colors" onClick={exportSelected}>
          {b.exportSelected}
        </button>
        <button type="button" className="rounded-lg bg-white/10 hover:bg-white/20 px-3 py-1.5 text-[12.5px] font-semibold transition-colors" onClick={startIdCards}>
          {b.generateIdCards}
        </button>
        <button type="button" className="rounded-lg bg-white/20 hover:bg-white/30 px-3 py-1.5 text-[12.5px] font-semibold transition-colors" onClick={onClearSelection}>
          {b.clearSelection}
        </button>
      </div>

      {action === 'status' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeAll}>
          <div className="card w-full max-w-md rounded-2xl bg-white p-6 flex flex-col gap-3.5 text-[#092f63]" onClick={(e) => e.stopPropagation()}>
            {!results ? (
              <>
                <h2 className="text-lg font-bold text-[#063b78]">{b.changeStatus}</h2>
                <p className="text-[13px] text-[#64748b]">
                  {lang === 'bn' ? `আপনি ${count} জন শিক্ষার্থীর অবস্থা পরিবর্তন করতে যাচ্ছেন।` : `You are about to change the status of ${count} student(s).`}
                </p>
                <div className="fld">
                  <label>{b.newStatusLabel}</label>
                  <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className="h-9 rounded-xl border border-[#dce5f0] px-3 text-[13px]">
                    {STUDENT_STATUSES.map((s) => (
                      <option key={s} value={s}>{(dict.studentStatus as Record<string, string>)[s]}</option>
                    ))}
                  </select>
                </div>
                <div className="fld">
                  <label>{b.reasonLabel}</label>
                  <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-xl border border-[#dce5f0] px-3 py-2 text-[13px]" />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button className="tb" onClick={closeAll}>{dict.common.cancel}</button>
                  <button className="primary" disabled={saving} onClick={submitStatusChange}>{saving ? b.processing : b.confirm}</button>
                </div>
              </>
            ) : (
              <ResultsPanel results={results} students={students} b={b} onClose={() => { closeAll(); onClearSelection(); }} />
            )}
          </div>
        </div>
      )}

      {action === 'transfer' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeAll}>
          <div className="card w-full max-w-md rounded-2xl bg-white p-6 flex flex-col gap-3.5 text-[#092f63]" onClick={(e) => e.stopPropagation()}>
            {!results ? (
              <>
                <h2 className="text-lg font-bold text-[#063b78]">{b.transferBatch}</h2>
                <p className="text-[13px] text-[#64748b]">
                  {lang === 'bn' ? `আপনি ${count} জন শিক্ষার্থীকে নির্বাচিত ব্যাচে স্থানান্তর করতে যাচ্ছেন।` : `You are about to transfer ${count} student(s) into the selected batch.`}
                </p>
                <div className="fld">
                  <label>{b.destinationBatchLabel}</label>
                  <select value={destinationBatchId} onChange={(e) => setDestinationBatchId(e.target.value)} className="h-9 rounded-xl border border-[#dce5f0] px-3 text-[13px]">
                    <option value="">{dict.common.selectOption}</option>
                    {(batches || []).map((bt) => (
                      <option key={bt.id} value={bt.id}>{bt.name} ({bt.code})</option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-[12.5px]">
                  <input type="checkbox" checked={overrideCapacity} onChange={(e) => setOverrideCapacity(e.target.checked)} />
                  {b.overrideCapacityLabel}
                </label>
                <label className="flex items-center gap-2 text-[12.5px]">
                  <input type="checkbox" checked={overrideConflict} onChange={(e) => setOverrideConflict(e.target.checked)} />
                  {b.overrideConflictLabel}
                </label>
                <div className="flex justify-end gap-2 pt-2">
                  <button className="tb" onClick={closeAll}>{dict.common.cancel}</button>
                  <button className="primary" disabled={saving || !destinationBatchId} onClick={submitTransfer}>{saving ? b.processing : b.confirm}</button>
                </div>
              </>
            ) : (
              <ResultsPanel results={results} students={students} b={b} onClose={() => { closeAll(); onClearSelection(); }} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultsPanel({
  results,
  students,
  b,
  onClose,
}: {
  results: BulkOpResult[];
  students: StudentLookupItem[];
  b: any;
  onClose: () => void;
}) {
  const successful = results.filter((r) => r.success && !r.skipped);
  const skipped = results.filter((r) => r.skipped);
  const failed = results.filter((r) => !r.success);
  const nameOf = (id: string) => {
    const s = students.find((x) => x.id === id);
    return s ? `${s.name} (${s.studentIdCode})` : id;
  };

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-bold text-[#063b78]">{b.resultsTitle}</h2>
      <div className="flex gap-3 text-[13px]">
        <span className="font-bold text-emerald-700">{b.successfulLabel}: {successful.length}</span>
        <span className="font-bold text-amber-700">{b.skippedLabel}: {skipped.length}</span>
        <span className="font-bold text-rose-700">{b.failedLabel}: {failed.length}</span>
      </div>
      {(skipped.length > 0 || failed.length > 0) && (
        <div className="max-h-56 overflow-y-auto border border-[#edf1f7] rounded-xl">
          <table className="tbl text-[12px]">
            <thead>
              <tr><th style={{ textAlign: 'left' }}>{b.studentColumn}</th><th style={{ textAlign: 'left' }}>{b.reasonColumn}</th></tr>
            </thead>
            <tbody>
              {[...failed, ...skipped].map((r) => (
                <tr key={r.studentId} className="trow">
                  <td className="text-left">{nameOf(r.studentId)}</td>
                  <td className="text-left">{r.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex justify-end pt-2">
        <button className="primary" onClick={onClose}>{b.close}</button>
      </div>
    </div>
  );
}
