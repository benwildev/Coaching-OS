'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { usePortal } from '@/components/portal/PortalProvider';
import { Suspense } from 'react';

function PaymentCallbackContent() {
  const { lang } = usePortal();
  const searchParams = useSearchParams();

  const status = (searchParams.get('status') || '').toLowerCase();
  const receiptNumber = searchParams.get('receiptNumber') || '';
  const amount = searchParams.get('amount') || '';
  const reason = searchParams.get('reason') || '';

  const isBn = lang === 'bn';
  const isSuccess = status === 'success';
  const isCancelled = status === 'cancelled';

  return (
    <div className="max-w-[540px] mx-auto py-12 px-4">
      <div className="card p-8 rounded-2xl bg-white border border-[#dce5f0] shadow-sm text-center flex flex-col items-center">
        {isSuccess ? (
          <>
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-3xl mb-4">
              ✓
            </div>
            <h1 className="text-xl font-bold text-[#092f63]">
              {isBn ? 'পেমেন্ট সফল হয়েছে!' : 'Payment Successful!'}
            </h1>
            <p className="text-[13px] text-[#64748b] mt-1">
              {isBn
                ? 'আপনার পেমেন্ট সফলভাবে যাচাই ও গ্রহণ করা হয়েছে।'
                : 'Your transaction has been verified and recorded.'}
            </p>

            <div className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-4 my-6 text-left space-y-2">
              {receiptNumber && (
                <div className="flex justify-between text-[13px]">
                  <span className="text-[#64748b]">{isBn ? 'রশিদ নম্বর' : 'Receipt Number'}:</span>
                  <span className="font-mono font-bold text-[#092f63]">{receiptNumber}</span>
                </div>
              )}
              {amount && (
                <div className="flex justify-between text-[13px]">
                  <span className="text-[#64748b]">{isBn ? 'পরিশোধিত টাকা' : 'Amount Paid'}:</span>
                  <span className="font-bold text-emerald-600">৳{Number(amount).toLocaleString('en-BD')}</span>
                </div>
              )}
              <div className="flex justify-between text-[13px]">
                <span className="text-[#64748b]">{isBn ? 'স্ট্যাটাস' : 'Status'}:</span>
                <span className="font-bold text-emerald-600">{isBn ? 'পরিশোধিত' : 'Completed'}</span>
              </div>
            </div>

            <Link
              href="/portal/student/fees"
              className="w-full py-2.5 px-4 bg-[#092f63] hover:bg-[#07244c] text-white font-medium text-[13px] rounded-xl transition-colors"
            >
              {isBn ? 'ফি তালিকায় ফিরে যান' : 'Back to Fees & Invoices'}
            </Link>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-3xl mb-4">
              ✕
            </div>
            <h1 className="text-xl font-bold text-[#092f63]">
              {isCancelled
                ? isBn
                  ? 'পেমেন্ট বাতিল করা হয়েছে'
                  : 'Payment Cancelled'
                : isBn
                ? 'পেমেন্ট সম্পন্ন করা যায়নি'
                : 'Payment Failed'}
            </h1>
            <p className="text-[13px] text-[#64748b] mt-2">
              {isBn
                ? 'পেমেন্ট সম্পন্ন করা যায়নি। আবার চেষ্টা করুন অথবা অন্য একটি পেমেন্ট পদ্ধতি ব্যবহার করুন।'
                : 'Payment could not be completed. Please try again or use another payment method.'}
            </p>

            {reason && (
              <div className="w-full bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3 my-4 text-[12px]">
                {reason}
              </div>
            )}

            <div className="w-full flex flex-col gap-2 mt-4">
              <Link
                href="/portal/student/fees"
                className="w-full py-2.5 px-4 bg-[#092f63] hover:bg-[#07244c] text-white font-medium text-[13px] rounded-xl transition-colors"
              >
                {isBn ? 'আবার চেষ্টা করুন' : 'Try Again / Back to Fees'}
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function PaymentCallbackPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-slate-500">Loading...</div>}>
      <PaymentCallbackContent />
    </Suspense>
  );
}
