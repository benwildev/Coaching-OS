import prisma from '@/lib/db';
import type { Prisma, SubscriptionPlan } from '@prisma/client';
import { LIMIT_KEYS, normalizeFeatures, normalizeLimits, type SubscriptionSnapshot } from '@/lib/subscription';
import type { PlanInput, PlanUpdateInput } from '@/lib/validations/platform';
import { recordPlatformAudit } from './platform-audit.service';

const n = (v: Prisma.Decimal | number | null | undefined) => Number(v ?? 0);

export function planLimits(plan: SubscriptionPlan) {
  return normalizeLimits(plan);
}
export function planFeatures(plan: SubscriptionPlan) {
  return normalizeFeatures(plan.features);
}

/** What a tenant is "sold": frozen onto its Subscription so later plan edits don't change it silently. */
export function buildSnapshot(plan: SubscriptionPlan): SubscriptionSnapshot {
  return {
    planCode: plan.code,
    planName: plan.name,
    planBanglaName: plan.banglaName,
    version: plan.version,
    limits: planLimits(plan),
    features: planFeatures(plan),
  };
}

export function serializePlan(plan: SubscriptionPlan & { _count?: { subscriptions: number } }) {
  return {
    id: plan.id,
    name: plan.name,
    banglaName: plan.banglaName,
    code: plan.code,
    description: plan.description,
    status: plan.status,
    version: plan.version,
    limits: planLimits(plan),
    features: planFeatures(plan),
    priceMonthly: n(plan.priceMonthly),
    priceYearly: n(plan.priceYearly),
    trialDays: plan.trialDays,
    subscriptionCount: plan._count?.subscriptions ?? 0,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

export async function listPlans(includeArchived = true) {
  const plans = await prisma.subscriptionPlan.findMany({
    where: includeArchived ? {} : { status: 'ACTIVE' },
    orderBy: [{ status: 'asc' }, { priceMonthly: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { subscriptions: true } } },
  });
  return plans.map(serializePlan);
}

export async function getPlan(planId: string) {
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId }, include: { _count: { select: { subscriptions: true } } } });
  return plan ? serializePlan(plan) : null;
}

const limitData = (limits: PlanInput['limits'] | undefined) => ({
  maxStudents: limits?.maxStudents ?? null,
  maxTeachers: limits?.maxTeachers ?? null,
  maxStaffUsers: limits?.maxStaffUsers ?? null,
  maxPortalAccounts: limits?.maxPortalAccounts ?? null,
  maxBranches: limits?.maxBranches ?? null,
  maxSms: limits?.maxSms ?? null,
  maxWhatsapp: limits?.maxWhatsapp ?? null,
  maxEmail: limits?.maxEmail ?? null,
  maxStorageMb: limits?.maxStorageMb ?? null,
});

export async function createPlan(adminId: string, input: PlanInput, ipAddress?: string | null) {
  const dup = await prisma.subscriptionPlan.findUnique({ where: { code: input.code } });
  if (dup) throw new Error('PLAN_CODE_EXISTS: A plan with this code already exists');

  const plan = await prisma.subscriptionPlan.create({
    data: {
      name: input.name,
      banglaName: input.banglaName || null,
      code: input.code,
      description: input.description || null,
      ...limitData(input.limits),
      features: normalizeFeatures(input.features) as unknown as Prisma.InputJsonValue,
      priceMonthly: input.priceMonthly,
      priceYearly: input.priceYearly,
      trialDays: input.trialDays ?? null,
    },
  });
  await recordPlatformAudit({
    adminId,
    action: 'PLAN_CREATED',
    entity: 'SubscriptionPlan',
    entityId: plan.id,
    details: { code: plan.code, name: plan.name, limits: planLimits(plan), features: planFeatures(plan) },
    ipAddress,
  });
  return serializePlan(plan);
}

/**
 * Editing limits or features bumps `version`. Tenants already on the plan keep
 * the version (and limits) they were sold until Super Admin re-syncs them.
 */
export async function updatePlan(adminId: string, planId: string, input: PlanUpdateInput, ipAddress?: string | null) {
  const before = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!before) throw new Error('PLAN_NOT_FOUND');

  if (input.code && input.code !== before.code) {
    const dup = await prisma.subscriptionPlan.findUnique({ where: { code: input.code } });
    if (dup) throw new Error('PLAN_CODE_EXISTS: A plan with this code already exists');
  }

  const beforeLimits = planLimits(before);
  const beforeFeatures = planFeatures(before);
  const nextLimits = input.limits ? { ...beforeLimits, ...input.limits } : beforeLimits;
  const nextFeatures = input.features ? { ...beforeFeatures, ...input.features } : beforeFeatures;
  const changedCommercial =
    JSON.stringify(nextLimits) !== JSON.stringify(beforeLimits) || JSON.stringify(nextFeatures) !== JSON.stringify(beforeFeatures);

  const plan = await prisma.subscriptionPlan.update({
    where: { id: planId },
    data: {
      name: input.name ?? undefined,
      banglaName: input.banglaName !== undefined ? input.banglaName || null : undefined,
      code: input.code ?? undefined,
      description: input.description !== undefined ? input.description || null : undefined,
      status: input.status ?? undefined,
      priceMonthly: input.priceMonthly ?? undefined,
      priceYearly: input.priceYearly ?? undefined,
      trialDays: input.trialDays !== undefined ? input.trialDays : undefined,
      ...(input.limits ? limitData(nextLimits) : {}),
      ...(input.features ? { features: normalizeFeatures(nextFeatures) as unknown as Prisma.InputJsonValue } : {}),
      ...(changedCommercial ? { version: { increment: 1 } } : {}),
    },
  });

  const archivedNow = input.status === 'ARCHIVED' && before.status !== 'ARCHIVED';
  const reactivatedNow = input.status === 'ACTIVE' && before.status === 'ARCHIVED';
  await recordPlatformAudit({
    adminId,
    action: archivedNow ? 'PLAN_ARCHIVED' : 'PLAN_UPDATED',
    entity: 'SubscriptionPlan',
    entityId: plan.id,
    details: {
      code: plan.code,
      reactivated: reactivatedNow || undefined,
      version: { from: before.version, to: plan.version },
      limits: changedCommercial ? { before: beforeLimits, after: nextLimits } : undefined,
      features: changedCommercial ? { before: beforeFeatures, after: nextFeatures } : undefined,
      priceMonthly: n(before.priceMonthly) !== n(plan.priceMonthly) ? { before: n(before.priceMonthly), after: n(plan.priceMonthly) } : undefined,
    },
    ipAddress,
  });
  return serializePlan(plan);
}

/**
 * Plans referenced by any subscription (current tenants) can never be deleted —
 * archive instead. The FK is also ON DELETE RESTRICT, so this is doubly enforced.
 */
export async function deletePlan(adminId: string, planId: string, ipAddress?: string | null) {
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId }, include: { _count: { select: { subscriptions: true } } } });
  if (!plan) throw new Error('PLAN_NOT_FOUND');
  if (plan._count.subscriptions > 0) {
    throw new Error('PLAN_IN_USE: This plan is assigned to coaching centers and cannot be deleted. Archive it instead.');
  }
  await prisma.subscriptionPlan.delete({ where: { id: planId } });
  await recordPlatformAudit({ adminId, action: 'PLAN_DELETED', entity: 'SubscriptionPlan', entityId: planId, details: { code: plan.code }, ipAddress });
}

export { LIMIT_KEYS };
