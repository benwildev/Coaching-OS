'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatBDTExact, localizeNumber } from '@/lib/i18n';
import { saApi, fromLimit, toLimit } from '@/lib/super-admin-client';
import { FEATURE_KEYS, LIMIT_KEYS, type FeatureKey, type LimitKey, type Limits } from '@/lib/subscription';

interface Plan {
  id: string; name: string; banglaName?: string | null; code: string; description?: string | null; status: string; version: number;
  limits: Limits; features: Record<FeatureKey, boolean>; priceMonthly: number; priceYearly: number; trialDays: number | null; subscriptionCount: number;
}

const RES: Record<LimitKey, string> = {
  maxStudents: 'students', maxTeachers: 'teachers', maxStaffUsers: 'staffUsers', maxPortalAccounts: 'portalAccounts', maxBranches: 'branches',
  maxSms: 'sms', maxWhatsapp: 'whatsapp', maxEmail: 'email', maxStorageMb: 'storageMb',
};

const blank = () => ({
  id: '', name: '', banglaName: '', code: '', description: '', priceMonthly: '0', priceYearly: '0', trialDays: '',
  limits: Object.fromEntries(LIMIT_KEYS.map((k) => [k, ''])) as Record<LimitKey, string>,
  features: Object.fromEntries(FEATURE_KEYS.map((k) => [k, false])) as Record<FeatureKey, boolean>,
});

/* inline icons */
const PlusIcon = <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 4v10M4 9h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
const EditIcon = <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M10 2.5l2.5 2.5M2.5 12.5V10l7-7L12 5.5l-7 7H2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>;
const ArchiveIcon = <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="2" y="2" width="11" height="3" rx="1" stroke="currentColor" strokeWidth="1.3"/><path d="M3 5v7a1 1 0 001 1h7a1 1 0 001-1V5" stroke="currentColor" strokeWidth="1.3"/><path d="M6 8h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
const RestoreIcon = <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M2.5 7.5a5 5 0 019.5-1.5M12.5 7.5a5 5 0 01-9.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M12 3v3h-3M3 12V9h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const CloseIcon = <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;

