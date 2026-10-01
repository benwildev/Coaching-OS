import prisma from '@/lib/db';
import { recordAuditLog } from './audit.service';
import { checkTeacherLimit } from './subscription.service';
import { createUser } from './user.service';
import { getTodaysClasses } from './attendance.service';
import { getCurrentDhakaDateOnly, getCurrentDhakaDayOfWeek, isScheduleActiveOnDate } from '@/lib/schedule';
import { normalizeBdPhone } from '@/lib/validations/student';
import type { TeacherInput, TeacherUpdateInput, TeacherAccountLinkInput, TeachingAssignmentInput } from '@/lib/validations/teacher';
import { assertBranchAccess, type SessionUser } from '@/lib/auth/session';
import type { Prisma, RoleCode } from '@prisma/client';

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
          include: {
            batch: {
              select: {
                id: true,
                name: true,
                code: true,
                courseId: true,
                course: { select: { id: true, name: true, banglaName: true, code: true } },
              },
            },
            subject: { select: { id: true, name: true } },
          },
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
    const { classSchedules: _classSchedules, ...rest } = t;
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
      user: { select: { id: true, email: true, name: true, status: true } },
      teacherSubjects: { include: { subject: true } },
      batchTeacherAssignments: {
        include: {
          batch: {
            select: {
              id: true,
              name: true,
              banglaName: true,
              code: true,
              status: true,
              branchId: true,
              branch: { select: { id: true, name: true, code: true } },
              courseId: true,
              course: { select: { id: true, name: true, banglaName: true, code: true } },
            },
          },
          subject: { select: { id: true, name: true, banglaName: true, code: true } },
        },
        orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
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

export async function createTeacher(
  coachingCenterId: string,
  input: TeacherInput,
  actorId?: string,
  actorUser?: SessionUser
) {
  const teacherCode = await generateTeacherCode(coachingCenterId);
  const normalizedPhone = normalizeBdPhone(input.phone) || input.phone.trim();
  const validJoiningDate = input.joiningDate && !isNaN(Date.parse(input.joiningDate)) ? new Date(input.joiningDate) : null;

  // Pre-validate teaching assignments outside the transaction to minimize transaction time
  const assignmentRowsToCreate: Array<{
    branchId: string;
    batchId: string;
    subjectId: string;
    startDate: Date;
    endDate: Date | null;
  }> = [];

  if (input.teachingAssignments && input.teachingAssignments.length > 0) {
    const courseIds = Array.from(new Set(input.teachingAssignments.map((a) => a.courseId)));
    const batchIds = Array.from(new Set(input.teachingAssignments.map((a) => a.batchId)));
    const allSubjectIds = Array.from(new Set(input.teachingAssignments.flatMap((a) => a.subjectIds)));

    const [courses, batches, subjects] = await Promise.all([
      prisma.course.findMany({ where: { id: { in: courseIds }, coachingCenterId } }),
      prisma.batch.findMany({
        where: { id: { in: batchIds }, coachingCenterId },
        include: {
          course: { include: { courseSubjects: true } },
          batchSubjects: true,
          academicClass: { include: { subjects: true } },
        },
      }),
      prisma.subject.findMany({ where: { id: { in: allSubjectIds }, coachingCenterId } }),
    ]);

    const courseMap = new Map(courses.map((c) => [c.id, c]));
    const batchMap = new Map(batches.map((b) => [b.id, b]));
    const subjectMap = new Map(subjects.map((s) => [s.id, s]));

    const seenActiveAssignments = new Set<string>();

    for (const assignment of input.teachingAssignments) {
      const course = courseMap.get(assignment.courseId);
      if (!course) {
        throw new Error('COURSE_NOT_FOUND: Selected course does not exist in this coaching center');
      }

      const batch = batchMap.get(assignment.batchId);
      if (!batch) {
        throw new Error('BATCH_NOT_FOUND: Selected batch does not exist in this coaching center');
      }
      if (batch.courseId !== assignment.courseId) {
        throw new Error('BATCH_MISMATCH: Selected batch does not belong to the selected course');
      }

      if (actorUser) {
        assertBranchAccess(actorUser, batch.branchId);
      }

      if (input.branchId && batch.branchId && input.branchId !== batch.branchId) {
        throw new Error('BRANCH_MISMATCH: Teacher branch does not match batch branch');
      }

      const offeredSubjectIds = new Set<string>();
      batch.batchSubjects.forEach((bs) => offeredSubjectIds.add(bs.subjectId));
      if (batch.course?.courseSubjects) {
        batch.course.courseSubjects.forEach((cs) => offeredSubjectIds.add(cs.subjectId));
      }
      if (offeredSubjectIds.size === 0 && batch.academicClass?.subjects) {
        batch.academicClass.subjects.forEach((s) => offeredSubjectIds.add(s.id));
      }

      const dedupedSubjectIds = Array.from(new Set(assignment.subjectIds));
      for (const subjectId of dedupedSubjectIds) {
        if (!offeredSubjectIds.has(subjectId)) {
          throw new Error('SUBJECT_NOT_OFFERED: Selected subject is not offered by the selected batch');
        }

        const subject = subjectMap.get(subjectId);
        if (!subject) {
          throw new Error('SUBJECT_NOT_FOUND: Selected subject does not exist');
        }

        const assignKey = `${batch.id}:${subjectId}`;
        if (seenActiveAssignments.has(assignKey)) {
          throw new Error('DUPLICATE_ASSIGNMENT: Teacher already has an active assignment for this batch and subject');
        }
        seenActiveAssignments.add(assignKey);

        const startDate = assignment.startDate && !isNaN(Date.parse(assignment.startDate))
          ? new Date(assignment.startDate)
          : new Date();
        const endDate = assignment.endDate && !isNaN(Date.parse(assignment.endDate))
          ? new Date(assignment.endDate)
          : null;

        assignmentRowsToCreate.push({
          branchId: batch.branchId,
          batchId: batch.id,
          subjectId,
          startDate,
          endDate,
        });
      }
    }
  }

  const createdAssignmentsCount = assignmentRowsToCreate.length;

  const teacher = await prisma.$transaction(async (tx) => {
    // Phase 11.4: plan teacher limit (only ACTIVE teachers count), under an advisory lock.
    if ((input.status ?? 'ACTIVE') === 'ACTIVE') await checkTeacherLimit(tx, coachingCenterId);
    const created = await tx.teacher.create({
      data: {
        coachingCenterId,
        branchId: input.branchId || null,
        teacherCode,
        name: input.name.trim(),
        banglaName: input.banglaName?.trim() || null,
        phone: normalizedPhone,
        email: input.email?.trim() || null,
        designation: input.designation?.trim() || null,
        qualification: input.qualification?.trim() || null,
        bio: input.bio?.trim() || null,
        photoUrl: input.photoUrl?.trim() || null,
        status: input.status ?? 'ACTIVE',
        joiningDate: validJoiningDate,
      },
    });

    const subjectIds = Array.from(new Set(input.subjectIds || []));
    if (subjectIds.length) {
      await tx.teacherSubject.createMany({
        data: subjectIds.map((subjectId) => ({ teacherId: created.id, subjectId })),
      });
    }

    if (assignmentRowsToCreate.length > 0) {
      await tx.batchTeacherAssignment.createMany({
        data: assignmentRowsToCreate.map((row) => ({
          coachingCenterId,
          branchId: row.branchId,
          batchId: row.batchId,
          subjectId: row.subjectId,
          teacherId: created.id,
          status: 'ACTIVE',
          startDate: row.startDate,
          endDate: row.endDate,
        })),
      });
    }

    return created;
  }, {
    maxWait: 15000,
    timeout: 30000,
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'TEACHER_CREATED',
    entity: 'Teacher',
    entityId: teacher.id,
    details: {
      name: teacher.name,
      teacherCode: teacher.teacherCode,
      assignmentsCount: createdAssignmentsCount,
    },
  });

  return teacher;
}

async function generateTeacherCode(coachingCenterId: string): Promise<string> {
  const center = await prisma.coachingCenter.findUnique({ where: { id: coachingCenterId }, select: { code: true } });
  const prefix = (center?.code || 'TCH').trim().toUpperCase();

  // Find the latest teacher code for this center starting with this prefix
  const latest = await prisma.teacher.findFirst({
    where: {
      coachingCenterId,
      teacherCode: { startsWith: `${prefix}-T-` },
    },
    orderBy: { teacherCode: 'desc' },
    select: { teacherCode: true },
  });

  let nextNum = 1;
  if (latest?.teacherCode) {
    const parts = latest.teacherCode.split('-');
    const parsed = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(parsed)) {
      nextNum = parsed + 1;
    }
  }

  // Ensure collision safety against any existing codes
  let candidate = `${prefix}-T-${String(nextNum).padStart(4, '0')}`;
  while (await prisma.teacher.findUnique({ where: { coachingCenterId_teacherCode: { coachingCenterId, teacherCode: candidate } } })) {
    nextNum++;
    candidate = `${prefix}-T-${String(nextNum).padStart(4, '0')}`;
  }

  return candidate;
}

