'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/Icon';
import SalaryLineText from '@/components/salary/SalaryLineText';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatBDTExact, formatDhakaDate } from '@/lib/i18n';
import { COMPENSATION_TYPES } from '@/lib/validations/salary';

interface Named {
  id: string;
  name: string;
  banglaName?: string | null;
}
interface CompensationItem {
  id: string;
  type: (typeof COMPENSATION_TYPES)[number];
  amount: number;
  branchId: string;
  branchName: string | null;
  assignmentId: string | null;
  assignment: { course: Named | null; batch: Named; subject: Named } | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
  phase: 'CURRENT' | 'UPCOMING' | 'EXPIRED';
  notes: string | null;
}
interface HistoryRow {
  id: string;
  year: number;
  month: number;
  netAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: string;
  lines: any[];
}
interface TeacherAssignment {
  id: string;
  status: string;
  batch: { id: string; name: string; banglaName?: string | null; course?: Named | null };
  subject: Named;
}

const inputCls = 'w-full rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78]';

const label = (lang: string, o?: { name: string; banglaName?: string | null } | null) =>
  o ? (lang === 'bn' && o.banglaName ? o.banglaName : o.name) : '—';

export default function CompensationTab({
  teacherId,
  teacherBranchId,
  assignments,
  canManage,
}: {
  teacherId: string;
  teacherBranchId: string | null;
  assignments: TeacherAssignment[];
  canManage: boolean;
}) {
  const { lang, showToast } = useApp();
  const dict = DICTIONARY[lang];
  const c = dict.compensation;
  const s = dict.salary;
  const num = (v: number) => formatBDTExact(v, lang);
  const fmtDate = (d: string) => formatDhakaDate(d);

  const [data, setData] = useState<{ current: CompensationItem[]; upcoming: CompensationItem[]; history: CompensationItem[] } | null>(null);
  const [salary, setSalary] = useState<HistoryRow[] | null>(null);
  const [error, setError] = useState('');
  const [branches, setBranches] = useState<Named[]>([]);
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; item: CompensationItem } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({
    type: 'MONTHLY_FIXED' as (typeof COMPENSATION_TYPES)[number],
    amount: '',
    courseId: '',
    batchId: '',
    assignmentId: '',
    branchId: '',
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: '',
    notes: '',
  });

  const apiMsg = useCallback(
    (d: any) => (d?.error && (s.errors as Record<string, string>)[d.error]) || d?.message || s.loadFailed,
    [s]
  );

  const load = useCallback(async () => {
    try {
      const [r1, r2] = await Promise.all([
        fetch(`/api/teachers/${teacherId}/compensation`),
        fetch(`/api/teachers/${teacherId}/salary-history`),
      ]);
      const d1 = await r1.json();
      if (!r1.ok || !d1.success) {
        setError(apiMsg(d1));
        return;
      }
      setData({ current: d1.current, upcoming: d1.upcoming, history: d1.history });
      const d2 = await r2.json().catch(() => null);
      setSalary(r2.ok && d2?.success ? d2.history : []);
      setError('');
    } catch {
      setError(c.loadFailed);
    }
  }, [teacherId, apiMsg, c.loadFailed]);

  useEffect(() => {
    load();
  }, [load]);

  // Only a branch-less teacher needs the branch picker (the branch that pays this salary).
  useEffect(() => {
    if (!canManage || teacherBranchId) return;
    fetch('/api/batches/options')
      .then((r) => r.json())
      .then((d) => setBranches(d.branches || []))
      .catch(() => {});
  }, [canManage, teacherBranchId]);

  // Course -> Batch -> Subject, built ONLY from this teacher's own active assignments.
  const active = useMemo(() => assignments.filter((a) => a.status === 'ACTIVE'), [assignments]);
  const courses = useMemo(() => {
    const m = new Map<string, Named>();
    for (const a of active) if (a.batch.course) m.set(a.batch.course.id, a.batch.course);
    return [...m.values()];
  }, [active]);
  const batches = useMemo(() => {
    const m = new Map<string, Named>();
    for (const a of active) if (a.batch.course?.id === form.courseId) m.set(a.batch.id, a.batch);
    return [...m.values()];
  }, [active, form.courseId]);
  const subjectsForBatch = useMemo(
    () => active.filter((a) => a.batch.id === form.batchId),
    [active, form.batchId]
  );

  const needsAssignment = form.type === 'PER_BATCH' || form.type === 'PER_CLASS';

  const openCreate = () => {
    setFormError('');
    setForm({
      type: 'MONTHLY_FIXED',
      amount: '',
      courseId: '',
      batchId: '',
      assignmentId: '',
      branchId: teacherBranchId || '',
      effectiveFrom: new Date().toISOString().slice(0, 10),
      effectiveTo: '',
      notes: '',
    });
    setModal({ mode: 'create' });
  };

  const openEdit = (item: CompensationItem) => {
    setFormError('');
    setForm({
      type: item.type,
      amount: String(item.amount),
      courseId: item.assignment?.course?.id || '',
      batchId: item.assignment?.batch.id || '',
      assignmentId: item.assignmentId || '',
      branchId: item.branchId,
      effectiveFrom: item.effectiveFrom,
      effectiveTo: item.effectiveTo || '',
      notes: item.notes || '',
    });
    setModal({ mode: 'edit', item });
  };

  const save = async () => {
    if (!modal) return;
    setSaving(true);
    setFormError('');
    try {
      const amount = Number(form.amount);
      const isEdit = modal.mode === 'edit';
      const body = isEdit
        ? { amount, effectiveFrom: form.effectiveFrom, effectiveTo: form.effectiveTo || null, notes: form.notes }
        : {
            type: form.type,
            amount,
            effectiveFrom: form.effectiveFrom,
            effectiveTo: form.effectiveTo || null,
            notes: form.notes,
            ...(needsAssignment ? { assignmentId: form.assignmentId } : {}),
            ...(!needsAssignment && !teacherBranchId && form.branchId ? { branchId: form.branchId } : {}),
          };
      const res = await fetch(
        isEdit ? `/api/teachers/${teacherId}/compensation/${modal.item.id}` : `/api/teachers/${teacherId}/compensation`,
        { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      );
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) {
        const first = d?.details ? (Object.values(d.details).flat()[0] as string) : '';
        setFormError(first || apiMsg(d));
        return;
      }
      setModal(null);
      showToast(lang === 'bn' ? 'সংরক্ষিত হয়েছে' : 'Saved');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const endRule = async (item: CompensationItem) => {
    if (!window.confirm(c.endConfirm)) return;
    const res = await fetch(`/api/teachers/${teacherId}/compensation/${item.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const d = await res.json().catch(() => null);
    if (!res.ok || !d?.success) {
      showToast(apiMsg(d));
      return;
    }
    await load();
  };

  const amountText = (i: CompensationItem) =>
    `${num(i.amount)} ${i.type === 'PER_CLASS' ? c.perClass : c.perMonth}`;

  const assignmentText = (i: CompensationItem) =>
    i.assignment
      ? `${label(lang, i.assignment.course)} → ${label(lang, i.assignment.batch)} → ${label(lang, i.assignment.subject)}`
      : i.type === 'CUSTOM' && i.notes
        ? i.notes
        : '—';

  const monthName = (y: number, m: number) => {
    const text = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(Date.UTC(y, m - 1, 1))
    );
    return text;
  };

  const statusCls: Record<string, string> = {
    PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    PARTIAL: 'bg-amber-50 text-amber-700 border-amber-200',
    UNPAID: 'bg-rose-50 text-rose-700 border-rose-200',
  };
  const statusText: Record<string, string> = {
    PAID: s.statusPaid,
    PARTIAL: s.statusPartial,
    UNPAID: s.statusUnpaid,
  };

  const Row = ({ item, history = false }: { item: CompensationItem; history?: boolean }) => (
    <div className="rounded-xl border border-[#e4ebf5] p-3.5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-[13px] flex-1">
        <div>
          <div className="text-[11px] font-bold text-[#8795ab] uppercase">{c.type}</div>
          <div className="font-bold text-[#092f63]">{c[item.type]}</div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-[#8795ab] uppercase">{c.amountRate}</div>
          <div className="font-bold text-emerald-700 num">{amountText(item)}</div>
        </div>
        <div className="col-span-2">
          <div className="text-[11px] font-bold text-[#8795ab] uppercase">{c.assignment}</div>
          <div className="font-semibold text-[#092f63] break-words">{assignmentText(item)}</div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-[#8795ab] uppercase">{c.effectiveFrom}</div>
          <div className="font-semibold text-[#092f63]">{fmtDate(item.effectiveFrom)}</div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-[#8795ab] uppercase">{c.effectiveTo}</div>
          <div className="font-semibold text-[#092f63]">{item.effectiveTo ? fmtDate(item.effectiveTo) : c.openEnded}</div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-[#8795ab] uppercase">{c.status}</div>
          <span
            className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-full border ${
              item.phase === 'CURRENT'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : item.phase === 'UPCOMING'
                  ? 'bg-sky-50 text-sky-700 border-sky-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            {item.phase === 'CURRENT' ? c.phaseCurrent : item.phase === 'UPCOMING' ? c.phaseUpcoming : c.phaseExpired}
          </span>
        </div>
        {item.branchName && (
          <div>
            <div className="text-[11px] font-bold text-[#8795ab] uppercase">{c.branch}</div>
            <div className="font-semibold text-[#092f63]">{item.branchName}</div>
          </div>
        )}
        {item.notes && item.type !== 'CUSTOM' && (
          <div className="col-span-2 sm:col-span-4 text-[12px] text-[#64748b]">{item.notes}</div>
        )}
      </div>
      {canManage && !history && (
        <div className="flex gap-2 shrink-0">
          <button className="tb text-[12px]" onClick={() => openEdit(item)}>
            {c.edit}
          </button>
          <button className="tb text-[12px] text-rose-700" onClick={() => endRule(item)}>
            {c.end}
          </button>
        </div>
      )}
    </div>
  );

  if (error) return <div className="card p-5 rounded-2xl bg-white border border-[#dce5f0] text-[13px] text-rose-700">{error}</div>;
  if (!data) {
    return (
      <div className="card p-10 rounded-2xl bg-white border border-[#dce5f0] flex justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-4 border-[#063b78] border-t-transparent" />
      </div>
    );
  }

  const edit = modal?.mode === 'edit' ? modal.item : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="text-lg font-bold text-[#063b78]">{c.current}</h2>
          {canManage && (
            <button className="primary text-[12.5px]" onClick={openCreate}>
              <Icon name="plus" size={15} />
              <span>{c.add}</span>
            </button>
          )}
        </div>
        {data.current.length === 0 && data.upcoming.length === 0 ? (
          <p className="text-[13px] text-[#64748b]">{c.none}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {data.current.map((i) => (
              <Row key={i.id} item={i} />
            ))}
            {data.upcoming.map((i) => (
              <Row key={i.id} item={i} />
            ))}
          </div>
        )}
      </div>

      <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
        <h2 className="text-lg font-bold text-[#063b78] mb-4">{c.history}</h2>
        {data.history.length === 0 ? (
          <p className="text-[13px] text-[#64748b]">{c.noHistory}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {data.history.map((i) => (
              <Row key={i.id} item={i} history />
            ))}
          </div>
        )}
      </div>

      <div className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
        <h2 className="text-lg font-bold text-[#063b78]">{s.mySalary}</h2>
        <p className="text-[12.5px] text-[#64748b] mb-4">{s.mySalaryDesc}</p>
        {!salary || salary.length === 0 ? (
          <p className="text-[13px] text-[#64748b]">{s.noHistory}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {salary.map((h) => (
              <div key={h.id} className="rounded-xl border border-[#e4ebf5] p-3.5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="font-bold text-[#092f63] text-[13.5px]">{monthName(h.year, h.month)}</div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${statusCls[h.status] || ''}`}>
                    {statusText[h.status] || h.status}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-3 text-[12.5px]">
                  <div>
                    <div className="text-[11px] font-bold text-[#8795ab] uppercase">{s.netPayable}</div>
                    <div className="font-extrabold text-[#063b78] num">{num(h.netAmount)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-[#8795ab] uppercase">{s.paid}</div>
                    <div className="font-bold text-emerald-700 num">{num(h.paidAmount)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-[#8795ab] uppercase">{s.remaining}</div>
                    <div className="font-bold text-rose-700 num">{num(h.remainingAmount)}</div>
                  </div>
                </div>
                <ul className="mt-2 text-[12px] text-[#55637a] list-disc pl-5">
                  {h.lines.map((l, idx) => (
                    <li key={idx}>
                      <SalaryLineText line={l} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card p-6 bg-white max-w-lg w-full shadow-2xl space-y-4 rounded-2xl max-h-[90vh] overflow-y-auto scroll">
            <div className="flex items-center justify-between pb-3 border-b border-[#edf2f7]">
              <h3 className="font-extrabold text-base text-[#063b78]">{edit ? c.edit : c.add}</h3>
              <button onClick={() => setModal(null)} className="text-[#64748b] hover:text-black p-1 rounded-lg" aria-label={c.cancel}>
                <Icon name="x" size={18} />
              </button>
            </div>
            {formError && <div className="text-[12.5px] text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{formError}</div>}

            <div className="fld">
              <label className="text-[12.5px] font-bold text-[#334155]">{c.type} *</label>
              <select
                value={form.type}
                disabled={!!edit}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value as typeof form.type, courseId: '', batchId: '', assignmentId: '' })
                }
                className={inputCls}
              >
                {COMPENSATION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {c[t]}
                  </option>
                ))}
              </select>
              <p className="text-[11.5px] text-[#64748b] mt-1">{c[`${form.type}_HINT` as 'MONTHLY_FIXED_HINT']}</p>
            </div>

            {needsAssignment && !edit && (
              <>
                {active.length === 0 ? (
                  <p className="text-[12.5px] text-amber-700">{c.noAssignments}</p>
                ) : (
                  <>
                    <div className="fld">
                      <label className="text-[12.5px] font-bold text-[#334155]">{dict.teachers.course} *</label>
                      <select
                        value={form.courseId}
                        onChange={(e) => setForm({ ...form, courseId: e.target.value, batchId: '', assignmentId: '' })}
                        className={inputCls}
                      >
                        <option value="">-- {c.selectCourse} --</option>
                        {courses.map((co) => (
                          <option key={co.id} value={co.id}>
                            {label(lang, co)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="fld">
                      <label className="text-[12.5px] font-bold text-[#334155]">{dict.teachers.batch} *</label>
                      <select
                        value={form.batchId}
                        disabled={!form.courseId}
                        onChange={(e) => setForm({ ...form, batchId: e.target.value, assignmentId: '' })}
                        className={inputCls}
                      >
                        <option value="">-- {c.selectBatch} --</option>
                        {batches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {label(lang, b)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="fld">
                      <label className="text-[12.5px] font-bold text-[#334155]">{s.subject} *</label>
                      <select
                        value={form.assignmentId}
                        disabled={!form.batchId}
                        onChange={(e) => setForm({ ...form, assignmentId: e.target.value })}
                        className={inputCls}
                      >
                        <option value="">-- {c.selectSubject} --</option>
                        {subjectsForBatch.map((a) => (
                          <option key={a.id} value={a.id}>
                            {label(lang, a.subject)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </>
            )}

            {edit && edit.assignment && (
              <div className="text-[12.5px] font-semibold text-[#092f63] bg-[#f4f8fd] rounded-xl px-3 py-2">{assignmentText(edit)}</div>
            )}

            {!needsAssignment && !teacherBranchId && !edit && (
              <div className="fld">
                <label className="text-[12.5px] font-bold text-[#334155]">{c.branch} *</label>
                <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} className={inputCls}>
                  <option value="">--</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {label(lang, b)}
                    </option>
                  ))}
                </select>
                <p className="text-[11.5px] text-[#64748b] mt-1">{c.branchHint}</p>
              </div>
            )}

            <div className="fld">
              <label className="text-[12.5px] font-bold text-[#334155]">
                {c.amountRate} * <span className="font-medium text-[#64748b]">({form.type === 'PER_CLASS' ? c.perClass : c.perMonth})</span>
              </label>
              <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputCls} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="fld">
                <label className="text-[12.5px] font-bold text-[#334155]">{c.effectiveFrom} *</label>
                <input type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} className={inputCls} />
              </div>
              <div className="fld">
                <label className="text-[12.5px] font-bold text-[#334155]">{c.effectiveTo}</label>
                <input type="date" value={form.effectiveTo} onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })} className={inputCls} />
              </div>
            </div>
            {edit && <p className="text-[11.5px] text-[#64748b]">{c.lockedHint}</p>}

            <div className="fld">
              <label className="text-[12.5px] font-bold text-[#334155]">{c.notes}</label>
              <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#edf2f7]">
              <button className="tb" onClick={() => setModal(null)}>
                {c.cancel}
              </button>
              <button
                className="primary"
                disabled={saving || !form.amount || (needsAssignment && !edit && !form.assignmentId)}
                onClick={save}
              >
                {saving ? c.saving : c.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
