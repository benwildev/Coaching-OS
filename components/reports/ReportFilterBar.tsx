'use client';

import { useEffect, useMemo, useState } from 'react';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY, pickLocalized } from '@/lib/i18n';
import type { ReportParams } from '@/lib/reports/client';
import type { ReportOptions } from '@/lib/reports/options';

export type FilterField =
  | 'academicSessionId'
  | 'branchId'
  | 'programId'
  | 'classId'
  | 'groupId'
  | 'courseId'
  | 'batchId'
  | 'subjectId'
  | 'teacherId'
  | 'dateRange'
  | 'status'
  | 'method'
  | 'channel'
  | 'event'
  | 'examType'
  | 'resultScope'
  | 'granularity'
  | 'compare'
  | 'overdueOnly'
  | 'adjustmentType'
  | 'search';

/** Keys that are view state, not filters — preserved across Apply/Reset. */
const VIEW_KEYS = ['view', 'examId', 'studentId'];

/**
 * Reusable report filter bar. Edits are local until Apply, which writes
 * them to the URL (no full reload). Every option list comes from
 * /api/reports/options, which is already narrowed to the caller's scope.
 */
export default function ReportFilterBar({
  fields,
  params,
  onApply,
  options,
  statusOptions,
  statusLabel,
  keepKeys = [],
}: {
  fields: FilterField[];
  params: ReportParams;
  onApply: (next: ReportParams) => void;
  options: ReportOptions | null;
  statusOptions?: Array<{ value: string; label: string }>;
  statusLabel?: string;
  keepKeys?: string[];
}) {
  const { lang } = useApp();
  const D = DICTIONARY[lang] as any;
  const F = DICTIONARY[lang].reports.filter;
  const [draft, setDraft] = useState<ReportParams>(params);
  useEffect(() => setDraft(params), [params]);

  const set = (k: string, v: string) => {
    setDraft((d) => {
      const next = { ...d, [k]: v };
      // Clear dependent selections so a hidden, now-invalid child filter is never submitted.
      const dependents: Record<string, string[]> = {
        programId: ['classId', 'groupId', 'batchId'],
        classId: ['groupId', 'batchId', 'subjectId'],
        branchId: ['batchId'],
        academicSessionId: ['batchId'],
      };
      for (const dep of dependents[k] || []) delete next[dep];
      return next;
    });
  };

  const name = (o: { name: string; banglaName?: string | null }) => pickLocalized(lang, o.name, o.banglaName);
  const opts = useMemo(() => {
    const o = options;
    if (!o) return null;
    return {
      sessions: o.sessions.map((s) => ({ value: s.id, label: name(s) + (s.isCurrent ? ' ★' : '') })),
      branches: o.branches.map((b) => ({ value: b.id, label: name(b) })),
      programs: o.programs.map((p) => ({ value: p.id, label: name(p) })),
      classes: o.classes.filter((c) => !draft.programId || c.academicProgramId === draft.programId).map((c) => ({ value: c.id, label: name(c) })),
      groups: o.groups.filter((g) => !draft.classId || g.academicClassId === draft.classId).map((g) => ({ value: g.id, label: name(g) })),
      courses: o.courses.filter((c) => !draft.classId || c.academicClassId === draft.classId).map((c) => ({ value: c.id, label: name(c) })),
      batches: o.batches
        .filter(
          (b) =>
            (!draft.branchId || b.branchId === draft.branchId) &&
            (!draft.academicSessionId || b.academicSessionId === draft.academicSessionId) &&
            (!draft.programId || b.academicProgramId === draft.programId) &&
            (!draft.classId || b.academicClassId === draft.classId)
        )
        .map((b) => ({ value: b.id, label: `${name(b)} (${b.code})` })),
      subjects: o.subjects.filter((s) => !draft.classId || s.academicClassId === draft.classId).map((s) => ({ value: s.id, label: name(s) })),
      teachers: o.teachers.map((t) => ({ value: t.id, label: `${name(t)} (${t.teacherCode})` })),
      methods: o.paymentMethods.map((m) => ({ value: m, label: D.paymentMethod?.[m] ?? m })),
      channels: o.channels.map((c) => ({ value: c, label: c })),
      events: o.events.map((e) => ({ value: e, label: D.notificationEvent?.[e] ?? e })),
      examTypes: o.examTypes.map((e) => ({ value: e, label: D.examType?.[e] ?? e })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, draft.programId, draft.classId, draft.branchId, draft.academicSessionId, lang]);

  const select = (key: string, label: string, items: Array<{ value: string; label: string }>, anyLabel: string = F.all, disabled = false) => (
    <label key={key} className="flex flex-col gap-1 min-w-0">
      <span className="text-[11px] font-bold text-[#64748b] uppercase tracking-wide truncate">{label}</span>
      <select
        value={draft[key] || ''}
        disabled={disabled}
        onChange={(e) => set(key, e.target.value)}
        className="h-10 w-full rounded-lg border border-[#dce5f0] bg-white px-2 text-[13px] min-w-0"
      >
        {anyLabel !== '' && <option value="">{anyLabel}</option>}
        {items.map((i) => (
          <option key={i.value} value={i.value}>
            {i.label}
          </option>
        ))}
      </select>
    </label>
  );

  const renderField = (f: FilterField) => {
    if (!opts) return null;
    switch (f) {
      case 'academicSessionId':
        return select(f, F.academicYear, opts.sessions);
      case 'branchId':
        return options?.branchLocked ? select(f, F.branch, opts.branches, '', true) : select(f, F.branch, opts.branches);
      case 'programId':
        return select(f, F.program, opts.programs);
      case 'classId':
        return select(f, F.class, opts.classes);
      case 'groupId':
        return select(f, F.group, opts.groups);
      case 'courseId':
        return select(f, F.course, opts.courses);
      case 'batchId':
        return select(f, F.batch, opts.batches);
      case 'subjectId':
        return select(f, F.subject, opts.subjects);
      case 'teacherId':
        return options?.role === 'TEACHER' ? null : select(f, F.teacher, opts.teachers);
      case 'status':
        return select(f, statusLabel || F.status, statusOptions || []);
      case 'method':
        return select(f, F.method, opts.methods);
      case 'channel':
        return select(f, F.channel, opts.channels);
      case 'event':
        return select(f, F.event, opts.events);
      case 'examType':
        return select(f, F.examType, opts.examTypes);
      case 'adjustmentType':
        return select(f, F.adjustmentType, [
          { value: 'DISCOUNT', label: DICTIONARY[lang].reports.adjustment.DISCOUNT },
          { value: 'WAIVER', label: DICTIONARY[lang].reports.adjustment.WAIVER },
        ]);
      case 'resultScope':
        return options?.permissions.internalResults
          ? select(f, F.resultScope, [
              { value: 'published', label: F.published },
              { value: 'internal', label: F.internal },
            ], '')
          : null;
      case 'granularity':
        return select(f, F.granularity, [
          { value: 'day', label: F.day },
          { value: 'week', label: F.week },
          { value: 'month', label: F.month },
        ], '');
      case 'compare':
        return select(f, F.compare, [
          { value: 'none', label: F.compareNone },
          { value: 'previous', label: F.comparePrevious },
        ], '');
      case 'overdueOnly':
        return (
          <label key={f} className="flex items-center gap-2 h-10 mt-auto text-[13px] font-semibold text-[#092f63]">
            <input type="checkbox" checked={draft.overdueOnly === 'true'} onChange={(e) => set('overdueOnly', e.target.checked ? 'true' : '')} className="w-4 h-4" />
            {F.overdueOnly}
          </label>
        );
      case 'dateRange':
        return (
          <div key={f} className="contents">
            <label className="flex flex-col gap-1 min-w-0">
              <span className="text-[11px] font-bold text-[#64748b] uppercase tracking-wide">{F.dateFrom}</span>
              <input type="date" value={draft.dateFrom || ''} max={draft.dateTo || undefined} onChange={(e) => set('dateFrom', e.target.value)} className="h-10 w-full rounded-lg border border-[#dce5f0] bg-white px-2 text-[13px] min-w-0" />
            </label>
            <label className="flex flex-col gap-1 min-w-0">
              <span className="text-[11px] font-bold text-[#64748b] uppercase tracking-wide">{F.dateTo}</span>
              <input type="date" value={draft.dateTo || ''} min={draft.dateFrom || undefined} onChange={(e) => set('dateTo', e.target.value)} className="h-10 w-full rounded-lg border border-[#dce5f0] bg-white px-2 text-[13px] min-w-0" />
            </label>
          </div>
        );
      case 'search':
        return (
          <label key={f} className="flex flex-col gap-1 min-w-0 col-span-2">
            <span className="text-[11px] font-bold text-[#64748b] uppercase tracking-wide">{F.search}</span>
            <input
              type="search"
              value={draft.search || ''}
              maxLength={100}
              placeholder={F.searchPlaceholder}
              onChange={(e) => set('search', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && apply()}
              className="h-10 w-full rounded-lg border border-[#dce5f0] bg-white px-3 text-[13px] min-w-0"
            />
          </label>
        );
    }
  };

  const keep = (src: ReportParams) => Object.fromEntries(Object.entries(src).filter(([k]) => VIEW_KEYS.includes(k) || keepKeys.includes(k)));
  const apply = () => onApply({ ...draft, page: '' });
  const reset = () => onApply(keep(params));

  return (
    <form
      className="no-print bg-white p-4 rounded-2xl border border-[#dce5f0] shadow-xs"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
      aria-label={F.filters}
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 items-end">
        {fields.map(renderField)}
        <div className="col-span-2 flex gap-2 items-end">
          <button type="submit" className="btn-navy h-10 grow justify-center">
            <Icon name="check2" size={15} />
            {F.apply}
          </button>
          <button type="button" className="tb h-10" onClick={reset}>
            {F.reset}
          </button>
        </div>
      </div>
    </form>
  );
}
