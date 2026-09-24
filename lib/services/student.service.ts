import prisma from '@/lib/db';
import { recordAuditLog } from './audit.service';
import {
  type AdmissionInput,
  type StudentUpdateInput,
  admissionSchema,
  normalizeBdPhone,
} from '@/lib/validations/student';
import type { Prisma } from '@prisma/client';

export interface StudentFilterParams {
  search?: string;
  sessionId?: string;
  programId?: string;
  classId?: string;
  groupId?: string;
  courseId?: string;
  batchId?: string;
  branchId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'name' | 'studentIdCode' | 'admissionDate' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Generates an atomic, sequential, human-readable student ID (e.g. ACC-26-00001)
 * Uses PostgreSQL row-locking on the sequence counter table to prevent race conditions.
 */
export async function generateStudentId(
  tx: Prisma.TransactionClient,
  coachingCenterId: string,
  centerCode: string,
  academicYear: number
): Promise<string> {
  const sequence = await tx.studentIdSequence.upsert({
    where: {
      coachingCenterId_academicYear: {
        coachingCenterId,
        academicYear,
      },
    },
    create: {
      coachingCenterId,
      academicYear,
      currentNumber: 1,
    },
    update: {
      currentNumber: { increment: 1 },
    },
  });

  const shortYear = String(academicYear).slice(-2);
  const formattedSeq = String(sequence.currentNumber).padStart(5, '0');
  const code = (centerCode || 'CO').trim().toUpperCase();

  return `${code}-${shortYear}-${formattedSeq}`;
}

/**
 * Creates a new student with guardian, enrollment, optional batch, and audit log
 * within a single atomic database transaction.
 */
export async function createStudentAdmission(
  coachingCenterId: string,
  rawInput: AdmissionInput,
  actorId?: string
) {
  // Validate input
  const input = admissionSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    // 1. Fetch tenant center info
    const center = await tx.coachingCenter.findUnique({
      where: { id: coachingCenterId },
      select: { id: true, code: true, name: true },
    });

    if (!center) {
      throw new Error('TENANT_NOT_FOUND');
    }

    // 2. Fetch academic session to get current year
    const session = await tx.academicSession.findFirst({
      where: { id: input.academicSessionId, coachingCenterId },
      select: { id: true, startDate: true },
    });

    const admissionYear = session?.startDate
      ? new Date(session.startDate).getFullYear()
      : new Date().getFullYear();

    // 3. Generate sequential human-readable Student ID
    const studentIdCode = await generateStudentId(
      tx,
      coachingCenterId,
      center.code,
      admissionYear
    );

    // 4. Verify branch exists and belongs to this tenant
    const branch = await tx.branch.findFirst({
      where: { id: input.branchId, coachingCenterId },
    });

    if (!branch) {
      throw new Error('BRANCH_NOT_FOUND');
    }

    // 5. Create Student record
    const student = await tx.student.create({
      data: {
        coachingCenterId,
        branchId: input.branchId,
        studentIdCode,
        name: input.name.trim(),
        banglaName: input.banglaName?.trim() || null,
        gender: input.gender || null,
        dob: input.dob ? new Date(input.dob) : null,
        bloodGroup: input.bloodGroup || null,
        religion: input.religion?.trim() || null,
        nationality: input.nationality || 'Bangladeshi',
        phone: input.phone ? normalizeBdPhone(input.phone) : null,
        email: input.email?.trim() || null,
        photoUrl: input.photoUrl?.trim() || null,
        address: input.address?.trim() || null,
        permanentAddress: input.permanentAddress?.trim() || null,
        schoolName: input.schoolName?.trim() || null,
        educationBoardId: input.educationBoardId || null,
        nidBirthReg: input.nidBirthReg?.trim() || null,
        sscRoll: input.sscRoll?.trim() || null,
        sscReg: input.sscReg?.trim() || null,
        status: 'ACTIVE',
      },
    });

    // 6. Create Primary Guardian record
    const primaryPhone = normalizeBdPhone(input.guardianPhone);
    const primaryGuardian = await tx.guardian.create({
      data: {
        coachingCenterId,
        name: input.guardianName.trim(),
        banglaName: input.guardianBanglaName?.trim() || null,
        relationship: input.guardianRelationship,
        phone: primaryPhone,
        altPhone: input.guardianAltPhone ? normalizeBdPhone(input.guardianAltPhone) : null,
        whatsapp: input.guardianWhatsapp ? normalizeBdPhone(input.guardianWhatsapp) : null,
        email: input.guardianEmail?.trim() || null,
        occupation: input.guardianOccupation?.trim() || null,
        address: input.guardianAddress?.trim() || null,
        isPrimary: true,
        isEmergency: true,
        preferredChannel: input.preferredChannel || 'SMS',
      },
    });

    // Link Primary Guardian to Student
    await tx.studentGuardian.create({
      data: {
        studentId: student.id,
        guardianId: primaryGuardian.id,
        relationship: input.guardianRelationship,
        isPrimary: true,
        isEmergencyContact: true,
        canReceiveNotifications: true,
        preferredChannel: input.preferredChannel || 'SMS',
      },
    });

    // 7. Handle Secondary Guardian if provided
    if (input.hasSecondaryGuardian && input.secondaryName && input.secondaryPhone) {
      const secPhone = normalizeBdPhone(input.secondaryPhone);
      const secondaryGuardian = await tx.guardian.create({
        data: {
          coachingCenterId,
          name: input.secondaryName.trim(),
          relationship: input.secondaryRelationship || 'OTHER',
          phone: secPhone,
          isPrimary: false,
          isEmergency: false,
          preferredChannel: 'SMS',
        },
      });

      await tx.studentGuardian.create({
        data: {
          studentId: student.id,
          guardianId: secondaryGuardian.id,
          relationship: input.secondaryRelationship || 'OTHER',
          isPrimary: false,
          isEmergencyContact: false,
          canReceiveNotifications: false,
          preferredChannel: 'SMS',
        },
      });
    }

    // 8. Create Academic Enrollment record
    const enrollment = await tx.studentEnrollment.create({
      data: {
        coachingCenterId,
        studentId: student.id,
        branchId: input.branchId,
        academicSessionId: input.academicSessionId,
        academicProgramId: input.academicProgramId,
        academicClassId: input.academicClassId,
        academicGroupId: input.academicGroupId || null,
        courseId: input.courseId || null,
        educationBoardId: input.educationBoardId || null,
        rollNumber: input.rollNumber?.trim() || null,
        admissionDate: input.admissionDate ? new Date(input.admissionDate) : new Date(),
        status: 'ENROLLED',
        remarks: input.remarks?.trim() || null,
      },
    });

    // 9. Assign Batch if selected
    if (input.batchId) {
      const batch = await tx.batch.findFirst({
        where: { id: input.batchId, coachingCenterId },
      });
      if (batch) {
        await tx.studentBatch.create({
          data: {
            coachingCenterId,
            studentId: student.id,
            batchId: batch.id,
            joinedAt: new Date(),
            status: 'ACTIVE',
          },
        });
      }
    }

    // 10. Record Audit Log
    await recordAuditLog({
      coachingCenterId,
      userId: actorId,
      action: 'STUDENT_ADMITTED',
      entity: 'Student',
      entityId: student.id,
      details: {
        studentIdCode: student.studentIdCode,
        name: student.name,
        branchId: input.branchId,
        enrollmentId: enrollment.id,
      },
    });

    return {
      ...student,
      enrollment,
      primaryGuardian,
    };
  }, {
    maxWait: 10000,
    timeout: 30000,
  });
}

