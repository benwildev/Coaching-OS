import prisma from '@/lib/db';
import { recordAuditLog } from './audit.service';
import { notifyStudentGuardians } from './guardian-notify.service';
import {
  ALLOWED_STATUS_TRANSITIONS,
  EXAM_STATUS,
  type CreateExamInput,
  type UpdateExamInput,
  type AddExamSubjectInput,
  type UpdateExamSubjectInput,
} from '@/lib/validations/exam';

export interface ExamFilterParams {
  page?: number;
  pageSize?: number;
  academicSessionId?: string;
  academicProgramId?: string;
  academicClassId?: string;
  academicGroupId?: string;
  batchId?: string;
  branchId?: string;
  examType?: string;
  status?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * List exams for a tenant with server-side pagination and genuine counts
 */
export async function listExams(coachingCenterId: string, params: ExamFilterParams = {}) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 15));
  const skip = (page - 1) * pageSize;

  const where: any = {
    coachingCenterId,
  };

  if (params.branchId) where.branchId = params.branchId;
  if (params.academicSessionId) where.academicSessionId = params.academicSessionId;
  if (params.academicProgramId) where.academicProgramId = params.academicProgramId;
  if (params.academicClassId) where.academicClassId = params.academicClassId;
  if (params.academicGroupId) where.academicGroupId = params.academicGroupId;
  if (params.batchId) where.batchId = params.batchId;
  if (params.examType) where.examType = params.examType;
  if (params.status && params.status !== 'all') where.status = params.status;

  if (params.dateFrom || params.dateTo) {
    where.startDate = {};
    if (params.dateFrom) where.startDate.gte = new Date(params.dateFrom);
    if (params.dateTo) where.startDate.lte = new Date(params.dateTo);
  }

  if (params.search && params.search.trim()) {
    const s = params.search.trim();
    where.OR = [
      { title: { contains: s, mode: 'insensitive' } },
      { banglaTitle: { contains: s, mode: 'insensitive' } },
      { examType: { contains: s, mode: 'insensitive' } },
    ];
  }

  const [total, exams, stats] = await Promise.all([
    prisma.exam.count({ where }),
    prisma.exam.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { startDate: 'desc' },
      include: {
        academicSession: { select: { id: true, name: true, isCurrent: true } },
        academicProgram: { select: { id: true, name: true, banglaName: true, code: true } },
        academicClass: { select: { id: true, name: true, banglaName: true, code: true } },
        academicGroup: { select: { id: true, name: true, banglaName: true, code: true } },
        batch: { select: { id: true, name: true, banglaName: true, code: true } },
        branch: { select: { id: true, name: true, code: true } },
        _count: {
          select: {
            examSubjects: true,
            examStudents: true,
          },
        },
      },
    }),
    Promise.all([
      prisma.exam.count({ where: { coachingCenterId, status: 'PUBLISHED' } }),
      prisma.exam.count({ where: { coachingCenterId, status: 'ONGOING' } }),
      prisma.exam.count({ where: { coachingCenterId, status: 'SCHEDULED' } }),
      prisma.exam.count({ where: { coachingCenterId, status: 'COMPLETED' } }),
    ]),
  ]);

  return {
    exams,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
    stats: {
      total,
      published: stats[0],
      ongoing: stats[1],
      scheduled: stats[2],
      completed: stats[3],
    },
  };
}

/**
 * Exams relevant to one student (via ExamStudent enrollment), for the
 * portal "My Exams" list. DRAFT exams are never announced to students, so
 * they're excluded regardless of the isStudentPortal flag.
 */
export async function getStudentExams(coachingCenterId: string, studentId: string, isStudentPortal: boolean = true) {
  const exams = await prisma.exam.findMany({
    where: {
      coachingCenterId,
      examStudents: { some: { studentId } },
      status: isStudentPortal ? { not: 'DRAFT' } : undefined,
    },
    orderBy: { startDate: 'desc' },
    include: {
      academicSession: { select: { id: true, name: true } },
      batch: { select: { id: true, name: true, banglaName: true } },
      examSubjects: {
        orderBy: { examDate: 'asc' },
        select: {
          id: true,
          examDate: true,
          startTime: true,
          durationMinutes: true,
          totalMarks: true,
          subject: { select: { id: true, name: true, banglaName: true, code: true } },
        },
      },
    },
  });

  return exams.map((exam) => ({
    id: exam.id,
    title: exam.title,
    banglaTitle: exam.banglaTitle,
    examType: exam.examType,
    status: exam.status,
    startDate: exam.startDate,
    endDate: exam.endDate,
    publishedAt: exam.publishedAt,
    session: exam.academicSession?.name ?? null,
    batch: exam.batch,
    subjects: exam.examSubjects.map((es) => ({
      id: es.id,
      examDate: es.examDate,
      startTime: es.startTime,
      durationMinutes: es.durationMinutes,
      totalMarks: Number(es.totalMarks),
      subject: es.subject,
    })),
  }));
}

