import prisma from '@/lib/db';
import { recordAuditLog } from './audit.service';
import { notifyStudentGuardians } from './guardian-notify.service';
import { EXAM_STATUS } from '@/lib/validations/exam';
import type { ResultEntryInput, ResultFilterParams } from '@/lib/validations/result';
import type { SessionUser } from '@/lib/auth/session';
import {
  getCoachingCenterGradingConfig,
  calculateSubjectGrade,
  calculateHighestMarks,
  calculateCompetitionRanking,
  calculateOverallExamResult,
} from './result-calculation.service';

/**
 * Validate teacher authorization for entering/editing subject marks
 */
export async function assertTeacherSubjectAccess(
  coachingCenterId: string,
  user: SessionUser,
  batchId: string | null,
  subjectId: string
): Promise<void> {
  // Center-wide administrative roles
  if (user.role === 'OWNER' || user.role === 'ADMIN' || user.role === 'STAFF') {
    return;
  }

  if (user.role === 'TEACHER') {
    const teacher = await prisma.teacher.findFirst({
      where: {
        coachingCenterId,
        userId: user.userId,
      },
    });

    if (!teacher) {
      throw new Error('FORBIDDEN_TEACHER: No teacher profile associated with this account.');
    }

    // If exam has a batch, verify teacher is assigned to this batch and subject
    if (batchId) {
      const assignment = await prisma.batchTeacherAssignment.findFirst({
        where: {
          coachingCenterId,
          teacherId: teacher.id,
          batchId,
          subjectId,
          status: 'ACTIVE',
        },
      });

      if (!assignment) {
        throw new Error('FORBIDDEN_TEACHER: You are not assigned to teach this subject in this batch.');
      }
    } else {
      // If no batch (e.g. center/class exam), verify teacher teaches this subject
      const teacherSub = await prisma.teacherSubject.findFirst({
        where: {
          teacherId: teacher.id,
          subjectId,
        },
      });

      if (!teacherSub) {
        throw new Error('FORBIDDEN_TEACHER: You are not assigned to teach this subject.');
      }
    }
  }
}

/**
 * Subjects a TEACHER is authorized for: their TeacherSubject records plus any
 * subject they hold an ACTIVE BatchTeacherAssignment for. Returns null for
 * OWNER/ADMIN/STAFF (no subject restriction) — the same role split as
 * assertTeacherSubjectAccess above.
 */
export async function getTeacherAuthorizedSubjectIds(
  coachingCenterId: string,
  user: SessionUser
): Promise<string[] | null> {
  if (user.role !== 'TEACHER') return null;

  const teacher = await prisma.teacher.findFirst({
    where: { coachingCenterId, userId: user.userId },
    select: { id: true },
  });
  if (!teacher) return [];

  const [teacherSubjects, assignments] = await Promise.all([
    prisma.teacherSubject.findMany({ where: { teacherId: teacher.id }, select: { subjectId: true } }),
    prisma.batchTeacherAssignment.findMany({
      where: { coachingCenterId, teacherId: teacher.id, status: 'ACTIVE' },
      select: { subjectId: true },
    }),
  ]);

  return Array.from(new Set([...teacherSubjects, ...assignments].map((r) => r.subjectId)));
}

/**
 * Get results and marks entry roster for a specific ExamSubject
 */
