import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import {
  CHANNEL_LIMIT,
  FEATURE_KEYS,
  LIMIT_KEYS,
  computeEffectiveStatus,
  normalizeLimits,
  resolveLimits,
  dhakaMonthBounds,
  type EffectiveStatus,
  type SubscriptionOverrides,
} from '@/lib/subscription';
import { completeInitialSetup } from './tenant.service';
import { loadTenantSubscription } from './subscription.service';
import { getTenantUsage, QUOTA_STATUSES } from './usage.service';
import { buildSnapshot } from './plan.service';
import { recordPlatformAudit } from './platform-audit.service';
import type { SubscriptionAssignInput, TenantCreateInput } from '@/lib/validations/platform';

const DAY_MS = 24 * 60 * 60 * 1000;

// ------------------------------------------------------------------
// Category used by the dashboard / list. A suspended tenant is counted ONLY as
// suspended, so the categories always add up to the total.
// ------------------------------------------------------------------
export type TenantCategory = 'SUSPENDED' | 'LEGACY' | 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'EXPIRED' | 'CANCELLED';

export function categoryOf(tenantStatus: string, effective: EffectiveStatus): TenantCategory {
  if (tenantStatus === 'SUSPENDED') return 'SUSPENDED';
  return effective;
}

async function groupCount(model: 'student' | 'teacher', ids: string[]) {
  const rows = await (prisma[model] as unknown as { groupBy: (a: unknown) => Promise<Array<{ coachingCenterId: string; _count: { _all: number } }>> }).groupBy({
    by: ['coachingCenterId'],
    where: { coachingCenterId: { in: ids }, status: 'ACTIVE' },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.coachingCenterId, r._count._all]));
}

async function monthMessageCounts(ids: string[], now: Date) {
  const { start, end } = dhakaMonthBounds(now);
  const rows = await prisma.communicationLog.groupBy({
    by: ['coachingCenterId', 'channel'],
    where: { coachingCenterId: { in: ids }, status: { in: [...QUOTA_STATUSES] }, createdAt: { gte: start, lt: end } },
    _count: { _all: true },
  });
  const out = new Map<string, { SMS: number; WHATSAPP: number; EMAIL: number }>();
  for (const r of rows) {
    const cur = out.get(r.coachingCenterId) ?? { SMS: 0, WHATSAPP: 0, EMAIL: 0 };
    cur[r.channel] = r._count._all;
    out.set(r.coachingCenterId, cur);
  }
  return out;
}

async function staffCounts(ids: string[]) {
  const rows = await prisma.user.groupBy({
    by: ['coachingCenterId'],
    where: {
      coachingCenterId: { in: ids },
      status: 'ACTIVE',
      roleAssignments: { some: { role: { code: { in: ['ADMIN', 'STAFF'] } } } },
    },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.coachingCenterId, r._count._all]));
}

export interface TenantListParams {
  search?: string;
  category?: string;
  /** Filter by plan (id) */
  planId?: string;
  /** 'trial' = on a trial, 'paid' = has a non-trial subscription */
  kind?: string;
  page?: number;
  pageSize?: number;
}