/**
 * Get detailed exam by ID with subjects, students, marks completion progress
 */
export async function getExamById(coachingCenterId: string, examId: string, branchId?: string) {
  const where: any = { id: examId, coachingCenterId };
  if (branchId) where.branchId = branchId;

  const exam = await prisma.exam.findFirst({
    where,
    include: {
      academicSession: { select: { id: true, name: true } },
      academicProgram: { select: { id: true, name: true, banglaName: true } },
      academicClass: { select: { id: true, name: true, banglaName: true } },
      academicGroup: { select: { id: true, name: true, banglaName: true } },
      batch: { select: { id: true, name: true, banglaName: true, code: true } },
      branch: { select: { id: true, name: true, code: true } },
      examSubjects: {
        include: {
          subject: { select: { id: true, name: true, banglaName: true, code: true } },
          results: {
            select: {
              id: true,
              studentId: true,
              marksObtained: true,
              status: true,
              isPassed: true,
              grade: true,
            },
          },
        },
        orderBy: { examDate: 'asc' },
      },
      examStudents: {
        include: {
          student: {
            select: {
              id: true,
              studentIdCode: true,
              name: true,
              banglaName: true,
              phone: true,
              gender: true,
            },
          },
        },
        orderBy: { rollNumber: 'asc' },
      },
    },
  });

  if (!exam) {
    throw new Error('EXAM_NOT_FOUND');
  }

  // Calculate completion statistics per subject
  const totalStudents = exam.examStudents.length;
  const subjectsWithProgress = exam.examSubjects.map((es) => {
    const resultsEntered = es.results.filter(
      (r) => r.status === 'ABSENT' || r.status === 'EXCUSED' || r.marksObtained !== null
    ).length;
    const passedCount = es.results.filter((r) => r.isPassed && r.status === 'PRESENT').length;
    const failedCount = es.results.filter((r) => !r.isPassed && r.status === 'PRESENT').length;
    const absentCount = es.results.filter((r) => r.status === 'ABSENT').length;

    return {
      id: es.id,
      subjectId: es.subjectId,
      subjectName: es.subject.name,
      subjectBanglaName: es.subject.banglaName,
      subjectCode: es.subject.code,
      examDate: es.examDate,
      startTime: es.startTime,
      durationMinutes: es.durationMinutes,
      totalMarks: Number(es.totalMarks),
      passMarks: Number(es.passMarks),
      totalEnrolled: totalStudents,
      resultsEntered,
      resultsPending: Math.max(0, totalStudents - resultsEntered),
      isCompleted: totalStudents > 0 && resultsEntered >= totalStudents,
      passedCount,
      failedCount,
      absentCount,
    };
  });

  const totalResultsExpected = totalStudents * exam.examSubjects.length;
  const totalResultsEntered = subjectsWithProgress.reduce((sum, s) => sum + s.resultsEntered, 0);

  return {
    ...exam,
    totalMarks: Number(exam.totalMarks),
    passMarks: Number(exam.passMarks),
    subjectsWithProgress,
    progress: {
      totalStudents,
      totalSubjects: exam.examSubjects.length,
      totalResultsExpected,
      totalResultsEntered,
      totalResultsPending: Math.max(0, totalResultsExpected - totalResultsEntered),
      isFullyEntered: totalResultsExpected > 0 && totalResultsEntered >= totalResultsExpected,
    },
  };
}

/**
 * Fetch genuinely eligible students for an exam context (batch or class enrollment)
 */
