'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';

interface AcademicOptions {
  sessions: Array<{ id: string; name: string; banglaName?: string | null }>;
  programs: Array<{
    id: string;
    name: string;
    banglaName?: string | null;
    classes: Array<{ id: string; name: string; banglaName?: string | null; groups: Array<{ id: string; name: string; banglaName?: string | null }> }>;
  }>;
  courses: Array<{ id: string; name: string; banglaName?: string | null; academicClassId?: string | null }>;
  batches: Array<{ id: string; name: string; code: string; academicSessionId: string; academicProgramId: string; academicClassId: string; academicGroupId?: string | null; availableSeats: number }>;
}

interface Candidate {
  id: string;
  studentIdCode: string;
  name: string;
  banglaName?: string | null;
  enrollments: Array<{ academicClassId: string }>;
  studentBatches: Array<{ batch: { id: string; name: string } }>;
}

interface OpResult {
  studentId: string;
  success: boolean;
  skipped?: boolean;
  reason?: string;
}

export default function PromoteStudentsPage() {
  const { lang, showToast } = useApp();
  const dict = DICTIONARY[lang];
  const p = dict.promotion;

  const [options, setOptions] = useState<AcademicOptions | null>(null);
  const [preselected, setPreselected] = useState<string[]>([]);

  const [sourceSessionId, setSourceSessionId] = useState('');
  const [sourceClassId, setSourceClassId] = useState('');
  const [sourceGroupId, setSourceGroupId] = useState('');
  const [sourceBatchId, setSourceBatchId] = useState('');

  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  const [destinationSessionId, setDestinationSessionId] = useState('');
  const [destinationProgramId, setDestinationProgramId] = useState('');
  const [destinationClassId, setDestinationClassId] = useState('');
  const [destinationGroupId, setDestinationGroupId] = useState('');
  const [destinationCourseId, setDestinationCourseId] = useState('');
  const [destinationBatchId, setDestinationBatchId] = useState('');
  const [overrideCapacity, setOverrideCapacity] = useState(false);

  const [promoting, setPromoting] = useState(false);
  const [results, setResults] = useState<OpResult[] | null>(null);

  useEffect(() => {
    fetch('/api/academic/options').then((r) => r.json()).then(setOptions).catch(() => {});
    const raw = sessionStorage.getItem('bulkPromoteStudentIds');
    if (raw) {
      setPreselected(JSON.parse(raw));
      sessionStorage.removeItem('bulkPromoteStudentIds');
    }
  }, []);

  const sourceClasses = options?.programs.flatMap((prog) => prog.classes) || [];
  const sourceGroups = sourceClasses.find((c) => c.id === sourceClassId)?.groups || [];
  const sourceBatches = (options?.batches || []).filter((b) => b.academicSessionId === sourceSessionId && (!sourceClassId || b.academicClassId === sourceClassId));

  const destProgram = options?.programs.find((prog) => prog.id === destinationProgramId);
  const destClasses = destProgram?.classes || [];
  const destGroups = destClasses.find((c) => c.id === destinationClassId)?.groups || [];
  const destCourses = (options?.courses || []).filter((c) => !c.academicClassId || c.academicClassId === destinationClassId);
  const destBatches = (options?.batches || []).filter((b) => b.academicSessionId === destinationSessionId && (!destinationClassId || b.academicClassId === destinationClassId));

  const loadCandidates = async () => {
    if (!sourceSessionId) return;
    setLoadingCandidates(true);
    try {
      const sp = new URLSearchParams({ sourceSessionId });
      if (sourceClassId) sp.set('sourceClassId', sourceClassId);
      if (sourceGroupId) sp.set('sourceGroupId', sourceGroupId);
      if (sourceBatchId) sp.set('sourceBatchId', sourceBatchId);
      const res = await fetch(`/api/students/promotion/candidates?${sp}`);
      const data = await res.json();
      if (data.success) {
        setCandidates(data.students);
        const preselectedSet = new Set<string>(data.students.map((s: Candidate) => s.id).filter((id: string) => preselected.includes(id)));
        setSelected(preselectedSet.size > 0 ? preselectedSet : new Set<string>());
      }
    } finally {
      setLoadingCandidates(false);
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canConfirm = selected.size > 0 && destinationSessionId && destinationProgramId && destinationClassId && destinationBatchId;

  const confirmPromotion = async () => {
    setPromoting(true);
    try {
      const res = await fetch('/api/students/promotion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentIds: Array.from(selected),
          sourceSessionId,
          destinationSessionId,
          destinationProgramId,
          destinationClassId,
          destinationGroupId: destinationGroupId || undefined,
          destinationCourseId: destinationCourseId || undefined,
          destinationBatchId,
          overrideCapacity,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResults(data.results);
      } else {
        showToast(data.message || dict.common.actionFailed);
      }
    } finally {
      setPromoting(false);
    }
  };

  const nameOf = (id: string) => {
    const c = candidates?.find((x) => x.id === id);
    return c ? `${c.name} (${c.studentIdCode})` : id;
  };

  return (
    <div className="max-w-[1000px] mx-auto flex flex-col gap-5">
      <div>
        <Link href="/students" className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#063b78] hover:underline mb-2">
          <Icon name="chevleft" size={16} />
          <span>{dict.students.title}</span>
        </Link>
        <h1 className="text-2xl font-extrabold text-[#063b78] tracking-tight">{p.title}</h1>
        <p className="text-[13.5px] text-[#64748b] mt-0.5">{p.subtitle}</p>
      </div>

      {results ? (
        <div className="card p-5 flex flex-col gap-3">
          <h2 className="text-lg font-bold text-[#063b78]">{dict.bulkOps.resultsTitle}</h2>
          <div className="flex gap-4 text-[13px]">
            <span className="font-bold text-emerald-700">{dict.bulkOps.successfulLabel}: {results.filter((r) => r.success && !r.skipped).length}</span>
            <span className="font-bold text-amber-700">{dict.bulkOps.skippedLabel}: {results.filter((r) => r.skipped).length}</span>
            <span className="font-bold text-rose-700">{dict.bulkOps.failedLabel}: {results.filter((r) => !r.success).length}</span>
          </div>
          <div className="border border-[#edf1f7] rounded-xl overflow-hidden">
            <table className="tbl text-[12.5px]">
              <thead><tr><th style={{ textAlign: 'left' }}>{dict.bulkOps.studentColumn}</th><th style={{ textAlign: 'left' }}>{dict.bulkOps.reasonColumn}</th></tr></thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.studentId} className="trow">
                    <td className="text-left">{nameOf(r.studentId)}</td>
                    <td className="text-left">{r.success && !r.skipped ? '✔' : r.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link href="/students" className="primary self-start">{dict.students.title}</Link>
        </div>
      ) : (
        <>
          <div className="card p-5 flex flex-col gap-3">
            <h2 className="text-[14px] font-bold text-[#063b78] uppercase tracking-wide">{p.sourceTitle}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <select value={sourceSessionId} onChange={(e) => setSourceSessionId(e.target.value)} className="h-9 rounded-xl border border-[#dce5f0] px-3 text-[13px]">
                <option value="">{p.sourceSession}</option>
                {options?.sessions.map((s) => <option key={s.id} value={s.id}>{lang === 'bn' && s.banglaName ? s.banglaName : s.name}</option>)}
              </select>
              <select value={sourceClassId} onChange={(e) => { setSourceClassId(e.target.value); setSourceGroupId(''); }} className="h-9 rounded-xl border border-[#dce5f0] px-3 text-[13px]">
                <option value="">{p.sourceClass}</option>
                {sourceClasses.map((c) => <option key={c.id} value={c.id}>{lang === 'bn' && c.banglaName ? c.banglaName : c.name}</option>)}
              </select>
              <select value={sourceGroupId} onChange={(e) => setSourceGroupId(e.target.value)} className="h-9 rounded-xl border border-[#dce5f0] px-3 text-[13px]">
                <option value="">{p.sourceGroup}</option>
                {sourceGroups.map((g) => <option key={g.id} value={g.id}>{lang === 'bn' && g.banglaName ? g.banglaName : g.name}</option>)}
              </select>
              <select value={sourceBatchId} onChange={(e) => setSourceBatchId(e.target.value)} className="h-9 rounded-xl border border-[#dce5f0] px-3 text-[13px]">
                <option value="">{p.sourceBatch}</option>
                {sourceBatches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <button className="primary self-start" disabled={!sourceSessionId || loadingCandidates} onClick={loadCandidates}>
              {loadingCandidates ? '…' : p.loadCandidates}
            </button>
          </div>

          {candidates && (
            <div className="card rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#edf1f7] font-bold text-[#063b78]">{p.candidatesTitle} ({selected.size}/{candidates.length})</div>
              {candidates.length === 0 ? (
                <div className="py-10 text-center text-[13px] text-[#64748b]">{p.noCandidates}</div>
              ) : (
                <div className="overflow-x-auto scroll max-h-80 overflow-y-auto">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th className="w-10"><input type="checkbox" checked={selected.size === candidates.length} onChange={() => setSelected(selected.size === candidates.length ? new Set() : new Set(candidates.map((c) => c.id)))} /></th>
                        <th style={{ textAlign: 'left' }}>{dict.students.colId}</th>
                        <th style={{ textAlign: 'left' }}>{dict.students.colName}</th>
                        <th style={{ textAlign: 'left' }}>{dict.students.colBatch}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.map((c) => (
                        <tr key={c.id} className="trow">
                          <td><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} /></td>
                          <td className="text-left font-mono">{c.studentIdCode}</td>
                          <td className="text-left">{lang === 'bn' && c.banglaName ? c.banglaName : c.name}</td>
                          <td className="text-left">{c.studentBatches[0]?.batch.name || dict.common.none}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {candidates && candidates.length > 0 && (
            <div className="card p-5 flex flex-col gap-3">
              <h2 className="text-[14px] font-bold text-[#063b78] uppercase tracking-wide">{p.destinationTitle}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select value={destinationSessionId} onChange={(e) => setDestinationSessionId(e.target.value)} className="h-9 rounded-xl border border-[#dce5f0] px-3 text-[13px]">
                  <option value="">{p.destinationSession}</option>
                  {options?.sessions.map((s) => <option key={s.id} value={s.id}>{lang === 'bn' && s.banglaName ? s.banglaName : s.name}</option>)}
                </select>
                <select value={destinationProgramId} onChange={(e) => { setDestinationProgramId(e.target.value); setDestinationClassId(''); setDestinationGroupId(''); }} className="h-9 rounded-xl border border-[#dce5f0] px-3 text-[13px]">
                  <option value="">{p.destinationProgram}</option>
                  {options?.programs.map((prog) => <option key={prog.id} value={prog.id}>{lang === 'bn' && prog.banglaName ? prog.banglaName : prog.name}</option>)}
                </select>
                <select value={destinationClassId} onChange={(e) => { setDestinationClassId(e.target.value); setDestinationGroupId(''); }} className="h-9 rounded-xl border border-[#dce5f0] px-3 text-[13px]">
                  <option value="">{p.destinationClass}</option>
                  {destClasses.map((c) => <option key={c.id} value={c.id}>{lang === 'bn' && c.banglaName ? c.banglaName : c.name}</option>)}
                </select>
                <select value={destinationGroupId} onChange={(e) => setDestinationGroupId(e.target.value)} className="h-9 rounded-xl border border-[#dce5f0] px-3 text-[13px]">
                  <option value="">{p.destinationGroup}</option>
                  {destGroups.map((g) => <option key={g.id} value={g.id}>{lang === 'bn' && g.banglaName ? g.banglaName : g.name}</option>)}
                </select>
                <select value={destinationCourseId} onChange={(e) => setDestinationCourseId(e.target.value)} className="h-9 rounded-xl border border-[#dce5f0] px-3 text-[13px]">
                  <option value="">{p.destinationCourse}</option>
                  {destCourses.map((c) => <option key={c.id} value={c.id}>{lang === 'bn' && c.banglaName ? c.banglaName : c.name}</option>)}
                </select>
                <select value={destinationBatchId} onChange={(e) => setDestinationBatchId(e.target.value)} className="h-9 rounded-xl border border-[#dce5f0] px-3 text-[13px]">
                  <option value="">{p.destinationBatch}</option>
                  {destBatches.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.availableSeats} seats)</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-[12.5px]">
                <input type="checkbox" checked={overrideCapacity} onChange={(e) => setOverrideCapacity(e.target.checked)} />
                {dict.bulkOps.overrideCapacityLabel}
              </label>

              <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[12.5px] px-3 py-2.5">
                {lang === 'bn'
                  ? `আপনি ${selected.size} জন শিক্ষার্থীকে উত্তীর্ণ করতে যাচ্ছেন।`
                  : `You are about to promote ${selected.size} student(s).`}
              </div>

              <button className="primary self-start" disabled={!canConfirm || promoting} onClick={confirmPromotion}>
                {promoting ? p.promoting : p.confirmPromote}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
