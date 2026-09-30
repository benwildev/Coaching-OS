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
    <form onSubmit={submit} className="max-w-[820px] mx-auto flex flex-col gap-5">
      <Link href="/super-admin/coaching-centers" className="text-[13px] font-semibold text-[#063b78] hover:underline">‹ {t.centers}</Link>
      <h1 className="text-2xl font-extrabold text-[#063b78]">{t.newCenter}</h1>

      <div className="card p-5 rounded-2xl bg-white border border-[#dce5f0] grid md:grid-cols-2 gap-4">
        {field('centerName', t.name)}
        {field('centerCode', t.planCode)}
        {field('centerPhone', 'Phone')}
        {field('centerEmail', 'Email', 'email', false)}
        {field('ownerName', t.owner)}
        {field('ownerEmail', `${t.owner} ${t.email}`, 'email')}
        {field('ownerPhone', `${t.owner} Phone`)}
        {field('ownerPassword', t.password, 'password')}
        {field('branchName', t.branches)}
        {field('branchCode', `${t.branches} ${t.planCode}`)}
        {field('sessionName', 'Session')}
        <div className="grid grid-cols-2 gap-3">
          {field('sessionStartDate', t.startDate, 'date')}
          {field('sessionEndDate', t.endDate, 'date')}
        </div>
        <div className="md:col-span-2 flex gap-4 flex-wrap text-[13px]">
          {PROGRAMS.map((p) => (
            <label key={p} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={f.selectedPrograms.includes(p)}
                onChange={(e) => setF((prev) => ({ ...prev, selectedPrograms: e.target.checked ? [...prev.selectedPrograms, p] : prev.selectedPrograms.filter((x) => x !== p) }))}
              />
              {p}
            </label>
          ))}
        </div>
      </div>

      <div className="card p-5 rounded-2xl bg-white border border-[#dce5f0] grid md:grid-cols-2 gap-4">
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
          <input type="number" min={1} value={f.trialDays} onChange={(e) => set('trialDays', e.target.value)} />
        </div>
      </div>

      {error && <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-[13px] text-rose-800">{error}</div>}
      <div><button type="submit" disabled={saving || f.selectedPrograms.length === 0} className="primary disabled:opacity-60">{saving ? '…' : t.save}</button></div>
    </form>
  );
}
