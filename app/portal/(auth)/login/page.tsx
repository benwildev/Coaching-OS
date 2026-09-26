'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePortal } from '@/components/portal/PortalProvider';
import { DICTIONARY } from '@/lib/i18n';

export default function PortalLoginPage() {
  const router = useRouter();
  const { lang, setLang, refreshPortalUser } = usePortal();
  const t = DICTIONARY[lang].portalLogin;

  const [portalType, setPortalType] = useState<'STUDENT' | 'GUARDIAN'>('STUDENT');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!identifier || !password) {
      setError(t.fillFields);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/portal/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portalType, identifier, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || t.invalidCredentials);
      }
      await refreshPortalUser();
      router.push(portalType === 'STUDENT' ? '/portal/student' : '/portal/guardian');
      router.refresh();
    } catch (err: any) {
      setError(err.message || t.invalidCredentials);
      setLoading(false);
    }
  };

  return (
    <>
      <div className="absolute top-6 right-6 flex items-center bg-white border border-[#dce5f0] rounded-full p-1 shadow-xs">
        <button
          type="button"
          onClick={() => setLang('bn')}
          className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${lang === 'bn' ? 'bg-[#063b78] text-white' : 'text-[#64748b] hover:text-[#063b78]'}`}
        >
          বাংলা
        </button>
        <button
          type="button"
          onClick={() => setLang('en')}
          className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${lang === 'en' ? 'bg-[#063b78] text-white' : 'text-[#64748b] hover:text-[#063b78]'}`}
        >
          English
        </button>
      </div>

      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#ffd200] text-[#063b78] font-black text-3xl shadow-sm mb-3">
            A
          </div>
          <h1 className="text-2xl font-black text-[#063b78] tracking-tight">{t.title}</h1>
          <p className="text-xs text-[#64748b] mt-1 font-medium">{t.subtitle}</p>
        </div>

        <div className="card p-7 sm:p-8 bg-white border border-[#dce5f0] rounded-2xl shadow-sm">
          <div className="flex items-center bg-[#f0f5fc] border border-[#dce5f0] rounded-xl p-1 mb-5">
            <button
              type="button"
              onClick={() => setPortalType('STUDENT')}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${portalType === 'STUDENT' ? 'bg-[#063b78] text-white' : 'text-[#64748b]'}`}
            >
              {t.studentTab}
            </button>
            <button
              type="button"
              onClick={() => setPortalType('GUARDIAN')}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${portalType === 'GUARDIAN' ? 'bg-[#063b78] text-white' : 'text-[#64748b]'}`}
            >
              {t.guardianTab}
            </button>
          </div>

          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="fld">
              <label>{portalType === 'STUDENT' ? t.studentIdentifierLabel : t.guardianIdentifierLabel}</label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={portalType === 'STUDENT' ? t.studentIdentifierPlaceholder : t.guardianIdentifierPlaceholder}
                autoComplete="username"
                required
              />
            </div>

            <div className="fld">
              <label>{t.passwordLabel}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>

            <button type="submit" disabled={loading} className="primary w-full justify-center text-sm py-2.5 mt-2">
              {loading ? t.submitting : t.submit}
            </button>
          </form>

          <div className="mt-5 text-center">
            <Link href="/portal/forgot-password" className="text-xs font-bold text-[#063b78] hover:underline">
              {t.forgotPassword}
            </Link>
          </div>

          <div className="mt-6 pt-5 border-t border-[#edf1f7] text-center">
            <span className="text-xs text-[#64748b]">{t.needSetupHint}</span>
          </div>
        </div>

        <div className="text-center mt-6 text-[11px] text-[#64748b]">Asia/Dhaka (GMT+6)</div>
      </div>
    </>
  );
}
