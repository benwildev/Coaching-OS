import prisma from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { assertBranchAccess, type SessionUser } from '@/lib/auth/session';
import { recordAuditLog } from './audit.service';
import { notifyUsers } from './notification.service';
import { dispatchToGuardian } from './communication.service';
import { resolveNoticeRecipients } from './notice-recipients.service';
import { notifyPortalAccountsForEvent } from './portal-notification.service';
import { checkNoticeAudienceScope, type CreateNoticeInput, type NoticeFilterParams, type UpdateNoticeInput } from '@/lib/validations/notice';

export interface NoticeScope {
  coachingCenterId: string;
  user: SessionUser;
}

export function resolveNoticeScope(coachingCenterId: string, user: SessionUser): NoticeScope {
  return { coachingCenterId, user };
}

function isBranchScoped(user: SessionUser) {
  return user.role !== 'OWNER' && user.role !== 'ADMIN' && !!user.branchId;
}

// A TEACHER may only ever target a specific academic scope, never a
// centre/branch/role-wide broadcast (AGENTS.md §31).
const TEACHER_ALLOWED_AUDIENCES = new Set(['CLASS', 'GROUP', 'BATCH']);

function assertAudienceAllowed(user: SessionUser, targetAudience: string) {
  if (user.role === 'TEACHER' && !TEACHER_ALLOWED_AUDIENCES.has(targetAudience)) {
    throw new Error('NOTICE_ACCESS_DENIED: teachers may only target a class, group, or batch');
  }
}

function noticeVisibilityWhere(scope: NoticeScope): Prisma.NoticeWhereInput {
  const and: Prisma.NoticeWhereInput[] = [{ coachingCenterId: scope.coachingCenterId }];
  if (isBranchScoped(scope.user)) and.push({ OR: [{ branchId: scope.user.branchId }, { branchId: null }] });
  return { AND: and };
}

function assertCanModify(scope: NoticeScope, notice: { createdById: string | null; branchId: string | null }) {
  const { user } = scope;
  if (user.role === 'OWNER' || user.role === 'ADMIN') return;
  if (isBranchScoped(user) && notice.branchId && notice.branchId !== user.branchId) {
    throw new Error('NOTICE_ACCESS_DENIED');
  }
  if (user.role === 'STAFF') return;
  if (user.role === 'TEACHER' && notice.createdById === user.userId) return;
  throw new Error('NOTICE_ACCESS_DENIED: you may only modify notices you created');
}

async function findVisible(scope: NoticeScope, noticeId: string) {
  const notice = await prisma.notice.findFirst({
    where: { AND: [noticeVisibilityWhere(scope), { id: noticeId }] },
    include: {
      branch: { select: { id: true, name: true } },
      academicClass: { select: { id: true, name: true, banglaName: true } },
      academicGroup: { select: { id: true, name: true, banglaName: true } },
      batch: { select: { id: true, name: true, code: true } },
      createdBy: { select: { id: true, name: true } },
      updatedBy: { select: { id: true, name: true } },
    },
  });
  if (!notice) throw new Error('NOTICE_NOT_FOUND');
  return notice;
}

