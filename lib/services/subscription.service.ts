import prisma from '@/lib/db';
import type { Prisma } from '@prisma/client';
import {
  RESOURCE_LIMIT,
  allFeatures,
  computeEffectiveStatus,
  emptyLimits,
  normalizeFeatures,
  normalizeLimits,
  resolveFeatures,
  resolveLimits,
  statusAllowsGrowth,
  type EffectiveStatus,
  type Features,
  type LimitKey,
  type LimitedResource,
  type Limits,
  type StoredStatus,
  type SubscriptionOverrides,
  type SubscriptionSnapshot,
} from '@/lib/subscription';
import { countResource } from './usage.service';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * The single source of truth for "what is this tenant allowed to do". Every
 * limit, status and feature decision in the application goes through this file
 * (and feature-access / message-quota, which sit on top of it) — no route or
 * service hardcodes a number. State is re-read from the database on every call;
 * nothing about a subscription is ever placed in a JWT.
 */

export interface TenantSubscriptionState {
  hasSubscription: boolean;
  tenantStatus: string;
  /** ACTIVE / SUSPENDED as set by the platform. */
  tenantSuspended: boolean;
  status: EffectiveStatus;
  storedStatus: StoredStatus | null;
  startDate: Date | null;
  endDate: Date | null;
  planId: string | null;
  planCode: string | null;
  planName: string | null;
  planBanglaName: string | null;
  /** Version of the plan this tenant was sold (snapshot). */
  planVersion: number | null;
  limits: Limits;
  features: Features;
  overrides: SubscriptionOverrides | null;
  /** May create students/teachers/accounts/branches and send messages. */
  canGrow: boolean;
}

export async function loadTenantSubscription(db: Db, coachingCenterId: string, now: Date = new Date()): Promise<TenantSubscriptionState> {
  const center = await db.coachingCenter.findUnique({
    where: { id: coachingCenterId },
    select: { status: true, subscription: { include: { plan: true } } },
  });
  if (!center) throw new Error('TENANT_NOT_FOUND');
  const tenantSuspended = center.status === 'SUSPENDED';
  const sub = center.subscription;

  if (!sub) {
    // Legacy tenant (no subscription assigned yet): unrestricted.
    return {
      hasSubscription: false,
      tenantStatus: center.status,
      tenantSuspended,
      status: 'LEGACY',
      storedStatus: null,
      startDate: null,
      endDate: null,
      planId: null,
      planCode: null,
      planName: null,
      planBanglaName: null,
      planVersion: null,
      limits: emptyLimits(),
      features: allFeatures(true),
      overrides: null,
      canGrow: !tenantSuspended,
    };
  }

  const snap = (sub.planSnapshot ?? null) as Partial<SubscriptionSnapshot> | null;
  const overrides = (sub.overrides ?? null) as SubscriptionOverrides | null;
  const baseLimits = snap ? normalizeLimits(snap.limits) : normalizeLimits(sub.plan);
  const baseFeatures = snap ? normalizeFeatures(snap.features) : normalizeFeatures(sub.plan.features);
  const status = computeEffectiveStatus({ status: sub.status, endDate: sub.endDate }, now);

  return {
    hasSubscription: true,
    tenantStatus: center.status,
    tenantSuspended,
    status,
    storedStatus: sub.status,
    startDate: sub.startDate,
    endDate: sub.endDate,
    planId: sub.planId,
    planCode: snap?.planCode ?? sub.plan.code,
    planName: snap?.planName ?? sub.plan.name,
    planBanglaName: snap?.planBanglaName ?? sub.plan.banglaName,
    planVersion: sub.planVersion,
    limits: resolveLimits(baseLimits, overrides),
    features: resolveFeatures(baseFeatures, overrides),
    overrides,
    canGrow: !tenantSuspended && statusAllowsGrowth(status),
  };
}

export const getTenantSubscription = (coachingCenterId: string) => loadTenantSubscription(prisma, coachingCenterId);

export async function getTenantLimits(coachingCenterId: string): Promise<Limits> {
  return (await getTenantSubscription(coachingCenterId)).limits;
}

/** Serializes concurrent checks for one tenant+key; released automatically at commit/rollback. */
export async function lockKey(tx: Prisma.TransactionClient, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key})::bigint)`;
}

const RESOURCE_TEXT: Record<LimitedResource, { code: string; label: string; noun: string }> = {
  STUDENT: { code: 'STUDENT_LIMIT_REACHED', label: 'Student', noun: 'students' },
  TEACHER: { code: 'TEACHER_LIMIT_REACHED', label: 'Teacher', noun: 'teachers' },
  STAFF: { code: 'STAFF_LIMIT_REACHED', label: 'Staff account', noun: 'staff accounts' },
  PORTAL: { code: 'PORTAL_LIMIT_REACHED', label: 'Portal account', noun: 'portal accounts' },
  BRANCH: { code: 'BRANCH_LIMIT_REACHED', label: 'Branch', noun: 'branches' },
};

export function assertStateCanGrow(state: TenantSubscriptionState): void {
  if (state.tenantSuspended) {
    throw new Error('TENANT_SUSPENDED: This account is suspended. Please contact support.');
  }
  if (!state.canGrow) {
    throw new Error('SUBSCRIPTION_INACTIVE: Your subscription is not active. Please renew your plan to add new records.');
  }
}

/**
 * Enforces a count-based limit INSIDE the caller's transaction: takes a
 * per-tenant/per-resource advisory lock first, then counts, then (if allowed)
 * returns — the caller creates the record in the same transaction, so a
 * concurrent creator blocks on the lock and only counts after this one commits.
 * That is what makes "499 of 500, two admins at once" safe.
 *
 * Existing records are never touched: lowering a limit below current usage only
 * blocks NEW creation.
 */
export async function assertResourceLimit(tx: Prisma.TransactionClient, coachingCenterId: string, resource: LimitedResource): Promise<void> {
  await lockKey(tx, `sub-limit:${coachingCenterId}:${resource}`);
  const state = await loadTenantSubscription(tx, coachingCenterId);
  assertStateCanGrow(state);

  const limit = state.limits[RESOURCE_LIMIT[resource]];
  if (limit === null) return;

  const used = await countResource(tx, coachingCenterId, resource);
  if (used >= limit) {
    const t = RESOURCE_TEXT[resource];
    throw new Error(
      `${t.code}: ${t.label} limit reached. Your current plan allows up to ${limit} ${t.noun}. Please contact your administrator to upgrade your plan.`
    );
  }
}

export const checkStudentLimit = (tx: Prisma.TransactionClient, cc: string) => assertResourceLimit(tx, cc, 'STUDENT');
export const checkTeacherLimit = (tx: Prisma.TransactionClient, cc: string) => assertResourceLimit(tx, cc, 'TEACHER');
export const checkStaffLimit = (tx: Prisma.TransactionClient, cc: string) => assertResourceLimit(tx, cc, 'STAFF');
export const checkPortalAccountLimit = (tx: Prisma.TransactionClient, cc: string) => assertResourceLimit(tx, cc, 'PORTAL');
export const checkBranchLimit = (tx: Prisma.TransactionClient, cc: string) => assertResourceLimit(tx, cc, 'BRANCH');

export type { LimitKey };