export default function PlansPage() {
  const { lang, showToast } = useApp();
  const t = DICTIONARY[lang].superAdmin;
  const sd = DICTIONARY[lang].subscription;
  const [plans, setPlans] = useState<Plan[]>([]);
  const [form, setForm] = useState<ReturnType<typeof blank> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const num = (n: number | null) => (n === null ? sd.unlimited : localizeNumber(lang, n));

  const load = useCallback(async () => {
    const r = await saApi<{ plans: Plan[] }>('/api/super-admin/plans');
    if (r.ok) setPlans(r.data.plans);
  }, []);
  useEffect(() => { load(); }, [load]);

  const edit = (p: Plan) =>
    setForm({
      id: p.id, name: p.name, banglaName: p.banglaName || '', code: p.code, description: p.description || '',
      priceMonthly: String(p.priceMonthly), priceYearly: String(p.priceYearly), trialDays: p.trialDays === null ? '' : String(p.trialDays),
      limits: Object.fromEntries(LIMIT_KEYS.map((k) => [k, fromLimit(p.limits[k])])) as Record<LimitKey, string>,
      features: { ...p.features },
    });

  const save = async () => {
    if (!form) return;
    setError(null);
    const body = {
      name: form.name, banglaName: form.banglaName || null, code: form.code, description: form.description || null,
      priceMonthly: Number(form.priceMonthly) || 0, priceYearly: Number(form.priceYearly) || 0,
      trialDays: form.trialDays === '' ? null : Number(form.trialDays),
      limits: Object.fromEntries(LIMIT_KEYS.map((k) => [k, toLimit(form.limits[k])])),
      features: form.features,
    };
    const r = await saApi(form.id ? `/api/super-admin/plans/${form.id}` : '/api/super-admin/plans', { method: form.id ? 'PUT' : 'POST', body });
    if (r.ok) { showToast(t.saved); setForm(null); load(); } else setError(r.data.message || (r.data.error as string) || 'Error');
  };

  const setStatus = async (p: Plan, status: 'ACTIVE' | 'ARCHIVED') => {
    const r = await saApi(`/api/super-admin/plans/${p.id}`, { method: 'PUT', body: { status } });
    showToast(r.ok ? t.saved : r.data.message || r.data.error || 'Error');
    if (r.ok) load();
  };

  return (
    <div className="flex flex-col gap-6 fade-in">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[22px] font-extrabold text-[#052e5f] tracking-tight">{t.plans}</h1>
          <p className="text-[13px] text-[#64748b] mt-0.5">{t.planLimitHint}</p>
        </div>
        <button type="button" className="primary" onClick={() => setForm(blank())}>
          {PlusIcon}
          <span>{t.createPlan}</span>
        </button>
      </div>

      {/* ── Plans table ────────────────────────────────────────────── */}
      <div className="card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left border-b border-[#edf1f7]">
                {[t.plan, t.priceMonthly, sd.resources.students, sd.resources.teachers, sd.resources.staffUsers, sd.resources.branches, sd.resources.sms, sd.resources.whatsapp, sd.resources.email, t.features, t.status, ''].map((h, i) => (
                  <th key={i} className="px-4 py-3 font-semibold text-[11.5px] uppercase tracking-wide text-[#64748b] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plans.length === 0 ? (
                <tr><td colSpan={12} className="px-4 py-14 text-center text-[#94a3b8] text-[14px]">{t.noData}</td></tr>
              ) : plans.map((p) => (
                <tr key={p.id} className={`border-b border-[#f1f5f9] hover:bg-[#f8fafc] transition-colors ${p.status === 'ARCHIVED' ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="font-bold text-[#052e5f] text-[14px]">{lang === 'bn' && p.banglaName ? p.banglaName : p.name}</div>
                    <div className="text-[11px] font-mono text-[#94a3b8] mt-0.5 flex items-center gap-2">
                      <span>{p.code}</span>
                      <span className="text-[#cbd5e1]">·</span>
                      <span>v{p.version}</span>
                      <span className="text-[#cbd5e1]">·</span>
                      <span className="text-[#64748b]">{t.assignedTo} <b className="num">{localizeNumber(lang, p.subscriptionCount)}</b></span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-bold num text-[#052e5f]">{formatBDTExact(p.priceMonthly, lang)}</td>
                  <td className="px-4 py-3 num">{num(p.limits.maxStudents)}</td>
                  <td className="px-4 py-3 num">{num(p.limits.maxTeachers)}</td>
                  <td className="px-4 py-3 num">{num(p.limits.maxStaffUsers)}</td>
                  <td className="px-4 py-3 num">{num(p.limits.maxBranches)}</td>
                  <td className="px-4 py-3 num">{num(p.limits.maxSms)}</td>
                  <td className="px-4 py-3 num">{num(p.limits.maxWhatsapp)}</td>
                  <td className="px-4 py-3 num">{num(p.limits.maxEmail)}</td>
                  <td className="px-4 py-3 max-w-[180px]">
                    <div className="flex flex-wrap gap-1">
                      {FEATURE_KEYS.filter((k) => p.features[k]).map((k) => (
                        <span key={k} className="inline-block px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10.5px] font-semibold">
                          {(sd.featureNames as Record<string, string>)[k]}
                        </span>
                      ))}
                      {FEATURE_KEYS.filter((k) => p.features[k]).length === 0 && <span className="text-[#cbd5e1]">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-lg ${
                      p.status === 'ARCHIVED' ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'
                    }`}>
                      {p.status === 'ARCHIVED' ? t.archived : sd.statusNames.ACTIVE}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <button type="button" className="sa-plan-btn" onClick={() => edit(p)} title={t.editPlan}>
                        {EditIcon}
                        <span className="hidden lg:inline">{t.editPlan}</span>
                      </button>
                      {p.status === 'ARCHIVED' ? (
                        <button type="button" className="sa-plan-btn sa-plan-restore" onClick={() => setStatus(p, 'ACTIVE')} title={t.restore}>
                          {RestoreIcon}
                          <span className="hidden lg:inline">{t.restore}</span>
                        </button>
                      ) : (
                        <button type="button" className="sa-plan-btn sa-plan-archive" onClick={() => setStatus(p, 'ARCHIVED')} title={t.archive}>
                          {ArchiveIcon}
                          <span className="hidden lg:inline">{t.archive}</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Form modal ─────────────────────────────────────────────── */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" role="dialog" aria-modal="true">
          <div className="w-full max-w-[680px] max-h-[92vh] overflow-y-auto rounded-2xl bg-white border border-[#dce5f0] shadow-xl p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[18px] font-bold text-[#052e5f]">{form.id ? t.editPlan : t.createPlan}</h2>
              <button type="button" onClick={() => setForm(null)} className="text-[#94a3b8] hover:text-[#052e5f] transition-colors" aria-label="Close">
                {CloseIcon}
              </button>
            </div>

            {/* Plan details */}
            <div className="grid md:grid-cols-3 gap-4">
              <div className="fld"><label>{t.planName}</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="fld"><label>{t.planNameBangla}</label><input value={form.banglaName} onChange={(e) => setForm({ ...form, banglaName: e.target.value })} /></div>
              <div className="fld"><label>{t.planCode}</label><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></div>
              <div className="fld"><label>{t.priceMonthly}</label><input type="number" min={0} value={form.priceMonthly} onChange={(e) => setForm({ ...form, priceMonthly: e.target.value })} /></div>
              <div className="fld"><label>{t.priceYearly}</label><input type="number" min={0} value={form.priceYearly} onChange={(e) => setForm({ ...form, priceYearly: e.target.value })} /></div>
              <div className="fld"><label>{t.trialDays}</label><input type="number" min={0} value={form.trialDays} onChange={(e) => setForm({ ...form, trialDays: e.target.value })} /></div>
              <div className="fld md:col-span-3"><label>{t.description}</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            </div>

            {/* Limits */}
            <div>
              <h3 className="text-[13px] font-bold text-[#052e5f] mb-1">{t.limits}</h3>
              <p className="text-[12px] text-[#94a3b8] mb-3">{t.unlimitedHint}</p>
              <div className="grid sm:grid-cols-3 gap-3">
                {LIMIT_KEYS.map((k) => (
                  <div className="fld" key={k}><label>{(sd.resources as Record<string, string>)[RES[k]]}</label>
                    <input type="number" min={0} value={form.limits[k]} placeholder={sd.unlimited} onChange={(e) => setForm({ ...form, limits: { ...form.limits, [k]: e.target.value } })} /></div>
                ))}
              </div>
            </div>

            {/* Features */}
            <div>
              <h3 className="text-[13px] font-bold text-[#052e5f] mb-2">{t.features}</h3>
              <div className="grid sm:grid-cols-3 gap-2">
                {FEATURE_KEYS.map((k) => (
                  <label key={k} className="flex items-center gap-2 text-[13px] py-1.5 px-2 rounded-lg hover:bg-[#f8fafc] transition-colors cursor-pointer">
                    <input type="checkbox" checked={form.features[k]} onChange={(e) => setForm({ ...form, features: { ...form.features, [k]: e.target.checked } })} className="w-4 h-4 rounded" />
                    <span className="text-[#1e293b]">{(sd.featureNames as Record<string, string>)[k]}</span>
                  </label>
                ))}
              </div>
            </div>

            {error && <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-[13px] text-rose-800">{error}</div>}

            <div className="flex gap-2 justify-end pt-2 border-t border-[#eef2f7]">
              <button type="button" className="tb" onClick={() => setForm(null)}>{t.cancel}</button>
              <button type="button" className="primary" onClick={save}>{t.save}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .sa-plan-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 5px 8px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          color: #063b78;
          background: none;
          border: none;
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .sa-plan-btn:hover { background: #eef3fa; }
        .sa-plan-archive { color: #dc2626; }
        .sa-plan-archive:hover { background: #fef2f2; }
        .sa-plan-restore { color: #059669; }
        .sa-plan-restore:hover { background: #ecfdf5; }
      `}</style>
    </div>
  );
}
