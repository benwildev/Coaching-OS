'use client';

import { useEffect, useState, useCallback } from 'react';
import PageHeader from '@/components/PageHeader';
import { useApp } from '@/lib/store';
import { formatDhakaDate } from '@/lib/i18n';

type Tab = 'GATEWAYS' | 'MANUAL_INSTRUCTIONS' | 'SUBMISSIONS';

interface GatewayConfig {
  provider: 'BKASH' | 'SSLCOMMERZ';
  isEnabled: boolean;
  isSandbox: boolean;
  isConfigured: boolean;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  lastTestError: string | null;
  updatedAt: string | null;
}

interface ManualInstruction {
  id?: string;
  paymentMethod: 'BKASH' | 'NAGAD' | 'BANK' | 'CARD' | 'OTHER';
  accountType?: string | null;
  accountNumber?: string | null;
  bankName?: string | null;
  branchName?: string | null;
  routingNumber?: string | null;
  accountTitle?: string | null;
  instructions?: string | null;
  instructionsBn?: string | null;
  isEnabled: boolean;
  displayOrder: number;
}

interface ManualSubmission {
  id: string;
  studentId: string;
  invoiceId: string;
  paymentMethod: string;
  amount: number;
  transactionId?: string | null;
  referenceNumber?: string | null;
  senderMobile?: string | null;
  bankName?: string | null;
  studentNote?: string | null;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string | null;
  createdAt: string;
  student: { name: string; studentIdCode: string; phone?: string | null };
  invoice: { invoiceNumber: string; totalAmount: number; dueAmount: number };
  reviewedBy?: { name: string } | null;
  payment?: { receiptNumber: string } | null;
}

