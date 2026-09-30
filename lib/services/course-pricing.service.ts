import prisma from '@/lib/db';
import { recordAuditLog } from './audit.service';
import type { Prisma } from '@prisma/client';
import {
  computePricingTotals,
  validateInstallments,
  toPaisa,
  type BillingType,
  type CoursePricingConfig,
} from '@/lib/course-pricing';
import type { CoursePricingInput } from '@/lib/validations/course';

type Db = Prisma.TransactionClient | typeof prisma;

const n = (v: Prisma.Decimal | number | null | undefined): number => (v == null ? 0 : Number(v));

export interface CoursePricing extends CoursePricingConfig {
  course: { id: string; name: string; banglaName: string | null; code: string; status: string };
  additionalFees: Array<CoursePricingConfig['additionalFees'][number] & { id: string }>;
  totals: ReturnType<typeof computePricingTotals>;
}

/**
 * Loads a course's pricing scoped to the tenant. Returns null when the course
 * does not exist in this coaching center (so a Tenant A caller can never read
 * or price a Tenant B course). Accepts a transaction client so admission reads
 * the exact pricing that is in force inside its own transaction.
 */
export async function loadCoursePricing(db: Db, coachingCenterId: string, courseId: string): Promise<CoursePricing | null> {
  const course = await db.course.findFirst({
    where: { id: courseId, coachingCenterId },
    select: {
      id: true,
      name: true,
      banglaName: true,
      code: true,
      status: true,
      fee: true,
      billingType: true,
      feeItems: { orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] },
      installments: { orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] },
    },
  });
  if (!course) return null;

  const config: CoursePricingConfig = {
    fee: n(course.fee),
    billingType: (course.billingType === 'INSTALLMENT' ? 'INSTALLMENT' : 'ONE_TIME') as BillingType,
    additionalFees: course.feeItems.map((f) => ({
      id: f.id,
      name: f.name,
      banglaName: f.banglaName,
      amount: n(f.amount),
      isRequired: f.isRequired,
      isActive: f.isActive,
    })),
    installments: course.installments.map((i) => ({
      name: i.name,
      banglaName: i.banglaName,
      amount: n(i.amount),
      dueAfterDays: i.dueAfterDays,
    })),
  };

  return {
    ...config,
    additionalFees: config.additionalFees as CoursePricing['additionalFees'],
    course: { id: course.id, name: course.name, banglaName: course.banglaName, code: course.code, status: course.status },
    totals: computePricingTotals(config),
  };
}

export async function getCoursePricing(coachingCenterId: string, courseId: string) {
  return loadCoursePricing(prisma, coachingCenterId, courseId);
}

/**
 * Replaces a course's Fee & Payment Plan (Course Fee, billing type, additional
 * fee lines, installments) in one transaction and records granular audit
 * entries. This is configuration only: it never reads or writes
 * StudentFeeAssignment / FeeInvoice / Payment, so existing student
 * obligations cannot change. Students admitted afterwards get the new
 * pricing because admission re-reads it inside its own transaction.
 */
