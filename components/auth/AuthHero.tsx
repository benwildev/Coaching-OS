import { Calendar, Receipt, MessageCircle } from 'lucide-react';

export type AuthLang = 'en' | 'bn';

/** Navy brand panel shared by /login and /forgot-password. */
export default function AuthHero({ lang }: { lang: AuthLang }) {
  return (
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
            {lang === 'bn' ? 'কোচিং ওএস' : 'Coaching OS'}
          </div>
          <div className="text-xs text-blue-200/80 font-medium mt-0.5">
            {lang === 'bn'
              ? 'বাংলাদেশ কোচিং সেন্টার ম্যানেজমেন্ট সিস্টেম'
              : 'Bangladesh coaching centre management'}
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
          ? 'সবার জন্য একটি নিরাপদ সাইন-ইন · ইমেইল ও পাসওয়ার্ড'
          : 'One secure sign-in for everyone · email and password'}
      </div>
    </div>
  );
}

/** EN | বাংলা pill toggle used on the auth pages. */
export function AuthLangToggle({ lang, onChange }: { lang: AuthLang; onChange: (l: AuthLang) => void }) {
  return (
    <div className="flex items-center bg-white border border-slate-200 rounded-full p-0.5 shadow-2xs shrink-0 mt-1">
      {(['en', 'bn'] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => onChange(l)}
          className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
            lang === l ? 'bg-[#063b78] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {l === 'en' ? 'EN' : 'বাংলা'}
        </button>
      ))}
    </div>
  );
}