export async function getEligibleStudents(
  coachingCenterId: string,
  params: {
    academicSessionId: string;
    academicProgramId: string;
    academicClassId: string;
    academicGroupId?: string;
    batchId?: string;
    branchId?: string;
  }
) {
  // If batchId is specified, fetch active students in this batch
  if (params.batchId) {
    const studentBatches = await prisma.studentBatch.findMany({
      where: {
        coachingCenterId,
        batchId: params.batchId,
        status: 'ACTIVE',
      },
      include: {
        student: {
          select: {
            id: true,
            studentIdCode: true,
            name: true,
            banglaName: true,
            phone: true,
            gender: true,
            status: true,
          },
        },
      },
      orderBy: { rollCode: 'asc' },
    });

    return studentBatches.map((sb) => ({
      id: sb.student.id,
      studentIdCode: sb.student.studentIdCode,
      name: sb.student.name,
      banglaName: sb.student.banglaName,
      phone: sb.student.phone,
      gender: sb.student.gender,
      roll: sb.rollCode || '',
    }));
  }

  // Otherwise fetch active enrollments for this session, program, and class
  const where: any = {
    coachingCenterId,
    academicSessionId: params.academicSessionId,
    academicProgramId: params.academicProgramId,
    academicClassId: params.academicClassId,
    status: 'ACTIVE',
  };
  if (params.academicGroupId) where.academicGroupId = params.academicGroupId;
  if (params.branchId) where.branchId = params.branchId;

  const enrollments = await prisma.studentEnrollment.findMany({
    where,
    include: {
      student: {
        select: {
          id: true,
          studentIdCode: true,
          name: true,
          banglaName: true,
          phone: true,
          gender: true,
          status: true,
        },
      },
    },
    orderBy: { rollNumber: 'asc' },
  });

  return enrollments.map((e) => ({
    id: e.student.id,
    studentIdCode: e.student.studentIdCode,
    name: e.student.name,
    banglaName: e.student.banglaName,
    phone: e.student.phone,
    gender: e.student.gender,
    roll: e.rollNumber || '',
  }));
}

/**
 * Atomically create an exam, its subjects, and enroll eligible students
 */
export async function createExam(
  coachingCenterId: string,
  input: CreateExamInput,
  actorId: string,
  branchId?: string
) {
  // Validate unique subjects
  const subjectIds = input.subjects.map((s) => s.subjectId);
  const uniqueSubjects = new Set(subjectIds);
  if (uniqueSubjects.size !== subjectIds.length) {
    throw new Error('DUPLICATE_SUBJECT: A subject cannot appear twice in the same exam.');
  }

  // Verify all subjects belong to this center
  const existingSubjects = await prisma.subject.findMany({
    where: {
      id: { in: subjectIds },
      coachingCenterId,
      academicClassId: input.academicClassId,
    },
  });
  if (existingSubjects.length !== subjectIds.length) {
    throw new Error('INVALID_SUBJECT: One or more selected subjects do not belong to this class context.');
  }

  // Resolve eligible students
  let finalStudentIds: string[] = [];
  if (input.selectionMode === 'ALL_ELIGIBLE') {
    const eligible = await getEligibleStudents(coachingCenterId, {
      academicSessionId: input.academicSessionId,
      academicProgramId: input.academicProgramId,
      academicClassId: input.academicClassId,
      academicGroupId: input.academicGroupId || undefined,
      batchId: input.batchId || undefined,
      branchId: input.branchId || branchId,
    });
    finalStudentIds = eligible.map((s) => s.id);
  } else {
    finalStudentIds = input.studentIds || [];
  }

  const effectiveBranchId = input.branchId || branchId || null;

  return prisma.$transaction(
    async (tx) => {
      // 1. Create Exam record
      const exam = await tx.exam.create({
        data: {
          coachingCenterId,
          branchId: effectiveBranchId,
          academicSessionId: input.academicSessionId,
          academicProgramId: input.academicProgramId,
          academicClassId: input.academicClassId,
          academicGroupId: input.academicGroupId || null,
          batchId: input.batchId || null,
          title: input.title,
          banglaTitle: input.banglaTitle || null,
          examType: input.examType,
          status: EXAM_STATUS.DRAFT,
          startDate: input.startDate ? new Date(input.startDate) : new Date(),
          endDate: input.endDate ? new Date(input.endDate) : null,
          totalMarks: input.totalMarks,
          passMarks: input.passMarks,
        },
      });

      // 2. Create ExamSubjects
      const createdSubjects = await Promise.all(
        input.subjects.map((s) =>
          tx.examSubject.create({
            data: {
              examId: exam.id,
              subjectId: s.subjectId,
              examDate: s.examDate ? new Date(s.examDate) : null,
              startTime: s.startTime || null,
              durationMinutes: s.durationMinutes ?? (s as any).duration ?? 60,
              totalMarks: s.totalMarks ?? 100,
              passMarks: s.passMarks ?? 40,
            },
          })
        )
      );

      // 3. Create ExamStudent records & initialize Result rows for each (subject, student)
      if (finalStudentIds.length > 0) {
        // Enrolled students
        await tx.examStudent.createMany({
          data: finalStudentIds.map((sid) => ({
            examId: exam.id,
            studentId: sid,
          })),
          skipDuplicates: true,
        });

        // Initialize Result rows
        const resultRows: any[] = [];
        for (const sub of createdSubjects) {
          for (const sid of finalStudentIds) {
            resultRows.push({
              examSubjectId: sub.id,
              studentId: sid,
              status: 'PRESENT',
              marksObtained: null,
              isPassed: false,
            });
          }
        }

        if (resultRows.length > 0) {
          await tx.result.createMany({
            data: resultRows,
            skipDuplicates: true,
          });
        }
      }

      // 4. Audit Log
      await recordAuditLog({
        coachingCenterId,
        userId: actorId,
        action: 'EXAM_CREATED',
        entity: 'Exam',
        entityId: exam.id,
        details: {
          title: exam.title,
          examType: exam.examType,
          subjectsCount: createdSubjects.length,
          studentsCount: finalStudentIds.length,
          batchId: exam.batchId,
        },
      });

      return {
        ...exam,
        examSubjects: createdSubjects,
        examStudents: finalStudentIds.map((sid) => ({ examId: exam.id, studentId: sid })),
      };
    },
    { maxWait: 10000, timeout: 45000 }
  );
}

