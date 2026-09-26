import prisma from '@/lib/db';
import type { Prisma, RoleCode } from '@prisma/client';

export interface NoticeScopeInput {
  targetAudience: string;
  branchId?: string | null;
  academicSessionId?: string | null;
  academicProgramId?: string | null;
  academicClassId?: string | null;
  academicGroupId?: string | null;
  batchId?: string | null;
}

export interface ResolvedGuardianRecipient {
  guardianId: string;
  studentId: string;
}

export interface ResolvedNoticeRecipients {
  userIds: string[];
  guardians: ResolvedGuardianRecipient[];
}

/**
 * The single centralized recipient resolver for notices (AGENTS.md §17).
 * No other file computes "who should receive this notice" — everything
 * (the publish flow, any future digest/report) calls through here.
 */
export async function resolveNoticeRecipients(
  coachingCenterId: string,
  notice: NoticeScopeInput
): Promise<ResolvedNoticeRecipients> {
  const [userIds, guardians] = await Promise.all([
    resolveUserRecipients(coachingCenterId, notice),
    resolveGuardianRecipients(coachingCenterId, notice),
  ]);
  return { userIds, guardians };
}

async function resolveUserRecipients(coachingCenterId: string, notice: NoticeScopeInput): Promise<string[]> {
  const roleFilter = audienceToRoles(notice.targetAudience);
  if (!roleFilter) return [];

  const users = await prisma.user.findMany({
    where: {
      coachingCenterId,
      status: 'ACTIVE',
      ...(roleFilter.length
        ? { roleAssignments: { some: { role: { code: { in: roleFilter } } } } }
        : {}),
      ...(notice.branchId ? { OR: [{ branchId: notice.branchId }, { branchId: null }] } : {}),
    },
    select: { id: true },
  });
  return Array.from(new Set(users.map((u) => u.id)));
}

function audienceToRoles(audience: string): RoleCode[] | null {
  switch (audience) {
    case 'ALL_CENTER':
    case 'BRANCH':
      return ['OWNER', 'ADMIN', 'STAFF', 'TEACHER'];
    case 'TEACHERS':
      return ['TEACHER'];
    case 'STAFF':
      return ['STAFF'];
    case 'CLASS':
    case 'GROUP':
    case 'BATCH':
    case 'STUDENTS':
    case 'GUARDIANS':
      return null; // these audiences reach guardians only, not staff users
    default:
      return null;
  }
}

/**
 * Guardians reachable for this notice. Students/guardians have no login
 * (AGENTS.md §8/§48), so STUDENTS and GUARDIANS audiences — and any
 * academic-scoped audience (CLASS/GROUP/BATCH) — resolve to the same
 * guardian set: guardians of matching students who have not opted out.
 */
async function resolveGuardianRecipients(
  coachingCenterId: string,
  notice: NoticeScopeInput
): Promise<ResolvedGuardianRecipient[]> {
  const reachesGuardians =
    notice.targetAudience === 'ALL_CENTER' ||
    notice.targetAudience === 'BRANCH' ||
    notice.targetAudience === 'CLASS' ||
    notice.targetAudience === 'GROUP' ||
    notice.targetAudience === 'BATCH' ||
    notice.targetAudience === 'STUDENTS' ||
    notice.targetAudience === 'GUARDIANS';
  if (!reachesGuardians) return [];

  const studentIds = await resolveStudentIdsInScope(coachingCenterId, notice);
  if (studentIds === null) {
    // ALL_CENTER / BRANCH with no narrower academic scope — every active
    // student of the tenant (optionally filtered to one branch).
    const students = await prisma.student.findMany({
      where: {
        coachingCenterId,
        status: 'ACTIVE',
        ...(notice.branchId ? { branchId: notice.branchId } : {}),
      },
      select: { id: true },
    });
    return dedupeGuardianLinks(await guardianLinksForStudents(students.map((s) => s.id)));
  }

  return dedupeGuardianLinks(await guardianLinksForStudents(studentIds));
}

/**
 * Returns the student ids matching an academic scope (CLASS/GROUP/BATCH),
 * or null when the audience doesn't narrow by academic scope (ALL_CENTER,
 * BRANCH, STUDENTS, GUARDIANS with no class/group/batch given).
 */
async function resolveStudentIdsInScope(coachingCenterId: string, notice: NoticeScopeInput): Promise<string[] | null> {
  if (notice.targetAudience === 'BATCH' && notice.batchId) {
    const rows = await prisma.studentBatch.findMany({
      where: { coachingCenterId, batchId: notice.batchId, status: 'ACTIVE' },
      select: { studentId: true },
    });
    return rows.map((r) => r.studentId);
  }

  if ((notice.targetAudience === 'CLASS' && notice.academicClassId) || (notice.targetAudience === 'GROUP' && notice.academicGroupId)) {
    const rows = await prisma.studentEnrollment.findMany({
      where: {
        coachingCenterId,
        status: 'ENROLLED',
        ...(notice.academicClassId ? { academicClassId: notice.academicClassId } : {}),
        ...(notice.academicGroupId ? { academicGroupId: notice.academicGroupId } : {}),
      },
      select: { studentId: true },
    });
    return rows.map((r) => r.studentId);
  }

  return null;
}

