'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import AuthHero, { AuthLangToggle, type AuthLang } from '@/components/auth/AuthHero';

/**
 * The single sign-in page for every account type (owner, admin, staff,
 * teacher, student, guardian). Email + password only; the server decides
 * which account the credentials belong to and where to send the user.
 */
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<AuthLang>('en');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || typeof data.redirectTo !== 'string') {
        throw new Error(
          data.error ||
            (lang === 'bn' ? 'লগইন ব্যর্থ হয়েছে। তথ্য যাচাই করুন।' : 'Sign in failed. Please check your credentials.')
        );
      }
      // Full navigation (not router.push) so the client-side identity stores
      // (staff AppProvider / PortalProvider) load the newly signed-in account
      // instead of keeping whatever they fetched while signed out.
      window.location.assign(data.redirectTo);
    } catch (err) {
      setError((err instanceof Error && err.message) || (lang === 'bn' ? 'প্রমাণীকরণ ত্রুটি ঘটেছে' : 'Authentication failed'));
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
                {lang === 'bn' ? 'সাইন ইন' : 'Sign in'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
                {lang === 'bn'
                  ? 'আপনার ইমেইল ও পাসওয়ার্ড দিয়ে প্রবেশ করুন।'
                  : 'Sign in with your email and password.'}
              </p>
            </div>
            <AuthLangToggle lang={lang} onChange={setLang} />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs">
            {error && (
              <div role="alert" className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {lang === 'bn' ? 'ইমেইল ঠিকানা' : 'Email address'}
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#063b78] focus:border-transparent transition-all bg-white"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700">
                    {lang === 'bn' ? 'পাসওয়ার্ড' : 'Password'}
                  </label>
                  <Link href="/forgot-password" className="text-xs font-semibold text-[#063b78] hover:underline">
                    {lang === 'bn' ? 'পাসওয়ার্ড ভুলে গেছেন?' : 'Forgot password?'}
                  </Link>
                </div>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#063b78] focus:border-transparent transition-all bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-[#ffd200] hover:bg-[#ffdb29] text-[#063b78] font-bold text-sm shadow-xs transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{lang === 'bn' ? 'যাচাই করা হচ্ছে…' : 'Signing in…'}</span>
                  </>
                ) : (
                  <span>{lang === 'bn' ? 'প্রবেশ করুন' : 'Sign in'}</span>
                )}
              </button>
            </form>
          </div>

          <p className="text-center mt-5 text-[12px] text-slate-500">
            {lang === 'bn'
              ? 'সাইন ইন করতে সমস্যা হচ্ছে? আপনার সেন্টারের পরিচালকের সাথে যোগাযোগ করুন।'
              : "Trouble signing in? Contact your centre's administrator."}
          </p>
        </div>
      </div>
    </div>
  );
}
