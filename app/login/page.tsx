'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<'bn' | 'en'>('bn');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!identifier || !password) {
      setError(lang === 'bn' ? 'ইমেইল/ফোন এবং পাসওয়ার্ড পূরণ করুন।' : 'Please enter your email/phone and password.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || (lang === 'bn' ? 'লগইন ব্যর্থ হয়েছে।' : 'Login failed.'));
      }

      router.push('/dashboard');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f8fc] flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
      {/* Language Switcher Pill */}
      <div className="absolute top-6 right-6 flex items-center bg-white border border-[#dce5f0] rounded-full p-1 shadow-xs">
        <button
          type="button"
          onClick={() => setLang('bn')}
          className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
            lang === 'bn' ? 'bg-[#063b78] text-white' : 'text-[#64748b] hover:text-[#063b78]'
          }`}
        >
          বাংলা
        </button>
        <button
          type="button"
          onClick={() => setLang('en')}
          className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
            lang === 'en' ? 'bg-[#063b78] text-white' : 'text-[#64748b] hover:text-[#063b78]'
          }`}
        >
          English
        </button>
      </div>

      <div className="max-w-md w-full">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#ffd200] text-[#063b78] font-black text-3xl shadow-sm mb-3">
            A
          </div>
          <h1 className="text-2xl font-black text-[#063b78] tracking-tight">
            {lang === 'bn' ? 'কোচিং ওএস লগইন' : 'Coaching OS Sign In'}
          </h1>
          <p className="text-xs text-[#64748b] mt-1 font-medium">
            {lang === 'bn'
              ? 'বাংলাদেশ কোচিং সেন্টার ব্যবস্থাপনা সিস্টেম'
              : 'Bangladesh Coaching Center Management Platform'}
          </p>
        </div>

        {/* Login Box */}
        <div className="card p-7 sm:p-8 bg-white border border-[#dce5f0] rounded-2xl shadow-sm">
          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="fld">
              <label>{lang === 'bn' ? 'ইমেইল অথবা মোবাইল নম্বর' : 'Email or Mobile Number'}</label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={lang === 'bn' ? '01712000000 অথবা email@domain.com' : '01712000000 or email@domain.com'}
                autoComplete="username"
                required
              />
            </div>

            <div className="fld">
              <label>{lang === 'bn' ? 'পাসওয়ার্ড' : 'Password'}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="primary w-full justify-center text-sm py-2.5 mt-2"
            >
              {loading
                ? (lang === 'bn' ? 'যাচাই করা হচ্ছে…' : 'Signing in…')
                : (lang === 'bn' ? 'প্রবেশ করুন →' : 'Sign in to Dashboard →')}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-[#edf1f7] text-center">
            <span className="text-xs text-[#64748b]">
              {lang === 'bn' ? 'নতুন কোচিং সেন্টার চালু করতে চান?' : 'Setting up a new Coaching Center?'}{' '}
            </span>
            <Link
              href="/setup"
              className="text-xs font-bold text-[#063b78] hover:underline"
            >
              {lang === 'bn' ? 'সেটআপ শুরু করুন' : 'Run Setup Wizard'}
            </Link>
          </div>
        </div>

        <div className="text-center mt-6 text-[11px] text-[#64748b]">
          Asia/Dhaka (GMT+6) · Bangladesh Standard Security Standard
        </div>
      </div>
    </div>
  );
}