/**
 * Server-side querying of students with multi-dimensional filtering,
 * server pagination, and genuine aggregate statistics (zero mock data).
 */
export async function getStudentsList(
  coachingCenterId: string,
  params: StudentFilterParams = {}
) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 15));
  const skip = (page - 1) * pageSize;

  // Build Prisma where clause
  const where: Prisma.StudentWhereInput = {
    coachingCenterId,
  };

  // Status Filter
  if (params.status && params.status !== 'all') {
    where.status = params.status;
  }

  // Branch Filter
  if (params.branchId && params.branchId !== 'all') {
    where.branchId = params.branchId;
  }

  // Academic Enrollment Filters
  const enrollmentWhere: Prisma.StudentEnrollmentWhereInput = {
    coachingCenterId,
  };
  let hasEnrollmentFilter = false;

  if (params.sessionId && params.sessionId !== 'all') {
    enrollmentWhere.academicSessionId = params.sessionId;
    hasEnrollmentFilter = true;
  }
  if (params.programId && params.programId !== 'all') {
    enrollmentWhere.academicProgramId = params.programId;
    hasEnrollmentFilter = true;
  }
  if (params.classId && params.classId !== 'all') {
    enrollmentWhere.academicClassId = params.classId;
    hasEnrollmentFilter = true;
  }
  if (params.groupId && params.groupId !== 'all') {
    enrollmentWhere.academicGroupId = params.groupId;
    hasEnrollmentFilter = true;
  }
  if (params.courseId && params.courseId !== 'all') {
    enrollmentWhere.courseId = params.courseId;
    hasEnrollmentFilter = true;
  }

  if (hasEnrollmentFilter) {
    where.enrollments = {
      some: enrollmentWhere,
    };
  }

  // Batch Filter
  if (params.batchId && params.batchId !== 'all') {
    where.studentBatches = {
      some: {
        batchId: params.batchId,
        status: 'ACTIVE',
      },
    };
  }

  // Multi-field Search Filter
  if (params.search && params.search.trim()) {
    const q = params.search.trim();
    const normalizedPhone = normalizeBdPhone(q);

    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { banglaName: { contains: q } },
      { studentIdCode: { contains: q, mode: 'insensitive' } },
      ...(normalizedPhone.length >= 3
        ? [{ phone: { contains: normalizedPhone } }]
        : [{ phone: { contains: q } }]),
      {
        studentGuardians: {
          some: {
            guardian: {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { banglaName: { contains: q } },
                ...(normalizedPhone.length >= 3
                  ? [{ phone: { contains: normalizedPhone } }]
                  : [{ phone: { contains: q } }]),
              ],
            },
          },
        },
      },
    ];
  }

  // Sorting
  let orderBy: Prisma.StudentOrderByWithRelationInput = { createdAt: 'desc' };
  if (params.sortBy === 'name') {
    orderBy = { name: params.sortOrder === 'desc' ? 'desc' : 'asc' };
  } else if (params.sortBy === 'studentIdCode') {
    orderBy = { studentIdCode: params.sortOrder === 'desc' ? 'desc' : 'asc' };
  } else if (params.sortBy === 'createdAt') {
    orderBy = { createdAt: params.sortOrder === 'asc' ? 'asc' : 'desc' };
  }

  // Real Database Counts only (ZERO fake metrics)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    totalCount,
    activeCount,
    inactiveCount,
    newAdmissionsCount,
    filteredCount,
    students,
  ] = await Promise.all([
    prisma.student.count({ where: { coachingCenterId } }),
    prisma.student.count({ where: { coachingCenterId, status: 'ACTIVE' } }),
    prisma.student.count({ where: { coachingCenterId, status: 'INACTIVE' } }),
    prisma.student.count({
      where: { coachingCenterId, createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      skip,
      take: pageSize,
      orderBy,
      include: {
        branch: {
          select: { id: true, name: true, code: true },
        },
        educationBoard: {
          select: { id: true, name: true, banglaName: true },
        },
        studentGuardians: {
          where: { isPrimary: true },
          include: {
            guardian: true,
          },
          take: 1,
        },
        enrollments: {
          orderBy: { admissionDate: 'desc' },
          take: 1,
          include: {
            academicSession: { select: { id: true, name: true } },
            academicProgram: { select: { id: true, name: true, banglaName: true } },
            academicClass: { select: { id: true, name: true, banglaName: true } },
            academicGroup: { select: { id: true, name: true, banglaName: true } },
            course: { select: { id: true, name: true, banglaName: true } },
            branch: { select: { id: true, name: true } },
          },
        },
        studentBatches: {
          where: { status: 'ACTIVE' },
          include: {
            batch: { select: { id: true, name: true, code: true } },
          },
          take: 1,
        },
      },
    }),
  ]);

  return {
    students,
    total: filteredCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(filteredCount / pageSize)),
    stats: {
      total: totalCount,
      active: activeCount,
      inactive: inactiveCount,
      newAdmissions: newAdmissionsCount,
    },
  };
}

