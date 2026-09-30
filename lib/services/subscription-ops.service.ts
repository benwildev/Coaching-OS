import prisma from '@/lib/db';
import { Prisma, type Subscription, type SubscriptionPlan } from '@prisma/client';
import {
  FEATURE_KEYS,
  LIMIT_KEYS,
  addDays,
  addDuration,
  computeEffectiveStatus,
  computeOverLimits,
  computeRenewalEnd,
  normalizeFeatures,
  normalizeLimits,
  resolveFeatures,
  resolveLimits,
  subscriptionNotice,
  type Duration,
  type FeatureKey,
  type LimitKey,
  type OverrideMeta,
  type StoredStatus,
  type SubscriptionOverrides,
  type SubscriptionSnapshot,
} from '@/lib/subscription';
import { buildSnapshot } from './plan.service';
import { lockKey, loadTenantSubscription } from './subscription.service';
import { getTenantUsage } from './usage.service';
import { scrubSecrets } from './platform-audit.service';

/**
 * Phase 11.5 — manual subscription administration. NOT billing: nothing here
 * charges anyone, and it is deliberately separate from student fee/payment logic.
 *
 * Every mutation:
 *  - runs in ONE transaction under a per-tenant advisory lock ("sub-ops:<tenant>"),
 *    re-reads the subscription inside the lock and computes ALL dates server-side;
 *  - writes its audit row INSIDE that transaction (state and history cannot diverge);
 *  - is idempotent per `idempotencyKey` (a double-click / retry returns the current
 *    state instead of applying twice);
 *  - never deletes or deactivates tenant data. Lowering limits only affects NEW
 *    creation/reactivation (see subscription.service).
 *
 * LIFECYCLE (stored status → allowed operations):
 *   none       : assign
 *   TRIAL      : renew (=convert to paid), extend, trial extend/end/convert, change-plan, cancel, overrides
 *   ACTIVE     : renew, extend, change-plan, cancel, overrides
 *   PAST_DUE   : renew, extend, change-plan, cancel, overrides
 *   EXPIRED    : renew, extend, trial start, change-plan, cancel, overrides
 *   CANCELLED  : restore ONLY (renew/extend/change-plan are refused with INVALID_TRANSITION)
 * Tenant suspension is separate (CoachingCenter.status) and does not change these.
 */

type Tx = Prisma.TransactionClient;
const TX_OPTIONS = { maxWait: 15000, timeout: 20000 } as const;

export interface OpContext {
  adminId: string;
  adminName: string;
  ipAddress?: string | null;
}

const fail = (code: string, message: string): never => {
  throw new Error(`${code}: ${message}`);
};

function summary(sub: Subscription | null, now: Date) {
  if (!sub) return null;
  return {
    planVersion: sub.planVersion,
    plan: (sub.planSnapshot as Partial<SubscriptionSnapshot> | null)?.planCode ?? null,
    status: sub.status,
    effectiveStatus: computeEffectiveStatus({ status: sub.status, endDate: sub.endDate }, now),
    startDate: sub.startDate,
    endDate: sub.endDate,
  };
}

async function audit(tx: Tx, ctx: OpContext, coachingCenterId: string, action: string, entityId: string | null, details: Record<string, unknown>) {
  await tx.platformAuditLog.create({
    data: {
      platformAdminId: ctx.adminId,
      coachingCenterId,
      action,
      entity: 'Subscription',
      entityId,
      details: scrubSecrets(details) as Prisma.InputJsonValue,
      ipAddress: ctx.ipAddress ?? null,
    },
  });
}

async function hasReplay(tx: Tx, coachingCenterId: string, key?: string): Promise<boolean> {
  if (!key) return false;
  const hit = await tx.platformAuditLog.findFirst({
    where: { coachingCenterId, details: { path: ['idempotencyKey'], equals: key } },
    select: { id: true },
  });
  return !!hit;
}

/** Runs `fn` under the tenant's subscription lock. Returns `{ replay: true }` when this idempotency key was already applied. */
async function withLock<T>(
  coachingCenterId: string,
  idempotencyKey: string | undefined,
  fn: (tx: Tx, now: Date) => Promise<T>
): Promise<T | { replay: true }> {
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `sub-ops:${coachingCenterId}`);
    if (await hasReplay(tx, coachingCenterId, idempotencyKey)) return { replay: true as const };
    return fn(tx, new Date());
  }, TX_OPTIONS);
}