export async function getExamSubjectResults(
  coachingCenterId: string,
  examId: string,
  examSubjectId: string,
  user: SessionUser
) {
  const examSubject = await prisma.examSubject.findFirst({
    where: {
      id: examSubjectId,
      examId,
      exam: { coachingCenterId },
    },
    include: {
      exam: {
        include: {
          academicSession: { select: { id: true, name: true } },
          academicProgram: { select: { id: true, name: true, banglaName: true } },
          academicClass: { select: { id: true, name: true, banglaName: true } },
          batch: { select: { id: true, name: true, code: true } },
          branch: { select: { id: true, name: true, code: true } },
        },
      },
      subject: { select: { id: true, name: true, banglaName: true, code: true } },
      results: {
        include: {
          student: {
            select: {
              id: true,
              studentIdCode: true,
              name: true,
              banglaName: true,
              gender: true,
              phone: true,
            },
          },
        },
      },
    },
  });

  if (!examSubject) {
    throw new Error('EXAM_SUBJECT_NOT_FOUND');
  }

  // Teacher authorization check
  await assertTeacherSubjectAccess(
    coachingCenterId,
    user,
    examSubject.exam.batchId,
    examSubject.subjectId
  );

  // Load all enrolled students in the exam to ensure full roster even if results table has new students
  const enrolledStudents = await prisma.examStudent.findMany({
    where: { examId },
    include: {
      student: {
        select: {
          id: true,
          studentIdCode: true,
          name: true,
          banglaName: true,
          gender: true,
          phone: true,
        },
      },
    },
    orderBy: { rollNumber: 'asc' },
  });

  const resultMap = new Map(examSubject.results.map((r) => [r.studentId, r]));

  const roster = enrolledStudents.map((es, idx) => {
    const res = resultMap.get(es.studentId);
    return {
      studentId: es.studentId,
      rollNumber: es.rollNumber || (idx + 1).toString(),
      studentIdCode: es.student.studentIdCode,
      name: es.student.name,
      banglaName: es.student.banglaName,
      gender: es.student.gender,
      phone: es.student.phone,
      resultId: res?.id || null,
      status: res?.status || 'PRESENT',
      marksObtained: res?.marksObtained !== null && res?.marksObtained !== undefined ? Number(res.marksObtained) : null,
      grade: res?.grade || null,
      gpa: res?.gpa !== null && res?.gpa !== undefined ? Number(res.gpa) : null,
      isPassed: res?.isPassed ?? false,
      remarks: res?.remarks || '',
    };
  });

  const validMarks = roster
    .map((r) => r.marksObtained)
    .filter((m): m is number => m !== null && m !== undefined);

  return {
    exam: {
      id: examSubject.exam.id,
      title: examSubject.exam.title,
      banglaTitle: examSubject.exam.banglaTitle,
      examType: examSubject.exam.examType,
      status: examSubject.exam.status,
      startDate: examSubject.exam.startDate,
      endDate: examSubject.exam.endDate,
      session: examSubject.exam.academicSession.name,
      program: examSubject.exam.academicProgram.name,
      class: examSubject.exam.academicClass.name,
      batch: examSubject.exam.batch?.name || null,
      branch: examSubject.exam.branch?.name || null,
    },
    subject: {
      id: examSubject.id,
      subjectId: examSubject.subjectId,
      name: examSubject.subject.name,
      banglaName: examSubject.subject.banglaName,
      code: examSubject.subject.code,
      examDate: examSubject.examDate,
      startTime: examSubject.startTime,
      durationMinutes: examSubject.durationMinutes,
      totalMarks: Number(examSubject.totalMarks),
      passMarks: Number(examSubject.passMarks),
    },
    roster,
    stats: {
      totalEnrolled: roster.length,
      enteredCount: roster.filter((r) => r.status === 'ABSENT' || r.status === 'EXCUSED' || r.marksObtained !== null).length,
      pendingCount: roster.filter((r) => r.status === 'PRESENT' && r.marksObtained === null).length,
      absentCount: roster.filter((r) => r.status === 'ABSENT').length,
      highestMark: validMarks.length > 0 ? Math.max(...validMarks) : null,
      averageMark:
        validMarks.length > 0
          ? Number((validMarks.reduce((a, b) => a + b, 0) / validMarks.length).toFixed(2))
          : null,
    },
  };
}

/**
 * Bulk save validated subject results with server-side calculation of Grade, GPA, Pass/Fail, and Highest Marks
 */