/**
 * Update exam basic details (only allowed in DRAFT or SCHEDULED status)
 */
export async function updateExam(
  coachingCenterId: string,
  examId: string,
  input: UpdateExamInput,
  actorId: string,
  branchId?: string
) {
  const where: any = { id: examId, coachingCenterId };
  if (branchId) where.branchId = branchId;

  const existing = await prisma.exam.findFirst({ where });
  if (!existing) {
    throw new Error('EXAM_NOT_FOUND');
  }

  if (existing.status !== EXAM_STATUS.DRAFT && existing.status !== EXAM_STATUS.SCHEDULED) {
    throw new Error('CANNOT_EDIT: Exams can only be edited in DRAFT or SCHEDULED status.');
  }

  const updated = await prisma.exam.update({
    where: { id: examId },
    data: {
      title: input.title !== undefined ? input.title : undefined,
      banglaTitle: input.banglaTitle !== undefined ? input.banglaTitle : undefined,
      examType: input.examType !== undefined ? input.examType : undefined,
      academicGroupId: input.academicGroupId !== undefined ? input.academicGroupId || null : undefined,
      batchId: input.batchId !== undefined ? input.batchId || null : undefined,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate !== undefined ? (input.endDate ? new Date(input.endDate) : null) : undefined,
      totalMarks: input.totalMarks !== undefined ? input.totalMarks : undefined,
      passMarks: input.passMarks !== undefined ? input.passMarks : undefined,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'EXAM_UPDATED',
    entity: 'Exam',
    entityId: examId,
    details: input as Record<string, unknown>,
  });

  // Only the exam DATE actually matters to guardians — and only once the
  // exam is already SCHEDULED (a DRAFT edit hasn't been announced yet).
  if (existing.status === EXAM_STATUS.SCHEDULED && input.startDate) {
    const newStart = new Date(input.startDate);
    if (!existing.startDate || newStart.getTime() !== existing.startDate.getTime()) {
      const examStudents = await prisma.examStudent.findMany({
        where: { examId },
        include: { student: { select: { id: true, name: true } } },
      });
      for (const es of examStudents) {
        await notifyStudentGuardians({
          coachingCenterId,
          branchId: existing.branchId,
          studentId: es.studentId,
          event: 'EXAM_UPDATED',
          vars: { studentName: es.student.name, examName: updated.title, examDate: newStart.toISOString().slice(0, 10) },
          triggeredById: actorId,
          sourceType: 'Exam',
          sourceId: examId,
        });
      }
    }
  }

  return updated;
}

/**
 * Transition exam lifecycle with strict state machine validation
 */
export async function transitionExamStatus(
  coachingCenterId: string,
  examId: string,
  targetStatus: string,
  actorId: string,
  userRole: string,
  reason?: string
) {
  const exam = await prisma.exam.findFirst({
    where: { id: examId, coachingCenterId },
    include: {
      examSubjects: true,
      examStudents: { include: { student: { select: { id: true, name: true } } } },
    },
  });

  if (!exam) {
    throw new Error('EXAM_NOT_FOUND');
  }

  const currentStatus = exam.status;
  const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];

  if (!allowed.includes(targetStatus)) {
    throw new Error(
      `INVALID_TRANSITION: Cannot transition exam from ${currentStatus} to ${targetStatus}.`
    );
  }

  // Elevated role requirement for reopening published/completed exams
  if (currentStatus === EXAM_STATUS.PUBLISHED || (currentStatus === EXAM_STATUS.COMPLETED && targetStatus === EXAM_STATUS.ONGOING)) {
    if (userRole !== 'OWNER' && userRole !== 'ADMIN') {
      throw new Error('FORBIDDEN: Only Center Owner or Admin can reopen completed or published exams.');
    }
  }

  // Pre-condition validations
  if (targetStatus === EXAM_STATUS.SCHEDULED) {
    if (exam.examSubjects.length === 0) {
      throw new Error('EXAM_HAS_NO_SUBJECTS: Cannot schedule an exam with zero subjects.');
    }
  }

  const updated = await prisma.exam.update({
    where: { id: examId },
    data: {
      status: targetStatus,
      publishedAt: targetStatus === EXAM_STATUS.PUBLISHED ? new Date() : undefined,
    },
  });

  let auditAction = `EXAM_${targetStatus}`;
  if (currentStatus === EXAM_STATUS.PUBLISHED && targetStatus !== EXAM_STATUS.PUBLISHED) {
    auditAction = 'RESULTS_REOPENED';
  }

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: auditAction,
    entity: 'Exam',
    entityId: examId,
    details: {
      fromStatus: currentStatus,
      toStatus: targetStatus,
      reason: reason || null,
    },
  });

  if (targetStatus === EXAM_STATUS.SCHEDULED || targetStatus === EXAM_STATUS.CANCELLED) {
    const event = targetStatus === EXAM_STATUS.SCHEDULED ? 'EXAM_SCHEDULED' : 'EXAM_CANCELLED';
    const examDate = exam.examSubjects.find((s) => s.examDate)?.examDate ?? exam.startDate;
    for (const es of exam.examStudents) {
      await notifyStudentGuardians({
        coachingCenterId,
        branchId: exam.branchId,
        studentId: es.studentId,
        event,
        vars: {
          studentName: es.student.name,
          examName: exam.title,
          examDate: examDate ? examDate.toISOString().slice(0, 10) : '',
        },
        triggeredById: actorId,
        sourceType: 'Exam',
        sourceId: examId,
      });
    }
  }

  return updated;
}