async function requireTenant(tx: Tx, coachingCenterId: string) {
  const c = await tx.coachingCenter.findUnique({ where: { id: coachingCenterId }, select: { id: true, name: true, status: true } });
  if (!c) fail('COACHING_CENTER_NOT_FOUND', 'Coaching center not found');
  return c!;
}

async function requireSubscription(tx: Tx, coachingCenterId: string) {
  const s = await tx.subscription.findUnique({ where: { coachingCenterId } });
  if (!s) fail('SUBSCRIPTION_NOT_FOUND', 'This coaching center has no subscription yet. Assign a plan first.');
  return s!;
}

async function requireAssignablePlan(tx: Tx, planId: string): Promise<SubscriptionPlan> {
  const plan = await tx.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan) fail('PLAN_NOT_FOUND', 'The selected plan does not exist');
  if (plan!.status !== 'ACTIVE') fail('PLAN_ARCHIVED', 'Archived plans cannot be assigned. Choose an active plan.');
  return plan!;
}

const refuseCancelled = (sub: Subscription, op: string) => {
  if (sub.status === 'CANCELLED') fail('INVALID_TRANSITION', `A cancelled subscription cannot be ${op}. Use "Restore" first.`);
};

// ------------------------------------------------------------------
// Operations
// ------------------------------------------------------------------

export async function assignPlan(
  ctx: OpContext,
  coachingCenterId: string,
  input: { planId: string; mode: 'TRIAL' | 'PAID'; trialDays?: number; duration?: Duration; reason?: string; idempotencyKey?: string }
) {
  return withLock(coachingCenterId, input.idempotencyKey, async (tx, now) => {
    await requireTenant(tx, coachingCenterId);
    const existing = await tx.subscription.findUnique({ where: { coachingCenterId } });
    if (existing) fail('SUBSCRIPTION_EXISTS', 'This coaching center already has a subscription. Use Change Plan or Renew.');
    const plan = await requireAssignablePlan(tx, input.planId);

    let status: StoredStatus;
    let endDate: Date;
    let trialDays: number | null = null;
    if (input.mode === 'TRIAL') {
      trialDays = input.trialDays ?? plan.trialDays ?? null;
      if (!trialDays || trialDays < 1) fail('TRIAL_DAYS_REQUIRED', 'This plan has no default trial length. Enter the number of trial days.');
      status = 'TRIAL';
      endDate = addDays(now, trialDays as number);
    } else {
      status = 'ACTIVE';
      endDate = addDuration(now, input.duration as Duration);
    }

    const created = await tx.subscription.create({
      data: { coachingCenterId, planId: plan.id, status, startDate: now, endDate, planVersion: plan.version, planSnapshot: buildSnapshot(plan) as unknown as Prisma.InputJsonValue },
    });
    await audit(tx, ctx, coachingCenterId, 'SUBSCRIPTION_ASSIGNED', created.id, {
      idempotencyKey: input.idempotencyKey,
      reason: input.reason ?? null,
      before: null,
      after: summary(created, now),
      mode: input.mode,
    });
    if (input.mode === 'TRIAL') {
      await audit(tx, ctx, coachingCenterId, 'SUBSCRIPTION_TRIAL_STARTED', created.id, { trialDays, endDate, reason: input.reason ?? null });
    }
    return { replay: false as const, subscription: summary(created, now) };
  });
}

export async function renew(ctx: OpContext, coachingCenterId: string, input: { duration: Duration; reason?: string; idempotencyKey?: string }) {
  return withLock(coachingCenterId, input.idempotencyKey, async (tx, now) => {
    await requireTenant(tx, coachingCenterId);
    const sub = await requireSubscription(tx, coachingCenterId);
    refuseCancelled(sub, 'renewed');

    const wasTrial = sub.status === 'TRIAL';
    // Renewing a trial converts it to a paid period that starts now; otherwise the
    // shared renewal rule applies (add after the current end if still running, else start from now).
    const newEnd = wasTrial ? addDuration(now, input.duration) : computeRenewalEnd(sub.endDate, now, input.duration);
    const updated = await tx.subscription.update({
      where: { id: sub.id },
      data: { status: 'ACTIVE', endDate: newEnd, ...(wasTrial ? { startDate: now } : {}), cancelledAt: null },
    });
    await audit(tx, ctx, coachingCenterId, 'SUBSCRIPTION_RENEWED', sub.id, {
      idempotencyKey: input.idempotencyKey,
      reason: input.reason ?? null,
      duration: input.duration,
      convertedFromTrial: wasTrial || undefined,
      before: summary(sub, now),
      after: summary(updated, now),
    });
    return { replay: false as const, subscription: summary(updated, now) };
  });
}

