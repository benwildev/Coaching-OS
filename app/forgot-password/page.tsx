'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2 } from 'lucide-react';
import AuthHero, { AuthLangToggle, type AuthLang } from '@/components/auth/AuthHero';

/**
 * Password recovery for every account type. The outcome shown is always the
 * same, so the page never reveals whether (or what kind of) account owns
 * the email.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<AuthLang>('en');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.status === 400) {
        setError(lang === 'bn' ? 'একটি সঠিক ইমেইল ঠিকানা দিন।' : 'Enter a valid email address.');
        return;
      }
      setSent(true);
    } catch {
      setError(lang === 'bn' ? 'অনুরোধ পাঠানো যায়নি। আবার চেষ্টা করুন।' : 'Could not send the request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#f5f8fc]">
      <AuthHero lang={lang} />

      <div className="flex-1 flex flex-col justify-center items-center px-5 py-7 sm:p-10 lg:p-16 relative bg-white sm:bg-[#f5f8fc]">
        <div className="w-full max-w-[420px]">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="text-[28px] sm:text-3xl font-extrabold text-[#063b78] tracking-tight">
                {lang === 'bn' ? 'পাসওয়ার্ড রিসেট' : 'Reset password'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
                {lang === 'bn'
                  ? 'আপনার অ্যাকাউন্টের ইমেইল ঠিকানা দিন।'
                  : 'Enter the email address you sign in with.'}
              </p>
            </div>
            <AuthLangToggle lang={lang} onChange={setLang} />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs">
            {sent ? (
              <div role="status" className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-px" />
                <span>
                  {lang === 'bn'
                    ? 'কোনো অ্যাকাউন্ট থাকলে পাসওয়ার্ড রিসেটের নির্দেশনা দেওয়া হবে। দ্রুত সহায়তার জন্য আপনার সেন্টারের পরিচালকের সাথে যোগাযোগ করুন।'
                    : "If an account exists, password reset instructions will be provided. For faster help, contact your centre's administrator."}
                </span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                    {error}
                  </div>
                )}
                <div>
                  <label htmlFor="reset-email" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    {lang === 'bn' ? 'ইমেইল ঠিকানা' : 'Email address'}
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#063b78] focus:border-transparent transition-all bg-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-3 px-4 rounded-xl bg-[#ffd200] hover:bg-[#ffdb29] text-[#063b78] font-bold text-sm shadow-xs transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] disabled:opacity-60"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{lang === 'bn' ? 'রিসেটের অনুরোধ করুন' : 'Request reset'}</span>
                </button>
              </form>
            )}
          </div>

          <p className="text-center mt-5 text-xs">
            <Link href="/login" className="font-semibold text-[#063b78] hover:underline">
              {lang === 'bn' ? '← সাইন ইনে ফিরে যান' : '← Back to sign in'}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
