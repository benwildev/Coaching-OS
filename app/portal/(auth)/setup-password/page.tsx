'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { usePortal } from '@/components/portal/PortalProvider';
import { DICTIONARY } from '@/lib/i18n';

function SetupPasswordContent() {
  const router = useRouter();
  const token = useSearchParams().get('token') || '';
  const { lang } = usePortal();
  const t = DICTIONARY[lang].portalSetupPassword;

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(t.passwordTooShort);
      return;
    }
    if (password !== confirm) {
      setError(t.passwordMismatch);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/portal/auth/setup-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || t.invalidToken);
      setDone(true);
      setTimeout(() => router.push('/portal/login'), 1800);
    } catch (err: any) {
      setError(err.message || t.invalidToken);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md w-full">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#ffd200] text-[#063b78] font-black text-3xl shadow-sm mb-3">
          A
        </div>
        <h1 className="text-2xl font-black text-[#063b78] tracking-tight">{t.title}</h1>
        <p className="text-xs text-[#64748b] mt-1 font-medium">{t.subtitle}</p>
      </div>

      <div className="card p-7 sm:p-8 bg-white border border-[#dce5f0] rounded-2xl shadow-sm">
        {!token ? (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold text-center">
            {t.noToken}
          </div>
        ) : done ? (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold text-center">
            {t.success}
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="fld">
                <label>{t.passwordLabel}</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" required />
              </div>
              <div className="fld">
                <label>{t.confirmLabel}</label>
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" autoComplete="new-password" required />
              </div>
              <button type="submit" disabled={loading} className="primary w-full justify-center text-sm py-2.5 mt-2">
                {loading ? t.submitting : t.submit}
              </button>
            </form>
          </>
        )}

        <div className="mt-6 pt-5 border-t border-[#edf1f7] text-center">
          <Link href="/portal/login" className="text-xs font-bold text-[#063b78] hover:underline">
            {t.backToLogin}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function PortalSetupPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetupPasswordContent />
    </Suspense>
  );
}
