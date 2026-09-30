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

const CATEGORY_BADGE: Record<string, { bg: string; text: string; dot: string }> = {
  ACTIVE:    { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  TRIAL:     { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500' },
  EXPIRED:   { bg: 'bg-amber-50', text: 'text-amber-800', dot: 'bg-amber-500' },
  PAST_DUE:  { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  CANCELLED: { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' },
  SUSPENDED: { bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500' },
  LEGACY:    { bg: 'bg-slate-50', text: 'text-slate-500', dot: 'bg-slate-400' },
};

/* inline icons */
const SearchIcon = <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.6"/><path d="M12.5 12.5L16 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>;
const PlusIcon = <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 4v10M4 9h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
const ChevronLeft = <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M11 4L6 9l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const ChevronRight = <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M7 4l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;

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
    <div className="flex flex-col gap-5 fade-in">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[22px] font-extrabold text-[#052e5f] tracking-tight">{t.centers}</h1>
          <p className="text-[13px] text-[#64748b] mt-0.5">Manage all registered coaching centers</p>
        </div>
        <Link href="/super-admin/coaching-centers/new" className="primary">
          {PlusIcon}
          <span>{t.newCenter}</span>
        </Link>
      </div>

      {/* ── Legacy banner ──────────────────────────────────────────── */}
      {noSub > 0 && category !== 'LEGACY' && (
        <div className="flex items-center justify-between gap-3 flex-wrap p-3.5 rounded-2xl bg-amber-50 border border-amber-200/60">
          <span className="text-[13px] text-amber-900 font-medium">{so.noSubscriptionsBanner.replace('{n}', num(noSub))}</span>
          <button type="button" className="text-[12.5px] font-bold text-amber-700 hover:text-amber-800" onClick={() => { setPage(1); setCategory('LEGACY'); }}>{so.viewThem} →</button>
        </div>
      )}

      {/* ── Filters ────────────────────────────────────────────────── */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative grow min-w-[220px]">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94a3b8]">{SearchIcon}</span>
          <input
            value={search}
            onChange={(e) => { setPage(1); setSearch(e.target.value); }}
            placeholder={t.search}
            className="w-full rounded-xl border border-[#dce5f0] bg-white pl-10 pr-3 py-2.5 text-[13.5px] transition-colors focus:border-[#063b78] focus:outline-none"
          />
        </div>
        <select value={category} onChange={(e) => { setPage(1); setCategory(e.target.value); }} className="rounded-xl border border-[#dce5f0] bg-white px-3 py-2.5 text-[13.5px] focus:border-[#063b78] focus:outline-none" aria-label={t.status}>
          <option value="all">{t.allStatuses}</option>
          {['ACTIVE', 'TRIAL', 'PAST_DUE', 'EXPIRED', 'CANCELLED', 'SUSPENDED', 'LEGACY'].map((c) => <option key={c} value={c}>{st[c]}</option>)}
        </select>
        <select value={planId} onChange={(e) => { setPage(1); setPlanId(e.target.value); }} className="rounded-xl border border-[#dce5f0] bg-white px-3 py-2.5 text-[13.5px] focus:border-[#063b78] focus:outline-none" aria-label={t.plan}>
          <option value="">{so.allPlans}</option>
          {plans.map((p) => <option key={p.id} value={p.id}>{lang === 'bn' && p.banglaName ? p.banglaName : p.name}</option>)}
        </select>
        <select value={kind} onChange={(e) => { setPage(1); setKind(e.target.value); }} className="rounded-xl border border-[#dce5f0] bg-white px-3 py-2.5 text-[13.5px] focus:border-[#063b78] focus:outline-none" aria-label={so.type}>
          <option value="">{so.allTypes}</option>
          <option value="trial">{so.trialOnly}</option>
          <option value="paid">{so.paidOnly}</option>
        </select>
      </div>

      {/* ── Table ──────────────────────────────────────────────────── */}
      <div className="card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left border-b border-[#edf1f7]">
                {[t.name, t.owner, t.plan, t.status, so.colType, so.colStart, t.expiry, so.colLimits, t.actions].map((h) => (
                  <th key={h} className="px-4 py-3 font-semibold text-[11.5px] uppercase tracking-wide text-[#64748b] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-14 text-center">
                  <div className="inline-block h-6 w-6 animate-spin rounded-full border-[2.5px] border-[#063b78] border-t-transparent" />
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-14 text-center text-[#94a3b8] text-[14px]">{t.noData}</td></tr>
              ) : (
                rows.map((r) => {
                  const badge = CATEGORY_BADGE[r.category] || CATEGORY_BADGE.LEGACY;
                  return (
                    <tr key={r.id} className="border-b border-[#f1f5f9] hover:bg-[#f8fafc] align-top transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/super-admin/coaching-centers/${r.id}`} className="font-bold text-[#052e5f] hover:text-[#063b78] transition-colors">
                          {lang === 'bn' && r.banglaName ? r.banglaName : r.name}
                        </Link>
                        <div className="text-[11px] font-mono text-[#94a3b8] mt-0.5">{r.code}</div>
                      </td>
                      <td className="px-4 py-3">
                        {r.owner ? (
                          <div>
                            <div className="font-medium text-[#1e293b]">{r.owner.name}</div>
                            <div className="text-[11px] text-[#94a3b8]">{r.owner.email}{r.owner.phone ? ` · ${r.owner.phone}` : ''}</div>
                          </div>
                        ) : <span className="text-[#cbd5e1]">—</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium">{r.plan ? (lang === 'bn' && r.plan.banglaName ? r.plan.banglaName : r.plan.name) : <span className="text-[#cbd5e1]">—</span>}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11.5px] font-semibold ${badge.bg} ${badge.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                          {st[r.category] || r.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-[#64748b]">{r.plan ? (r.isTrial ? so.trialType : so.paidType) : <span className="text-[#cbd5e1]">—</span>}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-[#64748b]">{r.startDate ? formatDhakaDate(r.startDate) : <span className="text-[#cbd5e1]">—</span>}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-[#64748b]">{r.subscriptionEnd ? formatDhakaDate(r.subscriptionEnd) : <span className="text-[#cbd5e1]">—</span>}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-[12px]">
                        {r.limits ? (
                          <div className="space-y-0.5">
                            <div><span className="text-[#94a3b8]">{DICTIONARY[lang].subscription.resources.students}:</span> <b className="num text-[#1e293b]">{num(r.students)}/{lim(r.limits.maxStudents)}</b></div>
                            <div><span className="text-[#94a3b8]">{DICTIONARY[lang].subscription.resources.teachers}:</span> <b className="num text-[#1e293b]">{num(r.teachers)}/{lim(r.limits.maxTeachers)}</b></div>
                            <div><span className="text-[#94a3b8]">{DICTIONARY[lang].subscription.resources.staffUsers}:</span> <b className="num text-[#1e293b]">{num(r.staff)}/{lim(r.limits.maxStaffUsers)}</b></div>
                          </div>
                        ) : <span className="text-[#cbd5e1]">—</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Link href={`/super-admin/coaching-centers/${r.id}`} className="sa-action-btn sa-action-view">{t.view}</Link>
                          <Link href={`/super-admin/coaching-centers/${r.id}?tab=subscription`} className="sa-action-btn sa-action-manage">{r.plan ? t.manage : so.assignPlan}</Link>
                          {r.tenantStatus === 'SUSPENDED'
                            ? <button type="button" onClick={() => setStatus(r, 'ACTIVE')} className="sa-action-btn sa-action-activate">{t.activate}</button>
                            : <button type="button" onClick={() => setStatus(r, 'SUSPENDED')} className="sa-action-btn sa-action-suspend">{t.suspend}</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pagination ─────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button type="button" className="sa-page-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>{ChevronLeft}</button>
          <span className="px-3 py-1.5 text-[13px] font-semibold text-[#052e5f] bg-white border border-[#dce5f0] rounded-lg num">{num(page)} / {num(totalPages)}</span>
          <button type="button" className="sa-page-btn" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>{ChevronRight}</button>
        </div>
      )}

      <style>{`
        .sa-action-btn {
          padding: 5px 10px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          transition: all 0.15s;
          white-space: nowrap;
          border: none;
          background: none;
          cursor: pointer;
        }
        .sa-action-view { color: #063b78; }
        .sa-action-view:hover { background: #eef3fa; }
        .sa-action-manage { color: #063b78; }
        .sa-action-manage:hover { background: #eef3fa; }
        .sa-action-activate { color: #059669; }
        .sa-action-activate:hover { background: #ecfdf5; }
        .sa-action-suspend { color: #dc2626; }
        .sa-action-suspend:hover { background: #fef2f2; }
        .sa-page-btn {
          width: 36px; height: 36px;
          border-radius: 10px;
          border: 1px solid #dce5f0;
          background: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #063b78;
          cursor: pointer;
          transition: all 0.15s;
        }
        .sa-page-btn:hover:not(:disabled) { border-color: #063b78; background: #f8fafc; }
        .sa-page-btn:disabled { opacity: 0.35; cursor: not-allowed; }
      `}</style>
    </div>
  );
}

export default function CoachingCentersPage() {
  return <Suspense fallback={null}><ListInner /></Suspense>;
}