export async function listTenants(params: TenantListParams = {}, now: Date = new Date()) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));

  const where: Prisma.CoachingCenterWhereInput = {};
  if (params.search?.trim()) {
    const q = params.search.trim();
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { code: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      // owner contact (email / phone) — only the owner account, never other staff
      {
        users: {
          some: {
            roleAssignments: { some: { role: { code: 'OWNER' } } },
            OR: [{ email: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }],
          },
        },
      },
    ];
  }
  if (params.planId) where.subscription = { planId: params.planId };
  if (params.kind === 'trial') where.subscription = { ...(where.subscription as object | undefined), status: 'TRIAL' };
  if (params.kind === 'paid') where.subscription = { ...(where.subscription as object | undefined), status: { not: 'TRIAL' } };

  const centers = await prisma.coachingCenter.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      subscription: { include: { plan: { select: { name: true, banglaName: true, code: true } } } },
      users: {
        where: { roleAssignments: { some: { role: { code: 'OWNER' } } } },
        select: { name: true, email: true, phone: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  });

  const ids = centers.map((c) => c.id);
  const [students, teachers, staff, messages] = ids.length
    ? await Promise.all([groupCount('student', ids), groupCount('teacher', ids), staffCounts(ids), monthMessageCounts(ids, now)])
    : [new Map(), new Map(), new Map(), new Map()];

  let rows = centers.map((c) => {
    const effective = computeEffectiveStatus(c.subscription ? { status: c.subscription.status, endDate: c.subscription.endDate } : null, now);
    const m = messages.get(c.id) ?? { SMS: 0, WHATSAPP: 0, EMAIL: 0 };
    return {
      id: c.id,
      name: c.name,
      banglaName: c.banglaName,
      code: c.code,
      tenantStatus: c.status,
      category: categoryOf(c.status, effective),
      subscriptionStatus: effective,
      owner: c.users[0] ? { name: c.users[0].name, email: c.users[0].email, phone: c.users[0].phone } : null,
      isTrial: c.subscription?.status === 'TRIAL',
      startDate: c.subscription?.startDate ?? null,
      // effective limits = overrides → sold plan snapshot → unlimited (same resolution the limit checks use)
      limits: c.subscription
        ? resolveLimits(normalizeLimits((c.subscription.planSnapshot as { limits?: unknown } | null)?.limits), (c.subscription.overrides as SubscriptionOverrides | null) ?? null)
        : null,
      plan: c.subscription ? { name: c.subscription.plan.name, banglaName: c.subscription.plan.banglaName, code: c.subscription.plan.code } : null,
      students: students.get(c.id) ?? 0,
      teachers: teachers.get(c.id) ?? 0,
      staff: staff.get(c.id) ?? 0,
      messagesUsed: m.SMS + m.WHATSAPP + m.EMAIL,
      subscriptionEnd: c.subscription?.endDate ?? null,
      createdAt: c.createdAt,
    };
  });

  if (params.category && params.category !== 'all') rows = rows.filter((r) => r.category === params.category);

  const total = rows.length;
  return {
    tenants: rows.slice((page - 1) * pageSize, page * pageSize),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// ------------------------------------------------------------------
// Dashboard — every number is computed from the database.
// ------------------------------------------------------------------
export async function getPlatformDashboard(now: Date = new Date()) {
  const centers = await prisma.coachingCenter.findMany({
    select: { id: true, name: true, code: true, status: true, subscription: { select: { status: true, endDate: true, plan: { select: { name: true } } } } },
  });

  const counts: Record<TenantCategory, number> = { SUSPENDED: 0, LEGACY: 0, TRIAL: 0, ACTIVE: 0, PAST_DUE: 0, EXPIRED: 0, CANCELLED: 0 };
  const expiringSoon: Array<{ id: string; name: string; code: string; plan: string; endDate: Date; daysLeft: number; status: EffectiveStatus }> = [];

  for (const c of centers) {
    const effective = computeEffectiveStatus(c.subscription ? { status: c.subscription.status, endDate: c.subscription.endDate } : null, now);
    counts[categoryOf(c.status, effective)] += 1;
    if (c.subscription && c.status !== 'SUSPENDED' && (effective === 'TRIAL' || effective === 'ACTIVE' || effective === 'PAST_DUE')) {
      const daysLeft = Math.ceil((c.subscription.endDate.getTime() - now.getTime()) / DAY_MS);
      if (daysLeft <= 14) {
        expiringSoon.push({ id: c.id, name: c.name, code: c.code, plan: c.subscription.plan.name, endDate: c.subscription.endDate, daysLeft, status: effective });
      }
    }
  }
  expiringSoon.sort((a, b) => a.endDate.getTime() - b.endDate.getTime());

  const { start, end, label } = dhakaMonthBounds(now);
  const [students, teachers, staff, msgRows] = await Promise.all([
    prisma.student.count({ where: { status: 'ACTIVE' } }),
    prisma.teacher.count({ where: { status: 'ACTIVE' } }),
    prisma.user.count({ where: { status: 'ACTIVE', roleAssignments: { some: { role: { code: { in: ['ADMIN', 'STAFF'] } } } } } }),
    prisma.communicationLog.groupBy({
      by: ['channel'],
      where: { status: { in: [...QUOTA_STATUSES] }, createdAt: { gte: start, lt: end } },
      _count: { _all: true },
    }),
  ]);
  const msg = { SMS: 0, WHATSAPP: 0, EMAIL: 0 };
  for (const r of msgRows) msg[r.channel] = r._count._all;

  return {
    period: label,
    tenants: { total: centers.length, ...counts },
    usage: { students, teachers, staff, sms: msg.SMS, whatsapp: msg.WHATSAPP, email: msg.EMAIL },
    expiringSoon,
  };
}

// ------------------------------------------------------------------
// Tenant detail
// ------------------------------------------------------------------
export async function getTenantDetail(coachingCenterId: string, now: Date = new Date()) {
  const center = await prisma.coachingCenter.findUnique({
    where: { id: coachingCenterId },
    include: {
      branches: { select: { id: true, name: true, code: true, status: true, isMain: true }, orderBy: { isMain: 'desc' } },
      users: {
        // Never selects passwordHash or any auth secret.
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          lastLoginAt: true,
          roleAssignments: { select: { role: { select: { code: true } } }, take: 1, orderBy: { createdAt: 'asc' } },
        },
        orderBy: { createdAt: 'asc' },
      },
      subscription: { include: { plan: true } },
    },
  });
  if (!center) return null;

  const [state, usage, commByStatus, platformActivity, tenantActivity] = await Promise.all([
    loadTenantSubscription(prisma, coachingCenterId, now),
    getTenantUsage(coachingCenterId, now),
    prisma.communicationLog.groupBy({
      by: ['channel', 'status'],
      where: { coachingCenterId, createdAt: { gte: dhakaMonthBounds(now).start, lt: dhakaMonthBounds(now).end } },
      _count: { _all: true },
    }),
    prisma.platformAuditLog.findMany({
      where: { coachingCenterId },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: { id: true, action: true, entity: true, details: true, createdAt: true, platformAdmin: { select: { name: true, email: true } } },
    }),
    prisma.auditLog.findMany({
      where: { coachingCenterId },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { id: true, action: true, entity: true, createdAt: true },
    }),
  ]);

  const owner = center.users.find((u) => u.roleAssignments[0]?.role.code === 'OWNER') ?? null;

  return {
    overview: {
      id: center.id,
      name: center.name,
      banglaName: center.banglaName,
      code: center.code,
      phone: center.phone,
      email: center.email,
      city: center.city,
      district: center.district,
      status: center.status,
      createdAt: center.createdAt,
      owner: owner ? { name: owner.name, email: owner.email } : null,
      category: categoryOf(center.status, state.status),
    },
    subscription: {
      hasSubscription: state.hasSubscription,
      status: state.status,
      storedStatus: state.storedStatus,
      startDate: state.startDate,
      endDate: state.endDate,
      planId: state.planId,
      planName: state.planName,
      planBanglaName: state.planBanglaName,
      planCode: state.planCode,
      planVersion: state.planVersion,
      currentPlanVersion: center.subscription?.plan.version ?? null,
      planArchived: center.subscription?.plan.status === 'ARCHIVED',
      overrides: state.overrides,
    },
    limits: state.limits,
    features: state.features,
    usage,
    branches: center.branches,
    users: center.users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      status: u.status,
      role: u.roleAssignments[0]?.role.code ?? null,
      lastLoginAt: u.lastLoginAt,
    })),
    communication: { period: usage.period, byChannelStatus: commByStatus.map((r) => ({ channel: r.channel, status: r.status, count: r._count._all })) },
    activity: { platform: platformActivity, tenant: tenantActivity },
  };
}

