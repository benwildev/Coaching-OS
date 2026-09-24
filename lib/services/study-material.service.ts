import prisma from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { assertBranchAccess, type SessionUser } from '@/lib/auth/session';
import { recordAuditLog } from './audit.service';
import { resolveAcademicContext } from './academic.service';
import { assertTeacherSubjectAccess, getTeacherAuthorizedSubjectIds } from './exam-result.service';
import {
  checkMaterialResource,
  type CreateMaterialInput,
  type MaterialFilterParams,
  type UpdateMaterialInput,
} from '@/lib/validations/study-material';

export interface MaterialScope {
  coachingCenterId: string;
  user: SessionUser;
  teacherSubjectIds: string[] | null;
}

export async function resolveMaterialScope(coachingCenterId: string, user: SessionUser): Promise<MaterialScope> {
  return { coachingCenterId, user, teacherSubjectIds: await getTeacherAuthorizedSubjectIds(coachingCenterId, user) };
}

function isBranchScoped(user: SessionUser) {
  return user.role !== 'OWNER' && user.role !== 'ADMIN' && !!user.branchId;
}

function materialVisibilityWhere(scope: MaterialScope): Prisma.StudyMaterialWhereInput {
  const and: Prisma.StudyMaterialWhereInput[] = [{ coachingCenterId: scope.coachingCenterId }];
  if (isBranchScoped(scope.user)) and.push({ OR: [{ branchId: scope.user.branchId }, { branchId: null }] });
  if (scope.teacherSubjectIds) and.push({ subjectId: { in: scope.teacherSubjectIds } });
  return { AND: and };
}

/**
 * Teacher subject authorization reuses the Phase 6 helper: a batch-bound
 * material needs an ACTIVE BatchTeacherAssignment for that batch + subject;
 * a class-wide material needs the subject in the teacher's scope.
 */
async function assertSubjectAuthorized(scope: MaterialScope, subjectId: string, batchId: string | null) {
  if (!scope.teacherSubjectIds) return;
  if (batchId) {
    try {
      await assertTeacherSubjectAccess(scope.coachingCenterId, scope.user, batchId, subjectId);
    } catch {
      throw new Error('MATERIAL_ACCESS_DENIED: you are not assigned to teach this subject in this batch');
    }
    return;
  }
  if (!scope.teacherSubjectIds.includes(subjectId)) {
    throw new Error('MATERIAL_ACCESS_DENIED: you are not assigned to teach this subject');
  }
}

function assertCanModify(scope: MaterialScope, m: { createdById: string | null; branchId: string | null }) {
  const { user } = scope;
  if (user.role === 'OWNER' || user.role === 'ADMIN') return;
  if (isBranchScoped(user) && m.branchId && m.branchId !== user.branchId) throw new Error('MATERIAL_ACCESS_DENIED');
  if (user.role === 'STAFF') return;
  if (user.role === 'TEACHER' && m.createdById === user.userId) return;
  throw new Error('MATERIAL_ACCESS_DENIED: teachers may only modify their own materials');
}

const detailInclude = {
  subject: { select: { id: true, name: true, banglaName: true, code: true } },
  subjectPaper: { select: { id: true, name: true, banglaName: true } },
  academicClass: { select: { id: true, name: true, banglaName: true } },
  academicGroup: { select: { id: true, name: true, banglaName: true } },
  batch: { select: { id: true, name: true, banglaName: true, code: true } },
  branch: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
} satisfies Prisma.StudyMaterialInclude;

async function findVisible(scope: MaterialScope, materialId: string) {
  const m = await prisma.studyMaterial.findFirst({
    where: { AND: [materialVisibilityWhere(scope), { id: materialId }] },
    include: detailInclude,
  });
  if (!m) throw new Error('MATERIAL_NOT_FOUND');
  return m;
}

async function resolveMaterialContext(scope: MaterialScope, input: CreateMaterialInput) {
  const ctx = await resolveAcademicContext(scope.coachingCenterId, input);
  await assertSubjectAuthorized(scope, ctx.subjectId, ctx.batchId);
  // A batch-bound material lives in the batch's branch.
  const branchId = ctx.batchBranchId ?? (isBranchScoped(scope.user) ? scope.user.branchId! : null);
  assertBranchAccess(scope.user, branchId);
  return { ...ctx, branchId };
}

