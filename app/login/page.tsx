'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Calendar, Receipt, MessageCircle, Eye, EyeOff, Loader2, Phone, CheckCircle2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'otp' | 'password'>('otp');
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [lang, setLang] = useState<'en' | 'bn'>('en');

  // Request a real, account-bound sign-in code. When no SMS provider is
  // configured the server issues nothing and says so — fall back to password.
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    const cleanDigits = phone.replace(/\D/g, '');
    if (cleanDigits.length < 11) {
      setError(
        lang === 'bn'
          ? 'অনুগ্রহ করে একটি সঠিক ১১-ডিজিটের মোবাইল নম্বর দিন।'
          : 'Please enter a valid 11-digit mobile number.'
      );
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 503) {
        setError(
          lang === 'bn'
            ? 'এসএমএস কোড এই মুহূর্তে পাওয়া যাচ্ছে না (কোনো এসএমএস প্রোভাইডার কনফিগার করা নেই)। ইমেইল ও পাসওয়ার্ড দিয়ে সাইন ইন করুন।'
            : 'SMS codes are not available (no SMS provider is configured). Please sign in with email and password.'
        );
        return;
      }
      if (!res.ok || !data.success) {
        setError(lang === 'bn' ? 'কোড পাঠানো যায়নি। আবার চেষ্টা করুন।' : 'Could not request a code. Please try again.');
        return;
      }
      setOtp('');
      setOtpSent(true);
      setSuccessMsg(
        (lang === 'bn'
          ? 'নম্বরটি কোনো স্টাফ অ্যাকাউন্টের হলে ৫ মিনিটের জন্য বৈধ একটি কোড পাঠানো হয়েছে।'
          : 'If this number belongs to a staff account, a code valid for 5 minutes has been sent.') +
          (typeof data.devCode === 'string' ? ` [dev: ${data.devCode}]` : '')
      );
    } finally {
      setLoading(false);
    }
  };

  // Submit either OTP verification or Email/Password
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    setLoading(true);

    try {
      const payload =
        mode === 'otp'
          ? {
              identifier: phone.trim(),
              otp: otp.trim(),
              mode: 'otp',
            }
          : {
              identifier: email.trim(),
              password,
              mode: 'password',
            };

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      let data = await res.json().catch(() => ({}));
      // Student/guardian credentials are not accepted by the staff endpoint —
      // sign them in through the separate portal endpoint/session instead.
      if (mode === 'password' && res.status === 401) {
        const portalRes = await fetch('/api/portal/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: email.trim(), password }),
        });
        const portalData = await portalRes.json().catch(() => ({}));
        if (portalRes.ok && portalData.success) {
          router.push(portalData.user?.portalType === 'GUARDIAN' ? '/portal/guardian' : '/portal/student');
          router.refresh();
          return;
        }
        if (portalRes.status === 403 || portalRes.status === 429) data = { error: portalData.message || data.error };
      }
      if (!res.ok || !data.success) {
        throw new Error(
          data.error ||
            (lang === 'bn'
              ? 'লগইন ব্যর্থ হয়েছে। তথ্য যাচাই করুন।'
              : 'Sign in failed. Please check your credentials.')
        );
      }

      router.push(data.redirectUrl || '/dashboard');
      router.refresh();
    } catch (err) {
      setError(
        (err instanceof Error && err.message) ||
          (lang === 'bn' ? 'প্রমাণীকরণ ত্রুটি ঘটেছে' : 'Authentication failed')
      );
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#f8fafc]">
      {/* 
        TOP HEADER / LEFT BANNER:
        - On mobile: Compact navy header card matching Figma mockup exactly
        - On desktop: Full-height hero sidebar with headline and value propositions
      */}
      <div className="lg:w-[48%] xl:w-[46%] bg-gradient-to-br from-[#063374] via-[#042456] to-[#021738] p-6 sm:p-10 lg:p-16 flex flex-col justify-between relative overflow-hidden text-white shrink-0">
        {/* Subtle Background Pattern: Dot Grid */}
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(circle, rgba(255, 255, 255, 0.4) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />

        {/* Decorative Circular Watermark Geometry */}
        <div className="absolute -bottom-24 -right-24 w-80 h-80 sm:w-96 sm:h-96 rounded-full border-[32px] sm:border-[36px] border-cyan-400/10 pointer-events-none" />
        <div className="absolute -bottom-10 -right-10 w-56 h-56 sm:w-64 sm:h-64 rounded-full border-[20px] sm:border-[22px] border-emerald-400/10 pointer-events-none" />
        <div className="absolute -top-16 -right-16 w-52 h-52 rounded-full border-[24px] border-blue-400/10 pointer-events-none block lg:hidden" />

        {/* Top: Brand Header */}
        <div className="relative z-10 flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#ffd200] flex items-center justify-center text-[#063b78] shadow-md shrink-0">
            {/* Custom 3-bar Coaching OS chart icon matching original brand badge */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="11" width="4" height="9" rx="1.5" />
              <rect x="10" y="5" width="4" height="15" rx="1.5" />
              <rect x="16" y="8" width="4" height="12" rx="1.5" />
            </svg>
          </div>
          <div>
            <div className="font-extrabold text-white text-[17px] tracking-tight leading-tight">
              {lang === 'bn' ? 'আলোকিত কোচিং সেন্টার' : 'Alokito Coaching Centre'}
            </div>
            <div className="text-xs text-blue-200/80 font-medium mt-0.5">
              {lang === 'bn'
                ? 'ধানমন্ডি, ঢাকা · ৯ম-১২শ শ্রেণি'
                : 'Dhanmondi, Dhaka · Class 9–12'}
            </div>
          </div>
        </div>

        {/* Middle: Value Propositions (Visible on Desktop, hidden on mobile for compact header) */}
        <div className="hidden lg:block relative z-10 my-auto max-w-lg pt-12 pb-8">
          <h1 className="text-3xl sm:text-4xl lg:text-[40px] font-black text-white leading-[1.18] tracking-tight mb-8">
            {lang === 'bn'
              ? 'এক পর্দায় পরিচালনা করুন আপনার পুরো প্রতিষ্ঠান।'
              : 'Run the whole centre from one screen.'}
          </h1>

          <div className="space-y-4">
            {/* Feature 1 */}
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur-xs flex items-center justify-center text-[#ffd200] shrink-0 border border-white/10">
                <Calendar className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium text-blue-100/90 leading-snug">
                {lang === 'bn'
                  ? 'প্রতিটি ক্লাসের উপস্থিতি, ব্যাচ ও পরীক্ষার ব্যবস্থাপনা'
                  : 'Attendance, batches and exams for every class'}
              </span>
            </div>

            {/* Feature 2 */}
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur-xs flex items-center justify-center text-[#ffd200] shrink-0 border border-white/10">
                <Receipt className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium text-blue-100/90 leading-snug">
                {lang === 'bn'
                  ? 'ক্যাশ, বিকাশ, নগদ ও ব্যাংক রশিদের সমন্বিত হিসাব'
                  : 'Cash, bKash, Nagad and bank receipts in one ledger'}
              </span>
            </div>

            {/* Feature 3 */}
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur-xs flex items-center justify-center text-[#ffd200] shrink-0 border border-white/10">
                <MessageCircle className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium text-blue-100/90 leading-snug">
                {lang === 'bn'
                  ? 'অভিভাবকদের জন্য এসএমএস, হোয়াটসঅ্যাপ, ইমেইল ও ফোন আপডেট'
                  : 'Guardian updates by SMS, WhatsApp, email and phone'}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Note in Navy Header */}
        <div className="relative z-10 pt-4 text-[11.5px] text-blue-200/60 font-normal tracking-tight">
          {lang === 'bn'
            ? 'ডেমো প্রোটোটাইপ : নমুনা ডেটা · কোনো বাস্তব অ্যাকাউন্ট নয়'
            : 'Demo prototype : sample data · no real accounts'}
        </div>
      </div>

      {/* 
        MAIN CONTENT / SIGN IN FORM:
        - Clean white background on mobile matching the design mockup
      */}
      <div className="flex-1 flex flex-col justify-center items-center px-5 py-7 sm:p-10 lg:p-16 relative bg-white sm:bg-[#f8fafc]">
        <div className="w-full max-w-[420px]">
          {/* Header row: "Sign in" title and inline language toggle */}
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="text-[28px] sm:text-3xl font-extrabold text-[#063b78] tracking-tight">
                {lang === 'bn' ? 'সাইন ইন' : 'Sign in'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
                {lang === 'bn'
                  ? 'মালিক, শাখা পরিচালক, হিসাবরক্ষক ও শিক্ষকবৃন্দ একই পেজ ব্যবহার করবেন।'
                  : 'Owners, managers, accountants and teachers use the same page.'}
              </p>
            </div>

            {/* Language Toggle Pill: [ EN | বাংলা ] */}
            <div className="flex items-center bg-white border border-slate-200 rounded-full p-0.5 shadow-2xs shrink-0 mt-1">
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  lang === 'en'
                    ? 'bg-[#063b78] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLang('bn')}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  lang === 'bn'
                    ? 'bg-[#063b78] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                বাংলা
              </button>
            </div>
          </div>

          {/* Segmented Tab Switcher: [ Mobile + OTP ]  [ Email + password ] */}
          <div className="bg-[#eef2f6] p-1 rounded-2xl flex items-center gap-1 mb-4 shadow-2xs">
            <button
              type="button"
              onClick={() => {
                setMode('otp');
                setError(null);
                setSuccessMsg(null);
              }}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all duration-150 text-center cursor-pointer ${
                mode === 'otp'
                  ? 'bg-white text-[#063b78] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {lang === 'bn' ? 'মোবাইল + ওটিপি' : 'Mobile + OTP'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('password');
                setError(null);
                setSuccessMsg(null);
              }}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all duration-150 text-center cursor-pointer ${
                mode === 'password'
                  ? 'bg-white text-[#063b78] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {lang === 'bn' ? 'ইমেইল + পাসওয়ার্ড' : 'Email + password'}
            </button>
          </div>

          {/* Form Card */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs">
            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* MODE 1: Mobile + OTP */}
            {mode === 'otp' ? (
              <div>
                {!otpSent ? (
                  <form onSubmit={handleSendOtp} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        {lang === 'bn' ? 'মোবাইল নম্বর' : 'Mobile number'}
                      </label>
                      <div className="relative">
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="01712-345678"
                          autoComplete="tel"
                          required
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#063b78] focus:border-transparent transition-all bg-white"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full mt-2 py-3 px-4 rounded-xl bg-[#ffd200] hover:bg-[#ffdb29] text-[#063b78] font-bold text-sm shadow-xs transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] disabled:opacity-60"
                    >
                      <span>
                        {lang === 'bn' ? 'এসএমএস কোড পাঠান' : 'Send code by SMS'}
                      </span>
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-[#063b78]" />
                        <span className="text-xs font-semibold text-slate-800">
                          {phone}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setOtpSent(false)}
                        className="text-xs text-[#063b78] font-semibold hover:underline cursor-pointer"
                      >
                        {lang === 'bn' ? 'পরিবর্তন' : 'Change'}
                      </button>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-semibold text-slate-700">
                          {lang === 'bn'
                            ? '৬-ডিজিটের কোড দিন'
                            : 'Enter 6-digit verification code'}
                        </label>
                      </div>
                      <input
                        type="text"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        placeholder="••••••"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        required
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 text-sm tracking-widest text-center font-bold focus:outline-none focus:ring-2 focus:ring-[#063b78] focus:border-transparent transition-all bg-white"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full mt-2 py-3 px-4 rounded-xl bg-[#ffd200] hover:bg-[#ffdb29] text-[#063b78] font-bold text-sm shadow-xs transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] disabled:opacity-60"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>
                            {lang === 'bn' ? 'যাচাই করা হচ্ছে…' : 'Verifying…'}
                          </span>
                        </>
                      ) : (
                        <span>
                          {lang === 'bn'
                            ? 'যাচাই করুন ও প্রবেশ করুন'
                            : 'Verify & sign in'}
                        </span>
                      )}
                    </button>
                  </form>
                )}
              </div>
            ) : (
              /* MODE 2: Email + Password */
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    {lang === 'bn' ? 'ইমেইল ঠিকানা' : 'Email address'}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@alokito.edu.bd"
                    autoComplete="email"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#063b78] focus:border-transparent transition-all bg-white"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      {lang === 'bn' ? 'পাসওয়ার্ড' : 'Password'}
                    </label>
                  </div>
                  <div className="relative">
                    <input
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
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
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
                      <span>
                        {lang === 'bn' ? 'যাচাই করা হচ্ছে…' : 'Signing in…'}
                      </span>
                    </>
                  ) : (
                    <span>{lang === 'bn' ? 'প্রবেশ করুন' : 'Sign in'}</span>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* Student & Guardian Portal Link & Footer */}
          <div className="text-center mt-5 space-y-2 text-xs text-slate-500">
            <p className="text-[12px] text-slate-500">
              {lang === 'bn'
                ? 'সাইন ইন করতে সমস্যা হচ্ছে? আপনার সেন্টারের পরিচালকের সাথে যোগাযোগ করুন।'
                : "Trouble signing in? Ask your centre's owner to resend your invite."}
            </p>
            <p className="font-medium text-slate-600 pt-1">
              {lang === 'bn'
                ? 'শিক্ষার্থী বা অভিভাবক পোর্টাল?'
                : 'Looking for Student & Guardian Portal?'}{' '}
              <Link
                href="/portal/login"
                className="text-[#063b78] hover:underline font-bold"
              >
                {lang === 'bn' ? 'এখানে প্রবেশ করুন →' : 'Sign in here →'}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