// ------------------------------------------------------------------
// Mutations
// ------------------------------------------------------------------
export async function setTenantStatus(adminId: string, coachingCenterId: string, status: 'ACTIVE' | 'SUSPENDED', reason?: string, ipAddress?: string | null) {
  const center = await prisma.coachingCenter.findUnique({ where: { id: coachingCenterId }, select: { id: true, status: true, name: true } });
  if (!center) throw new Error('COACHING_CENTER_NOT_FOUND');
  if (center.status === status) return { id: center.id, status, unchanged: true };

  // Nothing is deleted. Suspension is enforced live: every staff/portal session
  // check reads CoachingCenter.status, so existing tokens stop working at once.
  await prisma.coachingCenter.update({ where: { id: coachingCenterId }, data: { status } });

  // Reactivating only lifts the suspension. It never edits the subscription: an expired,
  // cancelled or past-due subscription stays that way until it is explicitly renewed, so the
  // caller is told what still needs attention instead of the tenant silently looking healthy.
  const sub = await loadTenantSubscription(prisma, coachingCenterId);
  const warnings: string[] = [];
  if (status === 'ACTIVE') {
    if (sub.status === 'EXPIRED') warnings.push('SUBSCRIPTION_EXPIRED');
    if (sub.status === 'CANCELLED') warnings.push('SUBSCRIPTION_CANCELLED');
    if (sub.status === 'PAST_DUE') warnings.push('SUBSCRIPTION_PAST_DUE');
  }
  await recordPlatformAudit({
    adminId,
    coachingCenterId,
    action: status === 'SUSPENDED' ? 'TENANT_SUSPENDED' : 'TENANT_REACTIVATED',
    entity: 'CoachingCenter',
    entityId: coachingCenterId,
    details: { name: center.name, from: center.status, to: status, reason: reason || null, subscriptionStatus: sub.status, warnings: warnings.length ? warnings : undefined },
    ipAddress,
  });
  return { id: center.id, status, unchanged: false, subscriptionStatus: sub.status, warnings };
}