/**
 * Add a new subject to an existing DRAFT or SCHEDULED exam
 */
export async function addExamSubject(
  coachingCenterId: string,
  examId: string,
  input: AddExamSubjectInput,
  actorId: string
) {
  const exam = await prisma.exam.findFirst({
    where: { id: examId, coachingCenterId },
    include: { examStudents: true },
  });
  if (!exam) throw new Error('EXAM_NOT_FOUND');

  if (exam.status !== EXAM_STATUS.DRAFT && exam.status !== EXAM_STATUS.SCHEDULED) {
    throw new Error('CANNOT_ADD_SUBJECT: Subjects can only be added when exam is in DRAFT or SCHEDULED status.');
  }

  // Verify subject doesn't already exist
  const existing = await prisma.examSubject.findUnique({
    where: {
      examId_subjectId: {
        examId,
        subjectId: input.subjectId,
      },
    },
  });
  if (existing) {
    throw new Error('DUPLICATE_SUBJECT: This subject is already assigned to this exam.');
  }

  return prisma.$transaction(async (tx) => {
    const examSubject = await tx.examSubject.create({
      data: {
        examId,
        subjectId: input.subjectId,
        examDate: input.examDate ? new Date(input.examDate) : null,
        startTime: input.startTime || null,
        durationMinutes: input.durationMinutes,
        totalMarks: input.totalMarks,
        passMarks: input.passMarks,
      },
      include: {
        subject: { select: { id: true, name: true, banglaName: true, code: true } },
      },
    });

    // Create Result records for all currently enrolled students
    if (exam.examStudents.length > 0) {
      await tx.result.createMany({
        data: exam.examStudents.map((es) => ({
          examSubjectId: examSubject.id,
          studentId: es.studentId,
          status: 'PRESENT',
          marksObtained: null,
          isPassed: false,
        })),
        skipDuplicates: true,
      });
    }

    await recordAuditLog({
      coachingCenterId,
      userId: actorId,
      action: 'EXAM_SUBJECT_CREATED',
      entity: 'ExamSubject',
      entityId: examSubject.id,
      details: { examId, subjectId: input.subjectId },
    });

    return examSubject;
  });
}