export async function listNotices(scope: NoticeScope, params: NoticeFilterParams = {}) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(params.pageSize) || 20));

  const and: Prisma.NoticeWhereInput[] = [noticeVisibilityWhere(scope)];
  if (params.status && params.status !== 'all') and.push({ status: params.status });
  if (params.targetAudience) and.push({ targetAudience: params.targetAudience });
  if (params.branchId) and.push({ branchId: params.branchId });
  const s = params.search?.trim();
  if (s) {
    and.push({
      OR: [
        { title: { contains: s, mode: 'insensitive' } },
        { banglaTitle: { contains: s, mode: 'insensitive' } },
      ],
    });
  }
  const where: Prisma.NoticeWhereInput = { AND: and };

  const [total, notices] = await Promise.all([
    prisma.notice.count({ where }),
    prisma.notice.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        branch: { select: { id: true, name: true } },
        batch: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    }),
  ]);

  return {
    notices: notices.map((n) => withCanModify(scope, n)),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

function withCanModify<T extends { createdById: string | null; branchId: string | null }>(scope: NoticeScope, notice: T) {
  let canModify = true;
  try {
    assertCanModify(scope, notice);
  } catch {
    canModify = false;
  }
  return { ...notice, canModify };
}

export async function getNoticeById(scope: NoticeScope, noticeId: string) {
  const notice = await findVisible(scope, noticeId);
  return withCanModify(scope, notice);
}

export async function createNotice(scope: NoticeScope, input: CreateNoticeInput) {
  const { coachingCenterId, user } = scope;
  assertAudienceAllowed(user, input.targetAudience);
  const scopeErr = checkNoticeAudienceScope(input);
  if (scopeErr) throw new Error(scopeErr);

  const branchId = input.branchId || (isBranchScoped(user) ? user.branchId! : null);
  assertBranchAccess(user, branchId);

  const created = await prisma.notice.create({
    data: {
      coachingCenterId,
      branchId,
      academicSessionId: input.academicSessionId,
      academicProgramId: input.academicProgramId,
      academicClassId: input.academicClassId,
      academicGroupId: input.academicGroupId,
      batchId: input.batchId,
      title: input.title,
      banglaTitle: input.banglaTitle,
      content: input.content,
      banglaContent: input.banglaContent,
      targetAudience: input.targetAudience,
      status: input.status,
      isPublished: input.status === 'PUBLISHED',
      publishedAt: input.status === 'PUBLISHED' ? new Date() : null,
      createdById: user.userId,
      updatedById: user.userId,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: 'NOTICE_CREATED',
    entity: 'Notice',
    entityId: created.id,
    details: { targetAudience: created.targetAudience, status: created.status },
  });

  if (created.status === 'PUBLISHED') {
    await publishSideEffects(scope, created.id);
  }

  return getNoticeById(scope, created.id);
}

export async function updateNotice(scope: NoticeScope, noticeId: string, input: UpdateNoticeInput) {
  const { coachingCenterId, user } = scope;
  const existing = await findVisible(scope, noticeId);
  assertCanModify(scope, existing);
  if (existing.status === 'ARCHIVED') throw new Error('NOTICE_ACCESS_DENIED: restore the notice before editing');
  if (existing.status === 'PUBLISHED' && user.role !== 'OWNER' && user.role !== 'ADMIN') {
    throw new Error('NOTICE_ACCESS_DENIED: editing a published notice requires Owner or Admin');
  }
  assertAudienceAllowed(user, input.targetAudience);
  const scopeErr = checkNoticeAudienceScope(input);
  if (scopeErr) throw new Error(scopeErr);

  const branchId = input.branchId || existing.branchId;
  assertBranchAccess(user, branchId);

  await prisma.notice.update({
    where: { id: noticeId },
    data: {
      branchId,
      academicSessionId: input.academicSessionId,
      academicProgramId: input.academicProgramId,
      academicClassId: input.academicClassId,
      academicGroupId: input.academicGroupId,
      batchId: input.batchId,
      title: input.title,
      banglaTitle: input.banglaTitle,
      content: input.content,
      banglaContent: input.banglaContent,
      targetAudience: input.targetAudience,
      updatedById: user.userId,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: 'NOTICE_UPDATED',
    entity: 'Notice',
    entityId: noticeId,
    details: { targetAudience: input.targetAudience },
  });

  return getNoticeById(scope, noticeId);
}

/**
 * DRAFT -> PUBLISHED (resolves recipients + notifies), PUBLISHED -> ARCHIVED,
 * ARCHIVED -> DRAFT (restore), PUBLISHED -> DRAFT (unpublish). Mirrors
 * transitionMaterialStatus's shape.
 */
export async function transitionNoticeStatus(scope: NoticeScope, noticeId: string, target: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED') {
  const { coachingCenterId, user } = scope;
  const notice = await findVisible(scope, noticeId);
  assertCanModify(scope, notice);

  if (notice.status === target) {
    throw new Error(target === 'PUBLISHED' ? 'NOTICE_ALREADY_PUBLISHED' : `INVALID_TRANSITION: notice is already ${target}`);
  }
  if (target === 'PUBLISHED' && notice.status === 'ARCHIVED') {
    throw new Error('INVALID_TRANSITION: restore the archived notice before publishing');
  }

  await prisma.notice.update({
    where: { id: noticeId },
    data: {
      status: target,
      isPublished: target === 'PUBLISHED',
      publishedAt: target === 'PUBLISHED' ? new Date() : target === 'DRAFT' ? null : notice.publishedAt,
      updatedById: user.userId,
    },
  });

  const action =
    target === 'PUBLISHED'
      ? 'NOTICE_PUBLISHED'
      : target === 'ARCHIVED'
        ? 'NOTICE_ARCHIVED'
        : notice.status === 'ARCHIVED'
          ? 'NOTICE_RESTORED'
          : 'NOTICE_UNPUBLISHED';

  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action,
    entity: 'Notice',
    entityId: noticeId,
    details: { from: notice.status, to: target },
  });

  if (target === 'PUBLISHED') {
    await publishSideEffects(scope, noticeId);
  }

  return { id: noticeId, status: target };
}

/**
 * Resolves recipients and dispatches — always run AFTER the notice's own
 * status write commits, never inside the same $transaction as an external
 * provider call (AGENTS.md §43/§47).
 */
async function publishSideEffects(scope: NoticeScope, noticeId: string) {
  const notice = await prisma.notice.findFirst({ where: { id: noticeId, coachingCenterId: scope.coachingCenterId } });
  if (!notice) return;

  const recipients = await resolveNoticeRecipients(scope.coachingCenterId, notice);

  if (recipients.userIds.length > 0) {
    await notifyUsers({
      coachingCenterId: scope.coachingCenterId,
      userIds: recipients.userIds,
      type: 'NOTICE_PUBLISHED',
      title: notice.title,
      body: notice.banglaTitle || notice.title,
      actionUrl: `/notices/${notice.id}`,
      sourceType: 'Notice',
      sourceId: notice.id,
    });
  }

  const notifiedStudentIds = new Set<string>();
  for (const g of recipients.guardians) {
    await dispatchToGuardian({
      coachingCenterId: scope.coachingCenterId,
      branchId: notice.branchId,
      guardianId: g.guardianId,
      studentId: g.studentId,
      noticeId: notice.id,
      event: 'NOTICE_PUBLISHED',
      vars: { noticeTitle: notice.title },
      triggeredById: scope.user.userId,
      sourceType: 'Notice',
      sourceId: notice.id,
    });

    // In-app notification, if a PortalAccount exists (Phase 9). Every
    // guardian on the list gets one; each linked student gets exactly one
    // regardless of how many guardians share that child.
    await notifyPortalAccountsForEvent({
      coachingCenterId: scope.coachingCenterId,
      guardianId: g.guardianId,
      type: 'NOTICE_PUBLISHED',
      title: notice.title,
      body: notice.banglaTitle || notice.title,
      actionUrl: `/portal/guardian/notices`,
      sourceType: 'Notice',
      sourceId: notice.id,
    });
    if (!notifiedStudentIds.has(g.studentId)) {
      notifiedStudentIds.add(g.studentId);
      await notifyPortalAccountsForEvent({
        coachingCenterId: scope.coachingCenterId,
        studentId: g.studentId,
        type: 'NOTICE_PUBLISHED',
        title: notice.title,
        body: notice.banglaTitle || notice.title,
        actionUrl: `/portal/student/notices`,
        sourceType: 'Notice',
        sourceId: notice.id,
      });
    }
  }
}
