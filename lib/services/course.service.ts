import prisma from '@/lib/db';
import { recordAuditLog } from './audit.service';
import type { CourseInput, CourseUpdateInput, CourseSubjectInput } from '@/lib/validations/course';
import type { Prisma } from '@prisma/client';

export interface CourseFilterParams {
  search?: string;
  programId?: string;
  classId?: string;
  groupId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export async function getCoursesList(coachingCenterId: string, params: CourseFilterParams = {}) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
  const skip = (page - 1) * pageSize;

  const where: Prisma.CourseWhereInput = { coachingCenterId };

  if (params.status && params.status !== 'all') where.status = params.status;
  if (params.programId && params.programId !== 'all') where.academicProgramId = params.programId;
  if (params.classId && params.classId !== 'all') where.academicClassId = params.classId;
  if (params.groupId && params.groupId !== 'all') where.academicGroupId = params.groupId;

  if (params.search && params.search.trim()) {
    const q = params.search.trim();
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { banglaName: { contains: q } },
      { code: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [total, courses] = await Promise.all([
    prisma.course.count({ where }),
    prisma.course.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        academicProgram: { select: { id: true, name: true, banglaName: true } },
        academicClass: { select: { id: true, name: true, banglaName: true } },
        academicGroup: { select: { id: true, name: true, banglaName: true } },
        courseSubjects: {
          include: { subject: { select: { id: true, name: true, banglaName: true, code: true } } },
          orderBy: { displayOrder: 'asc' },
        },
        _count: { select: { batches: true } },
      },
    }),
  ]);

  return {
    courses,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getCourseById(coachingCenterId: string, courseId: string) {
  return prisma.course.findFirst({
    where: { id: courseId, coachingCenterId },
    include: {
      academicProgram: true,
      academicClass: true,
      academicGroup: true,
      courseSubjects: {
        include: {
          subject: true,
          subjectPaper: true,
        },
        orderBy: { displayOrder: 'asc' },
      },
      batches: {
        select: { id: true, name: true, code: true, status: true, capacity: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
}

export async function createCourse(coachingCenterId: string, input: CourseInput, actorId?: string) {
  const existing = await prisma.course.findFirst({
    where: { coachingCenterId, code: input.code.trim().toUpperCase() },
  });
  if (existing) {
    throw new Error('A course with this code already exists');
  }

  const course = await prisma.course.create({
    data: {
      coachingCenterId,
      name: input.name.trim(),
      banglaName: input.banglaName?.trim() || null,
      code: input.code.trim().toUpperCase(),
      description: input.description?.trim() || null,
      academicProgramId: input.academicProgramId,
      academicClassId: input.academicClassId,
      academicGroupId: input.academicGroupId || null,
      durationMonths: input.durationMonths ?? 12,
      fee: input.fee ?? 0,
      status: input.status ?? 'ACTIVE',
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'COURSE_CREATED',
    entity: 'Course',
    entityId: course.id,
    details: { name: course.name, code: course.code },
  });

  return course;
}

export async function updateCourse(
  coachingCenterId: string,
  courseId: string,
  input: CourseUpdateInput,
  actorId?: string
) {
  const existing = await prisma.course.findFirst({ where: { id: courseId, coachingCenterId } });
  if (!existing) throw new Error('COURSE_NOT_FOUND');

  if (input.code && input.code.trim().toUpperCase() !== existing.code) {
    const dupe = await prisma.course.findFirst({
      where: { coachingCenterId, code: input.code.trim().toUpperCase(), NOT: { id: courseId } },
    });
    if (dupe) throw new Error('A course with this code already exists');
  }

  const statusChanged = input.status && input.status !== existing.status;

  const course = await prisma.course.update({
    where: { id: courseId },
    data: {
      name: input.name?.trim() ?? existing.name,
      banglaName: input.banglaName !== undefined ? input.banglaName?.trim() || null : existing.banglaName,
      code: input.code ? input.code.trim().toUpperCase() : existing.code,
      description: input.description !== undefined ? input.description?.trim() || null : existing.description,
      academicProgramId: input.academicProgramId ?? existing.academicProgramId,
      academicClassId: input.academicClassId ?? existing.academicClassId,
      academicGroupId: input.academicGroupId !== undefined ? input.academicGroupId || null : existing.academicGroupId,
      durationMonths: input.durationMonths ?? existing.durationMonths,
      fee: input.fee ?? existing.fee,
      status: input.status ?? existing.status,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: statusChanged ? 'COURSE_STATUS_CHANGED' : 'COURSE_UPDATED',
    entity: 'Course',
    entityId: course.id,
    details: { name: course.name, status: course.status },
  });

  return course;
}

export async function archiveCourse(coachingCenterId: string, courseId: string, actorId?: string) {
  const existing = await prisma.course.findFirst({ where: { id: courseId, coachingCenterId } });
  if (!existing) throw new Error('COURSE_NOT_FOUND');

  const course = await prisma.course.update({
    where: { id: courseId },
    data: { status: 'ARCHIVED' },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'COURSE_ARCHIVED',
    entity: 'Course',
    entityId: course.id,
    details: { name: course.name },
  });

  return course;
}

/**
 * Replaces the full set of course subjects (a controlled, small list) inside
 * one transaction. Never duplicates Subject master records.
 */
export async function replaceCourseSubjects(
  coachingCenterId: string,
  courseId: string,
  subjects: CourseSubjectInput[],
  actorId?: string
) {
  const course = await prisma.course.findFirst({ where: { id: courseId, coachingCenterId } });
  if (!course) throw new Error('COURSE_NOT_FOUND');

  const subjectIds = subjects.map((s) => s.subjectId);
  if (subjectIds.length) {
    const validSubjects = await prisma.subject.count({
      where: { id: { in: subjectIds }, coachingCenterId },
    });
    if (validSubjects !== new Set(subjectIds).size) {
      throw new Error('One or more subjects are invalid for this coaching center');
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.courseSubject.deleteMany({ where: { courseId } });
    if (subjects.length) {
      await tx.courseSubject.createMany({
        data: subjects.map((s, idx) => ({
          courseId,
          subjectId: s.subjectId,
          subjectPaperId: s.subjectPaperId || null,
          displayOrder: s.displayOrder ?? idx,
          isMandatory: s.isMandatory ?? true,
          totalMarks: s.totalMarks ?? null,
          status: s.status ?? 'ACTIVE',
        })),
      });
    }
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'COURSE_SUBJECTS_UPDATED',
    entity: 'Course',
    entityId: courseId,
    details: { subjectCount: subjects.length },
  });

  return getCourseById(coachingCenterId, courseId);
}