export async function bulkSaveSubjectResults(
  coachingCenterId: string,
  examId: string,
  examSubjectId: string,
  entries: ResultEntryInput[],
  user: SessionUser
) {
  const examSubject = await prisma.examSubject.findFirst({
    where: {
      id: examSubjectId,
      examId,
      exam: { coachingCenterId },
    },
    include: {
      exam: true,
      subject: true,
    },
  });

  if (!examSubject) {
    throw new Error('EXAM_SUBJECT_NOT_FOUND');
  }

  // Teacher authorization check
  await assertTeacherSubjectAccess(
    coachingCenterId,
    user,
    examSubject.exam.batchId,
    examSubject.subjectId
  );

  // State validation: exams in CANCELLED or DRAFT cannot accept marks
  if (examSubject.exam.status === EXAM_STATUS.CANCELLED) {
    throw new Error('CANNOT_ENTER_MARKS: This examination has been cancelled.');
  }
  if (examSubject.exam.status === EXAM_STATUS.DRAFT) {
    throw new Error('CANNOT_ENTER_MARKS: Exam is in DRAFT. Please schedule or start the exam first.');
  }

  // Editing published results requires OWNER or ADMIN
  const isPostPublication = examSubject.exam.status === EXAM_STATUS.PUBLISHED;
  if (isPostPublication && user.role !== 'OWNER' && user.role !== 'ADMIN') {
    throw new Error('FORBIDDEN: Modifying published exam results requires Center Owner or Admin privileges.');
  }

  const totalMarks = Number(examSubject.totalMarks);
  const passMarks = Number(examSubject.passMarks);

  // Validate all marks are <= totalMarks and not negative
  for (const entry of entries) {
    if (entry.status === 'PRESENT' && entry.marksObtained !== null && entry.marksObtained !== undefined) {
      if (entry.marksObtained < 0) {
        throw new Error(`INVALID_MARKS: Negative marks are not allowed (Student: ${entry.studentId}).`);
      }
      if (entry.marksObtained > totalMarks) {
        throw new Error(
          `INVALID_MARKS: Marks obtained (${entry.marksObtained}) exceeds total marks (${totalMarks}).`
        );
      }
    }
  }

  const gradingConfig = await getCoachingCenterGradingConfig(coachingCenterId);

  // Perform updates inside transaction
  return prisma.$transaction(
    async (tx) => {
      const processedResults: any[] = [];

      for (const entry of entries) {
        let marks: number | null = null;
        let grade: string | null = null;
        let gpa: number | null = null;
        let isPassed = false;

        if (entry.status === 'PRESENT') {
          marks = entry.marksObtained !== undefined ? entry.marksObtained : null;
          if (marks !== null) {
            const calculated = calculateSubjectGrade(marks, totalMarks, passMarks, gradingConfig);
            grade = calculated.grade;
            gpa = calculated.gpa;
            isPassed = calculated.isPassed;
          }
        } else {
          // ABSENT or EXCUSED
          marks = null;
          grade = 'F';
          gpa = 0.0;
          isPassed = false;
        }

        const upserted = await tx.result.upsert({
          where: {
            examSubjectId_studentId: {
              examSubjectId,
              studentId: entry.studentId,
            },
          },
          create: {
            examSubjectId,
            studentId: entry.studentId,
            status: entry.status,
            marksObtained: marks !== null ? marks : undefined,
            grade,
            gpa: gpa !== null ? gpa : undefined,
            isPassed,
            remarks: entry.remarks || null,
          },
          update: {
            status: entry.status,
            marksObtained: marks !== null ? marks : null,
            grade,
            gpa: gpa !== null ? gpa : null,
            isPassed,
            remarks: entry.remarks || null,
          },
        });

        processedResults.push(upserted);
      }

      // Calculate and update highest marks across all valid results for this subject
      const allSubjectResults = await tx.result.findMany({
        where: {
          examSubjectId,
          status: 'PRESENT',
          marksObtained: { not: null },
        },
        select: { marksObtained: true },
      });

      const validMarks = allSubjectResults
        .map((r) => (r.marksObtained !== null ? Number(r.marksObtained) : null))
        .filter((m): m is number => m !== null);

      const highestMark = calculateHighestMarks(validMarks);

      if (highestMark !== null) {
        await tx.result.updateMany({
          where: { examSubjectId },
          data: { highestMarks: highestMark },
        });
      }

      // Audit Log
      await recordAuditLog({
        coachingCenterId,
        userId: user.userId,
        action: isPostPublication ? 'RESULTS_UPDATED' : 'RESULTS_SAVED',
        entity: 'ExamSubject',
        entityId: examSubjectId,
        details: {
          examId,
          subjectId: examSubject.subjectId,
          count: entries.length,
          isPostPublication,
          highestMark,
        },
      });

      return {
        savedCount: processedResults.length,
        highestMark,
      };
    },
    { maxWait: 10000, timeout: 45000 }
  );
}

