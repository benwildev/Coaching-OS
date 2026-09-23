'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import type { SetupWizardInput } from '@/lib/validations/setup';

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<SetupWizardInput>({
    centerName: 'Alokito Coaching Centre',
    centerBanglaName: 'আলোকিত কোচিং সেন্টার',
    centerCode: 'ACC',
    centerPhone: '01712000000',
    centerEmail: 'contact@alokito.edu.bd',
    centerAddress: 'House 42, Road 9/A, Dhanmondi',
    centerCity: 'Dhaka',
    centerDistrict: 'Dhaka',

    ownerName: 'Farhana Hossain',
    ownerBanglaName: 'ফারহানা হোসেন',
    ownerEmail: 'farhana@alokito.edu.bd',
    ownerPhone: '01712000000',
    ownerPassword: 'password123',

    branchName: 'Dhanmondi Main Campus',
    branchBanglaName: 'ধানমন্ডি প্রধান শাখা',
    branchCode: 'MAIN',
    branchAddress: 'House 42, Road 9/A, Dhanmondi, Dhaka-1209',

    sessionName: 'Session 2026',
    sessionBanglaName: 'শিক্ষাবর্ষ ২০২৬',
    sessionStartDate: '2026-01-01',
    sessionEndDate: '2026-12-31',
    selectedPrograms: ['SSC', 'HSC', 'ADMISSION'],

    primaryColor: '#063B78',
    accentColor: '#FFD200',
    logoUrl: '',
  });

  const handleNext = () => {
    setError(null);
    if (step === 1) {
      if (!form.centerName || !form.centerCode || !form.centerPhone) {
        setError('Coaching Center name, code, and phone are required.');
        return;
      }
    } else if (step === 2) {
      if (!form.ownerName || !form.ownerEmail || !form.ownerPhone || !form.ownerPassword) {
        setError('All owner account fields are required.');
        return;
      }
      if (form.ownerPassword.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
    } else if (step === 3) {
      if (!form.branchName) {
        setError('Main branch name is required.');
        return;
      }
    } else if (step === 4) {
      if (!form.sessionName || form.selectedPrograms.length === 0) {
        setError('Academic session name and at least one program must be selected.');
        return;
      }
    }
    setStep((s) => Math.min(s + 1, 6));
  };

  const handleBack = () => {
    setError(null);
    setStep((s) => Math.max(s - 1, 1));
  };

  const toggleProgram = (prog: string) => {
    setForm((f) => {
      const exists = f.selectedPrograms.includes(prog);
      return {
        ...f,
        selectedPrograms: exists
          ? f.selectedPrograms.filter((p) => p !== prog)
          : [...f.selectedPrograms, prog],
      };
    });
  };

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to complete setup');
      }

      router.push('/dashboard');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'An error occurred during setup');
      setLoading(false);
    }
  };

  const stepsList = [
    { num: 1, title: 'Center Profile', desc: 'প্রতিষ্ঠান তথ্য' },
    { num: 2, title: 'Owner Account', desc: 'মালিকানা অ্যাকাউন্ট' },
    { num: 3, title: 'Main Campus', desc: 'প্রধান শাখা' },
    { num: 4, title: 'Academic Setup', desc: 'শিক্ষাবর্ষ ও প্রোগ্রাম' },
    { num: 5, title: 'Branding', desc: 'ব্র্যান্ডিং ও রঙ' },
    { num: 6, title: 'Ready to Launch', desc: 'চূড়ান্ত পর্যালোচনা' },
  ];

  return (
    <div className="min-h-screen bg-[#f5f8fc] flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#ffd200] text-[#063b78] font-black text-2xl shadow-sm mb-3">
            A
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#063b78] tracking-tight">
            Coaching Center Onboarding
          </h1>
          <p className="text-sm text-[#64748b] mt-1 font-medium">
            বাংলাদেশ কোচিং সেন্টার ব্যবস্থাপনা সিস্টেম · প্রাথমিক সেটআপ
          </p>
        </div>

        {/* Wizard Container */}
        <div className="card p-6 sm:p-8 bg-white border border-[#dce5f0] rounded-2xl shadow-sm">
          {/* Progress Indicators */}
          <div className="grid grid-cols-6 gap-2 mb-8 pb-6 border-b border-[#edf1f7]">
            {stepsList.map((s) => (
              <div key={s.num} className="flex flex-col items-center text-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    step === s.num
                      ? 'bg-[#063b78] text-[#ffd200] ring-4 ring-[#063b78]/10'
                      : step > s.num
                      ? 'bg-[#16a34a] text-white'
                      : 'bg-[#edf1f7] text-[#64748b]'
                  }`}
                >
                  {step > s.num ? '✓' : s.num}
                </div>
                <div className="hidden sm:block text-[11px] font-bold text-[#092f63] mt-1.5 truncate max-w-[80px]">
                  {s.title}
                </div>
              </div>
            ))}
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold flex items-center gap-2">
              <Icon name="x" size={18} className="text-red-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: Center Information */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-[#063b78]">Step 1: Coaching Center Profile</h2>
              <p className="text-xs text-[#64748b]">আপনার প্রতিষ্ঠানের প্রাথমিক তথ্য লিখুন</p>

              <div className="grid sm:grid-cols-2 gap-4 pt-2">
                <div className="fld">
                  <label>Center Name (English) *</label>
                  <input
                    value={form.centerName}
                    onChange={(e) => setForm({ ...form, centerName: e.target.value })}
                    placeholder="e.g. Alokito Coaching Centre"
                  />
                </div>
                <div className="fld">
                  <label>নাম (বাংলায়)</label>
                  <input
                    value={form.centerBanglaName}
                    onChange={(e) => setForm({ ...form, centerBanglaName: e.target.value })}
                    placeholder="যেমন: আলোকিত কোচিং সেন্টার"
                  />
                </div>
                <div className="fld">
                  <label>Center Code (Short Abbreviation) *</label>
                  <input
                    value={form.centerCode}
                    onChange={(e) => setForm({ ...form, centerCode: e.target.value.toUpperCase() })}
                    placeholder="e.g. ACC"
                    maxLength={8}
                  />
                </div>
                <div className="fld">
                  <label>Official Phone Number *</label>
                  <input
                    value={form.centerPhone}
                    onChange={(e) => setForm({ ...form, centerPhone: e.target.value })}
                    placeholder="01712000000"
                  />
                </div>
                <div className="fld">
                  <label>Official Email</label>
                  <input
                    type="email"
                    value={form.centerEmail}
                    onChange={(e) => setForm({ ...form, centerEmail: e.target.value })}
                    placeholder="info@coaching.edu.bd"
                  />
                </div>
                <div className="fld">
                  <label>District *</label>
                  <input
                    value={form.centerDistrict}
                    onChange={(e) => setForm({ ...form, centerDistrict: e.target.value })}
                    placeholder="e.g. Dhaka, Chattogram, Rajshahi"
                  />
                </div>
                <div className="fld sm:col-span-2">
                  <label>Street Address</label>
                  <input
                    value={form.centerAddress}
                    onChange={(e) => setForm({ ...form, centerAddress: e.target.value })}
                    placeholder="House, Road, Area (e.g. House 42, Road 9/A, Dhanmondi)"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Owner Account */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-[#063b78]">Step 2: Center Owner Account</h2>
              <p className="text-xs text-[#64748b]">মালিকের প্রশাসনিক লগইন তথ্য তৈরি করুন</p>

              <div className="grid sm:grid-cols-2 gap-4 pt-2">
                <div className="fld">
                  <label>Owner Full Name (English) *</label>
                  <input
                    value={form.ownerName}
                    onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                    placeholder="e.g. Farhana Hossain"
                  />
                </div>
                <div className="fld">
                  <label>মালিকের নাম (বাংলায়)</label>
                  <input
                    value={form.ownerBanglaName}
                    onChange={(e) => setForm({ ...form, ownerBanglaName: e.target.value })}
                    placeholder="যেমন: ফারহানা হোসেন"
                  />
                </div>
                <div className="fld">
                  <label>Login Email Address *</label>
                  <input
                    type="email"
                    value={form.ownerEmail}
                    onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
                    placeholder="farhana@coaching.edu.bd"
                  />
                </div>
                <div className="fld">
                  <label>Mobile Number (for SMS & 2FA) *</label>
                  <input
                    value={form.ownerPhone}
                    onChange={(e) => setForm({ ...form, ownerPhone: e.target.value })}
                    placeholder="01712000000"
                  />
                </div>
                <div className="fld sm:col-span-2">
                  <label>Admin Password * (minimum 6 characters)</label>
                  <input
                    type="password"
                    value={form.ownerPassword}
                    onChange={(e) => setForm({ ...form, ownerPassword: e.target.value })}
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Main Branch */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-[#063b78]">Step 3: Main Branch / Campus</h2>
              <p className="text-xs text-[#64748b]">প্রতিষ্ঠানের প্রধান শাখা নির্ধারণ করুন</p>

              <div className="grid sm:grid-cols-2 gap-4 pt-2">
                <div className="fld">
                  <label>Branch Name *</label>
                  <input
                    value={form.branchName}
                    onChange={(e) => setForm({ ...form, branchName: e.target.value })}
                    placeholder="e.g. Dhanmondi Main Campus"
                  />
                </div>
                <div className="fld">
                  <label>শাখার নাম (বাংলায়)</label>
                  <input
                    value={form.branchBanglaName}
                    onChange={(e) => setForm({ ...form, branchBanglaName: e.target.value })}
                    placeholder="যেমন: ধানমন্ডি প্রধান শাখা"
                  />
                </div>
                <div className="fld sm:col-span-2">
                  <label>Branch Address</label>
                  <input
                    value={form.branchAddress}
                    onChange={(e) => setForm({ ...form, branchAddress: e.target.value })}
                    placeholder="Detailed campus address"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Academic Session & Programs */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-[#063b78]">Step 4: Academic Programs & Session</h2>
              <p className="text-xs text-[#64748b]">বর্তমান শিক্ষাবর্ষ ও পরিচালিত প্রোগ্রামসমূহ নির্বাচন করুন</p>

              <div className="grid sm:grid-cols-3 gap-4 pt-2">
                <div className="fld">
                  <label>First Academic Session *</label>
                  <input
                    value={form.sessionName}
                    onChange={(e) => setForm({ ...form, sessionName: e.target.value })}
                    placeholder="e.g. Session 2026"
                  />
                </div>
                <div className="fld">
                  <label>Start Date *</label>
                  <input
                    type="date"
                    value={form.sessionStartDate}
                    onChange={(e) => setForm({ ...form, sessionStartDate: e.target.value })}
                  />
                </div>
                <div className="fld">
                  <label>End Date *</label>
                  <input
                    type="date"
                    value={form.sessionEndDate}
                    onChange={(e) => setForm({ ...form, sessionEndDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="pt-4">
                <label className="text-xs font-bold text-[#063b78] uppercase tracking-wider block mb-2">
                  Academic Programs to Enable (Can add more later)
                </label>
                <div className="grid sm:grid-cols-3 gap-3">
                  {[
                    { id: 'SSC', name: 'SSC Coaching', sub: 'Class 9 & 10 (Science, Commerce, Arts)' },
                    { id: 'HSC', name: 'HSC Coaching', sub: 'Class 11 & 12 (Science, Commerce, Arts)' },
                    { id: 'ADMISSION', name: 'Admission Coaching', sub: 'Medical, Engineering, University' },
                  ].map((p) => {
                    const active = form.selectedPrograms.includes(p.id);
                    return (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => toggleProgram(p.id)}
                        className={`p-3.5 rounded-xl border text-left transition-all ${
                          active
                            ? 'border-[#063b78] bg-[#f0f5fc] text-[#063b78]'
                            : 'border-[#dce5f0] bg-white text-[#64748b] hover:border-[#063b78]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-[#092f63]">{p.name}</span>
                          <span className={`text-xs font-bold ${active ? 'text-[#063b78]' : 'text-gray-300'}`}>
                            {active ? '✓' : '+'}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#64748b] mt-1">{p.sub}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Branding */}
          {step === 5 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-[#063b78]">Step 5: Visual Branding & Colors</h2>
              <p className="text-xs text-[#64748b]">আপনার কোচিং সেন্টারের রঙ এবং থিম পছন্দ করুন</p>

              <div className="grid sm:grid-cols-2 gap-4 pt-2">
                <div className="fld">
                  <label>Primary Theme Color (Default: Deep Navy)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.primaryColor}
                      onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                      className="w-12 h-11 p-1 rounded-xl cursor-pointer"
                    />
                    <input
                      value={form.primaryColor}
                      onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                      className="grow"
                    />
                  </div>
                </div>

                <div className="fld">
                  <label>Accent Action Color (Default: Yellow)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.accentColor}
                      onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
                      className="w-12 h-11 p-1 rounded-xl cursor-pointer"
                    />
                    <input
                      value={form.accentColor}
                      onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
                      className="grow"
                    />
                  </div>
                </div>

                <div className="fld sm:col-span-2">
                  <label>Logo Image URL (Optional)</label>
                  <input
                    value={form.logoUrl}
                    onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                    placeholder="https://example.com/logo.png (or upload in settings later)"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: Review & Confirmation */}
          {step === 6 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-[#063b78]">Step 6: Review & Finalize</h2>
              <p className="text-xs text-[#64748b]">সকল তথ্য যাচাই করে সেটআপ নিশ্চিত করুন</p>

              <div className="bg-[#f8fafc] border border-[#edf1f7] rounded-xl p-4 divide-y divide-[#edf1f7] text-sm">
                <div className="py-2 flex justify-between">
                  <span className="text-[#64748b]">Coaching Center:</span>
                  <span className="font-bold text-[#092f63]">
                    {form.centerName} ({form.centerCode})
                  </span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-[#64748b]">Bangla Name:</span>
                  <span className="font-bold text-[#092f63]">{form.centerBanglaName || '—'}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-[#64748b]">Owner Administrator:</span>
                  <span className="font-bold text-[#092f63]">
                    {form.ownerName} ({form.ownerEmail})
                  </span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-[#64748b]">Main Campus:</span>
                  <span className="font-bold text-[#092f63]">{form.branchName}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-[#64748b]">Initial Session:</span>
                  <span className="font-bold text-[#092f63]">{form.sessionName}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-[#64748b]">Selected Programs:</span>
                  <span className="font-bold text-[#092f63]">{form.selectedPrograms.join(', ')}</span>
                </div>
              </div>

              <div className="p-3 bg-[#e8f5e9] border border-[#c8e6c9] rounded-xl text-xs text-[#2e7d32] font-semibold flex items-center gap-2">
                <span className="text-base">🛡️</span>
                <span>
                  All initial database models, tenant isolation keys, and Bangladesh education boards will be seeded automatically.
                </span>
              </div>
            </div>
          )}

          {/* Navigation Controls */}
          <div className="flex items-center justify-between gap-3 pt-6 mt-6 border-t border-[#edf1f7]">
            {step > 1 ? (
              <button
                type="button"
                onClick={handleBack}
                disabled={loading}
                className="tb"
              >
                ← Back
              </button>
            ) : <div />}

            {step < 6 ? (
              <button
                type="button"
                onClick={handleNext}
                className="primary"
              >
                Continue →
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="primary"
              >
                {loading ? 'Initializing Center…' : 'Enter Coaching OS →'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