export async function createTenant(adminId: string, input: TenantCreateInput, ipAddress?: string | null) {
  const { planId, trialDays, ...setup } = input;
  if (planId) {
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan || plan.status !== 'ACTIVE') throw new Error('PLAN_NOT_FOUND: The selected plan does not exist or is archived');
  }

  const created = await completeInitialSetup(setup, { enforceSingleton: false });
  await recordPlatformAudit({
    adminId,
    coachingCenterId: created.center.id,
    action: 'TENANT_CREATED',
    entity: 'CoachingCenter',
    entityId: created.center.id,
    details: { name: created.center.name, code: created.center.code, ownerEmail: setup.ownerEmail },
    ipAddress,
  });

  let subscription = null;
  if (planId) {
    subscription = await assignSubscription(adminId, created.center.id, { planId, trialDays }, ipAddress);
  }
  return { center: { id: created.center.id, name: created.center.name, code: created.center.code }, subscription };
}

const parseDate = (v: string | undefined, label: string) => {
  if (!v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error(`INVALID_DATE: ${label} is not a valid date`);
  return d;
};

/**
 * Create or change a tenant's subscription (assign plan, extend/renew, change
 * status, set overrides, re-sync to the latest plan). Keeps the sold terms
 * (snapshot) unless the plan changes or `applyLatestPlan` is set. Every change
 * is audited with before/after. Never touches tenant data.
 */
export async function assignSubscription(adminId: string, coachingCenterId: string, input: SubscriptionAssignInput, ipAddress?: string | null) {
  const center = await prisma.coachingCenter.findUnique({ where: { id: coachingCenterId }, select: { id: true } });
  if (!center) throw new Error('COACHING_CENTER_NOT_FOUND');
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: input.planId } });
  if (!plan) throw new Error('PLAN_NOT_FOUND');

  const existing = await prisma.subscription.findUnique({ where: { coachingCenterId } });
  const planChanged = !existing || existing.planId !== plan.id;
  if (planChanged && plan.status !== 'ACTIVE') throw new Error('PLAN_NOT_FOUND: Archived plans cannot be assigned to a coaching center');

  const now = new Date();
  const startDate = parseDate(input.startDate, 'startDate') ?? existing?.startDate ?? now;

  const status = input.status ?? existing?.status ?? (input.trialDays || plan.trialDays ? 'TRIAL' : 'ACTIVE');
  let endDate = parseDate(input.endDate, 'endDate');
  if (!endDate) {
    if (status === 'TRIAL' && (input.trialDays || plan.trialDays) && (!existing || planChanged || input.trialDays)) {
      endDate = new Date(startDate.getTime() + (input.trialDays ?? plan.trialDays ?? 14) * DAY_MS);
    } else if (existing) {
      endDate = existing.endDate;
    } else {
      endDate = new Date(startDate.getTime() + 30 * DAY_MS);
    }
  }
  if (endDate.getTime() <= startDate.getTime()) throw new Error('INVALID_DATE: End date must be after the start date');

  const resnapshot = planChanged || input.applyLatestPlan === true;
  const snapshot = resnapshot ? buildSnapshot(plan) : ((existing?.planSnapshot as unknown) ?? buildSnapshot(plan));
  const overrides: SubscriptionOverrides | null =
    input.overrides !== undefined ? ((input.overrides as SubscriptionOverrides | null) ?? null) : ((existing?.overrides as SubscriptionOverrides | null) ?? null);

  const data = {
    planId: plan.id,
    status,
    startDate,
    endDate,
    planVersion: resnapshot ? plan.version : existing?.planVersion ?? plan.version,
    planSnapshot: snapshot as unknown as Prisma.InputJsonValue,
    overrides: (overrides ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
    cancelledAt: status === 'CANCELLED' ? existing?.cancelledAt ?? now : null,
  };

  const beforeState = existing ? await loadTenantSubscription(prisma, coachingCenterId, now) : null;
  const saved = await prisma.subscription.upsert({
    where: { coachingCenterId },
    create: { coachingCenterId, ...data },
    update: { ...data, ...(input.overrides === null ? { overrides: Prisma.DbNull } : {}) },
  });
  const afterState = await loadTenantSubscription(prisma, coachingCenterId, now);

  const summary = (s: typeof afterState | null) =>
    s && {
      plan: s.planCode,
      planVersion: s.planVersion,
      status: s.storedStatus,
      effectiveStatus: s.status,
      startDate: s.startDate,
      endDate: s.endDate,
    };
  await recordPlatformAudit({
    adminId,
    coachingCenterId,
    action: existing ? 'SUBSCRIPTION_CHANGED' : 'SUBSCRIPTION_CREATED',
    entity: 'Subscription',
    entityId: saved.id,
    details: { before: summary(beforeState), after: summary(afterState), resynced: input.applyLatestPlan === true || undefined },
    ipAddress,
  });

  if (beforeState) {
    const limitDiff: Record<string, { before: number | null; after: number | null }> = {};
    for (const k of LIMIT_KEYS) if (beforeState.limits[k] !== afterState.limits[k]) limitDiff[k] = { before: beforeState.limits[k], after: afterState.limits[k] };
    if (Object.keys(limitDiff).length) {
      await recordPlatformAudit({ adminId, coachingCenterId, action: 'LIMITS_CHANGED', entity: 'Subscription', entityId: saved.id, details: { changes: limitDiff }, ipAddress });
    }
    for (const f of FEATURE_KEYS) {
      if (beforeState.features[f] !== afterState.features[f]) {
        await recordPlatformAudit({
          adminId,
          coachingCenterId,
          action: afterState.features[f] ? 'FEATURE_ENABLED' : 'FEATURE_DISABLED',
          entity: 'Subscription',
          entityId: saved.id,
          details: { feature: f },
          ipAddress,
        });
      }
    }
  }
  if (input.overrides !== undefined) {
    const had = !!existing?.overrides;
    const has = !!overrides;
    if (had || has) {
      await recordPlatformAudit({
        adminId,
        coachingCenterId,
        action: !had && has ? 'TENANT_OVERRIDE_CREATED' : 'TENANT_OVERRIDE_CHANGED',
        entity: 'Subscription',
        entityId: saved.id,
        details: { before: existing?.overrides ?? null, after: overrides },
        ipAddress,
      });
    }
  }

  return { id: saved.id, status: afterState.status, storedStatus: saved.status, endDate: saved.endDate, planVersion: saved.planVersion };
}

export { CHANNEL_LIMIT };