/**
 * Pre-publication check: returns completeness summary and warnings
 */
export async function getExamPublishStatus(coachingCenterId: string, examId: string) {
  const exam = await prisma.exam.findFirst({
    where: { id: examId, coachingCenterId },
    include: {
      examSubjects: {
        include: {
          subject: { select: { id: true, name: true, banglaName: true } },
          results: true,
        },
      },
      examStudents: true,
    },
  });

  if (!exam) throw new Error('EXAM_NOT_FOUND');

  const totalStudents = exam.examStudents.length;
  let totalMissing = 0;

  const subjectBreakdown = exam.examSubjects.map((sub) => {
    const entered = sub.results.filter(
      (r) => r.status === 'ABSENT' || r.status === 'EXCUSED' || r.marksObtained !== null
    ).length;
    const missing = Math.max(0, totalStudents - entered);
    totalMissing += missing;

    return {
      subjectId: sub.id,
      name: sub.subject.name,
      banglaName: sub.subject.banglaName,
      totalEnrolled: totalStudents,
      enteredCount: entered,
      missingCount: missing,
      isComplete: missing === 0,
    };
  });

  return {
    examId,
    title: exam.title,
    status: exam.status,
    totalStudents,
    totalSubjects: exam.examSubjects.length,
    totalMissing,
    isReadyForPublish: totalStudents > 0 && exam.examSubjects.length > 0 && totalMissing === 0,
    subjectBreakdown,
  };
}

/**
 * Verify prerequisites, compute overall competition ranking, and publish exam results
 */
