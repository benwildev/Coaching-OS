'use client';

import { useState, useEffect } from 'react';
import { usePortal } from '@/components/portal/PortalProvider';

interface PayInvoiceModalProps {
  invoiceId: string;
  invoiceNumber: string;
  dueAmount: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface OnlineGateway {
  provider: 'BKASH' | 'SSLCOMMERZ';
  name: string;
  isSandbox: boolean;
}

interface ManualInstruction {
  paymentMethod: string;
  accountType?: string | null;
  accountNumber?: string | null;
  bankName?: string | null;
  branchName?: string | null;
  routingNumber?: string | null;
  accountTitle?: string | null;
  instructions?: string | null;
  instructionsBn?: string | null;
}

export function PayInvoiceModal({
  invoiceId,
  invoiceNumber,
  dueAmount,
  isOpen,
  onClose,
  onSuccess,
}: PayInvoiceModalProps) {
  const { lang } = usePortal();
  const isBn = lang === 'bn';

  const [loading, setLoading] = useState(true);
  const [initiating, setInitiating] = useState<string | null>(null);
  const [gateways, setGateways] = useState<OnlineGateway[]>([]);
  const [instructions, setInstructions] = useState<ManualInstruction[]>([]);
  const [authoritativeDue, setAuthoritativeDue] = useState(dueAmount);
  const [error, setError] = useState<string | null>(null);

  // Manual submission form state
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualMethod, setManualMethod] = useState('BKASH');
  const [manualAmount, setManualAmount] = useState(dueAmount);
  const [transactionId, setTransactionId] = useState('');
  const [senderMobile, setSenderMobile] = useState('');
  const [bankName, setBankName] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [studentNote, setStudentNote] = useState('');
  const [submittingManual, setSubmittingManual] = useState(false);
  const [manualSuccessMsg, setManualSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setManualSuccessMsg(null);
      setShowManualForm(false);
      return;
    }

