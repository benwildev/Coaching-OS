'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate, localizeNumber } from '@/lib/i18n';
import { saApi } from '@/lib/super-admin-client';

interface Row {
  id: string;
  name: string;
  banglaName?: string | null;
  code: string;
  tenantStatus: string;
  category: string;
  owner: { name: string; email: string; phone?: string | null } | null;
  plan: { name: string; banglaName?: string | null } | null;
  isTrial: boolean;
  startDate: string | null;
  limits: { maxStudents: number | null; maxTeachers: number | null; maxStaffUsers: number | null; maxBranches: number | null } | null;
  students: number;
  teachers: number;
  staff: number;
  messagesUsed: number;
  subscriptionEnd: string | null;
  createdAt: string;
}
interface PlanOption { id: string; name: string; banglaName?: string | null; status: string }

const CATEGORY_STYLE: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  TRIAL: 'bg-sky-50 text-sky-700 border-sky-200',
  EXPIRED: 'bg-amber-50 text-amber-800 border-amber-200',
  PAST_DUE: 'bg-orange-50 text-orange-700 border-orange-200',
  CANCELLED: 'bg-slate-100 text-slate-600 border-slate-200',
  SUSPENDED: 'bg-rose-50 text-rose-700 border-rose-200',
  LEGACY: 'bg-slate-50 text-slate-500 border-slate-200',
};

