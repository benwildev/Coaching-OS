'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate, localizeNumber } from '@/lib/i18n';
import { saApi, fromLimit } from '@/lib/super-admin-client';
import {
  FEATURE_KEYS,
  LIMIT_KEYS,
  addDuration,
  computeRenewalEnd,
  type Duration,
  type FeatureKey,
  type LimitKey,
  type OverrideMeta,
} from '@/lib/subscription';

interface LimitRow { key: LimitKey; planValue: number | null; overridden: boolean; overrideValue?: number | null; overrideMeta: OverrideMeta | null; effective: number | null; used: number; over: number }
interface FeatureRow { key: FeatureKey; planValue: boolean; overridden: boolean; overrideValue?: boolean; overrideMeta: OverrideMeta | null; effective: boolean }
interface Overview {
  tenant: { name: string; status: string };
  subscription: { hasSubscription: boolean; status: string; storedStatus: string | null; isTrial: boolean; startDate: string | null; endDate: string | null; planName: string | null; planBanglaName: string | null; planVersion: number | null; currentPlanVersion: number | null; planOutdated: boolean; planArchived: boolean };
  limits: LimitRow[];
  features: FeatureRow[];
  overLimits: Array<{ key: LimitKey; used: number; limit: number; over: number }>;
}
interface HistoryRow { id: string; action: string; at: string; by: string | null; reason: string | null }
interface PlanOption { id: string; name: string; banglaName?: string | null; status: string; version: number }
interface PlanPreview {
  from: { name: string | null; version: number };
  to: { name: string; version: number };
  limitsBefore: Record<LimitKey, number | null>;
  limitsAfter: Record<LimitKey, number | null>;
  overLimits: Array<{ key: LimitKey; used: number; limit: number; over: number }>;
  overridesWillBeCleared: boolean;
}

type Mode = 'assign' | 'renew' | 'extend' | 'change' | 'trialStart' | 'trialExtend' | 'trialEnd' | 'trialConvert' | 'overrides' | 'suspend' | 'reactivate' | 'cancel' | 'restore' | 'resync' | null;