export async function extendSubscription(ctx: OpContext, coachingCenterId: string, input: { days: number; reason?: string; idempotencyKey?: string }) {
  return withLock(coachingCenterId, input.idempotencyKey, async (tx, now) => {
    await requireTenant(tx, coachingCenterId);
    const sub = await requireSubscription(tx, coachingCenterId);
    refuseCancelled(sub, 'extended');

    const newEnd = computeRenewalEnd(sub.endDate, now, { unit: 'DAYS', value: input.days });
    // Extending keeps the kind of subscription (a trial stays a trial). A stored
    // EXPIRED row is lifted to ACTIVE, otherwise it would stay expired despite a future end date.
    const status: StoredStatus = sub.status === 'EXPIRED' ? 'ACTIVE' : (sub.status as StoredStatus);
    const updated = await tx.subscription.update({ where: { id: sub.id }, data: { endDate: newEnd, status } });
    await audit(tx, ctx, coachingCenterId, 'SUBSCRIPTION_EXTENDED', sub.id, {
      idempotencyKey: input.idempotencyKey,
      reason: input.reason ?? null,
      days: input.days,
      before: summary(sub, now),
      after: summary(updated, now),
    });
    return { replay: false as const, subscription: summary(updated, now) };
  });
}

/** What a plan change would do, without doing it — used by the confirmation step. */
export async function previewPlanChange(coachingCenterId: string, planId: string, keepOverrides: boolean) {
  const [sub, plan, usage] = await Promise.all([
    prisma.subscription.findUnique({ where: { coachingCenterId } }),
    prisma.subscriptionPlan.findUnique({ where: { id: planId } }),
    getTenantUsage(coachingCenterId),
  ]);
  if (!sub) return fail('SUBSCRIPTION_NOT_FOUND', 'This coaching center has no subscription yet. Assign a plan first.');
  if (!plan) return fail('PLAN_NOT_FOUND', 'The selected plan does not exist');
  const overrides = keepOverrides ? ((sub.overrides as SubscriptionOverrides | null) ?? null) : null;
  const before = (sub.planSnapshot as Partial<SubscriptionSnapshot> | null) ?? {};
  const limitsBefore = resolveLimits(normalizeLimits(before.limits), (sub.overrides as SubscriptionOverrides | null) ?? null);
  const limitsAfter = resolveLimits(normalizeLimits(plan), overrides);
  const featuresBefore = resolveFeatures(normalizeFeatures(before.features), (sub.overrides as SubscriptionOverrides | null) ?? null);
  const featuresAfter = resolveFeatures(normalizeFeatures(plan.features), overrides);
  return {
    from: { name: before.planName ?? null, banglaName: before.planBanglaName ?? null, version: sub.planVersion },
    to: { name: plan.name, banglaName: plan.banglaName, version: plan.version, archived: plan.status !== 'ACTIVE' },
    limitsBefore,
    limitsAfter,
    featuresBefore,
    featuresAfter,
    overrideCount: Object.keys(((sub.overrides as SubscriptionOverrides | null)?.limits ?? {})).length + Object.keys(((sub.overrides as SubscriptionOverrides | null)?.features ?? {})).length,
    overridesWillBeCleared: !keepOverrides && !!sub.overrides,
    overLimits: computeOverLimits(limitsAfter, usage as unknown as Record<string, number | string>),
    effective: 'immediately' as const,
  };
}

