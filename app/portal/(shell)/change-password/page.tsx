'use client';

import { useState } from 'react';
import { usePortal } from '@/components/portal/PortalProvider';
import { DICTIONARY } from '@/lib/i18n';

export default function PortalChangePasswordPage() {
  const { lang, showToast } = usePortal();
  const t = DICTIONARY[lang].portalChangePassword;

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError(t.passwordTooShort);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t.passwordMismatch);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/portal/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || t.failed);
      showToast(t.success);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message || t.failed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-bold text-[#092f63]">{t.title}</h1>
        <p className="text-[13px] text-[#64748b]">{t.subtitle}</p>
      </div>

      <div className="card p-5 sm:p-6 bg-white border border-[#dce5f0] rounded-2xl">
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">{error}</div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="fld">
            <label>{t.currentPasswordLabel}</label>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" required />
          </div>
          <div className="fld">
            <label>{t.newPasswordLabel}</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" required />
          </div>
          <div className="fld">
            <label>{t.confirmPasswordLabel}</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" required />
          </div>
          <button type="submit" disabled={loading} className="primary w-full justify-center text-sm py-2.5 mt-2">
            {loading ? t.submitting : t.submit}
          </button>
        </form>
      </div>
    </div>
  );
}