const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-[560px] max-h-[92vh] overflow-y-auto rounded-2xl bg-white border border-[#dce5f0] shadow-xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-[#063b78]">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-[#64748b] hover:text-[#063b78] text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function SubscriptionOps({ tenantId, onChanged }: { tenantId: string; onChanged?: () => void }) {
  const { lang, showToast } = useApp();
  const t = DICTIONARY[lang].subOps;
  const sd = DICTIONARY[lang].subscription;
  const num = (n: number) => localizeNumber(lang, n);
  const statusName = (s: string) => (sd.statusNames as Record<string, string>)[s] || s;
  const resName = (k: LimitKey) => (sd.resources as Record<string, string>)[
    { maxStudents: 'students', maxTeachers: 'teachers', maxStaffUsers: 'staffUsers', maxPortalAccounts: 'portalAccounts', maxBranches: 'branches', maxSms: 'sms', maxWhatsapp: 'whatsapp', maxEmail: 'email', maxStorageMb: 'storageMb' }[k]
  ];
  const lim = (v: number | null) => (v === null ? t.unlimited : num(v));

  const [ov, setOv] = useState<Overview | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [idem, setIdem] = useState(newKey());

  // form state (reset every time a dialog opens)
  const [planId, setPlanId] = useState('');
  const [assignMode, setAssignMode] = useState<'TRIAL' | 'PAID'>('PAID');
  const [months, setMonths] = useState('1');
  const [customMonths, setCustomMonths] = useState('');
  const [daysVal, setDaysVal] = useState('7');
  const [reason, setReason] = useState('');
  const [keepOverrides, setKeepOverrides] = useState(false);
  const [preview, setPreview] = useState<PlanPreview | null>(null);
  const [ovLimits, setOvLimits] = useState<Record<string, { mode: 'inherit' | 'value' | 'unlimited'; value: string }>>({});
  const [ovFeatures, setOvFeatures] = useState<Record<string, 'inherit' | 'on' | 'off'>>({});

  const load = useCallback(async () => {
    const [o, h, p] = await Promise.all([
      saApi<Overview>(`/api/super-admin/coaching-centers/${tenantId}/subscription`),
      saApi<{ history: HistoryRow[] }>(`/api/super-admin/coaching-centers/${tenantId}/subscription/history`),
      saApi<{ plans: PlanOption[] }>('/api/super-admin/plans'),
    ]);
    if (o.ok) setOv(o.data as Overview);
    if (h.ok) setHistory(h.data.history);
    if (p.ok) setPlans(p.data.plans);
  }, [tenantId]);
  useEffect(() => { load(); }, [load]);

  const open = (m: Mode) => {
    setError(null); setWarnings([]); setReason(''); setPreview(null); setKeepOverrides(false);
    setPlanId(''); setMonths('1'); setCustomMonths(''); setDaysVal('7'); setAssignMode('PAID'); setIdem(newKey());
    if (m === 'overrides' && ov) {
      setOvLimits(Object.fromEntries(ov.limits.map((r) => [r.key, r.overridden ? (r.overrideValue === null ? { mode: 'unlimited' as const, value: '' } : { mode: 'value' as const, value: String(r.overrideValue) }) : { mode: 'inherit' as const, value: '' }])));
      setOvFeatures(Object.fromEntries(ov.features.map((r) => [r.key, r.overridden ? (r.overrideValue ? 'on' : 'off') : 'inherit'])) as Record<string, 'inherit' | 'on' | 'off'>);
    }
    setMode(m);
  };

  const duration: Duration = useMemo(() => (months === 'custom' ? { unit: 'MONTHS', value: Number(customMonths) || 0 } : { unit: 'MONTHS', value: Number(months) }), [months, customMonths]);
  const durationValid = duration.value >= 1 && duration.value <= 60;
  const sub = ov?.subscription;
  const activePlans = plans.filter((p) => p.status === 'ACTIVE');

  // Same rule the server applies (lib/subscription.ts), shown as a preview only — the server recalculates.
  const previewExpiry = useMemo(() => {
    if (!sub || !durationValid) return null;
    const now = new Date();
    if (mode === 'renew' && sub.storedStatus === 'TRIAL') return addDuration(now, duration);
    if (mode === 'renew') return computeRenewalEnd(sub.endDate ? new Date(sub.endDate) : null, now, duration);
    if (mode === 'extend') return computeRenewalEnd(sub.endDate ? new Date(sub.endDate) : null, now, { unit: 'DAYS', value: Number(daysVal) || 0 });
    if (mode === 'trialExtend') return computeRenewalEnd(sub.endDate ? new Date(sub.endDate) : null, now, { unit: 'DAYS', value: Number(daysVal) || 0 });
    if (mode === 'trialConvert' || mode === 'restore') return addDuration(now, duration);
    return null;
  }, [sub, mode, duration, durationValid, daysVal]);

  // Ask the server what a plan change would do (limits before/after, over-limit, overrides cleared).
  useEffect(() => {
    if (mode !== 'change' || !planId) { setPreview(null); return; }
    saApi<{ result: { preview: PlanPreview } }>(`/api/super-admin/coaching-centers/${tenantId}/subscription/change-plan`, { method: 'POST', body: { planId, keepOverrides, preview: true } })
      .then((r) => (r.ok ? setPreview(r.data.result.preview) : setPreview(null)));
  }, [mode, planId, keepOverrides, tenantId]);

  const fail = (r: { data: { error?: string; message?: string; details?: Record<string, string[]> } }) => {
    const known = (t.errors as Record<string, string>)[r.data.error || ''];
    const detail = r.data.details ? Object.values(r.data.details).flat().join(' ') : '';
    setError(known ? `${known}${detail ? ` ${detail}` : ''}` : r.data.message || r.data.error || 'Error');
  };

  const run = async (path: string, body: Record<string, unknown>, method: 'POST' | 'PUT' = 'POST') => {
    setBusy(true); setError(null);
    const r = await saApi<{ result?: { warnings?: string[] } }>(`/api/super-admin/coaching-centers/${tenantId}${path}`, { method, body: { ...body, idempotencyKey: idem } });
    setBusy(false);
    if (r.ok) {
      showToast(t.saved);
      const w = r.data.result?.warnings;
      if (w && w.length) setWarnings(w); else setMode(null);
      await load(); onChanged?.();
    } else fail(r);
  };

  const requireReason = reason.trim().length >= 3;

  const submit = () => {
    switch (mode) {
      case 'assign': return run('/subscription/assign', { planId, mode: assignMode, ...(assignMode === 'TRIAL' ? (Number(daysVal) ? { trialDays: Number(daysVal) } : {}) : { duration }), reason: reason || undefined });
      case 'renew': return run('/subscription/renew', { duration, reason: reason || undefined });
      case 'extend': return run('/subscription/extend', { days: Number(daysVal), reason: reason || undefined });
      case 'change': return run('/subscription/change-plan', { planId, keepOverrides, reason, confirm: true });
      case 'trialStart': return run('/subscription/trial', { action: 'start', ...(Number(daysVal) ? { trialDays: Number(daysVal) } : {}), reason: reason || undefined });
      case 'trialExtend': return run('/subscription/trial', { action: 'extend', days: Number(daysVal), reason: reason || undefined });
      case 'trialEnd': return run('/subscription/trial', { action: 'end', reason, confirm: true });
      case 'trialConvert': return run('/subscription/trial', { action: 'convert', duration, reason: reason || undefined });
      case 'cancel': return run('/subscription/cancel', { reason, confirm: true });
      case 'restore': return run('/subscription/restore', { duration, reason, confirm: true });
      case 'resync': return run('/subscription/resync', { reason, confirm: true });
      case 'suspend': return run('/status', { status: 'SUSPENDED', reason, confirm: true }, 'PUT' as const);
      case 'reactivate': return run('/status', { status: 'ACTIVE', reason: reason || undefined, confirm: true }, 'PUT' as const);
      case 'overrides': {
        const limits: Record<string, number | null> = {};
        for (const k of LIMIT_KEYS) {
          const o = ovLimits[k];
          if (o?.mode === 'unlimited') limits[k] = null;
          else if (o?.mode === 'value' && o.value.trim() !== '') limits[k] = Math.max(0, Math.floor(Number(o.value)) || 0);
        }
        const features: Record<string, boolean> = {};
        for (const k of FEATURE_KEYS) if (ovFeatures[k] && ovFeatures[k] !== 'inherit') features[k] = ovFeatures[k] === 'on';
        return run('/subscription/overrides', { limits, features, reason }, 'PUT');
      }
    }
  };

  if (!ov || !sub) return <div className="py-10 flex justify-center"><div className="h-7 w-7 animate-spin rounded-full border-4 border-[#063b78] border-t-transparent" /></div>;

  const card = 'card p-5 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs';
  const isSuspended = ov.tenant.status === 'SUSPENDED';
  const cancelled = sub.storedStatus === 'CANCELLED';
  const planLabel = sub.planName ? (lang === 'bn' && sub.planBanglaName ? sub.planBanglaName : sub.planName) : '—';
  const needsReason = ['change', 'trialEnd', 'cancel', 'restore', 'suspend', 'overrides', 'resync'].includes(mode || '');
  const needsPlan = mode === 'assign' || mode === 'change';
  const needsDuration = ['assign', 'renew', 'trialConvert', 'restore'].includes(mode || '') && !(mode === 'assign' && assignMode === 'TRIAL');
  const needsDays = ['extend', 'trialExtend', 'trialStart'].includes(mode || '') || (mode === 'assign' && assignMode === 'TRIAL');
  const canSubmit =
    !busy &&
    (!needsReason || requireReason) &&
    (!needsPlan || !!planId) &&
    (!needsDuration || durationValid) &&
    (!['extend', 'trialExtend'].includes(mode || '') || Number(daysVal) >= 1);
  const titles: Record<string, string> = { assign: t.assignPlan, renew: t.renew, extend: t.extend, change: t.changePlan, trialStart: t.startTrial, trialExtend: t.extendTrial, trialEnd: t.endTrial, trialConvert: t.convertTrial, overrides: t.overrideLimits, suspend: t.suspend, reactivate: t.reactivate, cancel: t.cancel, restore: t.restore, resync: t.sync };

  return (
    <div className="flex flex-col gap-5">
      {!sub.hasSubscription && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900">
          <div className="font-bold">{t.noSubscriptionTitle}</div>
          <p className="text-[13px] mt-1">{t.noSubscriptionBody}</p>
        </div>
      )}

      <div className={card}>
        <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-4 text-[13.5px]">
          <div><div className="text-[11.5px] uppercase tracking-wider font-semibold text-[#64748b]">{t.plan}</div><div className="font-bold text-[#092f63]">{planLabel}{sub.planArchived ? ` · ${t.archivedPlan}` : ''}</div></div>
          <div><div className="text-[11.5px] uppercase tracking-wider font-semibold text-[#64748b]">{t.status}</div><div className="font-bold text-[#092f63]">{isSuspended ? statusName('SUSPENDED') : statusName(sub.status)}</div></div>
          <div><div className="text-[11.5px] uppercase tracking-wider font-semibold text-[#64748b]">{t.type}</div><div className="font-bold text-[#092f63]">{sub.hasSubscription ? (sub.isTrial ? t.trialType : t.paidType) : '—'}</div></div>
          <div><div className="text-[11.5px] uppercase tracking-wider font-semibold text-[#64748b]">{t.startedOn}</div><div className="font-bold text-[#092f63]">{sub.startDate ? formatDhakaDate(sub.startDate) : '—'}</div></div>
          <div><div className="text-[11.5px] uppercase tracking-wider font-semibold text-[#64748b]">{sub.isTrial ? t.trialExpiry : t.expiresOn}</div><div className="font-bold text-[#092f63]">{sub.endDate ? formatDhakaDate(sub.endDate) : '—'}</div></div>
          <div><div className="text-[11.5px] uppercase tracking-wider font-semibold text-[#64748b]">{t.planVersion}</div><div className="font-bold text-[#092f63]">{sub.planVersion ?? '—'}</div></div>
        </div>
        {sub.planOutdated && (
          <div className="mt-3 flex items-center gap-3 flex-wrap text-[13px] text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <span>{t.outdated} (v{sub.planVersion} → v{sub.currentPlanVersion})</span>
            <button type="button" className="tb" onClick={() => open('resync')}>{t.sync}</button>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {!sub.hasSubscription && <button type="button" className="primary" onClick={() => open('assign')}>{t.assignPlan}</button>}
          {sub.hasSubscription && !cancelled && <button type="button" className="primary" onClick={() => open('renew')}>{t.renew}</button>}
          {sub.hasSubscription && !cancelled && <button type="button" className="tb" onClick={() => open('extend')}>{t.extend}</button>}
          {sub.hasSubscription && !cancelled && <button type="button" className="tb" onClick={() => open('change')}>{t.changePlan}</button>}
          {sub.storedStatus === 'TRIAL' && <button type="button" className="tb" onClick={() => open('trialExtend')}>{t.extendTrial}</button>}
          {sub.storedStatus === 'TRIAL' && <button type="button" className="tb" onClick={() => open('trialConvert')}>{t.convertTrial}</button>}
          {sub.storedStatus === 'TRIAL' && <button type="button" className="tb" onClick={() => open('trialEnd')}>{t.endTrial}</button>}
          {sub.hasSubscription && sub.status === 'EXPIRED' && <button type="button" className="tb" onClick={() => open('trialStart')}>{t.startTrial}</button>}
          {sub.hasSubscription && !cancelled && <button type="button" className="tb" onClick={() => open('overrides')}>{t.overrideLimits}</button>}
          {isSuspended ? <button type="button" className="tb text-emerald-700" onClick={() => open('reactivate')}>{t.reactivate}</button> : <button type="button" className="tb text-rose-600" onClick={() => open('suspend')}>{t.suspend}</button>}
          {sub.hasSubscription && !cancelled && <button type="button" className="tb text-rose-600" onClick={() => open('cancel')}>{t.cancel}</button>}
          {cancelled && <button type="button" className="primary" onClick={() => open('restore')}>{t.restore}</button>}
        </div>
      </div>

      <div className={`${card} overflow-x-auto`}>
        <h3 className="font-bold text-[#063b78] mb-2">{t.limitsTitle}</h3>
        {ov.overLimits.length > 0 && <p className="text-[12.5px] text-rose-700 mb-2">{t.overLimitNote}</p>}
        <table className="w-full text-[13px]">
          <thead><tr className="text-left text-[#64748b] border-b border-[#edf1f7]">{[t.limit, t.planLimit, t.override, t.effectiveLimit, t.used].map((h) => <th key={h} className="py-2 pr-3 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>
            {ov.limits.map((r) => (
              <tr key={r.key} className="border-b border-[#f1f5f9] align-top">
                <td className="py-2 pr-3 font-semibold text-[#092f63]">{resName(r.key)}</td>
                <td className="py-2 pr-3 num">{sub.hasSubscription ? lim(r.planValue) : '—'}</td>
                <td className="py-2 pr-3">
                  {r.overridden ? (
                    <div>
                      <div className="font-bold num">{lim(r.overrideValue ?? null)}</div>
                      {r.overrideMeta && <div className="text-[11px] text-[#64748b]">{r.overrideMeta.reason} · {t.setBy} {r.overrideMeta.updatedBy} · {formatDhakaDate(r.overrideMeta.updatedAt)}</div>}
                    </div>
                  ) : '—'}
                </td>
                <td className="py-2 pr-3 font-bold num">{lim(r.effective)}</td>
                <td className="py-2 pr-3 num">
                  {num(r.used)}{r.effective !== null ? ` / ${num(r.effective)}` : ''}
                  {r.over > 0 && <div className="text-[11.5px] font-semibold text-rose-600">{t.overBy.replace('{n}', num(r.over))}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`${card} overflow-x-auto`}>
        <h3 className="font-bold text-[#063b78] mb-2">{t.featuresTitle}</h3>
        <table className="w-full text-[13px]">
          <thead><tr className="text-left text-[#64748b] border-b border-[#edf1f7]">{[t.featuresTitle, t.planLimit, t.override, t.effectiveLimit].map((h) => <th key={h} className="py-2 pr-3 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {ov.features.map((r) => (
              <tr key={r.key} className="border-b border-[#f1f5f9] align-top">
                <td className="py-2 pr-3 font-semibold text-[#092f63]">{(sd.featureNames as Record<string, string>)[r.key]}</td>
                <td className="py-2 pr-3">{r.planValue ? '✓' : '✕'}</td>
                <td className="py-2 pr-3">{r.overridden ? <div><b>{r.overrideValue ? t.on : t.off}</b>{r.overrideMeta && <div className="text-[11px] text-[#64748b]">{r.overrideMeta.reason} · {r.overrideMeta.updatedBy}</div>}</div> : '—'}</td>
                <td className={`py-2 pr-3 font-bold ${r.effective ? 'text-emerald-700' : 'text-rose-600'}`}>{r.effective ? t.on : t.off}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={card}>
        <h3 className="font-bold text-[#063b78] mb-2">{t.historyTitle}</h3>
        {history.length === 0 ? <p className="text-[13px] text-[#94a3b8]">{t.noHistory}</p> : (
          <ol className="flex flex-col divide-y divide-[#edf1f7]">
            {history.map((h) => (
              <li key={h.id} className="py-2 text-[13px] flex flex-wrap items-baseline justify-between gap-2">
                <span><b className="text-[#092f63]">{(t.actions as Record<string, string>)[h.action] || h.action}</b>{h.reason ? <span className="text-[#64748b]"> — {h.reason}</span> : null}</span>
                <span className="text-[12px] text-[#64748b]">{formatDhakaDate(h.at)}{h.by ? ` · ${t.by} ${h.by}` : ''}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {mode && (
        <Modal title={titles[mode]} onClose={() => setMode(null)}>
          {warnings.length > 0 ? (
            <>
              {warnings.map((w) => <div key={w} className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[13px] text-amber-900">{(t.warnings as Record<string, string>)[w] || w}</div>)}
              <button type="button" className="primary" onClick={() => setMode(null)}>{t.close}</button>
            </>
          ) : (
            <>
              <div className="rounded-xl bg-[#f5f8fc] border border-[#dce5f0] p-3 text-[13px] grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <span className="text-[#64748b]">{t.tenant}</span><b>{ov.tenant.name}</b>
                <span className="text-[#64748b]">{t.current}</span><b>{isSuspended ? statusName('SUSPENDED') : `${planLabel} · ${statusName(sub.status)}`}</b>
                {mode === 'suspend' && (<><span className="text-[#64748b]">{t.action}</span><b>{t.suspend}</b></>)}
                {mode === 'reactivate' && (<><span className="text-[#64748b]">{t.action}</span><b>{t.reactivate}</b></>)}
                <span className="text-[#64748b]">{t.effective}</span><b>{t.immediately}</b>
              </div>

              {mode === 'suspend' && <p className="text-[12.5px] text-[#64748b]">{t.confirmSuspendBody}</p>}
              {mode === 'reactivate' && <p className="text-[12.5px] text-[#64748b]">{t.reactivateBody}</p>}
              {mode === 'cancel' && <p className="text-[12.5px] text-[#64748b]">{t.cancelBody}</p>}
              {mode === 'trialEnd' && <p className="text-[12.5px] text-[#64748b]">{t.endTrialBody}</p>}
              {mode === 'trialConvert' && <p className="text-[12.5px] text-[#64748b]">{t.convertBody}</p>}
              {mode === 'restore' && <p className="text-[12.5px] text-[#64748b]">{t.restoreBody}</p>}

              {needsPlan && (
                <div className="fld">
                  <label>{mode === 'change' ? t.newLabel : t.plan}</label>
                  <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
                    <option value="">—</option>
                    {activePlans.filter((p) => mode !== 'change' || p.name !== sub.planName).map((p) => <option key={p.id} value={p.id}>{lang === 'bn' && p.banglaName ? p.banglaName : p.name} (v{p.version})</option>)}
                  </select>
                </div>
              )}

              {mode === 'assign' && (
                <div className="flex gap-4 text-[13px]">
                  <label className="flex items-center gap-1.5"><input type="radio" checked={assignMode === 'PAID'} onChange={() => setAssignMode('PAID')} />{t.startAsPaid}</label>
                  <label className="flex items-center gap-1.5"><input type="radio" checked={assignMode === 'TRIAL'} onChange={() => setAssignMode('TRIAL')} />{t.startAsTrial}</label>
                </div>
              )}

              {needsDuration && (
                <div className="fld">
                  <label>{t.duration}</label>
                  <select value={months} onChange={(e) => setMonths(e.target.value)}>
                    <option value="1">{t.months1}</option><option value="3">{t.months3}</option><option value="6">{t.months6}</option><option value="12">{t.months12}</option><option value="custom">{t.customMonths}</option>
                  </select>
                  {months === 'custom' && <input type="number" min={1} max={60} value={customMonths} onChange={(e) => setCustomMonths(e.target.value)} className="mt-2" />}
                </div>
              )}

              {needsDays && (
                <div className="fld">
                  <label>{mode === 'extend' ? t.days : t.trialDays}</label>
                  <input type="number" min={1} value={daysVal} onChange={(e) => setDaysVal(e.target.value)} />
                </div>
              )}

              {previewExpiry && <div className="text-[13px]"><span className="text-[#64748b]">{t.newExpiry}: </span><b className="text-[#063b78]">{formatDhakaDate(previewExpiry)}</b></div>}
              {(mode === 'renew' || mode === 'extend') && <p className="text-[12px] text-[#64748b]">{t.renewNote}</p>}

              {mode === 'change' && (
                <>
                  <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={keepOverrides} onChange={(e) => setKeepOverrides(e.target.checked)} />{t.keepOverrides}</label>
                  {preview && (
                    <div className="rounded-xl border border-[#dce5f0] p-3 text-[13px] flex flex-col gap-2">
                      <div>{t.current}: <b>{preview.from.name}</b> → {t.newLabel}: <b>{preview.to.name}</b></div>
                      {preview.overridesWillBeCleared && <div className="text-amber-800">{t.overridesCleared}</div>}
                      <table className="w-full text-[12.5px]"><tbody>
                        {LIMIT_KEYS.filter((k) => preview.limitsBefore[k] !== preview.limitsAfter[k]).map((k) => (
                          <tr key={k}><td className="pr-3 py-0.5">{resName(k)}</td><td className="num">{lim(preview.limitsBefore[k])} → <b>{lim(preview.limitsAfter[k])}</b></td></tr>
                        ))}
                      </tbody></table>
                      {preview.overLimits.length > 0 && (
                        <div className="rounded-lg bg-rose-50 border border-rose-200 p-2 text-rose-800">
                          {preview.overLimits.map((o) => <div key={o.key}>{resName(o.key)}: <b className="num">{num(o.used)} / {num(o.limit)}</b> — {t.overBy.replace('{n}', num(o.over))}</div>)}
                          <div className="text-[12px] mt-1">{t.overLimitNote}</div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {mode === 'overrides' && (
                <div className="flex flex-col gap-3">
                  <div className="grid gap-2">
                    {ov.limits.map((r) => {
                      const cur = ovLimits[r.key] || { mode: 'inherit', value: '' };
                      return (
                        <div key={r.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-[13px]">
                          <span><b>{resName(r.key)}</b> <span className="text-[#64748b]">({t.planLimit}: {sub.hasSubscription ? lim(r.planValue) : '—'})</span></span>
                          <select value={cur.mode} onChange={(e) => setOvLimits((p) => ({ ...p, [r.key]: { ...cur, mode: e.target.value as 'inherit' | 'value' | 'unlimited' } }))} className="rounded-lg border border-[#dce5f0] px-2 py-1">
                            <option value="inherit">{t.inherit}</option><option value="value">{t.override}</option><option value="unlimited">{t.unlimited}</option>
                          </select>
                          <input type="number" min={0} disabled={cur.mode !== 'value'} value={cur.mode === 'value' ? cur.value : fromLimit(r.effective)} onChange={(e) => setOvLimits((p) => ({ ...p, [r.key]: { ...cur, value: e.target.value } }))} className="w-24 rounded-lg border border-[#dce5f0] px-2 py-1 disabled:bg-[#f1f5f9]" />
                        </div>
                      );
                    })}
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {ov.features.map((r) => (
                      <label key={r.key} className="flex items-center justify-between gap-2 text-[13px]">
                        <span>{(sd.featureNames as Record<string, string>)[r.key]} <span className="text-[#64748b]">({r.planValue ? t.on : t.off})</span></span>
                        <select value={ovFeatures[r.key] || 'inherit'} onChange={(e) => setOvFeatures((p) => ({ ...p, [r.key]: e.target.value as 'inherit' | 'on' | 'off' }))} className="rounded-lg border border-[#dce5f0] px-2 py-1">
                          <option value="inherit">{t.inherit}</option><option value="on">{t.on}</option><option value="off">{t.off}</option>
                        </select>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="fld">
                <label>{t.reason}{needsReason ? ' *' : ` (${t.optional})`}</label>
                <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
              </div>

              {error && <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-[13px] text-rose-800">{error}</div>}
              <div className="flex gap-2 justify-end">
                <button type="button" className="tb" onClick={() => setMode(null)}>{t.close}</button>
                <button type="button" className="primary disabled:opacity-50" disabled={!canSubmit} onClick={submit}>{busy ? t.working : t.confirm}</button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
