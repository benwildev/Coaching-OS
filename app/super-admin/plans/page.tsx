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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-[#063b78]">{t.plans}</h1>
        <button type="button" className="primary" onClick={() => setForm(blank())}>{t.createPlan}</button>
      </div>
      <p className="text-[12.5px] text-[#64748b]">{t.planLimitHint}</p>

      <div className="card rounded-2xl bg-white border border-[#dce5f0] shadow-2xs overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[#64748b] border-b border-[#edf1f7]">
              {[t.plan, t.priceMonthly, sd.resources.students, sd.resources.teachers, sd.resources.staffUsers, sd.resources.branches, sd.resources.sms, sd.resources.whatsapp, sd.resources.email, t.features, t.status, ''].map((h, i) => (
                <th key={i} className="px-3 py-2.5 font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id} className="border-b border-[#f1f5f9]">
                <td className="px-3 py-2.5"><div className="font-bold text-[#063b78]">{lang === 'bn' && p.banglaName ? p.banglaName : p.name}</div><div className="text-[11px] font-mono text-[#94a3b8]">{p.code} · v{p.version} · {t.assignedTo} {localizeNumber(lang, p.subscriptionCount)}</div></td>
                <td className="px-3 py-2.5 num">{formatBDTExact(p.priceMonthly, lang)}</td>
                <td className="px-3 py-2.5 num">{num(p.limits.maxStudents)}</td>
                <td className="px-3 py-2.5 num">{num(p.limits.maxTeachers)}</td>
                <td className="px-3 py-2.5 num">{num(p.limits.maxStaffUsers)}</td>
                <td className="px-3 py-2.5 num">{num(p.limits.maxBranches)}</td>
                <td className="px-3 py-2.5 num">{num(p.limits.maxSms)}</td>
                <td className="px-3 py-2.5 num">{num(p.limits.maxWhatsapp)}</td>
                <td className="px-3 py-2.5 num">{num(p.limits.maxEmail)}</td>
                <td className="px-3 py-2.5 text-[11.5px]">{FEATURE_KEYS.filter((k) => p.features[k]).map((k) => (sd.featureNames as Record<string, string>)[k]).join(', ') || '—'}</td>
                <td className="px-3 py-2.5">{p.status === 'ARCHIVED' ? t.archived : sd.statusNames.ACTIVE}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-[12px] font-semibold">
                  <button type="button" className="text-[#063b78] hover:underline mr-3" onClick={() => edit(p)}>{t.editPlan}</button>
                  {p.status === 'ARCHIVED'
                    ? <button type="button" className="text-emerald-700 hover:underline" onClick={() => setStatus(p, 'ACTIVE')}>{t.restore}</button>
                    : <button type="button" className="text-rose-600 hover:underline" onClick={() => setStatus(p, 'ARCHIVED')}>{t.archive}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form && (
        <div className="card p-5 rounded-2xl bg-white border border-[#063b78] shadow-sm flex flex-col gap-4">
          <h2 className="text-lg font-bold text-[#063b78]">{form.id ? t.editPlan : t.createPlan}</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="fld"><label>{t.planName}</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="fld"><label>{t.planNameBangla}</label><input value={form.banglaName} onChange={(e) => setForm({ ...form, banglaName: e.target.value })} /></div>
            <div className="fld"><label>{t.planCode}</label><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></div>
            <div className="fld"><label>{t.priceMonthly}</label><input type="number" min={0} value={form.priceMonthly} onChange={(e) => setForm({ ...form, priceMonthly: e.target.value })} /></div>
            <div className="fld"><label>{t.priceYearly}</label><input type="number" min={0} value={form.priceYearly} onChange={(e) => setForm({ ...form, priceYearly: e.target.value })} /></div>
            <div className="fld"><label>{t.trialDays}</label><input type="number" min={0} value={form.trialDays} onChange={(e) => setForm({ ...form, trialDays: e.target.value })} /></div>
            <div className="fld md:col-span-3"><label>{t.description}</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <div>
            <p className="text-[12px] text-[#64748b] mb-2">{t.unlimitedHint}</p>
            <div className="grid sm:grid-cols-3 gap-3">
              {LIMIT_KEYS.map((k) => (
                <div className="fld" key={k}><label>{(sd.resources as Record<string, string>)[RES[k]]}</label>
                  <input type="number" min={0} value={form.limits[k]} placeholder={sd.unlimited} onChange={(e) => setForm({ ...form, limits: { ...form.limits, [k]: e.target.value } })} /></div>
              ))}
            </div>
          </div>
          <div className="grid sm:grid-cols-4 gap-2 text-[13px]">
            {FEATURE_KEYS.map((k) => (
              <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={form.features[k]} onChange={(e) => setForm({ ...form, features: { ...form.features, [k]: e.target.checked } })} />{(sd.featureNames as Record<string, string>)[k]}</label>
            ))}
          </div>
          {error && <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-[13px] text-rose-800">{error}</div>}
          <div className="flex gap-2"><button type="button" className="primary" onClick={save}>{t.save}</button><button type="button" className="tb" onClick={() => setForm(null)}>{t.cancel}</button></div>
        </div>
      )}
    </div>
  );
}