async function guardianLinksForStudents(studentIds: string[]) {
  if (studentIds.length === 0) return [];
  return prisma.studentGuardian.findMany({
    where: { studentId: { in: studentIds }, canReceiveNotifications: true },
    select: { guardianId: true, studentId: true },
  });
}

function dedupeGuardianLinks(links: { guardianId: string; studentId: string }[]): ResolvedGuardianRecipient[] {
  const seen = new Set<string>();
  const result: ResolvedGuardianRecipient[] = [];
  for (const link of links) {
    const key = `${link.guardianId}:${link.studentId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ guardianId: link.guardianId, studentId: link.studentId });
  }
  return result;
}

// ------------------------------------------------------------------
// Portal "pull" views (Phase 9) — same targeting rules as the resolver
// above, expressed the other way round: "which published notices can this
// student/guardian see", for a paginated page load rather than a fan-out.
// Kept in this file so notice targeting still has exactly one home
// (AGENTS.md §17/§25).
// ------------------------------------------------------------------

interface StudentNoticeContext {
  branchId: string | null;
  classIds: string[];
  groupIds: string[];
  batchIds: string[];
}

async function getStudentNoticeContext(coachingCenterId: string, studentId: string): Promise<StudentNoticeContext | null> {
  const student = await prisma.student.findFirst({
    where: { id: studentId, coachingCenterId },
    select: {
      branchId: true,
      enrollments: { where: { status: 'ENROLLED' }, select: { academicClassId: true, academicGroupId: true } },
      studentBatches: { where: { status: 'ACTIVE' }, select: { batchId: true, batch: { select: { academicClassId: true, academicGroupId: true } } } },
    },
  });
  if (!student) return null;

  const classIds = new Set<string>();
  const groupIds = new Set<string>();
  const batchIds = new Set<string>();
  for (const e of student.enrollments) {
    classIds.add(e.academicClassId);
    if (e.academicGroupId) groupIds.add(e.academicGroupId);
  }
  for (const sb of student.studentBatches) {
    batchIds.add(sb.batchId);
    classIds.add(sb.batch.academicClassId);
    if (sb.batch.academicGroupId) groupIds.add(sb.batch.academicGroupId);
  }

  return { branchId: student.branchId, classIds: [...classIds], groupIds: [...groupIds], batchIds: [...batchIds] };
}

/** The OR-branches that match one student's scope; `extraAudiences` lets the guardian view add GUARDIANS on top. */
function noticeScopeBranches(ctx: StudentNoticeContext, extraAudiences: string[] = []): Prisma.NoticeWhereInput[] {
  const or: Prisma.NoticeWhereInput[] = [{ targetAudience: { in: ['ALL_CENTER', 'STUDENTS', ...extraAudiences] } }];
  if (ctx.branchId) or.push({ targetAudience: 'BRANCH', branchId: ctx.branchId });
  if (ctx.classIds.length) or.push({ targetAudience: 'CLASS', academicClassId: { in: ctx.classIds } });
  if (ctx.groupIds.length) or.push({ targetAudience: 'GROUP', academicGroupId: { in: ctx.groupIds } });
  if (ctx.batchIds.length) or.push({ targetAudience: 'BATCH', batchId: { in: ctx.batchIds } });
  return or;
}

function noticeScopeWhere(coachingCenterId: string, ctx: StudentNoticeContext): Prisma.NoticeWhereInput {
  return { AND: [{ coachingCenterId, status: 'PUBLISHED' }, { OR: noticeScopeBranches(ctx) }] };
}

export interface PortalNoticeListParams {
  page?: number;
  pageSize?: number;
}

const noticeListInclude = {
  branch: { select: { id: true, name: true } },
  batch: { select: { id: true, name: true } },
} satisfies Prisma.NoticeInclude;

async function paginateNotices(where: Prisma.NoticeWhereInput, params: PortalNoticeListParams) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(params.pageSize) || 20));
  const [total, notices] = await Promise.all([
    prisma.notice.count({ where }),
    prisma.notice.findMany({
      where,
      orderBy: [{ publishedAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: noticeListInclude,
    }),
  ]);
  return { notices, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}

export async function listNoticesForStudent(coachingCenterId: string, studentId: string, params: PortalNoticeListParams = {}) {
  const ctx = await getStudentNoticeContext(coachingCenterId, studentId);
  if (!ctx) throw new Error('STUDENT_NOT_FOUND');
  return paginateNotices(noticeScopeWhere(coachingCenterId, ctx), params);
}

export async function listNoticesForGuardian(coachingCenterId: string, guardianId: string, params: PortalNoticeListParams = {}) {
  const students = await prisma.studentGuardian.findMany({
    where: { guardianId, student: { coachingCenterId } },
    select: { studentId: true },
  });
  if (students.length === 0) return { notices: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 } };

  const contexts = (
    await Promise.all(students.map((s) => getStudentNoticeContext(coachingCenterId, s.studentId)))
  ).filter((c): c is StudentNoticeContext => c !== null);

  const or = contexts.flatMap((ctx) => noticeScopeBranches(ctx, ['GUARDIANS']));
  const where: Prisma.NoticeWhereInput = { AND: [{ coachingCenterId, status: 'PUBLISHED' }, { OR: or }] };

  return paginateNotices(where, params);
}