export async function changePlan(
  ctx: OpContext,
  coachingCenterId: string,
  input: { planId: string; keepOverrides: boolean; reason: string; idempotencyKey?: string }
) {
  return withLock(coachingCenterId, input.idempotencyKey, async (tx, now) => {
    await requireTenant(tx, coachingCenterId);
    const sub = await requireSubscription(tx, coachingCenterId);
    refuseCancelled(sub, 'moved to another plan');
    if (sub.planId === input.planId) fail('PLAN_UNCHANGED', 'The tenant is already on this plan. Use "Sync to latest plan" from the subscription screen if the plan was edited.');
    const plan = await requireAssignablePlan(tx, input.planId);
    const oldPlan = await tx.subscriptionPlan.findUnique({ where: { id: sub.planId } });

    const overrides = input.keepOverrides ? sub.overrides : null;
    const updated = await tx.subscription.update({
      where: { id: sub.id },
      data: {
        planId: plan.id,
        planVersion: plan.version,
        planSnapshot: buildSnapshot(plan) as unknown as Prisma.InputJsonValue,
        overrides: overrides === null || overrides === undefined ? Prisma.DbNull : (overrides as Prisma.InputJsonValue),
      },
    });
    const direction = oldPlan ? (Number(plan.priceMonthly) > Number(oldPlan.priceMonthly) ? 'UPGRADE' : Number(plan.priceMonthly) < Number(oldPlan.priceMonthly) ? 'DOWNGRADE' : 'CHANGE') : 'CHANGE';
    await audit(tx, ctx, coachingCenterId, 'SUBSCRIPTION_PLAN_CHANGED', sub.id, {
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
      direction,
      keepOverrides: input.keepOverrides,
      overridesCleared: !input.keepOverrides && !!sub.overrides,
      before: summary(sub, now),
      after: summary(updated, now),
    });
    return { replay: false as const, subscription: summary(updated, now), direction };
  });
}

export async function resyncToLatestPlan(ctx: OpContext, coachingCenterId: string, input: { reason: string; idempotencyKey?: string }) {
  return withLock(coachingCenterId, input.idempotencyKey, async (tx, now) => {
    await requireTenant(tx, coachingCenterId);
    const sub = await requireSubscription(tx, coachingCenterId);
    refuseCancelled(sub, 're-synced');
    const plan = await tx.subscriptionPlan.findUnique({ where: { id: sub.planId } });
    if (!plan) return fail('PLAN_NOT_FOUND', 'The tenant\'s plan no longer exists');
    if (plan.version === sub.planVersion) fail('PLAN_UNCHANGED', 'The tenant is already on the latest version of this plan.');
    const updated = await tx.subscription.update({
      where: { id: sub.id },
      data: { planVersion: plan.version, planSnapshot: buildSnapshot(plan) as unknown as Prisma.InputJsonValue },
    });
    await audit(tx, ctx, coachingCenterId, 'SUBSCRIPTION_PLAN_RESYNCED', sub.id, {
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
      fromVersion: sub.planVersion,
      toVersion: plan.version,
      before: summary(sub, now),
      after: summary(updated, now),
    });
    return { replay: false as const, subscription: summary(updated, now) };
  });
}

type TrialInput =
  | { action: 'start'; trialDays?: number; reason?: string; idempotencyKey?: string }
  | { action: 'extend'; days: number; reason?: string; idempotencyKey?: string }
  | { action: 'end'; reason: string; idempotencyKey?: string }
  | { action: 'convert'; duration: Duration; reason?: string; idempotencyKey?: string };