export async function verifyAndPublishExam(
  coachingCenterId: string,
  examId: string,
  actorId: string,
  allowIncomplete: boolean = false
) {
  const exam = await prisma.exam.findFirst({
    where: { id: examId, coachingCenterId },
    include: {
      examSubjects: {
        include: {
          results: true,
        },
      },
      examStudents: {
        include: {
          student: true,
        },
      },
    },
  });

  if (!exam) throw new Error('EXAM_NOT_FOUND');

  if (exam.status === EXAM_STATUS.CANCELLED) {
    throw new Error('CANNOT_PUBLISH_CANCELLED: A cancelled exam cannot be published.');
  }

  if (exam.examSubjects.length === 0) {
    throw new Error('NO_SUBJECTS: Cannot publish an exam with zero subjects.');
  }

  if (exam.examStudents.length === 0) {
    throw new Error('NO_STUDENTS: Cannot publish an exam with zero enrolled students.');
  }

  // Completeness check
  const publishStatus = await getExamPublishStatus(coachingCenterId, examId);
  if (!publishStatus.isReadyForPublish && !allowIncomplete) {
    throw new Error(
      `INCOMPLETE_RESULTS: There are ${publishStatus.totalMissing} pending marks. Please enter all marks or confirm incomplete publication.`
    );
  }

  // Calculate overall performance & competition ranking for all enrolled students
  const studentTotalMarks: Array<{
    studentId: string;
    totalMarks: number;
    isValid: boolean;
  }> = [];

  for (const es of exam.examStudents) {
    let studentSum = 0;
    let hasValidMarks = false;
    let allAbsent = true;

    for (const sub of exam.examSubjects) {
      const r = sub.results.find((res) => res.studentId === es.studentId);
      if (r && r.status === 'PRESENT' && r.marksObtained !== null) {
        studentSum += Number(r.marksObtained);
        hasValidMarks = true;
        allAbsent = false;
      }
    }

    studentTotalMarks.push({
      studentId: es.studentId,
      totalMarks: studentSum,
      isValid: hasValidMarks && !allAbsent,
    });
  }

  // Standard Competition Ranking: 1, 2, 2, 4
  const rankMap = calculateCompetitionRanking(studentTotalMarks);

  // Apply ranks and publish inside transaction
  const result = await prisma.$transaction(
    async (tx) => {
      // Update ranks on results records
      for (const [studentId, rank] of rankMap.entries()) {
        await tx.result.updateMany({
          where: {
            studentId,
            examSubject: { examId },
          },
          data: { rank },
        });
      }

      // Transition exam to PUBLISHED
      const published = await tx.exam.update({
        where: { id: examId },
        data: {
          status: EXAM_STATUS.PUBLISHED,
          publishedAt: new Date(),
        },
      });

      // Audit Log
      await recordAuditLog({
        coachingCenterId,
        userId: actorId,
        action: 'RESULTS_PUBLISHED',
        entity: 'Exam',
        entityId: examId,
        details: {
          totalStudents: exam.examStudents.length,
          rankedStudents: rankMap.size,
          incompleteAllowed: allowIncomplete,
          missingCount: publishStatus.totalMissing,
        },
      });

      return published;
    },
    { maxWait: 10000, timeout: 45000 }
  );

  for (const es of exam.examStudents) {
    await notifyStudentGuardians({
      coachingCenterId,
      branchId: exam.branchId,
      studentId: es.studentId,
      event: 'RESULT_PUBLISHED',
      vars: { studentName: es.student.name, examName: exam.title, resultDate: new Date().toISOString().slice(0, 10) },
      triggeredById: actorId,
      sourceType: 'Exam',
      sourceId: examId,
    });
  }

  return result;
}

/**
 * Get comprehensive student exam result history (with student portal privacy guard)
 */
export async function getStudentResultHistory(
  coachingCenterId: string,
  studentId: string,
  isStudentPortal: boolean = false
) {
  const where: any = {
    studentId,
    examSubject: {
      exam: {
        coachingCenterId,
        ...(isStudentPortal ? { status: EXAM_STATUS.PUBLISHED } : {}),
      },
    },
  };

  const results = await prisma.result.findMany({
    where,
    include: {
      examSubject: {
        include: {
          exam: {
            include: {
              academicSession: { select: { name: true } },
              academicProgram: { select: { name: true, banglaName: true } },
              academicClass: { select: { name: true, banglaName: true } },
              batch: { select: { name: true, code: true } },
            },
          },
          subject: { select: { id: true, name: true, banglaName: true, code: true } },
        },
      },
    },
    orderBy: { examSubject: { examDate: 'desc' } },
  });

  // Group by Exam
  const examMap = new Map<string, any>();

  for (const r of results) {
    const exam = r.examSubject.exam;
    if (!examMap.has(exam.id)) {
      examMap.set(exam.id, {
        examId: exam.id,
        title: exam.title,
        banglaTitle: exam.banglaTitle,
        examType: exam.examType,
        status: exam.status,
        startDate: exam.startDate,
        publishedAt: exam.publishedAt,
        session: exam.academicSession.name,
        program: exam.academicProgram.name,
        class: exam.academicClass.name,
        batch: exam.batch?.name || null,
        rank: r.rank,
        subjects: [],
      });
    }

    const group = examMap.get(exam.id);
    group.subjects.push({
      resultId: r.id,
      subjectId: r.examSubject.subject.id,
      subjectName: r.examSubject.subject.name,
      subjectBanglaName: r.examSubject.subject.banglaName,
      subjectCode: r.examSubject.subject.code,
      status: r.status,
      marksObtained: r.marksObtained !== null ? Number(r.marksObtained) : null,
      highestMarks: r.highestMarks !== null ? Number(r.highestMarks) : null,
      totalMarks: Number(r.examSubject.totalMarks),
      passMarks: Number(r.examSubject.passMarks),
      grade: r.grade,
      gpa: r.gpa !== null ? Number(r.gpa) : null,
      isPassed: r.isPassed,
      rank: r.rank,
      remarks: r.remarks,
    });
  }

  // Calculate overall performance summary per exam
  const examHistory = Array.from(examMap.values()).map((e) => {
    const overall = calculateOverallExamResult(e.subjects);
    return {
      ...e,
      overall,
    };
  });

  return examHistory;
}

