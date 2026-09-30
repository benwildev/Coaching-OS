'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';
import { saApi } from '@/lib/super-admin-client';

interface PlanOption {
  id: string;
  name: string;
  banglaName?: string | null;
  status: string;
  trialDays: number | null;
}

const PROGRAMS = ['SSC', 'HSC', 'ADMISSION'];

const BackIcon = <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const SectionIcon = {
  center: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 2L3 7v11h5v-5h4v5h5V7l-7-5z" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
  owner: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.4"/><path d="M3.5 17a6.5 6.5 0 0113 0" stroke="currentColor" strokeWidth="1.4"/></svg>,
  session: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="4" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M3 8h14M7 2v4M13 2v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  plan: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.4"/><path d="M7 7h6M7 10h4M7 13h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
};

export default function NewCoachingCenterPage() {
  const { lang, showToast } = useApp();
  const router = useRouter();
  const t = DICTIONARY[lang].superAdmin;
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const year = new Date().getFullYear();
  const [f, setF] = useState({
    centerName: '', centerCode: '', centerPhone: '', centerEmail: '', centerCity: 'Dhaka', centerDistrict: 'Dhaka',
    ownerName: '', ownerEmail: '', ownerPhone: '', ownerPassword: '',
    branchName: 'Main Campus', branchCode: 'MAIN',
    sessionName: String(year), sessionStartDate: `${year}-01-01`, sessionEndDate: `${year}-12-31`,
    selectedPrograms: ['SSC'] as string[],
    planId: '', trialDays: '',
  });

  useEffect(() => {
    saApi<{ plans: PlanOption[] }>('/api/super-admin/plans').then((r) => r.ok && setPlans(r.data.plans.filter((p) => p.status === 'ACTIVE')));
  }, []);

  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const body: Record<string, unknown> = { ...f, trialDays: f.trialDays ? Number(f.trialDays) : undefined, planId: f.planId || undefined };
    const r = await saApi<{ center: { id: string } }>('/api/super-admin/coaching-centers', { method: 'POST', body });
    setSaving(false);
    if (r.ok) {
      showToast(t.saved);
      router.push(`/super-admin/coaching-centers/${r.data.center.id}`);
    } else {
      setError(r.data.message || (r.data.error as string) || 'Error');
    }
  };

  const field = (k: keyof typeof f, label: string, type = 'text', required = true) => (
    <div className="fld">
      <label>{label}</label>
      <input type={type} value={f[k] as string} onChange={(e) => set(k, e.target.value)} required={required} autoComplete={type === 'password' ? 'new-password' : 'off'} />
    </div>
  );

  return (
    <form onSubmit={submit} className="max-w-[820px] mx-auto flex flex-col gap-6 fade-in">
      {/* ── Back link ──────────────────────────────────────────────── */}
      <Link href="/super-admin/coaching-centers" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#063b78] hover:text-[#052e5f] transition-colors w-fit">
        {BackIcon} {t.centers}
      </Link>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-[22px] font-extrabold text-[#052e5f] tracking-tight">{t.newCenter}</h1>
        <p className="text-[13px] text-[#64748b] mt-0.5">Create a new coaching center with owner account, default branch, and initial session.</p>
      </div>

      {/* ── Section 1: Center Details ──────────────────────────────── */}
      <div className="card p-6 rounded-2xl">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-8 h-8 rounded-lg bg-[#eef3fa] text-[#063b78] flex items-center justify-center flex-shrink-0">
            {SectionIcon.center}
          </div>
          <h2 className="text-[15px] font-bold text-[#052e5f]">Center Information</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {field('centerName', t.name)}
          {field('centerCode', t.planCode)}
          {field('centerPhone', 'Phone')}
          {field('centerEmail', 'Email', 'email', false)}
          {field('centerCity', 'City')}
          {field('centerDistrict', 'District')}
        </div>
      </div>

      {/* ── Section 2: Owner Account ───────────────────────────────── */}
      <div className="card p-6 rounded-2xl">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-8 h-8 rounded-lg bg-[#eef3fa] text-[#063b78] flex items-center justify-center flex-shrink-0">
            {SectionIcon.owner}
          </div>
          <h2 className="text-[15px] font-bold text-[#052e5f]">Owner Account</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {field('ownerName', t.owner)}
          {field('ownerEmail', `${t.owner} Email`, 'email')}
          {field('ownerPhone', `${t.owner} Phone`)}
          {field('ownerPassword', t.password, 'password')}
        </div>
      </div>

      {/* ── Section 3: Branch & Session ─────────────────────────────── */}
      <div className="card p-6 rounded-2xl">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-8 h-8 rounded-lg bg-[#eef3fa] text-[#063b78] flex items-center justify-center flex-shrink-0">
            {SectionIcon.session}
          </div>
          <h2 className="text-[15px] font-bold text-[#052e5f]">Branch & Academic Session</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {field('branchName', t.branches)}
          {field('branchCode', `${t.branches} Code`)}
          {field('sessionName', 'Session')}
          <div className="grid grid-cols-2 gap-3">
            {field('sessionStartDate', t.startDate, 'date')}
            {field('sessionEndDate', t.endDate, 'date')}
          </div>
        </div>
        <div className="mt-4">
          <label className="text-[12.5px] font-bold text-[#052e5f] block mb-2">Programs</label>
          <div className="flex gap-3 flex-wrap">
            {PROGRAMS.map((p) => (
              <label
                key={p}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-[13px] font-semibold cursor-pointer transition-all ${
                  f.selectedPrograms.includes(p)
                    ? 'bg-[#063b78] text-white border-[#063b78]'
                    : 'bg-white text-[#64748b] border-[#dce5f0] hover:border-[#063b78]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={f.selectedPrograms.includes(p)}
                  onChange={(e) => setF((prev) => ({ ...prev, selectedPrograms: e.target.checked ? [...prev.selectedPrograms, p] : prev.selectedPrograms.filter((x) => x !== p) }))}
                  className="sr-only"
                />
                {p}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* ── Section 4: Subscription Plan ────────────────────────────── */}
      <div className="card p-6 rounded-2xl">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-8 h-8 rounded-lg bg-[#eef3fa] text-[#063b78] flex items-center justify-center flex-shrink-0">
            {SectionIcon.plan}
          </div>
          <h2 className="text-[15px] font-bold text-[#052e5f]">Subscription Plan</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="fld">
            <label>{t.plan}</label>
            <select value={f.planId} onChange={(e) => set('planId', e.target.value)}>
              <option value="">— {DICTIONARY[lang].subscription.statusNames.LEGACY} —</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{lang === 'bn' && p.banglaName ? p.banglaName : p.name}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label>{t.trialDays}</label>
            <input type="number" min={1} value={f.trialDays} onChange={(e) => set('trialDays', e.target.value)} placeholder="Default from plan" />
          </div>
        </div>
      </div>

      {/* ── Error & Submit ─────────────────────────────────────────── */}
      {error && <div role="alert" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-[13px] text-rose-800 font-medium">{error}</div>}

      <div className="flex justify-end">
        <button type="submit" disabled={saving || f.selectedPrograms.length === 0} className="primary disabled:opacity-60">
          {saving ? (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#063b78] border-t-transparent" />
          ) : t.save}
        </button>
      </div>
    </form>
  );
}