export async function manageTrial(ctx: OpContext, coachingCenterId: string, input: TrialInput) {
  return withLock(coachingCenterId, input.idempotencyKey, async (tx, now) => {
    await requireTenant(tx, coachingCenterId);
    const sub = await requireSubscription(tx, coachingCenterId);
    refuseCancelled(sub, 'changed');
    const effective = computeEffectiveStatus({ status: sub.status, endDate: sub.endDate }, now);

    if (input.action === 'start') {
      if (effective !== 'EXPIRED') fail('INVALID_TRANSITION', 'A trial can only be started for a tenant whose subscription has expired. New tenants get a trial when the plan is assigned.');
      const plan = await tx.subscriptionPlan.findUnique({ where: { id: sub.planId } });
      const days = input.trialDays ?? plan?.trialDays ?? null;
      if (!days) return fail('TRIAL_DAYS_REQUIRED', 'Enter the number of trial days.');
      const updated = await tx.subscription.update({ where: { id: sub.id }, data: { status: 'TRIAL', startDate: now, endDate: addDays(now, days) } });
      await audit(tx, ctx, coachingCenterId, 'SUBSCRIPTION_TRIAL_STARTED', sub.id, { idempotencyKey: input.idempotencyKey, reason: input.reason ?? null, trialDays: days, before: summary(sub, now), after: summary(updated, now) });
      return { replay: false as const, subscription: summary(updated, now) };
    }

    if (sub.status !== 'TRIAL') fail('INVALID_TRANSITION', 'This tenant is not on a trial.');

    if (input.action === 'extend') {
      const newEnd = computeRenewalEnd(sub.endDate, now, { unit: 'DAYS', value: input.days });
      const updated = await tx.subscription.update({ where: { id: sub.id }, data: { endDate: newEnd } });
      await audit(tx, ctx, coachingCenterId, 'SUBSCRIPTION_TRIAL_EXTENDED', sub.id, { idempotencyKey: input.idempotencyKey, reason: input.reason ?? null, days: input.days, before: summary(sub, now), after: summary(updated, now) });
      return { replay: false as const, subscription: summary(updated, now) };
    }

    if (input.action === 'end') {
      const updated = await tx.subscription.update({ where: { id: sub.id }, data: { status: 'EXPIRED', endDate: now } });
      await audit(tx, ctx, coachingCenterId, 'SUBSCRIPTION_TRIAL_ENDED', sub.id, { idempotencyKey: input.idempotencyKey, reason: input.reason, before: summary(sub, now), after: summary(updated, now) });
      return { replay: false as const, subscription: summary(updated, now) };
    }

    // convert: the paid period starts now; unused trial days are not carried over.
    const updated = await tx.subscription.update({ where: { id: sub.id }, data: { status: 'ACTIVE', startDate: now, endDate: addDuration(now, input.duration) } });
    await audit(tx, ctx, coachingCenterId, 'SUBSCRIPTION_TRIAL_CONVERTED', sub.id, { idempotencyKey: input.idempotencyKey, reason: input.reason ?? null, duration: input.duration, before: summary(sub, now), after: summary(updated, now) });
    return { replay: false as const, subscription: summary(updated, now) };
  });
}

export async function cancelSubscription(ctx: OpContext, coachingCenterId: string, input: { reason: string; idempotencyKey?: string }) {
  return withLock(coachingCenterId, input.idempotencyKey, async (tx, now) => {
    await requireTenant(tx, coachingCenterId);
    const sub = await requireSubscription(tx, coachingCenterId);
    if (sub.status === 'CANCELLED') fail('INVALID_TRANSITION', 'This subscription is already cancelled.');
    // Data is preserved. Growth (new students/teachers/accounts/messages) stops via the existing enforcement.
    const updated = await tx.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELLED', cancelledAt: now } });
    await audit(tx, ctx, coachingCenterId, 'SUBSCRIPTION_CANCELLED', sub.id, { idempotencyKey: input.idempotencyKey, reason: input.reason, before: summary(sub, now), after: summary(updated, now) });
    return { replay: false as const, subscription: summary(updated, now) };
  });
}

export async function restoreSubscription(ctx: OpContext, coachingCenterId: string, input: { duration: Duration; reason: string; idempotencyKey?: string }) {
  return withLock(coachingCenterId, input.idempotencyKey, async (tx, now) => {
    await requireTenant(tx, coachingCenterId);
    const sub = await requireSubscription(tx, coachingCenterId);
    if (sub.status !== 'CANCELLED') fail('INVALID_TRANSITION', 'Only a cancelled subscription can be restored.');
    const plan = await tx.subscriptionPlan.findUnique({ where: { id: sub.planId } });
    if (!plan) return fail('PLAN_NOT_FOUND', 'The tenant\'s plan no longer exists');
    // A restored subscription gets a fresh paid period starting now and keeps the terms it was sold.
    const updated = await tx.subscription.update({ where: { id: sub.id }, data: { status: 'ACTIVE', startDate: now, endDate: addDuration(now, input.duration), cancelledAt: null } });
    await audit(tx, ctx, coachingCenterId, 'SUBSCRIPTION_RESTORED', sub.id, { idempotencyKey: input.idempotencyKey, reason: input.reason, duration: input.duration, before: summary(sub, now), after: summary(updated, now) });
    return { replay: false as const, subscription: summary(updated, now) };
  });
}

