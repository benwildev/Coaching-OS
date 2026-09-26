'use client';

import { useEffect, useState } from 'react';
import Icon from './Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatDhakaDate } from '@/lib/i18n';

interface AccountStatus {
  id: string;
  status: 'ACTIVE' | 'DISABLED';
  hasPassword: boolean;
  lastLoginAt: string | null;
}

/** Minimal staff-side portal-account control — embedded on Student/Guardian detail views (AGENTS.md Phase 9 §23). */
export default function PortalAccessCard({ studentId, guardianId, compact }: { studentId?: string; guardianId?: string; compact?: boolean }) {
  const { lang, currentUser, showToast } = useApp();
  const t = DICTIONARY[lang].portalAccess;
  const canManage = currentUser?.role === 'OWNER' || currentUser?.role === 'ADMIN';

  const [account, setAccount] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const query = studentId ? `studentId=${studentId}` : `guardianId=${guardianId}`;

  const load = () => {
    setLoading(true);
    fetch(`/api/portal-accounts?${query}`)
      .then((r) => r.json())
      .then((res) => res.success && setAccount(res.account))
      .finally(() => setLoading(false));
  };

  useEffect(load, [query]);

  const handleProvision = async () => {
    setBusy(true);
    setLink(null);
    try {
      const res = await fetch('/api/portal-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(studentId ? { studentId } : { guardianId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error();
      setLink(`${window.location.origin}/portal/setup-password?token=${data.setupToken}`);
      load();
    } catch {
      showToast(t.actionFailed);
    } finally {
      setBusy(false);
    }
  };

  const handleResetLink = async () => {
    if (!account) return;
    setBusy(true);
    setLink(null);
    try {
      const res = await fetch(`/api/portal-accounts/${account.id}/reset-link`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error();
      setLink(`${window.location.origin}/portal/setup-password?token=${data.resetToken}`);
    } catch {
      showToast(t.actionFailed);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!account) return;
    const nextStatus = account.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    if (nextStatus === 'DISABLED' && !window.confirm(t.confirmDisable)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/portal-accounts/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error();
      load();
    } catch {
      showToast(t.actionFailed);
    } finally {
      setBusy(false);
    }
  };

  const copyLink = () => {
    if (!link) return;
    navigator.clipboard?.writeText(link);
    showToast(t.copied);
  };

  if (!canManage) return null;
  if (loading) return null;

  return (
    <div className={compact ? 'flex flex-col gap-1.5' : 'card p-5 rounded-2xl bg-white border border-[#dce5f0] flex flex-col gap-3'}>
      {!compact && (
        <div className="flex items-center gap-2 text-[#063b78]">
          <Icon name="shield" size={17} />
          <h3 className="font-bold text-[14px]">{t.title}</h3>
        </div>
      )}

      {!account ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-[#64748b]">{t.notProvisioned}</span>
          <button type="button" disabled={busy} onClick={handleProvision} className="tb text-[11.5px]">{t.createAccount}</button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold ${account.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
              {account.status === 'ACTIVE' ? t.statusActive : t.statusDisabled}
            </span>
            <span className="text-[#64748b]">{account.hasPassword ? t.passwordSet : t.passwordNotSet}</span>
          </div>
          <div className="text-[11px] text-[#94a3b8]">
            {t.lastLogin}: {account.lastLoginAt ? formatDhakaDate(account.lastLoginAt) : t.never}
          </div>
          <div className="flex flex-wrap gap-2">
            {!account.hasPassword && (
              <button type="button" disabled={busy} onClick={handleResetLink} className="tb text-[11.5px]">{t.createAccount}</button>
            )}
            {account.hasPassword && (
              <button type="button" disabled={busy} onClick={handleResetLink} className="tb text-[11.5px]">{t.resetLink}</button>
            )}
            <button type="button" disabled={busy} onClick={handleToggleStatus} className="tb text-[11.5px]">
              {account.status === 'ACTIVE' ? t.disable : t.enable}
            </button>
          </div>
        </>
      )}

      {link && (
        <div className="mt-1 p-2.5 rounded-xl bg-amber-50 border border-amber-200 flex flex-col gap-1.5">
          <div className="text-[11px] font-semibold text-amber-800">{t.linkGenerated}</div>
          <div className="text-[11px] text-amber-700">{t.linkNote}</div>
          <div className="flex items-center gap-2">
            <input readOnly value={link} className="grow h-7 rounded-lg border border-amber-300 bg-white px-2 text-[10.5px] font-mono" onFocus={(e) => e.target.select()} />
            <button type="button" onClick={copyLink} className="tb text-[10.5px] shrink-0">{t.copy}</button>
          </div>
        </div>
      )}
    </div>
  );
}