export default function PaymentGatewaysSettingsPage() {
  const { lang, showToast, can } = useApp();
  const isBn = lang === 'bn';
  const canManage = can('settings.payment_gateways.update');
  const canReview = can('settings.payment_gateways.read') || can('fees.read');

  const [activeTab, setActiveTab] = useState<Tab>('GATEWAYS');
  const [configs, setConfigs] = useState<GatewayConfig[]>([]);
  const [instructions, setInstructions] = useState<ManualInstruction[]>([]);
  const [submissions, setSubmissions] = useState<ManualSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  // Testing & Action States
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [togglingProvider, setTogglingProvider] = useState<string | null>(null);

  // Edit Gateway Modal
  const [editingProvider, setEditingProvider] = useState<'BKASH' | 'SSLCOMMERZ' | null>(null);
  const [isSandbox, setIsSandbox] = useState(true);
  const [bkashCreds, setBkashCreds] = useState({ appKey: '', appSecret: '', username: '', password: '' });
  const [sslCreds, setSslCreds] = useState({ storeId: '', storePassword: '' });
  const [savingGateway, setSavingGateway] = useState(false);

  // Edit Manual Instruction Modal
  const [editingInstruction, setEditingInstruction] = useState<ManualInstruction | null>(null);
  const [savingInstruction, setSavingInstruction] = useState(false);

  // Review Submission Modal
  const [reviewingSubmission, setReviewingSubmission] = useState<ManualSubmission | null>(null);
  const [reviewAction, setReviewAction] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [rejectionReason, setRejectionReason] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/settings/payment-gateways').then((r) => r.json()),
      fetch('/api/settings/manual-payments').then((r) => r.json()),
      fetch('/api/fees/manual-submissions').then((r) => r.json()),
    ])
      .then(([gwRes, instRes, subRes]) => {
        if (gwRes.success) setConfigs(gwRes.configs || []);
        if (instRes.success) setInstructions(instRes.instructions || []);
        if (subRes.success) setSubmissions(subRes.submissions || []);
      })
      .catch((err) => showToast(err.message))
      .finally(() => setLoading(false));
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!canReview) {
    return (
      <div className="p-8 text-center text-rose-600 font-bold">
        {isBn ? 'এই পাতায় প্রবেশের অনুমতি আপনার নেই।' : 'You do not have permission to access payment settings.'}
      </div>
    );
  }

  // Gateway Actions
  const handleToggle = async (provider: 'BKASH' | 'SSLCOMMERZ', currentStatus: boolean) => {
    try {
      setTogglingProvider(provider);
      const res = await fetch(`/api/settings/payment-gateways/${provider.toLowerCase()}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: !currentStatus }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      showToast(isBn ? 'স্ট্যাটাস আপডেট হয়েছে' : 'Gateway status updated');
      loadData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error toggling gateway');
    } finally {
      setTogglingProvider(null);
    }
  };

  const handleTest = async (provider: 'BKASH' | 'SSLCOMMERZ') => {
    try {
      setTestingProvider(provider);
      const res = await fetch(`/api/settings/payment-gateways/${provider.toLowerCase()}/test`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Connection test successful!');
      } else {
        showToast(data.error || data.message || 'Connection test failed');
      }
      loadData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Connection test error');
    } finally {
      setTestingProvider(null);
    }
  };

  const handleSaveGateway = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProvider) return;

    try {
      setSavingGateway(true);
      const credentials = editingProvider === 'BKASH' ? bkashCreds : sslCreds;

      const res = await fetch('/api/settings/payment-gateways', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: editingProvider,
          isSandbox,
          credentials,
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      showToast(isBn ? 'গেটওয়ে তথ্য সংরক্ষিত হয়েছে' : 'Gateway credentials saved');
      setEditingProvider(null);
      loadData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error saving gateway');
    } finally {
      setSavingGateway(false);
    }
  };

  const handleSaveInstruction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInstruction) return;

    try {
      setSavingInstruction(true);
      const res = await fetch('/api/settings/manual-payments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingInstruction),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      showToast(isBn ? 'নির্দেশনা সংরক্ষিত হয়েছে' : 'Instruction saved');
      setEditingInstruction(null);
      loadData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error saving instruction');
    } finally {
      setSavingInstruction(false);
    }
  };

  const handleReviewSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingSubmission) return;

    try {
      setSubmittingReview(true);
      const res = await fetch(`/api/fees/manual-submissions/${reviewingSubmission.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: reviewAction,
          rejectionReason: reviewAction === 'REJECT' ? rejectionReason : undefined,
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      showToast(
        reviewAction === 'APPROVE'
          ? isBn
            ? 'পেমেন্ট অনুমোদিত এবং রশিদ তৈরি হয়েছে'
            : 'Payment approved & receipt generated'
          : isBn
          ? 'পেমেন্ট বাতিল করা হয়েছে'
          : 'Payment submission rejected'
      );
      setReviewingSubmission(null);
      loadData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error reviewing submission');
    } finally {
      setSubmittingReview(false);
    }
  };

  const bkashConfig = configs.find((c) => c.provider === 'BKASH');
  const sslConfig = configs.find((c) => c.provider === 'SSLCOMMERZ');

  return (
    <div className="space-y-6 max-w-[1000px] mx-auto pb-12">
      <PageHeader
        title={isBn ? 'পেমেন্ট সেটিংস ও কালেকশন' : 'Payment Gateways & Manual Collection'}
        subtitle={
          isBn
            ? 'ছাত্র/অভিভাবক পোর্টালের জন্য অনলাইন গেটওয়ে এবং অফলাইন ম্যানুয়াল সংগ্রহ পদ্ধতি পরিচালনা করুন।'
            : 'Manage online payment gateways and manual collection instructions for portals.'
        }
      />

      {/* TABS */}
      <div className="flex border-b border-[#cbd5e1] gap-4">
        <button
          onClick={() => setActiveTab('GATEWAYS')}
          className={`pb-2.5 px-2 text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'GATEWAYS'
              ? 'border-[#063b78] text-[#063b78]'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          {isBn ? 'অনলাইন গেটওয়ে (bKash / SSLCommerz)' : 'Online Gateways'}
        </button>
        <button
          onClick={() => setActiveTab('MANUAL_INSTRUCTIONS')}
          className={`pb-2.5 px-2 text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'MANUAL_INSTRUCTIONS'
              ? 'border-[#063b78] text-[#063b78]'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          {isBn ? 'ম্যানুয়াল পেমেন্ট নির্দেশনা' : 'Manual Payment Instructions'}
        </button>
        <button
          onClick={() => setActiveTab('SUBMISSIONS')}
          className={`pb-2.5 px-2 text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'SUBMISSIONS'
              ? 'border-[#063b78] text-[#063b78]'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span>{isBn ? 'পেমেন্ট অনুমোদন কিউ' : 'Payment Review Queue'}</span>
          {submissions.filter((s) => s.status === 'PENDING_REVIEW').length > 0 && (
            <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {submissions.filter((s) => s.status === 'PENDING_REVIEW').length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: ONLINE GATEWAYS */}
      {activeTab === 'GATEWAYS' && (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 text-blue-800 text-xs p-3.5 rounded-xl">
            <strong>{isBn ? 'মনে রাখবেন:' : 'Important Rule:'}</strong>{' '}
            {isBn
              ? 'অ্যাডমিন/স্টাফের জন্য ম্যানুয়াল পেমেন্ট গ্রহণ সর্বদা কার্যকর থাকবে। অনলাইন গেটওয়ে কনফিগার ও সক্রিয় করা হলে তবেই ছাত্র/অভিভাবক অনলাইন পেমেন্ট বাটন দেখতে পাবেন।'
              : 'Admin/Staff manual payment collection (/fees/collect) is ALWAYS available. Online payment buttons are only shown to students/guardians when configured and enabled.'}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* BKASH CARD */}
            <div className="bg-white border border-[#dce5f0] rounded-2xl p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-[#D12053] text-white flex items-center justify-center font-bold text-lg">
                      bK
                    </div>
                    <div>
                      <h3 className="font-bold text-[#092f63] text-base">bKash Checkout</h3>
                      <div className="text-xs text-[#64748b]">Tokenized API v1.2.0-beta</div>
                    </div>
                  </div>
                  <div>
                    {bkashConfig?.isEnabled ? (
                      <span className="bg-emerald-50 text-emerald-700 font-bold text-xs px-2.5 py-1 rounded-full border border-emerald-200">
                        {isBn ? 'সক্রিয়' : 'Enabled'}
                      </span>
                    ) : bkashConfig?.isConfigured ? (
                      <span className="bg-slate-100 text-slate-600 font-bold text-xs px-2.5 py-1 rounded-full border border-slate-200">
                        {isBn ? 'নিষ্ক্রিয়' : 'Disabled'}
                      </span>
                    ) : (
                      <span className="bg-amber-50 text-amber-700 font-bold text-xs px-2.5 py-1 rounded-full border border-amber-200">
                        {isBn ? 'কনফিগার করা নেই' : 'Not Configured'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="bg-[#f8fafc] rounded-xl p-3.5 space-y-2 text-xs text-[#475569] mb-6 border border-[#e2e8f0]">
                  <div className="flex justify-between">
                    <span>{isBn ? 'পরিবেশ (Environment)' : 'Environment'}:</span>
                    <span className="font-semibold text-[#092f63]">
                      {bkashConfig?.isSandbox ? 'Sandbox (Test)' : 'Production (Live)'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>{isBn ? 'সর্বশেষ পরীক্ষা' : 'Last Tested'}:</span>
                    <span>
                      {bkashConfig?.lastTestedAt
                        ? `${formatDhakaDate(bkashConfig.lastTestedAt)} (${bkashConfig.lastTestStatus})`
                        : isBn
                        ? 'কখনো পরীক্ষা হয়নি'
                        : 'Never'}
                    </span>
                  </div>
                  {bkashConfig?.lastTestError && (
                    <div className="text-rose-600 text-[11px] pt-1 border-t border-slate-200">
                      {bkashConfig.lastTestError}
                    </div>
                  )}
                </div>
              </div>

              {canManage ? (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-[#edf1f7]">
                  <button
                    onClick={() => {
                      setEditingProvider('BKASH');
                      setIsSandbox(bkashConfig?.isSandbox ?? true);
                      setBkashCreds({ appKey: '', appSecret: '', username: '', password: '' });
                    }}
                    className="flex-1 py-2 px-3 bg-[#092f63] hover:bg-[#07244c] text-white rounded-lg text-xs font-semibold"
                  >
                    {bkashConfig?.isConfigured ? (isBn ? 'সম্পাদনা' : 'Edit Credentials') : (isBn ? 'কনফিগার করুন' : 'Configure')}
                  </button>

                  {bkashConfig?.isConfigured && (
                    <>
                      <button
                        onClick={() => handleToggle('BKASH', Boolean(bkashConfig?.isEnabled))}
                        disabled={togglingProvider === 'BKASH'}
                        className={`py-2 px-3 rounded-lg text-xs font-semibold ${
                          bkashConfig.isEnabled
                            ? 'bg-amber-100 hover:bg-amber-200 text-amber-800'
                            : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800'
                        }`}
                      >
                        {bkashConfig.isEnabled ? (isBn ? 'নিষ্ক্রিয় করুন' : 'Disable') : (isBn ? 'সক্রিয় করুন' : 'Enable')}
                      </button>

                      <button
                        onClick={() => handleTest('BKASH')}
                        disabled={testingProvider === 'BKASH'}
                        className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                      >
                        {testingProvider === 'BKASH' ? (isBn ? 'পরীক্ষা হচ্ছে...' : 'Testing...') : (isBn ? 'পরীক্ষা' : 'Test')}
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic text-center">
                  {isBn ? 'শুধুমাত্র OWNER বা ADMIN গেটওয়ে পরিবর্তন করতে পারেন' : 'Only OWNER or ADMIN can modify gateway'}
                </div>
              )}
            </div>

            {/* SSLCOMMERZ CARD */}
            <div className="bg-white border border-[#dce5f0] rounded-2xl p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-[#0052cc] text-white flex items-center justify-center font-bold text-lg">
                      SSL
                    </div>
                    <div>
                      <h3 className="font-bold text-[#092f63] text-base">SSLCommerz</h3>
                      <div className="text-xs text-[#64748b]">Hosted Checkout v4 & Validation</div>
                    </div>
                  </div>
                  <div>
                    {sslConfig?.isEnabled ? (
                      <span className="bg-emerald-50 text-emerald-700 font-bold text-xs px-2.5 py-1 rounded-full border border-emerald-200">
                        {isBn ? 'সক্রিয়' : 'Enabled'}
                      </span>
                    ) : sslConfig?.isConfigured ? (
                      <span className="bg-slate-100 text-slate-600 font-bold text-xs px-2.5 py-1 rounded-full border border-slate-200">
                        {isBn ? 'নিষ্ক্রিয়' : 'Disabled'}
                      </span>
                    ) : (
                      <span className="bg-amber-50 text-amber-700 font-bold text-xs px-2.5 py-1 rounded-full border border-amber-200">
                        {isBn ? 'কনফিগার করা নেই' : 'Not Configured'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="bg-[#f8fafc] rounded-xl p-3.5 space-y-2 text-xs text-[#475569] mb-6 border border-[#e2e8f0]">
                  <div className="flex justify-between">
                    <span>{isBn ? 'পরিবেশ (Environment)' : 'Environment'}:</span>
                    <span className="font-semibold text-[#092f63]">
                      {sslConfig?.isSandbox ? 'Sandbox (Test)' : 'Production (Live)'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>{isBn ? 'সর্বশেষ পরীক্ষা' : 'Last Tested'}:</span>
                    <span>
                      {sslConfig?.lastTestedAt
                        ? `${formatDhakaDate(sslConfig.lastTestedAt)} (${sslConfig.lastTestStatus})`
                        : isBn
                        ? 'কখনো পরীক্ষা হয়নি'
                        : 'Never'}
                    </span>
                  </div>
                  {sslConfig?.lastTestError && (
                    <div className="text-rose-600 text-[11px] pt-1 border-t border-slate-200">
                      {sslConfig.lastTestError}
                    </div>
                  )}
                </div>
              </div>

              {canManage ? (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-[#edf1f7]">
                  <button
                    onClick={() => {
                      setEditingProvider('SSLCOMMERZ');
                      setIsSandbox(sslConfig?.isSandbox ?? true);
                      setSslCreds({ storeId: '', storePassword: '' });
                    }}
                    className="flex-1 py-2 px-3 bg-[#092f63] hover:bg-[#07244c] text-white rounded-lg text-xs font-semibold"
                  >
                    {sslConfig?.isConfigured ? (isBn ? 'সম্পাদনা' : 'Edit Credentials') : (isBn ? 'কনফিগার করুন' : 'Configure')}
                  </button>

                  {sslConfig?.isConfigured && (
                    <>
                      <button
                        onClick={() => handleToggle('SSLCOMMERZ', Boolean(sslConfig?.isEnabled))}
                        disabled={togglingProvider === 'SSLCOMMERZ'}
                        className={`py-2 px-3 rounded-lg text-xs font-semibold ${
                          sslConfig.isEnabled
                            ? 'bg-amber-100 hover:bg-amber-200 text-amber-800'
                            : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800'
                        }`}
                      >
                        {sslConfig.isEnabled ? (isBn ? 'নিষ্ক্রিয় করুন' : 'Disable') : (isBn ? 'সক্রিয় করুন' : 'Enable')}
                      </button>

                      <button
                        onClick={() => handleTest('SSLCOMMERZ')}
                        disabled={testingProvider === 'SSLCOMMERZ'}
                        className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                      >
                        {testingProvider === 'SSLCOMMERZ' ? (isBn ? 'পরীক্ষা হচ্ছে...' : 'Testing...') : (isBn ? 'পরীক্ষা' : 'Test')}
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic text-center">
                  {isBn ? 'শুধুমাত্র OWNER বা ADMIN গেটওয়ে পরিবর্তন করতে পারেন' : 'Only OWNER or ADMIN can modify gateway'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MANUAL PAYMENT INSTRUCTIONS */}
      {activeTab === 'MANUAL_INSTRUCTIONS' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[#64748b] max-w-xl">
              {isBn
                ? 'ছাত্র/অভিভাবকদের পোর্টাল পেজে প্রদর্শিত অফলাইন পেমেন্ট নির্দেশিকা (যেমন: বিকাশ মার্চেন্ট/পার্সোনাল নম্বর, নগদ নম্বর, ব্যাংক অ্যাকাউন্ট ইত্যাদি) কনফিগার করুন।'
                : 'Configure offline collection details (bKash/Nagad phone numbers, Bank Account details) shown in student/guardian portals.'}
            </p>
            {canManage && (
              <button
                onClick={() =>
                  setEditingInstruction({
                    paymentMethod: 'BKASH',
                    accountType: 'Personal',
                    accountNumber: '',
                    instructions: '',
                    instructionsBn: '',
                    isEnabled: true,
                    displayOrder: instructions.length,
                  })
                }
                className="py-2 px-3.5 bg-[#092f63] hover:bg-[#07244c] text-white text-xs font-semibold rounded-lg"
              >
                + {isBn ? 'নতুন নির্দেশনা যোগ করুন' : 'Add Manual Method'}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {instructions.map((inst, i) => (
              <div key={i} className="bg-white border border-[#dce5f0] rounded-xl p-4 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-[#092f63] text-sm">
                      {inst.paymentMethod}{' '}
                      {inst.accountType && <span className="text-xs font-normal text-slate-500">({inst.accountType})</span>}
                    </span>
                    <span
                      className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${
                        inst.isEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {inst.isEnabled ? (isBn ? 'সক্রিয়' : 'Active') : (isBn ? 'বন্ধ' : 'Inactive')}
                    </span>
                  </div>

                  {inst.accountNumber && (
                    <div className="font-mono text-sm font-semibold text-[#0f172a] mb-1">
                      {inst.accountNumber}
                    </div>
                  )}

                  {inst.bankName && (
                    <div className="text-xs text-[#475569] mb-1">
                      {inst.bankName} {inst.branchName ? `· ${inst.branchName}` : ''}{' '}
                      {inst.routingNumber ? `(Routing: ${inst.routingNumber})` : ''}
                    </div>
                  )}

                  {inst.accountTitle && (
                    <div className="text-xs text-[#64748b] mb-1">
                      {isBn ? 'হিসাবের নাম' : 'Account Name'}: {inst.accountTitle}
                    </div>
                  )}

                  {(inst.instructions || inst.instructionsBn) && (
                    <div className="text-xs text-[#64748b] mt-2 pt-2 border-t border-slate-100">
                      {inst.instructionsBn || inst.instructions}
                    </div>
                  )}
                </div>

                {canManage && (
                  <div className="pt-3 mt-3 border-t border-slate-100 flex justify-end">
                    <button
                      onClick={() => setEditingInstruction(inst)}
                      className="text-xs text-[#063b78] hover:underline font-semibold"
                    >
                      {isBn ? 'সম্পাদনা করুন' : 'Edit Details'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: MANUAL SUBMISSIONS REVIEW QUEUE */}
      {activeTab === 'SUBMISSIONS' && (
        <div className="space-y-4">
          <p className="text-xs text-[#64748b]">
            {isBn
              ? 'ছাত্র বা অভিভাবক পোর্টাল থেকে জমা দেওয়া অফলাইন পেমেন্ট রেফারেন্সগুলো পর্যালোচনা করুন। অনুমোদন করলে স্বয়ংক্রিয়ভাবে পেমেন্ট ও রশিদ রেকর্ড হবে।'
              : 'Review offline payments submitted by students/guardians. Approving will automatically create the normal Payment and Receipt.'}
          </p>

          <div className="bg-white border border-[#dce5f0] rounded-xl overflow-hidden shadow-sm">
            {submissions.length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-500">
                {isBn ? 'কোনো পর্যালোচনার অপেক্ষারত পেমেন্ট নেই।' : 'No payment submissions found.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#f8fafc] text-[#475569] border-b border-[#e2e8f0]">
                    <tr>
                      <th className="py-3 px-4 font-bold">{isBn ? 'ছাত্র/ছাত্রী' : 'Student'}</th>
                      <th className="py-3 px-4 font-bold">{isBn ? 'ইনভয়েস' : 'Invoice'}</th>
                      <th className="py-3 px-4 font-bold">{isBn ? 'পরিমাণ' : 'Amount'}</th>
                      <th className="py-3 px-4 font-bold">{isBn ? 'মাধ্যম ও TrxID' : 'Method & TrxID'}</th>
                      <th className="py-3 px-4 font-bold">{isBn ? 'তারিখ' : 'Date'}</th>
                      <th className="py-3 px-4 font-bold">{isBn ? 'স্ট্যাটাস' : 'Status'}</th>
                      <th className="py-3 px-4 font-bold text-right">{isBn ? 'অ্যাকশন' : 'Action'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1f5f9]">
                    {submissions.map((sub) => (
                      <tr key={sub.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <div className="font-bold text-[#092f63]">{sub.student.name}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{sub.student.studentIdCode}</div>
                        </td>
                        <td className="py-3 px-4 font-mono font-medium text-slate-700">
                          {sub.invoice.invoiceNumber}
                        </td>
                        <td className="py-3 px-4 font-bold text-emerald-700">
                          ৳{Number(sub.amount).toLocaleString('en-BD')}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-700">{sub.paymentMethod}</div>
                          {sub.transactionId && (
                            <div className="font-mono text-[11px] text-slate-500">ID: {sub.transactionId}</div>
                          )}
                          {sub.senderMobile && (
                            <div className="text-[11px] text-slate-400">{sub.senderMobile}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-500">{formatDhakaDate(sub.createdAt)}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold ${
                              sub.status === 'APPROVED'
                                ? 'bg-emerald-50 text-emerald-700'
                                : sub.status === 'REJECTED'
                                ? 'bg-rose-50 text-rose-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {sub.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {sub.status === 'PENDING_REVIEW' ? (
                            <button
                              onClick={() => {
                                setReviewingSubmission(sub);
                                setReviewAction('APPROVE');
                                setRejectionReason('');
                              }}
                              className="py-1 px-3 bg-[#092f63] hover:bg-[#063b78] text-white rounded text-xs font-semibold"
                            >
                              {isBn ? 'পর্যালোচনা' : 'Review'}
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-mono">
                              {sub.payment?.receiptNumber || '—'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: CONFIGURE GATEWAY CREDENTIALS */}
      {editingProvider && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-[500px] w-full p-6 shadow-xl relative border border-[#dce5f0]">
            <h2 className="text-base font-bold text-[#092f63] mb-1">
              {isBn ? `${editingProvider} গেটওয়ে কনফিগারেশন` : `Configure ${editingProvider}`}
            </h2>
            <p className="text-xs text-[#64748b] mb-4">
              {isBn
                ? 'তথ্যগুলো সুরক্ষিতভাবে এনক্রিপ্ট করে ডাটাবেজে সংরক্ষণ করা হবে।'
                : 'Credentials are encrypted at rest using AES-256-GCM.'}
            </p>

            <form onSubmit={handleSaveGateway} className="space-y-4">
              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-xs font-semibold text-slate-700">
                  {isBn ? 'স্যান্ডবক্স / টেস্ট মোড' : 'Sandbox (Test Environment)'}
                </span>
                <input
                  type="checkbox"
                  checked={isSandbox}
                  onChange={(e) => setIsSandbox(e.target.checked)}
                  className="w-4 h-4 text-[#092f63] rounded"
                />
              </div>

              {editingProvider === 'BKASH' ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">App Key</label>
                    <input
                      type="text"
                      required
                      value={bkashCreds.appKey}
                      onChange={(e) => setBkashCreds({ ...bkashCreds, appKey: e.target.value })}
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-300 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">App Secret</label>
                    <input
                      type="password"
                      required
                      value={bkashCreds.appSecret}
                      onChange={(e) => setBkashCreds({ ...bkashCreds, appSecret: e.target.value })}
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-300 font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Username</label>
                      <input
                        type="text"
                        required
                        value={bkashCreds.username}
                        onChange={(e) => setBkashCreds({ ...bkashCreds, username: e.target.value })}
                        className="w-full text-xs p-2.5 rounded-lg border border-slate-300 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
                      <input
                        type="password"
                        required
                        value={bkashCreds.password}
                        onChange={(e) => setBkashCreds({ ...bkashCreds, password: e.target.value })}
                        className="w-full text-xs p-2.5 rounded-lg border border-slate-300 font-mono"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Store ID</label>
                    <input
                      type="text"
                      required
                      value={sslCreds.storeId}
                      onChange={(e) => setSslCreds({ ...sslCreds, storeId: e.target.value })}
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-300 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Store Password</label>
                    <input
                      type="password"
                      required
                      value={sslCreds.storePassword}
                      onChange={(e) => setSslCreds({ ...sslCreds, storePassword: e.target.value })}
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-300 font-mono"
                    />
                  </div>
                </>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={savingGateway}
                  className="flex-1 py-2 px-4 bg-[#092f63] hover:bg-[#07244c] text-white rounded-lg text-xs font-semibold"
                >
                  {savingGateway ? (isBn ? 'সংরক্ষণ হচ্ছে...' : 'Saving...') : isBn ? 'সংরক্ষণ করুন' : 'Save Credentials'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingProvider(null)}
                  className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  {isBn ? 'বাতিল' : 'Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT MANUAL INSTRUCTION */}
      {editingInstruction && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-[500px] w-full p-6 shadow-xl relative border border-[#dce5f0]">
            <h2 className="text-base font-bold text-[#092f63] mb-1">
              {isBn ? 'ম্যানুয়াল পেমেন্ট মাধ্যম সম্পাদন' : 'Edit Manual Payment Method'}
            </h2>

            <form onSubmit={handleSaveInstruction} className="space-y-3 mt-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    {isBn ? 'পেমেন্ট মাধ্যম' : 'Method'}
                  </label>
                  <select
                    value={editingInstruction.paymentMethod}
                    onChange={(e) =>
                      setEditingInstruction({
                        ...editingInstruction,
                        paymentMethod: e.target.value as any,
                      })
                    }
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="BKASH">bKash</option>
                    <option value="NAGAD">Nagad</option>
                    <option value="BANK">Bank</option>
                    <option value="CARD">Card</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    {isBn ? 'অ্যাকাউন্টের ধরন' : 'Account Type'}
                  </label>
                  <input
                    type="text"
                    placeholder="Merchant / Personal"
                    value={editingInstruction.accountType || ''}
                    onChange={(e) => setEditingInstruction({ ...editingInstruction, accountType: e.target.value })}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  {isBn ? 'অ্যাকাউন্ট / মোবাইল নম্বর' : 'Account / Mobile Number'}
                </label>
                <input
                  type="text"
                  placeholder="017XXXXXXXX or Bank A/C"
                  value={editingInstruction.accountNumber || ''}
                  onChange={(e) => setEditingInstruction({ ...editingInstruction, accountNumber: e.target.value })}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 font-mono"
                />
              </div>

              {editingInstruction.paymentMethod === 'BANK' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      {isBn ? 'ব্যাংকের নাম' : 'Bank Name'}
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. City Bank"
                      value={editingInstruction.bankName || ''}
                      onChange={(e) => setEditingInstruction({ ...editingInstruction, bankName: e.target.value })}
                      className="w-full text-xs p-2 rounded-lg border border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      {isBn ? 'শাখা' : 'Branch'}
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Dhanmondi"
                      value={editingInstruction.branchName || ''}
                      onChange={(e) => setEditingInstruction({ ...editingInstruction, branchName: e.target.value })}
                      className="w-full text-xs p-2 rounded-lg border border-slate-300"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  {isBn ? 'নির্দেশনা (বাংলা)' : 'Instructions (Bangla)'}
                </label>
                <textarea
                  rows={2}
                  placeholder="পেমেন্ট করার পর ট্রানজেকশন আইডি সংরক্ষণ করুন..."
                  value={editingInstruction.instructionsBn || ''}
                  onChange={(e) => setEditingInstruction({ ...editingInstruction, instructionsBn: e.target.value })}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="instEnabled"
                  checked={editingInstruction.isEnabled}
                  onChange={(e) => setEditingInstruction({ ...editingInstruction, isEnabled: e.target.checked })}
                  className="w-4 h-4 text-[#092f63] rounded"
                />
                <label htmlFor="instEnabled" className="text-xs font-semibold text-slate-700">
                  {isBn ? 'পোর্টাল পেজে প্রদর্শন করুন' : 'Show in student/guardian portals'}
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={savingInstruction}
                  className="flex-1 py-2 px-4 bg-[#092f63] hover:bg-[#07244c] text-white rounded-lg text-xs font-semibold"
                >
                  {savingInstruction ? 'Saving...' : isBn ? 'সংরক্ষণ করুন' : 'Save Instruction'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingInstruction(null)}
                  className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  {isBn ? 'বাতিল' : 'Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: REVIEW SUBMISSION */}
      {reviewingSubmission && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-[480px] w-full p-6 shadow-xl relative border border-[#dce5f0]">
            <h2 className="text-base font-bold text-[#092f63] mb-1">
              {isBn ? 'ম্যানুয়াল পেমেন্ট পর্যালোচনা' : 'Review Payment Submission'}
            </h2>
            <div className="text-xs text-[#64748b] mb-4">
              {reviewingSubmission.student.name} ({reviewingSubmission.student.studentIdCode}) ·{' '}
              {reviewingSubmission.invoice.invoiceNumber}
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-2 mb-4">
              <div className="flex justify-between">
                <span>{isBn ? 'জমা দেওয়া পরিমাণ' : 'Submitted Amount'}:</span>
                <span className="font-bold text-emerald-700">৳{Number(reviewingSubmission.amount).toLocaleString('en-BD')}</span>
              </div>
              <div className="flex justify-between">
                <span>{isBn ? 'মাধ্যম' : 'Method'}:</span>
                <span className="font-semibold text-slate-800">{reviewingSubmission.paymentMethod}</span>
              </div>
              {reviewingSubmission.transactionId && (
                <div className="flex justify-between">
                  <span>TrxID:</span>
                  <span className="font-mono font-bold text-slate-800">{reviewingSubmission.transactionId}</span>
                </div>
              )}
              {reviewingSubmission.senderMobile && (
                <div className="flex justify-between">
                  <span>{isBn ? 'প্রেরক মোবাইল' : 'Sender Mobile'}:</span>
                  <span className="font-mono text-slate-800">{reviewingSubmission.senderMobile}</span>
                </div>
              )}
              {reviewingSubmission.studentNote && (
                <div className="pt-2 border-t border-slate-200 text-slate-600 italic">
                  &ldquo;{reviewingSubmission.studentNote}&rdquo;
                </div>
              )}
            </div>

            <form onSubmit={handleReviewSubmission} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {isBn ? 'পর্যালোচনা সিদ্ধান্ত' : 'Review Decision'}
                </label>
                <div className="flex gap-4 text-xs">
                  <label className="flex items-center gap-1.5 font-medium cursor-pointer">
                    <input
                      type="radio"
                      name="action"
                      checked={reviewAction === 'APPROVE'}
                      onChange={() => setReviewAction('APPROVE')}
                    />
                    <span className="text-emerald-700 font-bold">{isBn ? 'অনুমোদন করুন (Approve)' : 'Approve Payment'}</span>
                  </label>
                  <label className="flex items-center gap-1.5 font-medium cursor-pointer">
                    <input
                      type="radio"
                      name="action"
                      checked={reviewAction === 'REJECT'}
                      onChange={() => setReviewAction('REJECT')}
                    />
                    <span className="text-rose-700 font-bold">{isBn ? 'বাতিল করুন (Reject)' : 'Reject Submission'}</span>
                  </label>
                </div>
              </div>

              {reviewAction === 'REJECT' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isBn ? 'বাতিলের কারণ' : 'Rejection Reason'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={isBn ? 'ভুল TrxID বা টাকা পাওয়া যায়নি...' : 'Invalid TrxID or payment not received...'}
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300"
                  />
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={submittingReview}
                  className={`flex-1 py-2 px-4 text-white rounded-lg text-xs font-semibold ${
                    reviewAction === 'APPROVE'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {submittingReview
                    ? 'Processing...'
                    : reviewAction === 'APPROVE'
                    ? isBn
                      ? 'অনুমোদন নিশ্চিত করুন'
                      : 'Confirm Approval'
                    : isBn
                    ? 'বাতিল নিশ্চিত করুন'
                    : 'Confirm Rejection'}
                </button>
                <button
                  type="button"
                  onClick={() => setReviewingSubmission(null)}
                  className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  {isBn ? 'ফিরে যান' : 'Back'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