// ------------------------------------------------------------------
// Staff queries
// ------------------------------------------------------------------

export async function listMaterials(scope: MaterialScope, params: MaterialFilterParams = {}) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(params.pageSize) || 20));
  const and: Prisma.StudyMaterialWhereInput[] = [materialVisibilityWhere(scope)];
  if (params.status && params.status !== 'all') and.push({ status: params.status });
  else and.push({ status: { not: 'ARCHIVED' } });
  if (params.type) and.push({ type: params.type });
  if (params.subjectId) and.push({ subjectId: params.subjectId });
  if (params.academicClassId) and.push({ academicClassId: params.academicClassId });
  if (params.batchId) and.push({ batchId: params.batchId });
  const s = params.search?.trim();
  if (s) {
    and.push({
      OR: [
        { title: { contains: s, mode: 'insensitive' } },
        { banglaTitle: { contains: s, mode: 'insensitive' } },
        { description: { contains: s, mode: 'insensitive' } },
        { subject: { name: { contains: s, mode: 'insensitive' } } },
        { subject: { code: { contains: s, mode: 'insensitive' } } },
      ],
    });
  }
  const where: Prisma.StudyMaterialWhereInput = { AND: and };

  const [total, rows] = await Promise.all([
    prisma.studyMaterial.count({ where }),
    prisma.studyMaterial.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        title: true,
        banglaTitle: true,
        type: true,
        status: true,
        fileUrl: true,
        createdById: true,
        branchId: true,
        createdAt: true,
        updatedAt: true,
        publishedAt: true,
        subject: { select: { id: true, name: true, banglaName: true, code: true } },
        academicClass: { select: { id: true, name: true, banglaName: true } },
        batch: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, name: true } },
      },
    }),
  ]);

  return {
    materials: rows.map((r) => {
      let canModify = true;
      try {
        assertCanModify(scope, r);
      } catch {
        canModify = false;
      }
      return { ...r, canModify };
    }),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

export async function getMaterialStats(scope: MaterialScope) {
  const base = materialVisibilityWhere(scope);
  const [total, published, draft] = await Promise.all([
    prisma.studyMaterial.count({ where: { AND: [base, { status: { not: 'ARCHIVED' } }] } }),
    prisma.studyMaterial.count({ where: { AND: [base, { status: 'PUBLISHED' }] } }),
    prisma.studyMaterial.count({ where: { AND: [base, { status: 'DRAFT' }] } }),
  ]);
  return { total, published, draft };
}

export async function getMaterialById(scope: MaterialScope, materialId: string) {
  const m = await findVisible(scope, materialId);
  let canModify = true;
  try {
    assertCanModify(scope, m);
  } catch {
    canModify = false;
  }
  return { ...m, canModify };
}

// ------------------------------------------------------------------
// Mutations
// ------------------------------------------------------------------

export async function createMaterial(scope: MaterialScope, input: CreateMaterialInput) {
  const { coachingCenterId, user } = scope;
  const resErr = checkMaterialResource(input);
  if (resErr) throw new Error(resErr);
  const ctx = await resolveMaterialContext(scope, input);

  const created = await prisma.studyMaterial.create({
    data: {
      coachingCenterId,
      branchId: ctx.branchId,
      academicClassId: ctx.academicClassId,
      academicGroupId: ctx.academicGroupId,
      subjectId: ctx.subjectId,
      subjectPaperId: ctx.subjectPaperId,
      batchId: ctx.batchId,
      title: input.title,
      banglaTitle: input.banglaTitle,
      description: input.description,
      banglaDescription: input.banglaDescription,
      type: input.type,
      fileUrl: input.fileUrl,
      thumbnailUrl: input.thumbnailUrl,
      status: input.status,
      publishedAt: input.status === 'PUBLISHED' ? new Date() : null,
      createdById: user.userId,
      updatedById: user.userId,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: 'MATERIAL_CREATED',
    entity: 'StudyMaterial',
    entityId: created.id,
    details: { type: created.type, subjectId: created.subjectId, batchId: created.batchId, status: created.status },
  });
  if (created.status === 'PUBLISHED') {
    await recordAuditLog({
      coachingCenterId,
      userId: user.userId,
      action: 'MATERIAL_PUBLISHED',
      entity: 'StudyMaterial',
      entityId: created.id,
      details: { from: null, to: 'PUBLISHED' },
    });
  }

  return getMaterialById(scope, created.id);
}

export async function updateMaterial(scope: MaterialScope, materialId: string, input: UpdateMaterialInput) {
  const { coachingCenterId, user } = scope;
  const existing = await findVisible(scope, materialId);
  assertCanModify(scope, existing);
  if (existing.status === 'ARCHIVED') throw new Error('MATERIAL_ALREADY_ARCHIVED: restore it before editing');
  const resErr = checkMaterialResource(input);
  if (resErr) throw new Error(resErr);
  const ctx = await resolveMaterialContext(scope, input);

  const becomesPublished = input.status === 'PUBLISHED' && existing.status !== 'PUBLISHED';
  await prisma.studyMaterial.update({
    where: { id: materialId },
    data: {
      branchId: ctx.branchId,
      academicClassId: ctx.academicClassId,
      academicGroupId: ctx.academicGroupId,
      subjectId: ctx.subjectId,
      subjectPaperId: ctx.subjectPaperId,
      batchId: ctx.batchId,
      title: input.title,
      banglaTitle: input.banglaTitle,
      description: input.description,
      banglaDescription: input.banglaDescription,
      type: input.type,
      fileUrl: input.fileUrl,
      thumbnailUrl: input.thumbnailUrl,
      status: input.status,
      publishedAt: input.status === 'PUBLISHED' ? (existing.publishedAt ?? new Date()) : null,
      updatedById: user.userId,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: 'MATERIAL_UPDATED',
    entity: 'StudyMaterial',
    entityId: materialId,
    details: { statusBefore: existing.status, statusAfter: input.status, type: input.type },
  });
  if (becomesPublished) {
    await recordAuditLog({
      coachingCenterId,
      userId: user.userId,
      action: 'MATERIAL_PUBLISHED',
      entity: 'StudyMaterial',
      entityId: materialId,
      details: { from: existing.status, to: 'PUBLISHED' },
    });
  }

  return getMaterialById(scope, materialId);
}

/**
 * DRAFT → PUBLISHED (publish guard), PUBLISHED → DRAFT (unpublish),
 * DRAFT/PUBLISHED → ARCHIVED, ARCHIVED → DRAFT (restore).
 */
export async function transitionMaterialStatus(
  scope: MaterialScope,
  materialId: string,
  target: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED'
) {
  const { coachingCenterId, user } = scope;
  const m = await findVisible(scope, materialId);
  assertCanModify(scope, m);

  if (m.status === target) {
    throw new Error(target === 'ARCHIVED' ? 'MATERIAL_ALREADY_ARCHIVED' : `INVALID_TRANSITION: material is already ${target}`);
  }
  if (target === 'PUBLISHED') {
    if (m.status === 'ARCHIVED') throw new Error('INVALID_TRANSITION: restore the archived material before publishing');
    const resErr = checkMaterialResource(m);
    if (resErr) throw new Error(resErr);
    await resolveAcademicContext(coachingCenterId, m);
    await assertSubjectAuthorized(scope, m.subjectId, m.batchId);
  }

  await prisma.studyMaterial.update({
    where: { id: materialId },
    data: {
      status: target,
      publishedAt: target === 'PUBLISHED' ? new Date() : target === 'DRAFT' ? null : m.publishedAt,
      updatedById: user.userId,
    },
  });

  const action =
    target === 'PUBLISHED'
      ? 'MATERIAL_PUBLISHED'
      : target === 'ARCHIVED'
        ? 'MATERIAL_ARCHIVED'
        : m.status === 'ARCHIVED'
          ? 'MATERIAL_RESTORED'
          : 'MATERIAL_UNPUBLISHED';

  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action,
    entity: 'StudyMaterial',
    entityId: materialId,
    details: { from: m.status, to: target },
  });

  return { id: materialId, status: target };
}

export async function deleteMaterial(scope: MaterialScope, materialId: string) {
  const { coachingCenterId, user } = scope;
  const m = await findVisible(scope, materialId);
  assertCanModify(scope, m);
  await prisma.studyMaterial.delete({ where: { id: materialId } });
  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: 'MATERIAL_DELETED',
    entity: 'StudyMaterial',
    entityId: materialId,
    details: { title: m.title, type: m.type, status: m.status },
  });
  return { id: materialId, deleted: true };
}