export async function updateCoursePricing(
  coachingCenterId: string,
  courseId: string,
  input: CoursePricingInput,
  actorId?: string,
  actorBranchId?: string | null
) {
  const before = await loadCoursePricing(prisma, coachingCenterId, courseId);
  if (!before) throw new Error('COURSE_NOT_FOUND');

  const billingType = input.billingType;
  const installments = billingType === 'INSTALLMENT' ? input.installments : [];
  if (billingType === 'INSTALLMENT') {
    if (toPaisa(input.fee) <= 0) throw new Error('COURSE_FEE_REQUIRED: Set a Course Fee before configuring installments');
    const err = validateInstallments(input.fee, installments);
    if (err) throw new Error(`${err}: Installments must be at least two and add up to the Course Fee`);
  }

  // Required fees are always active; only optional fees can be switched off.
  const additionalFees = input.additionalFees.map((f) => ({ ...f, isActive: f.isRequired ? true : f.isActive }));

  const existingIds = new Set(before.additionalFees.map((f) => f.id));
  for (const f of additionalFees) {
    // An id from another course/tenant is rejected outright rather than silently re-created.
    if (f.id && !existingIds.has(f.id)) throw new Error('FEE_ITEM_NOT_FOUND: Additional fee does not belong to this course');
  }

  await prisma.$transaction(async (tx) => {
    await tx.course.update({ where: { id: courseId }, data: { fee: input.fee, billingType } });

    const keepIds = additionalFees.filter((f) => f.id).map((f) => f.id as string);
    await tx.courseFeeItem.deleteMany({ where: { courseId, id: { notIn: keepIds } } });
    for (const [idx, f] of additionalFees.entries()) {
      const data = {
        name: f.name.trim(),
        banglaName: f.banglaName?.trim() || null,
        amount: f.amount,
        isRequired: f.isRequired,
        isActive: f.isActive,
        displayOrder: idx,
      };
      if (f.id) await tx.courseFeeItem.update({ where: { id: f.id }, data });
      else await tx.courseFeeItem.create({ data: { courseId, ...data } });
    }

    await tx.courseInstallment.deleteMany({ where: { courseId } });
    if (installments.length) {
      await tx.courseInstallment.createMany({
        data: installments.map((i, idx) => ({
          courseId,
          name: i.name.trim(),
          banglaName: i.banglaName?.trim() || null,
          amount: i.amount,
          dueAfterDays: i.dueAfterDays,
          displayOrder: idx,
        })),
      });
    }
  });

  const after = (await loadCoursePricing(prisma, coachingCenterId, courseId))!;

  // ---- Audit (after commit; recordAuditLog never throws) ----
  const base = { coachingCenterId, userId: actorId, entity: 'Course', entityId: courseId } as const;
  const ctx = { courseId, courseName: after.course.name, branchId: actorBranchId ?? null };
  const hadPricing = toPaisa(before.fee) > 0 || before.additionalFees.length > 0;

  if (toPaisa(before.fee) !== toPaisa(after.fee) || before.billingType !== after.billingType) {
    await recordAuditLog({
      ...base,
      action: hadPricing ? 'COURSE_PRICING_UPDATED' : 'COURSE_PRICING_CREATED',
      details: { ...ctx, before: { fee: before.fee, billingType: before.billingType }, after: { fee: after.fee, billingType: after.billingType } },
    });
  } else if (!hadPricing && after.additionalFees.length > 0) {
    await recordAuditLog({ ...base, action: 'COURSE_PRICING_CREATED', details: { ...ctx, after: { fee: after.fee, billingType: after.billingType } } });
  }

  const beforeById = new Map(before.additionalFees.map((f) => [f.id, f]));
  const afterIds = new Set(after.additionalFees.map((f) => f.id));
  const kept = additionalFees.filter((f) => f.id);
  const created = after.additionalFees.filter((f) => !beforeById.has(f.id));
  for (const f of created) {
    await recordAuditLog({ ...base, action: 'COURSE_FEE_ITEM_ADDED', details: { ...ctx, item: pick(f) } });
  }
  for (const f of before.additionalFees.filter((b) => !afterIds.has(b.id))) {
    await recordAuditLog({ ...base, action: 'COURSE_FEE_ITEM_REMOVED', details: { ...ctx, item: pick(f) } });
  }
  for (const k of kept) {
    const prev = beforeById.get(k.id as string)!;
    const next = after.additionalFees.find((a) => a.id === k.id)!;
    if (JSON.stringify(pick(prev)) !== JSON.stringify(pick(next))) {
      await recordAuditLog({ ...base, action: 'COURSE_FEE_ITEM_UPDATED', details: { ...ctx, before: pick(prev), after: pick(next) } });
    }
  }

  if (JSON.stringify(before.installments) !== JSON.stringify(after.installments) || before.billingType !== after.billingType) {
    await recordAuditLog({
      ...base,
      action: 'COURSE_PAYMENT_PLAN_CHANGED',
      details: {
        ...ctx,
        before: { billingType: before.billingType, installments: before.installments },
        after: { billingType: after.billingType, installments: after.installments },
      },
    });
  }

  return after;
}

const pick = (f: { name: string; amount: number; isRequired: boolean; isActive: boolean }) => ({
  name: f.name,
  amount: f.amount,
  isRequired: f.isRequired,
  isActive: f.isActive,
});