/**
 * Update an exam subject
 */
export async function updateExamSubject(
  coachingCenterId: string,
  examId: string,
  examSubjectId: string,
  input: UpdateExamSubjectInput,
  actorId: string
) {
  const exam = await prisma.exam.findFirst({
    where: { id: examId, coachingCenterId },
  });
  if (!exam) throw new Error('EXAM_NOT_FOUND');

  if (exam.status === EXAM_STATUS.PUBLISHED) {
    throw new Error('CANNOT_UPDATE_PUBLISHED: Exam results are already published.');
  }

  const updated = await prisma.examSubject.update({
    where: { id: examSubjectId },
    data: {
      examDate: input.examDate !== undefined ? (input.examDate ? new Date(input.examDate) : null) : undefined,
      startTime: input.startTime !== undefined ? input.startTime : undefined,
      durationMinutes: input.durationMinutes !== undefined ? input.durationMinutes : undefined,
      totalMarks: input.totalMarks !== undefined ? input.totalMarks : undefined,
      passMarks: input.passMarks !== undefined ? input.passMarks : undefined,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'EXAM_SUBJECT_UPDATED',
    entity: 'ExamSubject',
    entityId: examSubjectId,
    details: { examId, ...input },
  });

  return updated;
}

/**
 * Delete an exam subject
 */
export async function deleteExamSubject(
  coachingCenterId: string,
  examId: string,
  examSubjectId: string,
  actorId: string
) {
  const exam = await prisma.exam.findFirst({
    where: { id: examId, coachingCenterId },
  });
  if (!exam) throw new Error('EXAM_NOT_FOUND');

  if (exam.status !== EXAM_STATUS.DRAFT && exam.status !== EXAM_STATUS.SCHEDULED) {
    throw new Error('CANNOT_DELETE_SUBJECT: Subjects can only be removed while exam is in DRAFT or SCHEDULED status.');
  }

  await prisma.examSubject.delete({
    where: { id: examSubjectId },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'EXAM_SUBJECT_DELETED',
    entity: 'ExamSubject',
    entityId: examSubjectId,
    details: { examId },
  });

  return { success: true };
}

/**
 * Enroll additional students into an exam
 */
export async function enrollStudentsToExam(
  coachingCenterId: string,
  examId: string,
  studentIds: string[],
  actorId: string
) {
  const exam = await prisma.exam.findFirst({
    where: { id: examId, coachingCenterId },
    include: { examSubjects: true },
  });
  if (!exam) throw new Error('EXAM_NOT_FOUND');

  if (exam.status === EXAM_STATUS.PUBLISHED || exam.status === EXAM_STATUS.CANCELLED) {
    throw new Error('CANNOT_ENROLL: Students cannot be added to a published or cancelled exam.');
  }

  return prisma.$transaction(async (tx) => {
    await tx.examStudent.createMany({
      data: studentIds.map((sid) => ({
        examId,
        studentId: sid,
      })),
      skipDuplicates: true,
    });

    // Initialize result records for newly enrolled students
    const resultRows: any[] = [];
    for (const sub of exam.examSubjects) {
      for (const sid of studentIds) {
        resultRows.push({
          examSubjectId: sub.id,
          studentId: sid,
          status: 'PRESENT',
          marksObtained: null,
          isPassed: false,
        });
      }
    }

    if (resultRows.length > 0) {
      await tx.result.createMany({
        data: resultRows,
        skipDuplicates: true,
      });
    }

    await recordAuditLog({
      coachingCenterId,
      userId: actorId,
      action: 'EXAM_STUDENTS_ASSIGNED',
      entity: 'Exam',
      entityId: examId,
      details: { addedCount: studentIds.length },
    });

    return { enrolledCount: studentIds.length };
  });
}