export async function updateOverrides(
  ctx: OpContext,
  coachingCenterId: string,
  input: { limits: Partial<Record<LimitKey, number | null | undefined>>; features: Partial<Record<FeatureKey, boolean | undefined>>; reason: string; idempotencyKey?: string }
) {
  return withLock(coachingCenterId, input.idempotencyKey, async (tx, now) => {
    await requireTenant(tx, coachingCenterId);
    const sub = await requireSubscription(tx, coachingCenterId);
    refuseCancelled(sub, 'given overrides');

    const prev = (sub.overrides as SubscriptionOverrides | null) ?? {};
    const stamp = new Date().toISOString();
    const nextLimits: NonNullable<SubscriptionOverrides['limits']> = {};
    const nextFeatures: NonNullable<SubscriptionOverrides['features']> = {};
    const metaLimits: NonNullable<NonNullable<SubscriptionOverrides['meta']>['limits']> = {};
    const metaFeatures: NonNullable<NonNullable<SubscriptionOverrides['meta']>['features']> = {};

    const mk = (old: OverrideMeta | undefined, changed: boolean): OverrideMeta =>
      changed || !old
        ? { reason: input.reason, createdBy: old?.createdBy ?? ctx.adminName, createdAt: old?.createdAt ?? stamp, updatedBy: ctx.adminName, updatedAt: stamp }
        : old;

    for (const k of LIMIT_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(input.limits, k) || input.limits[k] === undefined) continue;
      const value = input.limits[k] as number | null;
      nextLimits[k] = value;
      const had = Object.prototype.hasOwnProperty.call(prev.limits ?? {}, k);
      metaLimits[k] = mk(prev.meta?.limits?.[k], !had || (prev.limits ?? {})[k] !== value);
    }
    for (const k of FEATURE_KEYS) {
      if (typeof input.features[k] !== 'boolean') continue;
      nextFeatures[k] = input.features[k] as boolean;
      const had = typeof (prev.features ?? {})[k] === 'boolean';
      metaFeatures[k] = mk(prev.meta?.features?.[k], !had || (prev.features ?? {})[k] !== input.features[k]);
    }

    const hasAny = Object.keys(nextLimits).length + Object.keys(nextFeatures).length > 0;
    const next: SubscriptionOverrides | null = hasAny ? { limits: nextLimits, features: nextFeatures, meta: { limits: metaLimits, features: metaFeatures } } : null;

    const beforeState = await loadTenantSubscription(tx, coachingCenterId, now);
    const updated = await tx.subscription.update({ where: { id: sub.id }, data: { overrides: next === null ? Prisma.DbNull : (next as unknown as Prisma.InputJsonValue) } });
    const afterState = await loadTenantSubscription(tx, coachingCenterId, now);

    const limitChanges: Record<string, { before: number | null; after: number | null }> = {};
    for (const k of LIMIT_KEYS) if (beforeState.limits[k] !== afterState.limits[k]) limitChanges[k] = { before: beforeState.limits[k], after: afterState.limits[k] };
    const featureChanges: Record<string, { before: boolean; after: boolean }> = {};
    for (const k of FEATURE_KEYS) if (beforeState.features[k] !== afterState.features[k]) featureChanges[k] = { before: beforeState.features[k], after: afterState.features[k] };

    await audit(tx, ctx, coachingCenterId, 'SUBSCRIPTION_OVERRIDE_UPDATED', sub.id, {
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
      overridesBefore: { limits: prev.limits ?? {}, features: prev.features ?? {} },
      overridesAfter: { limits: nextLimits, features: nextFeatures },
      effectiveLimitChanges: limitChanges,
      effectiveFeatureChanges: featureChanges,
    });
    return { replay: false as const, subscription: summary(updated, now), effectiveLimitChanges: limitChanges, effectiveFeatureChanges: featureChanges };
  });
}

// ------------------------------------------------------------------
// Reads
// ------------------------------------------------------------------

