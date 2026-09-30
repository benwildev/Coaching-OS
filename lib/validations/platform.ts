import { z } from 'zod';
import { FEATURE_KEYS, LIMIT_KEYS, SUBSCRIPTION_STATUSES } from '../subscription';
import { setupWizardSchema } from './setup';

/** A limit is a whole number ≥ 0, or null = unlimited. */
const limitValue = z.number().int().min(0).max(100_000_000).nullable();

const limitsShape = Object.fromEntries(LIMIT_KEYS.map((k) => [k, limitValue.optional()])) as Record<(typeof LIMIT_KEYS)[number], z.ZodOptional<typeof limitValue>>;
const featuresShape = Object.fromEntries(FEATURE_KEYS.map((k) => [k, z.boolean().optional()])) as Record<(typeof FEATURE_KEYS)[number], z.ZodOptional<z.ZodBoolean>>;

export const platformLoginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});

export const planSchema = z.object({
  name: z.string().trim().min(2).max(80),
  banglaName: z.string().trim().max(80).nullable().optional(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{2,30}$/, 'Code must be 2-30 letters, digits, - or _'),
  description: z.string().trim().max(500).nullable().optional(),
  limits: z.object(limitsShape).default({}),
  features: z.object(featuresShape).default({}),
  priceMonthly: z.number().min(0).max(100_000_000).default(0),
  priceYearly: z.number().min(0).max(100_000_000).default(0),
  trialDays: z.number().int().min(0).max(365).nullable().optional(),
});
export type PlanInput = z.infer<typeof planSchema>;

export const planUpdateSchema = planSchema.partial().extend({
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
});
export type PlanUpdateInput = z.infer<typeof planUpdateSchema>;

export const overridesSchema = z
  .object({
    limits: z.object(limitsShape).optional(),
    features: z.object(featuresShape).optional(),
  })
  .nullable();

export const subscriptionAssignSchema = z.object({
  planId: z.string().min(1),
  status: z.enum(SUBSCRIPTION_STATUSES).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  trialDays: z.number().int().min(1).max(365).optional(),
  /** Re-snapshot the tenant to the plan's CURRENT limits/features (otherwise the sold terms are kept). */
  applyLatestPlan: z.boolean().optional(),
  overrides: overridesSchema.optional(),
});
export type SubscriptionAssignInput = z.infer<typeof subscriptionAssignSchema>;

export const tenantStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  reason: z.string().trim().max(300).optional(),
});

export const tenantCreateSchema = setupWizardSchema.extend({
  planId: z.string().min(1).optional(),
  trialDays: z.number().int().min(1).max(365).optional(),
});
export type TenantCreateInput = z.infer<typeof tenantCreateSchema>;

// ------------------------------------------------------------------
// Phase 11.5 — subscription operations. Dates are NEVER accepted from the
// client: callers send a duration / number of days and the server computes
// every date. `confirm: true` is required by the API (not just the UI) for the
// materially impactful operations.
// ------------------------------------------------------------------
const reasonRequired = z.string().trim().min(3, 'A reason is required').max(300);
const reasonOptional = z.string().trim().max(300).optional();
const idempotencyKey = z.string().trim().min(8).max(100).optional();
const confirmTrue = z.literal(true, { error: 'Confirmation is required' });

export const durationSchema = z
  .object({ unit: z.enum(['MONTHS', 'DAYS']), value: z.number().int().min(1) })
  .superRefine((d, ctx) => {
    const max = d.unit === 'MONTHS' ? 60 : 1825;
    if (d.value > max) ctx.addIssue({ code: 'custom', path: ['value'], message: `Maximum is ${max} ${d.unit.toLowerCase()}` });
  });

export const opAssignSchema = z
  .object({
    planId: z.string().min(1),
    mode: z.enum(['TRIAL', 'PAID']),
    trialDays: z.number().int().min(1).max(90).optional(),
    duration: durationSchema.optional(),
    reason: reasonOptional,
    idempotencyKey,
  })
  .superRefine((d, ctx) => {
    if (d.mode === 'PAID' && !d.duration) ctx.addIssue({ code: 'custom', path: ['duration'], message: 'A duration is required for a paid subscription' });
  });

export const opRenewSchema = z.object({ duration: durationSchema, reason: reasonOptional, idempotencyKey });

export const opExtendSchema = z.object({ days: z.number().int().min(1).max(730), reason: reasonOptional, idempotencyKey });

export const opChangePlanSchema = z
  .object({
    planId: z.string().min(1),
    keepOverrides: z.boolean().default(false),
    preview: z.boolean().default(false),
    reason: reasonRequired.optional(),
    confirm: z.boolean().optional(),
    idempotencyKey,
  })
  .superRefine((d, ctx) => {
    if (d.preview) return;
    if (!d.reason) ctx.addIssue({ code: 'custom', path: ['reason'], message: 'A reason is required' });
    if (d.confirm !== true) ctx.addIssue({ code: 'custom', path: ['confirm'], message: 'Confirmation is required' });
  });

export const opTrialSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), trialDays: z.number().int().min(1).max(90).optional(), reason: reasonOptional, idempotencyKey }),
  z.object({ action: z.literal('extend'), days: z.number().int().min(1).max(90), reason: reasonOptional, idempotencyKey }),
  z.object({ action: z.literal('end'), reason: reasonRequired, confirm: confirmTrue, idempotencyKey }),
  z.object({ action: z.literal('convert'), duration: durationSchema, reason: reasonOptional, idempotencyKey }),
]);

export const opCancelSchema = z.object({ reason: reasonRequired, confirm: confirmTrue, idempotencyKey });
export const opRestoreSchema = z.object({ duration: durationSchema, reason: reasonRequired, confirm: confirmTrue, idempotencyKey });

/** The COMPLETE desired override set: a key present = overridden (number, or null = unlimited); absent = plan value. */
export const opOverridesSchema = z.object({
  limits: z.object(limitsShape).default({}),
  features: z.object(featuresShape).default({}),
  reason: reasonRequired,
  idempotencyKey,
});

export const opTenantStatusSchema = z
  .object({ status: z.enum(['ACTIVE', 'SUSPENDED']), reason: z.string().trim().max(300).optional(), confirm: z.boolean().optional() })
  .superRefine((d, ctx) => {
    if (d.status === 'SUSPENDED') {
      if (!d.reason || d.reason.length < 3) ctx.addIssue({ code: 'custom', path: ['reason'], message: 'A reason is required to suspend' });
    }
  });