    setLoading(true);
    fetch(`/api/portal/payments/options?invoiceId=${encodeURIComponent(invoiceId)}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setGateways(res.availableOnlineGateways || []);
          setInstructions(res.manualInstructions || []);
          if (res.invoiceSummary?.dueAmount !== undefined) {
            setAuthoritativeDue(res.invoiceSummary.dueAmount);
            setManualAmount(res.invoiceSummary.dueAmount);
          }
        } else {
          setError(res.error || 'Failed to load payment options');
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [isOpen, invoiceId]);

  if (!isOpen) return null;

  async function handleInitiateOnline(provider: 'BKASH' | 'SSLCOMMERZ') {
    try {
      setInitiating(provider);
      setError(null);

      const res = await fetch(`/api/portal/payments/${encodeURIComponent(invoiceId)}/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });

      const data = await res.json();
      if (!data.success || !data.gatewayUrl) {
        throw new Error(data.error || 'Failed to initiate gateway payment');
      }

      // Redirect to provider checkout
      window.location.assign(data.gatewayUrl);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error initiating payment');
      setInitiating(null);
    }
  }

  async function handleSubmitManual(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSubmittingManual(true);
      setError(null);

      const res = await fetch(`/api/portal/payments/${encodeURIComponent(invoiceId)}/manual-submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod: manualMethod,
          amount: Number(manualAmount),
          transactionId: transactionId.trim() || undefined,
          senderMobile: senderMobile.trim() || undefined,
          bankName: bankName.trim() || undefined,
          referenceNumber: referenceNumber.trim() || undefined,
          studentNote: studentNote.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to submit manual payment');
      }

      setManualSuccessMsg(
        isBn
          ? 'আপনার পেমেন্ট তথ্য সফলভাবে জমা দেওয়া হয়েছে। অফিস পর্যালোচনার পর এটি রশিদে রূপান্তরিত হবে।'
          : 'Your payment reference has been submitted. It will be verified by administration.'
      );
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error submitting manual payment');
    } finally {
      setSubmittingManual(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-[560px] w-full p-6 shadow-xl relative my-8 border border-[#dce5f0]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-xl font-bold w-8 h-8 rounded-full flex items-center justify-center"
        >
          ✕
        </button>

        <div className="mb-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#063b78] bg-blue-50 px-2 py-0.5 rounded">
            {isBn ? 'ফি পরিশোধ' : 'Fee Payment'}
          </span>
          <h2 className="text-lg font-bold text-[#092f63] mt-1">
            {isBn ? `ইনভয়েস ${invoiceNumber}` : `Invoice ${invoiceNumber}`}
          </h2>
          <div className="text-[13px] text-[#64748b] mt-0.5">
            {isBn ? 'বকেয়া পরিমাণ' : 'Outstanding Due'}:{' '}
            <span className="font-bold text-rose-600">৳{Number(authoritativeDue).toLocaleString('en-BD')}</span>
          </div>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-[12px] p-3 rounded-xl mb-4">
            {error}
          </div>
        )}

        {manualSuccessMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[12.5px] p-4 rounded-xl mb-4 text-center font-medium">
            ✓ {manualSuccessMsg}
            <div className="mt-3">
              <button
                onClick={onClose}
                className="py-1.5 px-4 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700"
              >
                {isBn ? 'ঠিক আছে' : 'OK'}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            {isBn ? 'পেমেন্ট মাধ্যম লোড হচ্ছে...' : 'Loading payment options...'}
          </div>
        ) : !manualSuccessMsg && (
          <div className="space-y-6">
            {/* ONLINE PAYMENT SECTION */}
            {gateways.length > 0 ? (
              <div className="border border-[#e2e8f0] rounded-xl p-4 bg-[#fcfdfe]">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#092f63] mb-3">
                  {isBn ? 'অনলাইন ইনস্ট্যান্ট পেমেন্ট' : 'Online Instant Payment'}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {gateways.map((gw) => (
                    <button
                      key={gw.provider}
                      onClick={() => handleInitiateOnline(gw.provider)}
                      disabled={Boolean(initiating)}
                      className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm text-white shadow-sm transition-all ${
                        gw.provider === 'BKASH'
                          ? 'bg-[#D12053] hover:bg-[#b01743]'
                          : 'bg-[#0052cc] hover:bg-[#0041a8]'
                      } ${initiating === gw.provider ? 'opacity-70 animate-pulse cursor-wait' : ''}`}
                    >
                      {initiating === gw.provider ? (
                        <span>{isBn ? 'সংযোগ হচ্ছে...' : 'Connecting...'}</span>
                      ) : (
                        <>
                          <span>{isBn ? 'পরিশোধ করুন' : 'Pay with'} {gw.name}</span>
                          {gw.isSandbox && (
                            <span className="text-[9.5px] bg-black/20 px-1.5 py-0.5 rounded uppercase">
                              Sandbox
                            </span>
                          )}
                        </>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {/* MANUAL PAYMENT INSTRUCTIONS & SUBMISSION */}
            <div className="border border-[#e2e8f0] rounded-xl p-4 bg-[#f8fafc]">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#092f63]">
                  {isBn ? 'অফলাইন / ম্যানুয়াল পেমেন্ট মাধ্যম' : 'Offline / Manual Payment Options'}
                </h3>
                <span className="text-[11px] text-[#64748b]">
                  {isBn ? 'সর্বদা উপলব্ধ' : 'Always Available'}
                </span>
              </div>

              {instructions.length > 0 ? (
                <div className="space-y-2 mb-4">
                  {instructions.map((inst, i) => (
                    <div key={i} className="text-xs bg-white p-3 rounded-lg border border-[#e2e8f0]">
                      <div className="font-bold text-[#092f63]">
                        {inst.paymentMethod}{' '}
                        {inst.accountType && <span className="text-[#64748b] font-normal">({inst.accountType})</span>}
                      </div>
                      {inst.accountNumber && (
                        <div className="font-mono text-[13px] text-[#0f172a] font-semibold mt-0.5">
                          {inst.accountNumber}
                        </div>
                      )}
                      {inst.bankName && (
                        <div className="text-[11.5px] text-[#475569]">
                          {inst.bankName} {inst.branchName ? `· ${inst.branchName}` : ''}
                        </div>
                      )}
                      {(inst.instructionsBn || inst.instructions) && (
                        <p className="text-[11.5px] text-[#64748b] mt-1">
                          {isBn && inst.instructionsBn ? inst.instructionsBn : inst.instructions}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#64748b] mb-4">
                  {isBn
                    ? 'ক্যাশ বা সরাসরি অফিসে এসে যোগাযোগ করতে পারেন।'
                    : 'You can pay directly at the coaching center office counter.'}
                </p>
              )}

              {/* Toggle Manual Submission Form */}
              {!showManualForm ? (
                <button
                  type="button"
                  onClick={() => setShowManualForm(true)}
                  className="w-full py-2 px-3 bg-white border border-[#cbd5e1] hover:bg-slate-50 text-[#092f63] font-semibold text-xs rounded-lg transition-colors text-center"
                >
                  {isBn ? 'পেমেন্ট করেছেন? তথ্য জমা দিন' : 'Already Paid? Submit Payment Reference'}
                </button>
              ) : (
                <form onSubmit={handleSubmitManual} className="mt-3 pt-3 border-t border-[#e2e8f0] space-y-3">
                  <div className="text-xs font-bold text-[#092f63]">
                    {isBn ? 'পেমেন্ট রেফারেন্স ফরম' : 'Payment Submission Form'}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-[#475569] mb-1">
                        {isBn ? 'পেমেন্ট মাধ্যম' : 'Method'}
                      </label>
                      <select
                        value={manualMethod}
                        onChange={(e) => setManualMethod(e.target.value)}
                        className="w-full text-xs p-2 rounded-lg border border-[#cbd5e1] bg-white"
                      >
                        <option value="BKASH">bKash</option>
                        <option value="NAGAD">Nagad</option>
                        <option value="BANK">Bank Transfer</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#475569] mb-1">
                        {isBn ? 'পরিশোধের পরিমাণ (৳)' : 'Amount (৳)'}
                      </label>
                      <input
                        type="number"
                        min="1"
                        max={authoritativeDue}
                        value={manualAmount}
                        onChange={(e) => setManualAmount(Number(e.target.value))}
                        required
                        className="w-full text-xs p-2 rounded-lg border border-[#cbd5e1] bg-white font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-[#475569] mb-1">
                        {isBn ? 'ট্রানজেকশন আইডি (TrxID)' : 'Transaction ID'}
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 9K201..."
                        value={transactionId}
                        onChange={(e) => setTransactionId(e.target.value)}
                        className="w-full text-xs p-2 rounded-lg border border-[#cbd5e1] bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#475569] mb-1">
                        {isBn ? 'প্রেরক মোবাইল নম্বর' : 'Sender Mobile'}
                      </label>
                      <input
                        type="text"
                        placeholder="017XXXXXXXX"
                        value={senderMobile}
                        onChange={(e) => setSenderMobile(e.target.value)}
                        className="w-full text-xs p-2 rounded-lg border border-[#cbd5e1] bg-white font-mono"
                      />
                    </div>
                  </div>

                  {manualMethod === 'BANK' && (
                    <div>
                      <label className="block text-[11px] font-medium text-[#475569] mb-1">
                        {isBn ? 'ব্যাংকের নাম' : 'Bank Name'}
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Dutch-Bangla Bank"
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        className="w-full text-xs p-2 rounded-lg border border-[#cbd5e1] bg-white"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-medium text-[#475569] mb-1">
                      {isBn ? 'মন্তব্য (ঐচ্ছিক)' : 'Note (Optional)'}
                    </label>
                    <input
                      type="text"
                      placeholder={isBn ? 'কোন তথ্য থাকলে লিখুন' : 'Any details...'}
                      value={studentNote}
                      onChange={(e) => setStudentNote(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-[#cbd5e1] bg-white"
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={submittingManual}
                      className="flex-1 py-2 px-3 bg-[#092f63] hover:bg-[#07244c] text-white font-medium text-xs rounded-lg transition-colors disabled:opacity-50"
                    >
                      {submittingManual
                        ? isBn
                          ? 'জমা হচ্ছে...'
                          : 'Submitting...'
                        : isBn
                        ? 'রেফারেন্স জমা দিন'
                        : 'Submit Reference'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowManualForm(false)}
                      className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-lg font-medium"
                    >
                      {isBn ? 'বাতিল' : 'Cancel'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
