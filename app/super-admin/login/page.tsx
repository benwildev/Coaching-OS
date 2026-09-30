'use client';

import { useState } from 'react';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';

/** Platform sign-in. Separate from /login: tenant credentials do not work here. */
export default function SuperAdminLoginPage() {
  const { lang, setLang } = useApp();
  const t = DICTIONARY[lang].superAdmin;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/super-admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Sign in failed');
      window.location.assign(data.redirectTo || '/super-admin/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f8fc] flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-[400px] card p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-sm flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-[#063b78] text-[#ffd200] font-black flex items-center justify-center">S</span>
            <h1 className="text-lg font-extrabold text-[#063b78]">{t.loginTitle}</h1>
          </div>
          <button type="button" onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')} className="text-[12px] font-semibold text-[#063b78] border border-[#dce5f0] rounded-md px-2 py-1">
            {lang === 'bn' ? 'EN' : 'বাংলা'}
          </button>
        </div>
        <p className="text-[12.5px] text-[#64748b]">{t.loginHint}</p>
        <div className="fld">
          <label>{t.email}</label>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="fld">
          <label>{t.password}</label>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && (
          <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-[12.5px] text-rose-800">
            {error}
          </div>
        )}
        <button type="submit" disabled={loading} className="primary justify-center disabled:opacity-60">
          {loading ? '…' : t.signIn}
        </button>
      </form>
    </div>
  );
}