function ListInner() {
  const { lang, showToast } = useApp();
  const sp = useSearchParams();
  const t = DICTIONARY[lang].superAdmin;
  const so = DICTIONARY[lang].subOps;
  const st = DICTIONARY[lang].subscription.statusNames as Record<string, string>;
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(sp.get('category') || 'all');
  const [planId, setPlanId] = useState('');
  const [kind, setKind] = useState('');
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [noSub, setNoSub] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const num = (n: number) => localizeNumber(lang, n);
  const lim = (v: number | null | undefined) => (v === null || v === undefined ? '∞' : num(v));

  const load = useCallback(async () => {
    setLoading(true);
    const q = new URLSearchParams({ page: String(page), pageSize: '20', category });
    if (search.trim()) q.set('search', search.trim());
    if (planId) q.set('planId', planId);
    if (kind) q.set('kind', kind);
    const r = await saApi<{ tenants: Row[]; totalPages: number }>(`/api/super-admin/coaching-centers?${q}`);
    if (r.ok) { setRows(r.data.tenants); setTotalPages(r.data.totalPages); }
    setLoading(false);
  }, [page, category, search, planId, kind]);

  useEffect(() => { const id = setTimeout(load, 250); return () => clearTimeout(id); }, [load]);
  useEffect(() => {
    saApi<{ plans: PlanOption[] }>('/api/super-admin/plans').then((r) => r.ok && setPlans(r.data.plans));
    saApi<{ total: number }>('/api/super-admin/coaching-centers?category=LEGACY&pageSize=1').then((r) => r.ok && setNoSub(r.data.total));
  }, []);

  const setStatus = async (row: Row, status: 'ACTIVE' | 'SUSPENDED') => {
    const reason = status === 'SUSPENDED' ? window.prompt(`${t.confirmSuspend}\n\n${t.reason}:`) : '';
    if (status === 'SUSPENDED' && (!reason || reason.trim().length < 3)) return;
    if (status === 'ACTIVE' && !window.confirm(t.confirmActivate)) return;
    const r = await saApi(`/api/super-admin/coaching-centers/${row.id}/status`, { method: 'PUT', body: { status, reason: reason || undefined, confirm: true } });
    showToast(r.ok ? t.saved : r.data.message || r.data.error || 'Error');
    if (r.ok) load();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-extrabold text-[#063b78]">{t.centers}</h1>
        <Link href="/super-admin/coaching-centers/new" className="primary">{t.newCenter}</Link>
      </div>

      {noSub > 0 && category !== 'LEGACY' && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[13px] text-amber-900 flex items-center justify-between gap-3 flex-wrap">
          <span>{so.noSubscriptionsBanner.replace('{n}', num(noSub))}</span>
          <button type="button" className="tb" onClick={() => { setPage(1); setCategory('LEGACY'); }}>{so.viewThem}</button>
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <input value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} placeholder={t.search} className="grow min-w-[220px] rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13.5px]" />
        <select value={category} onChange={(e) => { setPage(1); setCategory(e.target.value); }} className="rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13.5px]" aria-label={t.status}>
          <option value="all">{t.allStatuses}</option>
          {['ACTIVE', 'TRIAL', 'PAST_DUE', 'EXPIRED', 'CANCELLED', 'SUSPENDED', 'LEGACY'].map((c) => <option key={c} value={c}>{st[c]}</option>)}
        </select>
        <select value={planId} onChange={(e) => { setPage(1); setPlanId(e.target.value); }} className="rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13.5px]" aria-label={t.plan}>
          <option value="">{so.allPlans}</option>
          {plans.map((p) => <option key={p.id} value={p.id}>{lang === 'bn' && p.banglaName ? p.banglaName : p.name}</option>)}
        </select>
        <select value={kind} onChange={(e) => { setPage(1); setKind(e.target.value); }} className="rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13.5px]" aria-label={so.type}>
          <option value="">{so.allTypes}</option>
          <option value="trial">{so.trialOnly}</option>
          <option value="paid">{so.paidOnly}</option>
        </select>
      </div>

      <div className="card rounded-2xl bg-white border border-[#dce5f0] shadow-2xs overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[#64748b] border-b border-[#edf1f7]">
              {[t.name, t.owner, t.plan, t.status, so.colType, so.colStart, t.expiry, so.colLimits, t.actions].map((h) => <th key={h} className="px-3 py-2.5 font-semibold whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-3 py-10 text-center text-[#94a3b8]">…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-10 text-center text-[#94a3b8]">{t.noData}</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-[#f1f5f9] hover:bg-[#f8fafc] align-top">
                  <td className="px-3 py-2.5">
                    <Link href={`/super-admin/coaching-centers/${r.id}`} className="font-bold text-[#063b78] hover:underline">{lang === 'bn' && r.banglaName ? r.banglaName : r.name}</Link>
                    <div className="text-[11px] font-mono text-[#94a3b8]">{r.code}</div>
                  </td>
                  <td className="px-3 py-2.5">{r.owner ? <><div>{r.owner.name}</div><div className="text-[11px] text-[#94a3b8]">{r.owner.email}{r.owner.phone ? ` · ${r.owner.phone}` : ''}</div></> : '—'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{r.plan ? (lang === 'bn' && r.plan.banglaName ? r.plan.banglaName : r.plan.name) : '—'}</td>
                  <td className="px-3 py-2.5"><span className={`px-2 py-0.5 rounded-md border text-[11.5px] font-semibold ${CATEGORY_STYLE[r.category] || ''}`}>{st[r.category] || r.category}</span></td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{r.plan ? (r.isTrial ? so.trialType : so.paidType) : '—'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{r.startDate ? formatDhakaDate(r.startDate) : '—'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{r.subscriptionEnd ? formatDhakaDate(r.subscriptionEnd) : '—'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-[12px]">
                    {r.limits ? (
                      <>
                        <div>{DICTIONARY[lang].subscription.resources.students}: <b className="num">{num(r.students)}/{lim(r.limits.maxStudents)}</b></div>
                        <div>{DICTIONARY[lang].subscription.resources.teachers}: <b className="num">{num(r.teachers)}/{lim(r.limits.maxTeachers)}</b></div>
                        <div>{DICTIONARY[lang].subscription.resources.staffUsers}: <b className="num">{num(r.staff)}/{lim(r.limits.maxStaffUsers)}</b></div>
                      </>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-2 text-[12px] font-semibold">
                      <Link href={`/super-admin/coaching-centers/${r.id}`} className="text-[#063b78] hover:underline">{t.view}</Link>
                      <Link href={`/super-admin/coaching-centers/${r.id}?tab=subscription`} className="text-[#063b78] hover:underline">{r.plan ? t.manage : so.assignPlan}</Link>
                      {r.tenantStatus === 'SUSPENDED'
                        ? <button type="button" onClick={() => setStatus(r, 'ACTIVE')} className="text-emerald-700 hover:underline">{t.activate}</button>
                        : <button type="button" onClick={() => setStatus(r, 'SUSPENDED')} className="text-rose-600 hover:underline">{t.suspend}</button>}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-[13px]">
          <button type="button" className="tb" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
          <span>{num(page)} / {num(totalPages)}</span>
          <button type="button" className="tb" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>›</button>
        </div>
      )}
    </div>
  );
}

export default function CoachingCentersPage() {
  return <Suspense fallback={null}><ListInner /></Suspense>;
}
