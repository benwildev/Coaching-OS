'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/Icon';
import EnglishInput from '@/components/EnglishInput';
import BanglaInput from '@/components/BanglaInput';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatBDTExact } from '@/lib/i18n';
import {
  computePricingTotals,
  toPaisa,
  fromPaisa,
  type BillingType,
  type PricingFeeItem,
  type PricingInstallment,
} from '@/lib/course-pricing';

interface FeeRow extends PricingFeeItem {
  key: string;
}
interface InstallmentRow extends PricingInstallment {
  key: string;
}

let rowCounter = 0;
const nextKey = () => `row-${++rowCounter}`;

/**
 * Course → "Fee & Payment Plan". The only place a coaching center configures
 * what a course costs: Course Fee, billing type, additional fee lines and
 * installments. Purely configuration — saving never touches existing students'
 * fees, invoices or payments (the server enforces that; the notice below says it).
 */
export default function CoursePricingPanel({ courseId }: { courseId: string }) {
  const { lang, showToast, can } = useApp();
  const dict = DICTIONARY[lang];
  const t = dict.coursePricing;
  const money = (n: number) => formatBDTExact(n, lang);
  const canEdit = can('courses.pricing.update');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fee, setFee] = useState(0);
  const [billingType, setBillingType] = useState<BillingType>('ONE_TIME');
  const [fees, setFees] = useState<FeeRow[]>([]);
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/pricing`);
      const data = await res.json();
      if (data.success) {
        const p = data.pricing;
        setFee(Number(p.fee));
        setBillingType(p.billingType);
        setFees(p.additionalFees.map((f: PricingFeeItem) => ({ ...f, amount: Number(f.amount), key: nextKey() })));
        setInstallments(
          p.installments.map((i: PricingInstallment) => ({ ...i, amount: Number(i.amount), key: nextKey() }))
        );
        setError(null);
      } else {
        setError(data.message || data.error || 'Failed to load');
      }
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => computePricingTotals({ fee, additionalFees: fees }), [fee, fees]);
  const installmentSum = useMemo(() => installments.reduce((s, i) => s + toPaisa(i.amount), 0), [installments]);
  const installmentDiff = fromPaisa(toPaisa(fee) - installmentSum);
  const installmentsOk = billingType !== 'INSTALLMENT' || (installments.length >= 2 && installmentDiff === 0);
  const hasOptional = fees.some((f) => f.isActive && !f.isRequired);

  const patchFee = (key: string, patch: Partial<FeeRow>) =>
    setFees((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const patchInstallment = (key: string, patch: Partial<InstallmentRow>) =>
    setInstallments((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const chooseBilling = (next: BillingType) => {
    setBillingType(next);
    if (next === 'INSTALLMENT' && installments.length === 0) {
      setInstallments([
        { key: nextKey(), name: 'Admission', banglaName: '', amount: 0, dueAfterDays: 0 },
        { key: nextKey(), name: 'Final Installment', banglaName: '', amount: 0, dueAfterDays: 30 },
      ]);
    }
  };

  const save = async () => {
    if (!installmentsOk) {
      setError(installments.length < 2 ? t.errors.INSTALLMENTS_MIN_TWO : t.errors.INSTALLMENTS_MUST_EQUAL_COURSE_FEE);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/courses/${courseId}/pricing`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fee,
          billingType,
          additionalFees: fees.map((f) => ({
            id: f.id,
            name: f.name,
            banglaName: f.banglaName || null,
            amount: Number(f.amount),
            isRequired: f.isRequired,
            isActive: f.isActive,
          })),
          installments:
            billingType === 'INSTALLMENT'
              ? installments.map((i) => ({
                  name: i.name,
                  banglaName: i.banglaName || null,
                  amount: Number(i.amount),
                  dueAfterDays: Number(i.dueAfterDays) || 0,
                }))
              : [],
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(t.saved);
        await load();
      } else {
        const known = (t.errors as Record<string, string>)[data.error];
        setError(known || data.message || data.error || 'Failed to save');
      }
    } finally {
      setSaving(false);
    }
  };

  const label = (name: string, bn?: string | null) => (lang === 'bn' && bn ? bn : name);

  if (loading) {
    return (
      <div className="card p-6 rounded-2xl bg-white border border-[#dce5f0] flex justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-4 border-[#063b78] border-t-transparent" />
      </div>
    );
  }

  return (
    <div id="fee-plan" className="card p-5 md:p-6 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs">
      <h2 className="text-lg font-bold text-[#063b78]">{t.tab}</h2>
      <p className="text-[12.5px] text-[#64748b] mb-4">{t.subtitle}</p>

      {!canEdit && (
        <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-[12.5px] text-amber-900">
          {t.noPermission}
        </div>
      )}

      <fieldset disabled={!canEdit || saving} className="flex flex-col gap-6 min-w-0">
        {/* Course Fee + billing */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="fld">
            <label>{t.courseFee} (৳)</label>
            <input
              type="number"
              min={0}
              value={fee || ''}
              placeholder="0"
              onChange={(e) => setFee(Number(e.target.value) || 0)}
            />
          </div>
          <div className="fld">
            <label>{t.billing}</label>
            <select value={billingType} onChange={(e) => chooseBilling(e.target.value as BillingType)}>
              <option value="ONE_TIME">{t.oneTime}</option>
              <option value="INSTALLMENT">{t.installment}</option>
            </select>
          </div>
        </div>

        {/* Installments */}
        {billingType === 'INSTALLMENT' && (
          <div>
            <h3 className="text-[14px] font-bold text-[#092f63] mb-2">{t.installments}</h3>
            <div className="flex flex-col gap-2">
              {installments.map((i, idx) => (
                <div key={i.key} className="grid grid-cols-12 gap-2 items-end">
                  <div className="fld col-span-12 md:col-span-4">
                    {idx === 0 && <label>{t.installmentName}</label>}
                    <EnglishInput
                      value={i.name}
                      onChange={(val) => patchInstallment(i.key, { name: val })}
                      placeholder={t.installmentNameHint}
                    />
                  </div>
                  <div className="fld col-span-5 md:col-span-3">
                    {idx === 0 && <label>{t.amount} (৳)</label>}
                    <input
                      type="number"
                      min={0}
                      value={i.amount || ''}
                      onChange={(e) => patchInstallment(i.key, { amount: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="fld col-span-5 md:col-span-3">
                    {idx === 0 && <label>{t.dueAfterDays}</label>}
                    <input
                      type="number"
                      min={0}
                      value={i.dueAfterDays}
                      onChange={(e) => patchInstallment(i.key, { dueAfterDays: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="col-span-2 md:col-span-2 pb-2">
                    {installments.length > 2 && (
                      <button
                        type="button"
                        aria-label={t.remove}
                        onClick={() => setInstallments((rows) => rows.filter((r) => r.key !== i.key))}
                        className="text-rose-600 hover:text-rose-700"
                      >
                        <Icon name="x" size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="tb mt-3"
              onClick={() =>
                setInstallments((rows) => [
                  ...rows,
                  { key: nextKey(), name: '', banglaName: '', amount: 0, dueAfterDays: 30 * rows.length },
                ])
              }
            >
              <Icon name="plus" size={14} />
              <span>{t.addInstallment}</span>
            </button>
            <p className={`text-[12.5px] mt-2 font-semibold ${installmentsOk ? 'text-emerald-700' : 'text-rose-600'}`}>
              {installmentsOk
                ? t.installmentBalanced
                : `${t.installmentUnbalanced} ${money(Math.abs(installmentDiff))}`}
              <span className="text-[#64748b] font-medium">
                {' '}
                ({t.installmentTotal}: {money(fromPaisa(installmentSum))})
              </span>
            </p>
          </div>
        )}

        {/* Additional fees */}
        <div>
          <h3 className="text-[14px] font-bold text-[#092f63] mb-2">{t.additionalFees}</h3>
          {fees.length === 0 ? (
            <p className="text-[13px] text-[#94a3b8] italic">{t.noAdditionalFees}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {fees.map((f, idx) => (
                <div key={f.key} className="grid grid-cols-12 gap-2 items-end">
                  <div className="fld col-span-12 md:col-span-3">
                    {idx === 0 && <label>{t.feeName}</label>}
                    <EnglishInput value={f.name} onChange={(val) => patchFee(f.key, { name: val })} />
                  </div>
                  <div className="fld col-span-12 md:col-span-3">
                    {idx === 0 && <label>{t.feeNameBangla}</label>}
                    <BanglaInput value={f.banglaName || ''} onChange={(val) => patchFee(f.key, { banglaName: val })} />
                  </div>
                  <div className="fld col-span-5 md:col-span-2">
                    {idx === 0 && <label>{t.amount} (৳)</label>}
                    <input
                      type="number"
                      min={0}
                      value={f.amount || ''}
                      onChange={(e) => patchFee(f.key, { amount: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="fld col-span-5 md:col-span-2">
                    {idx === 0 && <label>{t.required}</label>}
                    <select
                      value={f.isRequired ? 'yes' : 'no'}
                      onChange={(e) =>
                        patchFee(f.key, { isRequired: e.target.value === 'yes', isActive: true })
                      }
                    >
                      <option value="yes">{t.required}</option>
                      <option value="no">{t.optional}</option>
                    </select>
                  </div>
                  <div className="col-span-2 md:col-span-2 pb-2 flex items-center gap-3">
                    {!f.isRequired && (
                      <label className="flex items-center gap-1 text-[12px] text-[#64748b] whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={f.isActive}
                          onChange={(e) => patchFee(f.key, { isActive: e.target.checked })}
                        />
                        {t.enabled}
                      </label>
                    )}
                    <button
                      type="button"
                      aria-label={t.remove}
                      onClick={() => setFees((rows) => rows.filter((r) => r.key !== f.key))}
                      className="text-rose-600 hover:text-rose-700"
                    >
                      <Icon name="x" size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            className="tb mt-3"
            onClick={() =>
              setFees((rows) => [
                ...rows,
                { key: nextKey(), name: '', banglaName: '', amount: 0, isRequired: true, isActive: true },
              ])
            }
          >
            <Icon name="plus" size={14} />
            <span>{t.addFee}</span>
          </button>
        </div>
      </fieldset>

      {/* Summary */}
      <div className="mt-6 rounded-xl border border-[#dce5f0] bg-[#f5f8fc] p-4">
        <h3 className="text-[14px] font-bold text-[#063b78] mb-2">{t.summary}</h3>
        <dl className="text-[13.5px] text-[#092f63] flex flex-col gap-1.5">
          <div className="flex justify-between">
            <dt>{t.courseFee}</dt>
            <dd className="font-semibold num">{money(totals.courseFee)}</dd>
          </div>
          {fees
            .filter((f) => f.isActive && f.isRequired)
            .map((f) => (
              <div key={f.key} className="flex justify-between text-[#334155]">
                <dt>{label(f.name, f.banglaName) || t.feeName}</dt>
                <dd className="num">{money(f.amount)}</dd>
              </div>
            ))}
          <div className="flex justify-between border-t border-[#dce5f0] pt-1.5 font-bold text-[#063b78]">
            <dt>{hasOptional ? t.requiredTotal : t.totalDefaultCost}</dt>
            <dd className="num">{money(totals.requiredTotal)}</dd>
          </div>
          {hasOptional && (
            <>
              <div className="pt-1.5 text-[12px] font-semibold uppercase tracking-wider text-[#64748b]">
                {t.optionalFees}
              </div>
              {fees
                .filter((f) => f.isActive && !f.isRequired)
                .map((f) => (
                  <div key={f.key} className="flex justify-between text-[#334155]">
                    <dt>{label(f.name, f.banglaName) || t.feeName}</dt>
                    <dd className="num">{money(f.amount)}</dd>
                  </div>
                ))}
              <div className="flex justify-between border-t border-[#dce5f0] pt-1.5 font-semibold">
                <dt>{t.potentialTotal}</dt>
                <dd className="num">{money(totals.potentialTotal)}</dd>
              </div>
              <p className="text-[12px] text-[#64748b]">{t.optionalNote}</p>
            </>
          )}
        </dl>
      </div>

      <p className="mt-4 text-[12.5px] text-[#64748b]">{t.futureOnly}</p>

      {error && (
        <div role="alert" className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-[13px] text-rose-800">
          {error}
        </div>
      )}

      {canEdit && (
        <div className="pt-4">
          <button type="button" onClick={save} disabled={saving || !installmentsOk} className="primary disabled:opacity-50">
            {saving ? '…' : t.saveChanges}
          </button>
        </div>
      )}
    </div>
  );
}