/**
 * Retrieves full student profile with active & historical enrollments,
 * guardians, and batch history. Strict tenant isolation.
 */
export async function getStudentById(coachingCenterId: string, studentId: string) {
  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      coachingCenterId,
    },
    include: {
      branch: true,
      educationBoard: true,
      studentGuardians: {
        include: {
          guardian: true,
        },
        orderBy: { isPrimary: 'desc' },
      },
      enrollments: {
        orderBy: { admissionDate: 'desc' },
        include: {
          academicSession: true,
          academicProgram: true,
          academicClass: true,
          academicGroup: true,
          course: true,
          branch: true,
          educationBoard: true,
        },
      },
      studentBatches: {
        include: {
          batch: {
            include: {
              branch: true,
              academicSession: true,
              academicProgram: true,
              academicClass: true,
            },
          },
        },
        orderBy: { joinedAt: 'desc' },
      },
    },
  });

  return student;
}

/**
 * Updates student information, primary guardian details, status, or records a new enrollment.
 * Preserves historical enrollment records intact.
 */
export async function updateStudent(
  coachingCenterId: string,
  studentId: string,
  rawInput: StudentUpdateInput,
  actorId?: string
) {
  // Verify student belongs to this tenant
  const existing = await prisma.student.findFirst({
    where: { id: studentId, coachingCenterId },
    include: {
      studentGuardians: {
        where: { isPrimary: true },
        include: { guardian: true },
      },
    },
  });

  if (!existing) {
    throw new Error('STUDENT_NOT_FOUND');
  }

  return prisma.$transaction(async (tx) => {
    // 1. Update Student personal info
    const student = await tx.student.update({
      where: { id: studentId },
      data: {
        name: rawInput.name?.trim() ?? existing.name,
        banglaName: rawInput.banglaName !== undefined ? rawInput.banglaName?.trim() || null : existing.banglaName,
        gender: rawInput.gender ?? existing.gender,
        dob: rawInput.dob ? new Date(rawInput.dob) : existing.dob,
        bloodGroup: rawInput.bloodGroup !== undefined ? rawInput.bloodGroup || null : existing.bloodGroup,
        religion: rawInput.religion !== undefined ? rawInput.religion?.trim() || null : existing.religion,
        phone: rawInput.phone !== undefined ? (rawInput.phone ? normalizeBdPhone(rawInput.phone) : null) : existing.phone,
        email: rawInput.email !== undefined ? rawInput.email?.trim() || null : existing.email,
        photoUrl: rawInput.photoUrl !== undefined ? rawInput.photoUrl?.trim() || null : existing.photoUrl,
        address: rawInput.address !== undefined ? rawInput.address?.trim() || null : existing.address,
        permanentAddress: rawInput.permanentAddress !== undefined ? rawInput.permanentAddress?.trim() || null : existing.permanentAddress,
        schoolName: rawInput.schoolName !== undefined ? rawInput.schoolName?.trim() || null : existing.schoolName,
        educationBoardId: rawInput.educationBoardId !== undefined ? rawInput.educationBoardId || null : existing.educationBoardId,
        nidBirthReg: rawInput.nidBirthReg !== undefined ? rawInput.nidBirthReg?.trim() || null : existing.nidBirthReg,
        sscRoll: rawInput.sscRoll !== undefined ? rawInput.sscRoll?.trim() || null : existing.sscRoll,
        sscReg: rawInput.sscReg !== undefined ? rawInput.sscReg?.trim() || null : existing.sscReg,
        branchId: rawInput.branchId !== undefined ? rawInput.branchId || null : existing.branchId,
        status: rawInput.status ?? existing.status,
      },
    });

    // 2. Update Primary Guardian details if provided
    const primaryLink = existing.studentGuardians[0];
    if (primaryLink && rawInput.guardianName) {
      await tx.guardian.update({
        where: { id: primaryLink.guardianId },
        data: {
          name: rawInput.guardianName.trim(),
          banglaName: rawInput.guardianBanglaName?.trim() || null,
          relationship: rawInput.guardianRelationship || primaryLink.guardian.relationship,
          phone: rawInput.guardianPhone ? normalizeBdPhone(rawInput.guardianPhone) : primaryLink.guardian.phone,
          altPhone: rawInput.guardianAltPhone ? normalizeBdPhone(rawInput.guardianAltPhone) : primaryLink.guardian.altPhone,
          whatsapp: rawInput.guardianWhatsapp ? normalizeBdPhone(rawInput.guardianWhatsapp) : primaryLink.guardian.whatsapp,
          email: rawInput.guardianEmail?.trim() || null,
          occupation: rawInput.guardianOccupation?.trim() || null,
          address: rawInput.guardianAddress?.trim() || null,
          preferredChannel: rawInput.preferredChannel || primaryLink.guardian.preferredChannel,
        },
      });

      if (rawInput.guardianRelationship || rawInput.preferredChannel) {
        await tx.studentGuardian.update({
          where: { id: primaryLink.id },
          data: {
            relationship: rawInput.guardianRelationship || primaryLink.relationship,
            preferredChannel: rawInput.preferredChannel || primaryLink.preferredChannel,
          },
        });
      }
    }

    // 3. If adding a new academic enrollment (advancing session, changing program/class)
    if (rawInput.newEnrollment) {
      const ne = rawInput.newEnrollment;
      await tx.studentEnrollment.create({
        data: {
          coachingCenterId,
          studentId: student.id,
          branchId: ne.branchId,
          academicSessionId: ne.academicSessionId,
          academicProgramId: ne.academicProgramId,
          academicClassId: ne.academicClassId,
          academicGroupId: ne.academicGroupId || null,
          courseId: ne.courseId || null,
          educationBoardId: ne.educationBoardId || null,
          rollNumber: ne.rollNumber?.trim() || null,
          admissionDate: new Date(),
          status: 'ENROLLED',
          remarks: ne.remarks?.trim() || null,
        },
      });

      if (ne.batchId) {
        // Mark old active batches as TRANSFERRED or keep active
        await tx.studentBatch.create({
          data: {
            coachingCenterId,
            studentId: student.id,
            batchId: ne.batchId,
            joinedAt: new Date(),
            status: 'ACTIVE',
          },
        });
      }
    }

    // 4. Record Audit Log
    await recordAuditLog({
      coachingCenterId,
      userId: actorId,
      action: 'STUDENT_UPDATED',
      entity: 'Student',
      entityId: student.id,
      details: {
        name: student.name,
        status: student.status,
      },
    });

    return student;
  });
}