// ------------------------------------------------------------------
// Student portal
// ------------------------------------------------------------------

export interface PortalMaterialParams {
  search?: string;
  subjectId?: string;
  type?: string;
  page?: number;
  pageSize?: number;
}

/**
 * PUBLISHED materials relevant to one student of the tenant: matching their
 * enrolled class/group, their batches (or class-wide), their branch (or
 * centre-wide) and — when their batches define subjects — those subjects.
 * Only student-safe fields are returned.
 */
export async function getStudentPortalMaterials(
  coachingCenterId: string,
  user: SessionUser,
  studentId: string,
  params: PortalMaterialParams = {}
) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, coachingCenterId },
    select: {
      id: true,
      name: true,
      banglaName: true,
      studentIdCode: true,
      branchId: true,
      enrollments: {
        where: { status: 'ENROLLED' },
        select: { academicClassId: true, academicGroupId: true },
      },
      studentBatches: {
        where: { status: 'ACTIVE' },
        select: {
          batchId: true,
          batch: {
            select: {
              academicClassId: true,
              academicGroupId: true,
              batchSubjects: { where: { status: 'ACTIVE' }, select: { subjectId: true } },
            },
          },
        },
      },
    },
  });
  if (!student) throw new Error('STUDENT_NOT_FOUND');
  assertBranchAccess(user, student.branchId);

  const classIds = new Set<string>();
  const groupIds = new Set<string>();
  const batchIds = new Set<string>();
  const subjectIds = new Set<string>();
  for (const e of student.enrollments) {
    classIds.add(e.academicClassId);
    if (e.academicGroupId) groupIds.add(e.academicGroupId);
  }
  for (const sb of student.studentBatches) {
    batchIds.add(sb.batchId);
    classIds.add(sb.batch.academicClassId);
    if (sb.batch.academicGroupId) groupIds.add(sb.batch.academicGroupId);
    sb.batch.batchSubjects.forEach((bs) => subjectIds.add(bs.subjectId));
  }

  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(params.pageSize) || 20));
  const studentInfo = { id: student.id, name: student.name, banglaName: student.banglaName, studentIdCode: student.studentIdCode };

  if (classIds.size === 0) {
    return { student: studentInfo, materials: [], subjects: [], pagination: { page, pageSize, total: 0, totalPages: 1 } };
  }

  const relevance: Prisma.StudyMaterialWhereInput[] = [
    { coachingCenterId },
    { status: 'PUBLISHED' },
    { academicClassId: { in: [...classIds] } },
    { OR: [{ academicGroupId: null }, { academicGroupId: { in: [...groupIds] } }] },
    { OR: [{ batchId: null }, { batchId: { in: [...batchIds] } }] },
    { OR: [{ branchId: null }, ...(student.branchId ? [{ branchId: student.branchId }] : [])] },
  ];
  if (subjectIds.size) relevance.push({ subjectId: { in: [...subjectIds] } });

  const filters: Prisma.StudyMaterialWhereInput[] = [];
  if (params.subjectId) filters.push({ subjectId: params.subjectId });
  if (params.type) filters.push({ type: params.type });
  const s = params.search?.trim();
  if (s) {
    filters.push({
      OR: [
        { title: { contains: s, mode: 'insensitive' } },
        { banglaTitle: { contains: s, mode: 'insensitive' } },
        { description: { contains: s, mode: 'insensitive' } },
      ],
    });
  }
  const where: Prisma.StudyMaterialWhereInput = { AND: [...relevance, ...filters] };

  const [total, materials, subjectRows] = await Promise.all([
    prisma.studyMaterial.count({ where }),
    prisma.studyMaterial.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        title: true,
        banglaTitle: true,
        description: true,
        banglaDescription: true,
        type: true,
        fileUrl: true,
        thumbnailUrl: true,
        publishedAt: true,
        subject: { select: { id: true, name: true, banglaName: true, code: true } },
        subjectPaper: { select: { name: true, banglaName: true } },
      },
    }),
    // Subject filter options: subjects that actually have visible materials.
    prisma.studyMaterial.findMany({
      where: { AND: relevance },
      distinct: ['subjectId'],
      select: { subject: { select: { id: true, name: true, banglaName: true } } },
    }),
  ]);

  return {
    student: studentInfo,
    materials,
    subjects: subjectRows.map((r) => r.subject),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}
