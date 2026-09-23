import prisma from '@/lib/db';
import { recordAuditLog } from './audit.service';
import { getCurrentDhakaDateOnly, getCurrentDhakaDayOfWeek, isScheduleActiveOnDate } from '@/lib/schedule';
import type { TeacherInput, TeacherUpdateInput } from '@/lib/validations/teacher';
import type { Prisma } from '@prisma/client';

export interface TeacherFilterParams {
  search?: string;
  branchId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export async function getTeachersList(coachingCenterId: string, params: TeacherFilterParams = {}) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
  const skip = (page - 1) * pageSize;

  const where: Prisma.TeacherWhereInput = { coachingCenterId };
  if (params.branchId && params.branchId !== 'all') where.branchId = params.branchId;
  if (params.status && params.status !== 'all') where.status = params.status;
  if (params.search && params.search.trim()) {
    const q = params.search.trim();
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { banglaName: { contains: q } },
      { teacherCode: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q } },
    ];
  }

  const today = getCurrentDhakaDateOnly();
  const todayDow = getCurrentDhakaDayOfWeek();

  const [total, teachers] = await Promise.all([
    prisma.teacher.count({ where }),
    prisma.teacher.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { name: 'asc' },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        teacherSubjects: { include: { subject: { select: { id: true, name: true, banglaName: true } } } },
        batchTeacherAssignments: {
          where: { status: 'ACTIVE' },
          include: { batch: { select: { id: true, name: true, code: true } }, subject: { select: { id: true, name: true } } },
        },
        classSchedules: {
          where: { status: 'ACTIVE' },
          select: { id: true, dayOfWeek: true, effectiveStartDate: true, effectiveEndDate: true },
        },
      },
    }),
  ]);

  const enriched = teachers.map((t) => {
    const weeklyClassCount = t.classSchedules.length;
    const todaysClassCount = t.classSchedules.filter(
      (s) => s.dayOfWeek === todayDow && isScheduleActiveOnDate(s, today)
    ).length;
    const { classSchedules, ...rest } = t;
    return { ...rest, weeklyClassCount, todaysClassCount };
  });

  return {
    teachers: enriched,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getTeacherById(coachingCenterId: string, teacherId: string) {
  const teacher = await prisma.teacher.findFirst({
    where: { id: teacherId, coachingCenterId },
    include: {
      branch: true,
      teacherSubjects: { include: { subject: true } },
      batchTeacherAssignments: {
        include: {
          batch: { select: { id: true, name: true, banglaName: true, code: true, status: true } },
          subject: { select: { id: true, name: true, banglaName: true } },
        },
        orderBy: { startDate: 'desc' },
      },
      classSchedules: {
        where: { status: 'ACTIVE' },
        include: {
          batch: { select: { id: true, name: true, banglaName: true, code: true } },
          subject: { select: { id: true, name: true, banglaName: true } },
          room: { select: { id: true, name: true, code: true } },
        },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      },
      attendances: {
        orderBy: { date: 'desc' },
        take: 30,
      },
    },
  });

  if (!teacher) return null;

  const today = getCurrentDhakaDateOnly();
  const todayDow = getCurrentDhakaDayOfWeek();
  const todaysClasses = teacher.classSchedules.filter((s) => s.dayOfWeek === todayDow && isScheduleActiveOnDate(s, today));

  return {
    ...teacher,
    weeklyClassCount: teacher.classSchedules.length,
    todaysClasses,
  };
}

/** Resolves the Teacher profile linked to a logged-in User, if any (used for teacher self-service scoping). */
export async function getTeacherByUserId(coachingCenterId: string, userId: string) {
  return prisma.teacher.findFirst({ where: { coachingCenterId, userId } });
}

export async function createTeacher(coachingCenterId: string, input: TeacherInput, actorId?: string) {
  const teacherCode = await generateTeacherCode(coachingCenterId);

  const teacher = await prisma.$transaction(async (tx) => {
    const created = await tx.teacher.create({
      data: {
        coachingCenterId,
        branchId: input.branchId || null,
        teacherCode,
        name: input.name.trim(),
        banglaName: input.banglaName?.trim() || null,
        phone: input.phone.trim(),
        email: input.email?.trim() || null,
        designation: input.designation?.trim() || null,
        qualification: input.qualification?.trim() || null,
        bio: input.bio?.trim() || null,
        photoUrl: input.photoUrl?.trim() || null,
        status: input.status ?? 'ACTIVE',
        joiningDate: input.joiningDate ? new Date(input.joiningDate) : null,
      },
    });

    const subjectIds = Array.from(new Set(input.subjectIds || []));
    if (subjectIds.length) {
      await tx.teacherSubject.createMany({
        data: subjectIds.map((subjectId) => ({ teacherId: created.id, subjectId })),
      });
    }

    return created;
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'TEACHER_CREATED',
    entity: 'Teacher',
    entityId: teacher.id,
    details: { name: teacher.name, teacherCode: teacher.teacherCode },
  });

  return teacher;
}

async function generateTeacherCode(coachingCenterId: string): Promise<string> {
  const center = await prisma.coachingCenter.findUnique({ where: { id: coachingCenterId }, select: { code: true } });
  const count = await prisma.teacher.count({ where: { coachingCenterId } });
  const prefix = (center?.code || 'TCH').trim().toUpperCase();
  return `${prefix}-T-${String(count + 1).padStart(4, '0')}`;
}

export async function updateTeacher(
  coachingCenterId: string,
  teacherId: string,
  input: TeacherUpdateInput,
  actorId?: string
) {
  const existing = await prisma.teacher.findFirst({ where: { id: teacherId, coachingCenterId } });
  if (!existing) throw new Error('TEACHER_NOT_FOUND');

  const teacher = await prisma.$transaction(async (tx) => {
    const updated = await tx.teacher.update({
      where: { id: teacherId },
      data: {
        branchId: input.branchId !== undefined ? input.branchId || null : existing.branchId,
        name: input.name?.trim() ?? existing.name,
        banglaName: input.banglaName !== undefined ? input.banglaName?.trim() || null : existing.banglaName,
        phone: input.phone?.trim() ?? existing.phone,
        email: input.email !== undefined ? input.email?.trim() || null : existing.email,
        designation: input.designation !== undefined ? input.designation?.trim() || null : existing.designation,
        qualification: input.qualification !== undefined ? input.qualification?.trim() || null : existing.qualification,
        bio: input.bio !== undefined ? input.bio?.trim() || null : existing.bio,
        photoUrl: input.photoUrl !== undefined ? input.photoUrl?.trim() || null : existing.photoUrl,
        status: input.status ?? existing.status,
        joiningDate: input.joiningDate !== undefined ? (input.joiningDate ? new Date(input.joiningDate) : null) : existing.joiningDate,
      },
    });

    if (input.subjectIds) {
      const subjectIds = Array.from(new Set(input.subjectIds));
      await tx.teacherSubject.deleteMany({ where: { teacherId } });
      if (subjectIds.length) {
        await tx.teacherSubject.createMany({ data: subjectIds.map((subjectId) => ({ teacherId, subjectId })) });
      }
    }

    return updated;
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'TEACHER_UPDATED',
    entity: 'Teacher',
    entityId: teacher.id,
    details: { name: teacher.name, status: teacher.status },
  });

  return teacher;
}