/**
 * Fetches academic hierarchy options (sessions, branches, programs, classes, groups, courses, batches, boards)
 * for building dynamic, dependent form selections.
 */
export async function getAcademicHierarchyOptions(coachingCenterId: string) {
  const [sessions, branches, programs, courses, batches, boards] = await Promise.all([
    prisma.academicSession.findMany({
      where: { coachingCenterId, status: 'ACTIVE' },
      orderBy: { startDate: 'desc' },
      select: { id: true, name: true, banglaName: true, isCurrent: true },
    }),
    prisma.branch.findMany({
      where: { coachingCenterId, status: 'ACTIVE' },
      orderBy: { isMain: 'desc' },
      select: { id: true, name: true, banglaName: true, code: true, isMain: true },
    }),
    prisma.academicProgram.findMany({
      where: { coachingCenterId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      include: {
        classes: {
          orderBy: { order: 'asc' },
          include: {
            groups: {
              orderBy: { name: 'asc' },
            },
          },
        },
      },
    }),
    prisma.course.findMany({
      where: { coachingCenterId, status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        banglaName: true,
        code: true,
        academicProgramId: true,
        academicClassId: true,
        academicGroupId: true,
        fee: true,
      },
    }),
    prisma.batch.findMany({
      where: { coachingCenterId, status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        banglaName: true,
        code: true,
        branchId: true,
        academicSessionId: true,
        academicProgramId: true,
        academicClassId: true,
        academicGroupId: true,
        courseId: true,
        capacity: true,
      },
    }),
    prisma.educationBoard.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, banglaName: true, code: true },
    }),
  ]);

  return {
    sessions,
    branches,
    programs,
    courses,
    batches,
    boards,
  };
}
