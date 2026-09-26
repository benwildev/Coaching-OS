'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePortal } from '@/components/portal/PortalProvider';
import { DICTIONARY } from '@/lib/i18n';

export default function PortalForgotPasswordPage() {
  const { lang } = usePortal();
  const t = DICTIONARY[lang].portalForgotPassword;

  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier) return;
    setLoading(true);
    try {
      await fetch('/api/portal/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      });
    } finally {
      // Always shows the same outcome regardless of whether an account
      // exists (the API itself is deliberately silent about this).
      setSent(true);
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
        {sent ? (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold text-center">
            {t.sentMessage}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="fld">
              <label>{t.identifierLabel}</label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={t.identifierPlaceholder}
                autoComplete="username"
                required
              />
            </div>
            <button type="submit" disabled={loading} className="primary w-full justify-center text-sm py-2.5 mt-2">
              {loading ? t.submitting : t.submit}
            </button>
          </form>
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