/**
 * Get genuine batch performance metrics calculated directly from database Result records
 */
export async function getBatchPerformanceStats(coachingCenterId: string, batchId: string) {
  const batch = await prisma.batch.findFirst({
    where: { id: batchId, coachingCenterId },
    include: {
      studentBatches: { where: { status: 'ACTIVE' } },
      exams: {
        include: {
          examSubjects: {
            include: {
              subject: { select: { id: true, name: true, banglaName: true } },
              results: {
                where: { status: 'PRESENT', marksObtained: { not: null } },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!batch) throw new Error('BATCH_NOT_FOUND');

  const totalStudents = batch.studentBatches.length;

  let totalMarksObtained = 0;
  let totalPossibleMarks = 0;
  let totalPassCount = 0;
  let totalResultsCount = 0;
  let globalHighestMark = 0;
  let completedExamsCount = 0;

  const subjectStatsMap = new Map<string, { name: string; totalMarks: number; obtainedMarks: number; count: number }>();

  const examsBreakdown = batch.exams.map((exam) => {
    const isCompletedOrPublished = exam.status === 'COMPLETED' || exam.status === 'PUBLISHED';
    let examResultsCount = 0;

    if (isCompletedOrPublished) {
      completedExamsCount++;
      for (const es of exam.examSubjects) {
        const subName = es.subject.name;
        if (!subjectStatsMap.has(subName)) {
          subjectStatsMap.set(subName, { name: subName, totalMarks: 0, obtainedMarks: 0, count: 0 });
        }
        const subStat = subjectStatsMap.get(subName)!;

        for (const res of es.results) {
          if (res.marksObtained !== null) {
            const marks = Number(res.marksObtained);
            const tMarks = Number(es.totalMarks);
            totalMarksObtained += marks;
            totalPossibleMarks += tMarks;
            totalResultsCount++;
            examResultsCount++;
            if (res.isPassed) totalPassCount++;
            if (marks > globalHighestMark) globalHighestMark = marks;

            subStat.obtainedMarks += marks;
            subStat.totalMarks += tMarks;
            subStat.count++;
          }
        }
      }
    } else {
      for (const es of exam.examSubjects) {
        examResultsCount += es.results.length;
      }
    }

    return {
      id: exam.id,
      title: exam.title,
      banglaTitle: exam.banglaTitle,
      examType: exam.examType,
      status: exam.status,
      startDate: exam.startDate,
      isCompletedOrPublished,
      subjectsCount: exam.examSubjects.length,
      resultsEntered: examResultsCount,
    };
  });

  const averagePercentage =
    totalPossibleMarks > 0 ? Number(((totalMarksObtained / totalPossibleMarks) * 100).toFixed(2)) : 0;
  const passRate =
    totalResultsCount > 0 ? Number(((totalPassCount / totalResultsCount) * 100).toFixed(2)) : 0;

  const subjectAverages = Array.from(subjectStatsMap.values()).map((s) => ({
    name: s.name,
    averagePercentage: s.totalMarks > 0 ? Number(((s.obtainedMarks / s.totalMarks) * 100).toFixed(2)) : 0,
    count: s.count,
  }));

  return {
    batchId,
    batchName: batch.name,
    totalStudents,
    examsTaken: completedExamsCount,
    totalScheduledExams: batch.exams.length,
    averagePercentage,
    highestMark: globalHighestMark,
    passRate,
    subjectAverages,
    examsBreakdown,
  };
}

/**
 * Query results list with server-side pagination and multi-dimensional filters
 */
export async function getResultsList(coachingCenterId: string, params: ResultFilterParams) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
  const skip = (page - 1) * pageSize;

  const where: any = {
    examSubject: {
      exam: {
        coachingCenterId,
      },
    },
  };

  if (params.examId) where.examSubject.examId = params.examId;
  if (params.studentId) where.studentId = params.studentId;
  if (params.batchId) where.examSubject.exam.batchId = params.batchId;
  if (params.academicSessionId) where.examSubject.exam.academicSessionId = params.academicSessionId;
  if (params.academicProgramId) where.examSubject.exam.academicProgramId = params.academicProgramId;
  if (params.academicClassId) where.examSubject.exam.academicClassId = params.academicClassId;
  if (params.academicGroupId) where.examSubject.exam.academicGroupId = params.academicGroupId;
  if (params.branchId) where.examSubject.exam.branchId = params.branchId;
  if (params.examType) where.examSubject.exam.examType = params.examType;
  if (params.status) where.status = params.status;
  if (params.isPassed !== undefined && params.isPassed !== '') {
    where.isPassed = params.isPassed === 'true';
  }

  if (params.search && params.search.trim()) {
    const s = params.search.trim();
    where.OR = [
      { student: { name: { contains: s, mode: 'insensitive' } } },
      { student: { studentIdCode: { contains: s, mode: 'insensitive' } } },
      { examSubject: { exam: { title: { contains: s, mode: 'insensitive' } } } },
      { examSubject: { subject: { name: { contains: s, mode: 'insensitive' } } } },
    ];
  }

  const [total, results] = await Promise.all([
    prisma.result.count({ where }),
    prisma.result.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        student: {
          select: {
            id: true,
            studentIdCode: true,
            name: true,
            banglaName: true,
            phone: true,
          },
        },
        examSubject: {
          include: {
            exam: {
              select: {
                id: true,
                title: true,
                banglaTitle: true,
                examType: true,
                status: true,
                startDate: true,
                publishedAt: true,
                batch: { select: { id: true, name: true } },
                academicClass: { select: { id: true, name: true } },
              },
            },
            subject: {
              select: {
                id: true,
                name: true,
                banglaName: true,
                code: true,
              },
            },
          },
        },
      },
    }),
  ]);

  return {
    results: results.map((r) => ({
      id: r.id,
      studentId: r.studentId,
      studentName: r.student.name,
      studentBanglaName: r.student.banglaName,
      studentIdCode: r.student.studentIdCode,
      examId: r.examSubject.exam.id,
      examTitle: r.examSubject.exam.title,
      examBanglaTitle: r.examSubject.exam.banglaTitle,
      examType: r.examSubject.exam.examType,
      examStatus: r.examSubject.exam.status,
      startDate: r.examSubject.exam.startDate,
      batchName: r.examSubject.exam.batch?.name || null,
      className: r.examSubject.exam.academicClass.name,
      subjectName: r.examSubject.subject.name,
      subjectBanglaName: r.examSubject.subject.banglaName,
      totalMarks: Number(r.examSubject.totalMarks),
      passMarks: Number(r.examSubject.passMarks),
      marksObtained: r.marksObtained !== null ? Number(r.marksObtained) : null,
      highestMarks: r.highestMarks !== null ? Number(r.highestMarks) : null,
      grade: r.grade,
      gpa: r.gpa !== null ? Number(r.gpa) : null,
      isPassed: r.isPassed,
      rank: r.rank,
      status: r.status,
      remarks: r.remarks,
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}