export async function updateTeacher(
  coachingCenterId: string,
  teacherId: string,
  input: TeacherUpdateInput,
  actorId?: string
) {
  const existing = await prisma.teacher.findFirst({ where: { id: teacherId, coachingCenterId } });
  if (!existing) throw new Error('TEACHER_NOT_FOUND');

  const normalizedPhone = input.phone ? (normalizeBdPhone(input.phone) || input.phone.trim()) : undefined;
  const validJoiningDate = input.joiningDate !== undefined
    ? (input.joiningDate && !isNaN(Date.parse(input.joiningDate)) ? new Date(input.joiningDate) : null)
    : undefined;

  const teacher = await prisma.$transaction(async (tx) => {
    // Phase 11.4: re-activating an inactive teacher takes a slot again.
    if (input.status === 'ACTIVE' && existing.status !== 'ACTIVE') await checkTeacherLimit(tx, coachingCenterId);
    const updated = await tx.teacher.update({
      where: { id: teacherId },
      data: {
        branchId: input.branchId !== undefined ? input.branchId || null : existing.branchId,
        name: input.name?.trim() ?? existing.name,
        banglaName: input.banglaName !== undefined ? input.banglaName?.trim() || null : existing.banglaName,
        phone: normalizedPhone ?? existing.phone,
        email: input.email !== undefined ? input.email?.trim() || null : existing.email,
        designation: input.designation !== undefined ? input.designation?.trim() || null : existing.designation,
        qualification: input.qualification !== undefined ? input.qualification?.trim() || null : existing.qualification,
        bio: input.bio !== undefined ? input.bio?.trim() || null : existing.bio,
        photoUrl: input.photoUrl !== undefined ? input.photoUrl?.trim() || null : existing.photoUrl,
        status: input.status ?? existing.status,
        joiningDate: validJoiningDate !== undefined ? validJoiningDate : existing.joiningDate,
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

// ------------------------------------------------------------------
// Phase 10.5: Teacher <-> User account linking (OWNER/ADMIN only)
// ------------------------------------------------------------------
//
// Teacher (HR/profile record) and User (login identity) were previously
// two completely disjoint tables — Teacher.userId existed in the schema
// but no application code path ever set it, so a real TEACHER login could
// never resolve its own Teacher profile for attendance/marks scoping.

export interface EligibleTeacherAccount {
  id: string;
  email: string;
  name: string;
  status: string;
}

/** Users with the TEACHER role in this tenant who aren't linked to a Teacher yet — candidates for "link existing account". */
export async function getEligibleTeacherAccounts(coachingCenterId: string): Promise<EligibleTeacherAccount[]> {
  const linkedUserIds = (
    await prisma.teacher.findMany({ where: { coachingCenterId, userId: { not: null } }, select: { userId: true } })
  ).map((t) => t.userId!);

  const users = await prisma.user.findMany({
    where: {
      coachingCenterId,
      id: { notIn: linkedUserIds },
      roleAssignments: { some: { role: { code: 'TEACHER' } } },
    },
    select: { id: true, email: true, name: true, status: true },
    orderBy: { name: 'asc' },
  });
  return users;
}

/**
 * Links a Teacher record to a User login — either by creating a brand new
 * TEACHER-role User (reusing the same createUser used by Settings > Users,
 * so password hashing/escalation rules are identical), or by linking an
 * already-existing, still-unlinked TEACHER-role User in this tenant.
 *
 * Both Teacher and the target User are always re-verified against
 * `coachingCenterId` here — a client cannot link across tenants, and
 * `Teacher.userId` is `@unique` at the DB level so one User can never end
 * up linked to two Teacher records (a race on this is simply rejected by
 * that constraint).
 */
export async function linkTeacherAccount(
  coachingCenterId: string,
  teacherId: string,
  input: TeacherAccountLinkInput,
  actorId: string,
  actorRole: RoleCode
): Promise<{ userId: string; email: string }> {
  const teacher = await prisma.teacher.findFirst({ where: { id: teacherId, coachingCenterId } });
  if (!teacher) throw new Error('TEACHER_NOT_FOUND');
  if (teacher.userId) throw new Error('TEACHER_ALREADY_LINKED: This teacher already has a linked login account.');

  let userId: string;
  let email: string;

  if (input.mode === 'create') {
    // The new login inherits the teacher's own branch, so the two records
    // stay consistent for branch-scoped authorization (assertBranchAccess
    // compares User.branchId, not Teacher.branchId, everywhere else).
    const user = await createUser(
      coachingCenterId,
      {
        email: input.email,
        phone: input.phone,
        password: input.password,
        name: input.name,
        banglaName: input.banglaName || undefined,
        role: 'TEACHER',
        branchId: teacher.branchId || undefined,
      },
      actorId,
      actorRole
    );
    userId = user.id;
    email = user.email;
  } else {
    const user = await prisma.user.findFirst({ where: { id: input.userId, coachingCenterId } });
    if (!user) throw new Error('USER_NOT_FOUND');

    const roleAssignment = await prisma.roleAssignment.findFirst({
      where: { userId: user.id },
      include: { role: true },
      orderBy: { createdAt: 'asc' },
    });
    // Prevent linking an ADMIN/OWNER/STAFF account as a teacher's login —
    // only an existing TEACHER-role account is eligible.
    if (!roleAssignment || roleAssignment.role.code !== 'TEACHER') {
      throw new Error('INVALID_TEACHER_ACCOUNT: Only a user with the TEACHER role can be linked to a teacher record.');
    }
    const alreadyLinkedElsewhere = await prisma.teacher.findFirst({ where: { userId: user.id } });
    if (alreadyLinkedElsewhere) {
      throw new Error('USER_ALREADY_LINKED: This account is already linked to another teacher record.');
    }
    userId = user.id;
    email = user.email;
  }

  await prisma.teacher.update({ where: { id: teacherId }, data: { userId } });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: input.mode === 'create' ? 'TEACHER_ACCOUNT_CREATED_AND_LINKED' : 'TEACHER_ACCOUNT_LINKED',
    entity: 'Teacher',
    entityId: teacherId,
    details: { linkedUserId: userId, linkedEmail: email },
  });

  return { userId, email };
}

/**
 * Unlinks a Teacher from its User login (the login itself is untouched —
 * disable it separately via the existing user-status endpoint if needed).
 */
export async function unlinkTeacherAccount(coachingCenterId: string, teacherId: string, actorId: string): Promise<void> {
  const teacher = await prisma.teacher.findFirst({ where: { id: teacherId, coachingCenterId } });
  if (!teacher) throw new Error('TEACHER_NOT_FOUND');
  if (!teacher.userId) throw new Error('TEACHER_NOT_LINKED: This teacher has no linked login account.');

  const previousUserId = teacher.userId;
  await prisma.teacher.update({ where: { id: teacherId }, data: { userId: null } });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'TEACHER_ACCOUNT_UNLINKED',
    entity: 'Teacher',
    entityId: teacherId,
    details: { previousUserId },
  });
}

// ------------------------------------------------------------------
// Phase 10.5: real Teacher Dashboard data
// ------------------------------------------------------------------
//
// Every figure here comes from the teacher's own assignments — resolved
// from the authenticated User via getTeacherByUserId, never from a
// client-supplied teacherId. No fabricated numbers: an empty section
// means "no data yet", not a placeholder value.

export interface TeacherDashboardData {
  linked: true;
  teacher: { id: string; name: string; banglaName: string | null };
  todaysClasses: Array<{
    scheduleId: string;
    time: string;
    batchName: string;
    subjectName: string;
    roomName: string | null;
    studentCount: number;
    sessionId: string | null;
    sessionStatus: string | null;
  }>;
  pendingAttendanceCount: number;
  assignments: Array<{
    batchId: string;
    batchName: string;
    subjectId: string;
    subjectName: string;
    studentCount: number;
  }>;
  studentCount: number;
  pendingMarksEntry: Array<{
    examId: string;
    examSubjectId: string;
    examTitle: string;
    subjectName: string;
    batchName: string | null;
    enteredCount: number;
    totalCount: number;
  }>;
  recentNotices: Array<{ id: string; title: string; banglaTitle: string | null; publishedAt: Date | null }>;
}

export async function getTeacherDashboardData(
  coachingCenterId: string,
  userId: string
): Promise<{ linked: false } | TeacherDashboardData> {
  const teacher = await prisma.teacher.findFirst({ where: { coachingCenterId, userId } });
  if (!teacher) return { linked: false };

  const [todaysClasses, assignments, recentNotices] = await Promise.all([
    getTodaysClasses(coachingCenterId, { teacherId: teacher.id }),
    prisma.batchTeacherAssignment.findMany({
      where: { coachingCenterId, teacherId: teacher.id, status: 'ACTIVE' },
      include: {
        batch: { select: { id: true, name: true, banglaName: true, studentBatches: { where: { status: 'ACTIVE' }, select: { studentId: true } } } },
        subject: { select: { id: true, name: true, banglaName: true } },
      },
    }),
    prisma.notice.findMany({
      where: {
        coachingCenterId,
        status: 'PUBLISHED',
        targetAudience: { in: ['ALL_CENTER', 'TEACHERS'] },
        OR: [{ branchId: null }, { branchId: teacher.branchId ?? undefined }],
      },
      orderBy: { publishedAt: 'desc' },
      take: 5,
      select: { id: true, title: true, banglaTitle: true, publishedAt: true },
    }),
  ]);

  const teacherSubjectIds = Array.from(new Set(assignments.map((a) => a.subject.id)));
  const teacherBatchIds = Array.from(new Set(assignments.map((a) => a.batch.id)));

  // Scoped by the teacher's own subject+batch assignments up front — never
  // pulls another teacher's (or the whole tenant's) exam subjects.
  const ongoingExamSubjects = teacherSubjectIds.length && teacherBatchIds.length
    ? await prisma.examSubject.findMany({
        where: {
          subjectId: { in: teacherSubjectIds },
          exam: { coachingCenterId, status: { in: ['ONGOING', 'COMPLETED'] }, batchId: { in: teacherBatchIds } },
        },
        include: {
          exam: { select: { id: true, title: true, batchId: true, batch: { select: { name: true } } } },
          subject: { select: { name: true } },
          results: { select: { studentId: true, marksObtained: true } },
        },
      })
    : [];

  const pendingMarksEntry = ongoingExamSubjects
    .map((es) => {
      const enteredCount = es.results.filter((r) => r.marksObtained !== null).length;
      const totalCount = es.results.length;
      return {
        examId: es.exam.id,
        examSubjectId: es.id,
        examTitle: es.exam.title,
        subjectName: es.subject.name,
        batchName: es.exam.batch?.name ?? null,
        enteredCount,
        totalCount,
      };
    })
    .filter((es) => es.enteredCount < es.totalCount);

  const uniqueStudentIds = new Set(assignments.flatMap((a) => a.batch.studentBatches.map((sb) => sb.studentId)));

  return {
    linked: true,
    teacher: { id: teacher.id, name: teacher.name, banglaName: teacher.banglaName },
    todaysClasses: todaysClasses.map((c) => ({
      scheduleId: c.schedule.id,
      time: c.schedule.startTime,
      batchName: c.schedule.batch.name,
      subjectName: c.schedule.subject?.name ?? '',
      roomName: c.schedule.room?.name ?? null,
      studentCount: c.eligibleStudentCount,
      sessionId: c.session?.id ?? null,
      sessionStatus: c.session?.status ?? null,
    })),
    pendingAttendanceCount: todaysClasses.filter((c) => !c.session || c.session.status !== 'COMPLETED').length,
    assignments: assignments.map((a) => ({
      batchId: a.batch.id,
      batchName: a.batch.name,
      subjectId: a.subject.id,
      subjectName: a.subject.name,
      studentCount: a.batch.studentBatches.length,
    })),
    studentCount: uniqueStudentIds.size,
    pendingMarksEntry,
    recentNotices,
  };
}

// ------------------------------------------------------------------
// Phase 12: Teacher Teaching Assignments & Options
// ------------------------------------------------------------------

export async function assignTeacherToBatches(
  coachingCenterId: string,
  teacherId: string,
  assignments: TeachingAssignmentInput[],
  actorId?: string,
  actorUser?: SessionUser
) {
  const teacher = await prisma.teacher.findFirst({ where: { id: teacherId, coachingCenterId } });
  if (!teacher) throw new Error('TEACHER_NOT_FOUND: Teacher not found in this coaching center');

  const courseIds = Array.from(new Set(assignments.map((a) => a.courseId)));
  const batchIds = Array.from(new Set(assignments.map((a) => a.batchId)));
  const allSubjectIds = Array.from(new Set(assignments.flatMap((a) => a.subjectIds)));

  const [courses, batches, subjects, existingActiveList] = await Promise.all([
    prisma.course.findMany({ where: { id: { in: courseIds }, coachingCenterId } }),
    prisma.batch.findMany({
      where: { id: { in: batchIds }, coachingCenterId },
      include: {
        course: { include: { courseSubjects: true } },
        batchSubjects: true,
        academicClass: { include: { subjects: true } },
      },
    }),
    prisma.subject.findMany({ where: { id: { in: allSubjectIds }, coachingCenterId } }),
    prisma.batchTeacherAssignment.findMany({
      where: {
        teacherId: teacher.id,
        batchId: { in: batchIds },
        subjectId: { in: allSubjectIds },
        status: 'ACTIVE',
      },
    }),
  ]);

  const courseMap = new Map(courses.map((c) => [c.id, c]));
  const batchMap = new Map(batches.map((b) => [b.id, b]));
  const subjectMap = new Map(subjects.map((s) => [s.id, s]));
  const activeSet = new Set(existingActiveList.map((a) => `${a.batchId}:${a.subjectId}`));
  const pendingSet = new Set<string>();

  const itemsToCreate: Array<{
    batch: (typeof batches)[0];
    subjectId: string;
    startDate: Date;
    endDate: Date | null;
  }> = [];

  for (const assignment of assignments) {
    const course = courseMap.get(assignment.courseId);
    if (!course) throw new Error('COURSE_NOT_FOUND: Selected course does not exist in this coaching center');

    const batch = batchMap.get(assignment.batchId);
    if (!batch) throw new Error('BATCH_NOT_FOUND: Selected batch does not exist in this coaching center');
    if (batch.courseId !== assignment.courseId) {
      throw new Error('BATCH_MISMATCH: Selected batch does not belong to the selected course');
    }

    if (actorUser) assertBranchAccess(actorUser, batch.branchId);

    if (teacher.branchId && batch.branchId && teacher.branchId !== batch.branchId) {
      throw new Error('BRANCH_MISMATCH: Teacher branch does not match batch branch');
    }

    const offeredSubjectIds = new Set<string>();
    batch.batchSubjects.forEach((bs) => offeredSubjectIds.add(bs.subjectId));
    if (batch.course?.courseSubjects) {
      batch.course.courseSubjects.forEach((cs) => offeredSubjectIds.add(cs.subjectId));
    }
    if (offeredSubjectIds.size === 0 && batch.academicClass?.subjects) {
      batch.academicClass.subjects.forEach((s) => offeredSubjectIds.add(s.id));
    }

    const dedupedSubjectIds = Array.from(new Set(assignment.subjectIds));
    for (const subjectId of dedupedSubjectIds) {
      if (!offeredSubjectIds.has(subjectId)) {
        throw new Error('SUBJECT_NOT_OFFERED: Selected subject is not offered by the selected batch');
      }

      const subject = subjectMap.get(subjectId);
      if (!subject) throw new Error('SUBJECT_NOT_FOUND: Selected subject does not exist');

      const assignKey = `${batch.id}:${subjectId}`;
      if (activeSet.has(assignKey) || pendingSet.has(assignKey)) {
        throw new Error('DUPLICATE_ASSIGNMENT: Teacher already has an active assignment for this batch and subject');
      }
      pendingSet.add(assignKey);

      const startDate = assignment.startDate && !isNaN(Date.parse(assignment.startDate))
        ? new Date(assignment.startDate)
        : new Date();
      const endDate = assignment.endDate && !isNaN(Date.parse(assignment.endDate))
        ? new Date(assignment.endDate)
        : null;

      itemsToCreate.push({ batch, subjectId, startDate, endDate });
    }
  }

  const createdList = await prisma.$transaction(async (tx) => {
    const results = [];
    for (const item of itemsToCreate) {
      const created = await tx.batchTeacherAssignment.create({
        data: {
          coachingCenterId,
          branchId: item.batch.branchId,
          batchId: item.batch.id,
          subjectId: item.subjectId,
          teacherId: teacher.id,
          status: 'ACTIVE',
          startDate: item.startDate,
          endDate: item.endDate,
        },
        include: {
          batch: {
            select: {
              id: true,
              name: true,
              code: true,
              courseId: true,
              course: { select: { id: true, name: true, banglaName: true, code: true } },
            },
          },
          subject: { select: { id: true, name: true, banglaName: true, code: true } },
        },
      });
      results.push(created);
    }
    return results;
  }, {
    maxWait: 15000,
    timeout: 30000,
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'TEACHER_ASSIGNMENTS_ADDED',
    entity: 'Teacher',
    entityId: teacherId,
    details: { count: createdList.length },
  });

  return createdList;
}

export async function endBatchTeacherAssignment(
  coachingCenterId: string,
  teacherId: string,
  assignmentId: string,
  actorId?: string,
  actorUser?: SessionUser
) {
  const assignment = await prisma.batchTeacherAssignment.findFirst({
    where: { id: assignmentId, teacherId, coachingCenterId },
  });
  if (!assignment) throw new Error('ASSIGNMENT_NOT_FOUND: Assignment not found');

  if (actorUser) {
    assertBranchAccess(actorUser, assignment.branchId);
  }

  const updated = await prisma.batchTeacherAssignment.update({
    where: { id: assignmentId },
    data: {
      status: 'ENDED',
      endDate: new Date(),
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'TEACHER_ASSIGNMENT_ENDED',
    entity: 'BatchTeacherAssignment',
    entityId: assignmentId,
    details: { teacherId, batchId: assignment.batchId, subjectId: assignment.subjectId },
  });

  return updated;
}

export async function getTeacherAssignmentOptions(
  coachingCenterId: string,
  actorUser?: SessionUser
) {
  const courses = await prisma.course.findMany({
    where: { coachingCenterId, status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      banglaName: true,
      code: true,
      batches: {
        where: {
          status: 'ACTIVE',
          ...(actorUser?.role !== 'OWNER' && actorUser?.branchId ? { branchId: actorUser.branchId } : {}),
        },
        select: {
          id: true,
          name: true,
          banglaName: true,
          code: true,
          branchId: true,
          branch: { select: { id: true, name: true, banglaName: true } },
          batchSubjects: {
            where: { status: 'ACTIVE' },
            select: { subject: { select: { id: true, name: true, banglaName: true, code: true } } },
          },
          course: {
            select: {
              courseSubjects: {
                where: { status: 'ACTIVE' },
                select: { subject: { select: { id: true, name: true, banglaName: true, code: true } } },
              },
            },
          },
          academicClass: {
            select: {
              subjects: { select: { id: true, name: true, banglaName: true, code: true } },
            },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  return {
    courses: courses
      .map((c) => ({
        id: c.id,
        name: c.name,
        banglaName: c.banglaName,
        code: c.code,
        batches: c.batches.map((b) => {
          const subjectsMap = new Map<string, { id: string; name: string; banglaName: string | null; code: string }>();
          b.batchSubjects.forEach((bs) => subjectsMap.set(bs.subject.id, bs.subject));
          if (b.course?.courseSubjects) {
            b.course.courseSubjects.forEach((cs) => subjectsMap.set(cs.subject.id, cs.subject));
          }
          if (subjectsMap.size === 0 && b.academicClass?.subjects) {
            b.academicClass.subjects.forEach((s) => subjectsMap.set(s.id, s));
          }
          return {
            id: b.id,
            name: b.name,
            banglaName: b.banglaName,
            code: b.code,
            branchId: b.branchId,
            branchName: b.branch?.name || '',
            branchBanglaName: b.branch?.banglaName || null,
            subjects: Array.from(subjectsMap.values()),
          };
        }),
      }))
      .filter((c) => c.batches.length > 0),
  };
}

export async function deleteTeacher(coachingCenterId: string, teacherId: string, actorId?: string) {
  const existing = await prisma.teacher.findFirst({
    where: { id: teacherId, coachingCenterId },
    include: {
      _count: {
        select: {
          attendanceSessionsTaught: true,
          homeworks: true,
        },
      },
    },
  });
  if (!existing) throw new Error('TEACHER_NOT_FOUND');

  // Prevent hard delete if teacher has conducted classroom sessions or assigned homeworks
  if (existing._count.attendanceSessionsTaught > 0 || existing._count.homeworks > 0) {
    throw new Error('CANNOT_DELETE_TEACHER_WITH_HISTORY');
  }

  await prisma.$transaction(async (tx) => {
    await tx.batchTeacherAssignment.deleteMany({ where: { teacherId } });
    await tx.classSchedule.deleteMany({ where: { teacherId } });
    await tx.teacherAttendance.deleteMany({ where: { teacherId } });
    await tx.teacherSubject.deleteMany({ where: { teacherId } });
    await tx.teacher.delete({ where: { id: teacherId } });
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'TEACHER_DELETED',
    entity: 'Teacher',
    entityId: teacherId,
    details: { name: existing.name, teacherCode: existing.teacherCode },
  });

  return { success: true };
}
