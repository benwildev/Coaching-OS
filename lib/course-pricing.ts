/**
 * Phase 11.2 — pure (no DB) course pricing calculations.
 *
 * Shared by the server (admission, pricing API) and the browser (course page
 * summary, admission wizard preview) so the numbers a user sees are computed by
 * exactly the same code that later creates their fee assignments. Amounts are
 * compared in integer paisa to avoid floating-point drift (৳0.10 + ৳0.20).
 */

export const BILLING_TYPES = ['ONE_TIME', 'INSTALLMENT'] as const;
export type BillingType = (typeof BILLING_TYPES)[number];

export interface PricingFeeItem {
  id?: string;
  name: string;
  banglaName?: string | null;
  amount: number;
  isRequired: boolean;
  isActive: boolean;
}

export interface PricingInstallment {
  name: string;
  banglaName?: string | null;
  amount: number;
  dueAfterDays: number;
}

export interface CoursePricingConfig {
  fee: number;
  billingType: BillingType;
  additionalFees: PricingFeeItem[];
  installments: PricingInstallment[];
}

export interface PricingLine {
  kind: 'COURSE_FEE' | 'INSTALLMENT' | 'ADDITIONAL_FEE';
  name: string;
  banglaName?: string | null;
  amount: number;
  dueAfterDays: number;
  courseFeeItemId?: string;
}

export interface PricingTotals {
  courseFee: number;
  requiredAdditional: number;
  optionalAdditional: number;
  /** Course Fee + required additional fees — what every student owes by default. */
  requiredTotal: number;
  /** requiredTotal + every active optional fee — the ceiling, never the default. */
  potentialTotal: number;
}

export const toPaisa = (amount: number): number => Math.round((Number(amount) || 0) * 100);
export const fromPaisa = (paisa: number): number => paisa / 100;

export function computePricingTotals(config: Pick<CoursePricingConfig, 'fee' | 'additionalFees'>): PricingTotals {
  const active = config.additionalFees.filter((f) => f.isActive);
  const requiredAdditional = active.filter((f) => f.isRequired).reduce((s, f) => s + toPaisa(f.amount), 0);
  const optionalAdditional = active.filter((f) => !f.isRequired).reduce((s, f) => s + toPaisa(f.amount), 0);
  const courseFee = toPaisa(config.fee);
  return {
    courseFee: fromPaisa(courseFee),
    requiredAdditional: fromPaisa(requiredAdditional),
    optionalAdditional: fromPaisa(optionalAdditional),
    requiredTotal: fromPaisa(courseFee + requiredAdditional),
    potentialTotal: fromPaisa(courseFee + requiredAdditional + optionalAdditional),
  };
}

/** Returns a human-readable error code or null when the installment plan is valid. */
export function validateInstallments(fee: number, installments: PricingInstallment[]): string | null {
  if (installments.length < 2) return 'INSTALLMENTS_MIN_TWO';
  if (installments.some((i) => toPaisa(i.amount) <= 0)) return 'INSTALLMENT_AMOUNT_INVALID';
  const sum = installments.reduce((s, i) => s + toPaisa(i.amount), 0);
  if (sum !== toPaisa(fee)) return 'INSTALLMENTS_MUST_EQUAL_COURSE_FEE';
  return null;
}

/**
 * The lines a newly admitted student is charged. Required active additional
 * fees are always included; optional ones only when their id is in
 * `selectedOptionalIds`. For INSTALLMENT courses the Course Fee is expanded
 * into its installments; otherwise it is a single line.
 */
export function buildPricingLines(
  config: CoursePricingConfig,
  selectedOptionalIds: readonly string[] = [],
  courseFeeLabel = 'Course Fee'
): PricingLine[] {
  const lines: PricingLine[] = [];

  if (config.billingType === 'INSTALLMENT' && config.installments.length > 0) {
    for (const inst of config.installments) {
      lines.push({
        kind: 'INSTALLMENT',
        name: inst.name,
        banglaName: inst.banglaName,
        amount: inst.amount,
        dueAfterDays: inst.dueAfterDays,
      });
    }
  } else if (toPaisa(config.fee) > 0) {
    lines.push({ kind: 'COURSE_FEE', name: courseFeeLabel, amount: config.fee, dueAfterDays: 0 });
  }

  for (const item of config.additionalFees) {
    if (!item.isActive) continue;
    if (!item.isRequired && !(item.id && selectedOptionalIds.includes(item.id))) continue;
    lines.push({
      kind: 'ADDITIONAL_FEE',
      name: item.name,
      banglaName: item.banglaName,
      amount: item.amount,
      dueAfterDays: 0,
      courseFeeItemId: item.id,
    });
  }

  return lines.filter((l) => toPaisa(l.amount) > 0);
}

export interface AllocatedLine extends PricingLine {
  discountAmount: number;
  waiverAmount: number;
  finalAmount: number;
}

/**
 * Spreads a whole-admission discount and waiver over the lines in order (a
 * waterfall: first line absorbs as much as it can, the remainder spills to the
 * next). Deterministic and paisa-exact, so line totals always add up to the
 * requested totals. Throws if the deductions exceed the lines' total.
 */
export function allocateAdjustments(lines: PricingLine[], discount: number, waiver: number): AllocatedLine[] {
  const total = lines.reduce((s, l) => s + toPaisa(l.amount), 0);
  let remD = toPaisa(discount);
  let remW = toPaisa(waiver);
  if (remD + remW > total) throw new Error('INVALID_DISCOUNT: Discount and waiver combined cannot exceed original fee amount');

  return lines.map((l) => {
    const amt = toPaisa(l.amount);
    const d = Math.min(remD, amt);
    remD -= d;
    const w = Math.min(remW, amt - d);
    remW -= w;
    return {
      ...l,
      discountAmount: fromPaisa(d),
      waiverAmount: fromPaisa(w),
      finalAmount: fromPaisa(amt - d - w),
    };
  });
}