/** Everything the tenant subscription screen needs: plan value vs override vs effective, usage, over-limit, notice. No internal ids. */
export async function getSubscriptionOverview(coachingCenterId: string, now: Date = new Date()) {
  const center = await prisma.coachingCenter.findUnique({ where: { id: coachingCenterId }, select: { id: true, name: true, banglaName: true, code: true, status: true } });
  if (!center) return null;
  const [state, usage, sub] = await Promise.all([
    loadTenantSubscription(prisma, coachingCenterId, now),
    getTenantUsage(coachingCenterId, now),
    prisma.subscription.findUnique({ where: { coachingCenterId }, include: { plan: { select: { status: true, version: true } } } }),
  ]);
  const snap = (sub?.planSnapshot as Partial<SubscriptionSnapshot> | null) ?? null;
  const planLimits = snap ? normalizeLimits(snap.limits) : normalizeLimits(null);
  const planFeatures = snap ? normalizeFeatures(snap.features) : normalizeFeatures(null);
  const ov = (sub?.overrides as SubscriptionOverrides | null) ?? null;
  const usageRec = usage as unknown as Record<string, number | string>;

  const usageField: Record<LimitKey, string> = {
    maxStudents: 'students', maxTeachers: 'teachers', maxStaffUsers: 'staffUsers', maxPortalAccounts: 'portalAccounts', maxBranches: 'branches',
    maxSms: 'sms', maxWhatsapp: 'whatsapp', maxEmail: 'email', maxStorageMb: 'storageMb',
  };
  const limits = LIMIT_KEYS.map((key) => {
    const overridden = !!ov?.limits && Object.prototype.hasOwnProperty.call(ov.limits, key);
    const used = Number(usageRec[usageField[key]] ?? 0);
    const effective = state.limits[key];
    return {
      key,
      planValue: state.hasSubscription ? planLimits[key] : null,
      overridden,
      overrideValue: overridden ? (ov!.limits![key] ?? null) : undefined,
      overrideMeta: overridden ? ov?.meta?.limits?.[key] ?? null : null,
      effective,
      used,
      over: effective !== null && used > effective ? used - effective : 0,
    };
  });
  const features = FEATURE_KEYS.map((key) => {
    const overridden = !!ov?.features && typeof ov.features[key] === 'boolean';
    return {
      key,
      planValue: state.hasSubscription ? planFeatures[key] : true,
      overridden,
      overrideValue: overridden ? (ov!.features![key] as boolean) : undefined,
      overrideMeta: overridden ? ov?.meta?.features?.[key] ?? null : null,
      effective: state.features[key],
    };
  });

  return {
    tenant: { name: center.name, banglaName: center.banglaName, code: center.code, status: center.status },
    subscription: {
      hasSubscription: state.hasSubscription,
      status: state.status,
      storedStatus: state.storedStatus,
      isTrial: state.storedStatus === 'TRIAL',
      startDate: state.startDate,
      endDate: state.endDate,
      planName: state.planName,
      planBanglaName: state.planBanglaName,
      planVersion: state.planVersion,
      currentPlanVersion: sub?.plan.version ?? null,
      planOutdated: !!sub && sub.plan.version > sub.planVersion,
      planArchived: sub?.plan.status === 'ARCHIVED',
      cancelledAt: sub?.cancelledAt ?? null,
      canGrow: state.canGrow,
    },
    limits,
    features,
    overLimits: computeOverLimits(state.limits, usageRec),
    usagePeriod: usage.period,
    notice: subscriptionNotice({ tenantSuspended: state.tenantSuspended, status: state.status, endDate: state.endDate }, now),
  };
}

const HISTORY_ACTIONS_PREFIX = 'SUBSCRIPTION_';
const HISTORY_EXTRA = ['TENANT_SUSPENDED', 'TENANT_REACTIVATED', 'TENANT_CREATED', 'LIMITS_CHANGED', 'FEATURE_ENABLED', 'FEATURE_DISABLED', 'TENANT_OVERRIDE_CREATED', 'TENANT_OVERRIDE_CHANGED'];

/** Subscription history = the platform audit trail for this tenant (no duplicate history table). */
export async function getSubscriptionHistory(coachingCenterId: string, take = 100) {
  const rows = await prisma.platformAuditLog.findMany({
    where: { coachingCenterId, OR: [{ action: { startsWith: HISTORY_ACTIONS_PREFIX } }, { action: { in: HISTORY_EXTRA } }] },
    orderBy: { createdAt: 'desc' },
    take: Math.min(200, Math.max(1, take)),
    select: { id: true, action: true, details: true, createdAt: true, platformAdmin: { select: { name: true } } },
  });
  return rows.map((r) => {
    const d = { ...((r.details as Record<string, unknown> | null) ?? {}) };
    delete d.idempotencyKey; // internal
    return { id: r.id, action: r.action, at: r.createdAt, by: r.platformAdmin?.name ?? null, reason: (d.reason as string | null | undefined) ?? null, details: d };
  });
}
