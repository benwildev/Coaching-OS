import prisma from '@/lib/db';
import { recordAuditLog } from './audit.service';
import { assertBatchHasCapacity } from './batch.service';
import { detectStudentBatchConflicts } from './schedule.service';
import { generateInvoiceNumber } from './invoice.service';
import { generateReceiptNumber } from './payment.service';
import { loadCoursePricing } from './course-pricing.service';
import { checkStudentLimit } from './subscription.service';
import { allocateAdjustments, buildPricingLines, fromPaisa, toPaisa, type PricingLine } from '@/lib/course-pricing';
import {
  type AdmissionInput,
  type StudentUpdateInput,
  admissionSchema,
  normalizeBdPhone,
  STUDENT_STATUSES,
} from '@/lib/validations/student';
import type { Prisma, RoleCode } from '@prisma/client';
import { assertBranchAccess, type SessionUser } from '@/lib/auth/session';
import type { StudentBulkOpResult } from './bulk-types';

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
  const shortYear = String(academicYear).slice(-2);
  const code = (centerCode || 'CO').trim().toUpperCase();
  const prefix = `${code}-${shortYear}-`;

  let nextSeq = 1;
  const existingSeq = await tx.studentIdSequence.findUnique({
    where: {
      coachingCenterId_academicYear: { coachingCenterId, academicYear },
    },
  });

  if (!existingSeq) {
    const lastStudent = await tx.student.findFirst({
      where: {
        coachingCenterId,
        studentIdCode: { startsWith: prefix },
      },
      orderBy: { studentIdCode: 'desc' },
      select: { studentIdCode: true },
    });

    let currentMax = 0;
    if (lastStudent?.studentIdCode) {
      const match = lastStudent.studentIdCode.match(/\d+$/);
      if (match) currentMax = parseInt(match[0], 10);
    }
    nextSeq = currentMax + 1;
    await tx.studentIdSequence.create({
      data: {
        coachingCenterId,
        academicYear,
        currentNumber: nextSeq,
      },
    });
  } else {
    const updated = await tx.studentIdSequence.update({
      where: { id: existingSeq.id },
      data: { currentNumber: { increment: 1 } },
    });
    nextSeq = updated.currentNumber;
  }

  let candidateId = `${code}-${shortYear}-${String(nextSeq).padStart(5, '0')}`;
  while (await tx.student.findFirst({ where: { coachingCenterId, studentIdCode: candidateId } })) {
    nextSeq += 1;
    candidateId = `${code}-${shortYear}-${String(nextSeq).padStart(5, '0')}`;
    await tx.studentIdSequence.update({
      where: {
        coachingCenterId_academicYear: { coachingCenterId, academicYear },
      },
      data: { currentNumber: nextSeq },
    });
  }

  return candidateId;
}

/**
 * Creates a new student with guardian, enrollment, optional batch, fee assignment,
 * discount/waiver handling, invoice generation, initial payment, and audit logging
 * within an atomic database transaction.
 */
/**
 * Resolves an existing admission result by (coachingCenterId, idempotencyKey).
 * Used for deterministic idempotency replay so retries or concurrent submissions
 * return the exact original student, enrollment, invoice, and payment without duplicates.
 */
export async function getAdmissionByIdempotencyKey(coachingCenterId: string, idempotencyKey: string) {
  const enrollment = await prisma.studentEnrollment.findFirst({
    where: { coachingCenterId, idempotencyKey },
    include: {
      student: {
        include: {
          branch: { select: { id: true, name: true, code: true } },
          educationBoard: { select: { id: true, name: true, banglaName: true } },
          studentGuardians: {
            where: { isPrimary: true },
            include: { guardian: true },
            take: 1,
          },
          studentBatches: {
            where: { status: 'ACTIVE' },
            include: { batch: { select: { id: true, name: true, code: true } } },
            take: 1,
          },
        },
      },
      academicSession: { select: { id: true, name: true } },
      academicProgram: { select: { id: true, name: true, banglaName: true } },
      academicClass: { select: { id: true, name: true, banglaName: true } },
      academicGroup: { select: { id: true, name: true, banglaName: true } },
      course: { select: { id: true, name: true, banglaName: true } },
      branch: { select: { id: true, name: true } },
    },
  });
  if (!enrollment) return null;

  const student = enrollment.student;
  const primaryGuardian = student.studentGuardians[0]?.guardian || null;
  const assignedBatch = student.studentBatches[0]?.batch || null;

  const feeAssignments = await prisma.studentFeeAssignment.findMany({
    where: { coachingCenterId, studentId: student.id },
    orderBy: { createdAt: 'asc' },
  });
  const invoice = await prisma.feeInvoice.findFirst({
    where: { coachingCenterId, studentId: student.id },
    orderBy: { createdAt: 'desc' },
    include: { items: true },
  });
  const payment = invoice
    ? await prisma.payment.findFirst({
        where: { coachingCenterId, invoiceId: invoice.id },
        orderBy: { createdAt: 'desc' },
      })
    : null;

  return {
    ...student,
    enrollment,
    primaryGuardian,
    batch: assignedBatch,
    feeAssignment: feeAssignments[0] || null,
    feeAssignments,
    invoice: invoice || null,
    payment: payment || null,
    receiptNumber: payment?.receiptNumber || null,
    isDiscountPending: invoice?.notes?.includes('[PENDING_APPROVAL]') ?? false,
    idempotentReplay: true,
  };
}

export async function createStudentAdmission(
  coachingCenterId: string,
  rawInput: AdmissionInput,
  actorId?: string,
  actorRole: RoleCode = 'STAFF'
) {
  // Validate input
  const input = admissionSchema.parse(rawInput);
  const admissionIdempotencyKey = input.idempotencyKey?.trim() || null;

  // Admission Idempotency pre-check: if request was already committed, return the deterministic result
  if (admissionIdempotencyKey) {
    const existing = await getAdmissionByIdempotencyKey(coachingCenterId, admissionIdempotencyKey);
    if (existing) {
      return existing;
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
    // 1. Fetch tenant center info
    const center = await tx.coachingCenter.findUnique({
      where: { id: coachingCenterId },
      select: { id: true, code: true, name: true },
    });

    if (!center) {
      throw new Error('TENANT_NOT_FOUND');
    }

    // Phase 11.4: plan student limit, enforced under a per-tenant advisory lock
    // inside this transaction so concurrent admissions cannot overshoot it.
    await checkStudentLimit(tx, coachingCenterId);

    // 2. Verify branch exists and belongs to this tenant
    const branch = await tx.branch.findFirst({
      where: { id: input.branchId, coachingCenterId },
    });

    if (!branch) {
      throw new Error('BRANCH_NOT_FOUND');
    }

    // 3. Verify academic hierarchy belongs to this tenant and matches structure
    const session = await tx.academicSession.findFirst({
      where: { id: input.academicSessionId, coachingCenterId },
      select: { id: true, startDate: true },
    });
    if (!session) {
      throw new Error('SESSION_NOT_FOUND: Academic session does not exist in this coaching center');
    }

    const program = await tx.academicProgram.findFirst({
      where: { id: input.academicProgramId, coachingCenterId },
    });
    if (!program) {
      throw new Error('PROGRAM_NOT_FOUND: Academic program does not exist in this coaching center');
    }

    const cls = await tx.academicClass.findFirst({
      where: { id: input.academicClassId, coachingCenterId, academicProgramId: input.academicProgramId },
    });
    if (!cls) {
      throw new Error('CLASS_NOT_FOUND: Class does not belong to the selected academic program');
    }

    if (input.academicGroupId) {
      const grp = await tx.academicGroup.findFirst({
        where: { id: input.academicGroupId, coachingCenterId, academicClassId: input.academicClassId },
      });
      if (!grp) {
        throw new Error('GROUP_NOT_FOUND: Group does not belong to the selected academic class');
      }
    }

    if (input.courseId) {
      const crs = await tx.course.findFirst({
        where: {
          id: input.courseId,
          coachingCenterId,
          academicProgramId: input.academicProgramId,
          academicClassId: input.academicClassId,
          status: 'ACTIVE',
        },
      });
      if (!crs) {
        throw new Error('COURSE_NOT_FOUND: Course is either inactive or does not match the selected program/class');
      }
    }

    // 4. Duplicate checks (prevent duplicate active enrollment / duplicate identity)
    if (input.phone) {
      const normStudentPhone = normalizeBdPhone(input.phone);
      const duplicateEnrollment = await tx.studentEnrollment.findFirst({
        where: {
          coachingCenterId,
          academicSessionId: input.academicSessionId,
          academicProgramId: input.academicProgramId,
          academicClassId: input.academicClassId,
          status: 'ENROLLED',
          student: { phone: normStudentPhone, status: 'ACTIVE' },
        },
        include: { student: { select: { id: true, name: true, studentIdCode: true } } },
      });

      if (duplicateEnrollment) {
        throw new Error(
          `DUPLICATE_ENROLLMENT: Student ${duplicateEnrollment.student.name} (${duplicateEnrollment.student.studentIdCode}) with phone ${input.phone} is already actively enrolled in this class for this session.`
        );
      }
    }

    if (input.nidBirthReg && input.nidBirthReg.trim()) {
      const duplicateNid = await tx.student.findFirst({
        where: {
          coachingCenterId,
          nidBirthReg: input.nidBirthReg.trim(),
        },
        select: { id: true, name: true, studentIdCode: true },
      });
      if (duplicateNid) {
        throw new Error(
          `DUPLICATE_STUDENT: A student with NID/Birth Reg ${input.nidBirthReg} (${duplicateNid.name}, ID: ${duplicateNid.studentIdCode}) already exists.`
        );
      }
    }

    const admissionYear = session.startDate
      ? new Date(session.startDate).getFullYear()
      : new Date().getFullYear();

    // 5. Generate sequential human-readable Student ID
    const studentIdCode = await generateStudentId(
      tx,
      coachingCenterId,
      center.code,
      admissionYear
    );

    // 6. Create Student record
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

    // 7. Guardian Handling (link existing guardian or create new)
    let primaryGuardian;
    if (input.guardianId) {
      primaryGuardian = await tx.guardian.findFirst({
        where: { id: input.guardianId, coachingCenterId },
      });
      if (!primaryGuardian) {
        throw new Error('GUARDIAN_NOT_FOUND: The selected guardian was not found in this coaching center');
      }
    } else {
      const primaryPhone = normalizeBdPhone(input.guardianPhone);
      const existingGuardian = await tx.guardian.findFirst({
        where: { coachingCenterId, phone: primaryPhone },
      });

      if (existingGuardian) {
        primaryGuardian = existingGuardian;
      } else {
        primaryGuardian = await tx.guardian.create({
          data: {
            coachingCenterId,
            name: input.guardianName?.trim() || 'Guardian',
            banglaName: input.guardianBanglaName?.trim() || null,
            relationship: input.guardianRelationship || 'FATHER',
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
      }
    }

    // Link Primary Guardian to Student
    await tx.studentGuardian.create({
      data: {
        studentId: student.id,
        guardianId: primaryGuardian.id,
        relationship: input.guardianRelationship || primaryGuardian.relationship,
        isPrimary: true,
        isEmergencyContact: true,
        canReceiveNotifications: true,
        preferredChannel: input.preferredChannel || primaryGuardian.preferredChannel || 'SMS',
      },
    });

    // 8. Handle Secondary Guardian if provided
    if (input.hasSecondaryGuardian && input.secondaryPhone) {
      const secPhone = normalizeBdPhone(input.secondaryPhone);
      let secondaryGuardian = await tx.guardian.findFirst({
        where: { coachingCenterId, phone: secPhone },
      });

      if (!secondaryGuardian) {
        secondaryGuardian = await tx.guardian.create({
          data: {
            coachingCenterId,
            name: input.secondaryName?.trim() || 'Secondary Guardian',
            relationship: input.secondaryRelationship || 'OTHER',
            phone: secPhone,
            isPrimary: false,
            isEmergency: false,
            preferredChannel: 'SMS',
          },
        });
      }

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

    // 9. Create Academic Enrollment record
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
        idempotencyKey: admissionIdempotencyKey,
      },
    });

    // 10. Assign Batch if selected
    let assignedBatch = null;
    if (input.batchId) {
      const batch = await tx.batch.findFirst({
        where: { id: input.batchId, coachingCenterId },
      });
      if (!batch) {
        throw new Error('BATCH_NOT_FOUND: The requested batch was not found');
      }
      if (batch.branchId !== input.branchId) {
        throw new Error('CROSS_BRANCH_BATCH: Selected batch belongs to a different branch');
      }
      if (
        batch.academicSessionId !== input.academicSessionId ||
        batch.academicProgramId !== input.academicProgramId ||
        batch.academicClassId !== input.academicClassId
      ) {
        throw new Error('INCOMPATIBLE_BATCH: Selected batch does not match the academic program/class');
      }
      if (batch.status === 'COMPLETED' || batch.status === 'CANCELLED') {
        throw new Error(`BATCH_INACTIVE: Cannot assign student to a ${batch.status.toLowerCase()} batch`);
      }

      // Schedule conflict detection
      if (!input.overrideConflict) {
        const conflicts = await detectStudentBatchConflicts(coachingCenterId, student.id, batch.id);
        if (conflicts.length > 0) {
          throw new Error(`SCHEDULE_CONFLICT: ${conflicts[0].message}`);
        }
      }

      // Concurrency-safe capacity enforcement using PostgreSQL advisory lock
      await assertBatchHasCapacity(tx, batch.id, batch.capacity, input.overrideCapacity);

      await tx.studentBatch.create({
        data: {
          coachingCenterId,
          studentId: student.id,
          batchId: batch.id,
          joinedAt: new Date(),
          status: 'ACTIVE',
        },
      });
      assignedBatch = batch;
    }

    // 11. Fee Assignment & Invoice (if requested)
    // Phase 11.2: fee lines come either from the selected course's Fee & Payment
    // Plan (useCoursePricing — amounts are read server-side inside this
    // transaction, never trusted from the client) or from the legacy single fee
    // (feeStructureId / feeAmount). Either way each line becomes a snapshotted
    // StudentFeeAssignment and one invoice item, so a later change to the course
    // price cannot alter what this student owes.
    type AssignmentRow = Prisma.StudentFeeAssignmentGetPayload<object>;
    let feeAssignment: AssignmentRow | null = null;
    const feeAssignments: AssignmentRow[] = [];
    let invoice = null;
    let isDiscountPending = false;

    const usingCoursePricing = input.useCoursePricing === true;
    const hasFeeAssignment =
      usingCoursePricing || Boolean(input.feeStructureId || (input.feeAmount !== undefined && input.feeAmount > 0));

    if (hasFeeAssignment) {
      const admissionDate = input.admissionDate ? new Date(input.admissionDate) : new Date();
      const invoiceDueDate = input.feeDueDate ? new Date(input.feeDueDate) : null;
      let feeStructureId: string | null = null;
      let pricingCourseId: string | null = null;
      let assignmentDescription: string | null = input.remarks || null;
      let pricedLines: PricingLine[];

      if (usingCoursePricing) {
        if (!input.courseId) {
          throw new Error('COURSE_PRICING_REQUIRES_COURSE: Select a course to apply its Fee & Payment Plan');
        }
        const pricing = await loadCoursePricing(tx, coachingCenterId, input.courseId);
        if (!pricing) {
          throw new Error('COURSE_NOT_FOUND: Course does not exist in this coaching center');
        }
        const selectedOptional = [...new Set(input.optionalFeeIds ?? [])];
        const validOptionalIds = new Set(
          pricing.additionalFees.filter((f) => f.isActive && !f.isRequired).map((f) => f.id)
        );
        if (selectedOptional.some((id) => !validOptionalIds.has(id))) {
          throw new Error('INVALID_OPTIONAL_FEE: Selected optional fee does not belong to this course or is not available');
        }
        pricedLines = buildPricingLines(pricing, selectedOptional);
        if (pricedLines.length === 0) {
          throw new Error('COURSE_PRICING_NOT_CONFIGURED: This course has no fee set. Set it in the course Fee & Payment Plan');
        }
        pricingCourseId = pricing.course.id;
        assignmentDescription = `Course: ${pricing.course.name}`;
      } else {
        let legacyAmount = 0;
        let feeName = 'Admission Fee';

        if (input.feeStructureId) {
          const fs = await tx.feeStructure.findFirst({
            where: { id: input.feeStructureId, coachingCenterId, isActive: true },
          });
          if (!fs) {
            throw new Error('FEE_STRUCTURE_NOT_FOUND: Fee structure does not exist or is inactive');
          }
          if (fs.branchId && fs.branchId !== input.branchId) {
            throw new Error('CROSS_BRANCH_FEE_STRUCTURE: Fee structure belongs to another branch');
          }
          if (fs.academicClassId && fs.academicClassId !== input.academicClassId) {
            throw new Error('INCOMPATIBLE_FEE_STRUCTURE: Fee structure does not match student class');
          }
          if (fs.courseId && input.courseId && fs.courseId !== input.courseId) {
            throw new Error('INCOMPATIBLE_FEE_STRUCTURE: Fee structure does not match selected course');
          }
          legacyAmount = input.feeAmount !== undefined ? input.feeAmount : Number(fs.amount);
          feeName = input.feeName?.trim() || fs.name;
          feeStructureId = fs.id;
        } else {
          legacyAmount = input.feeAmount!;
          feeName = input.feeName?.trim() || 'Admission Fee';
        }
        pricedLines = [{ kind: 'COURSE_FEE', name: feeName, amount: legacyAmount, dueAfterDays: 0 }];
      }

      const originalAmount = fromPaisa(pricedLines.reduce((s, l) => s + toPaisa(l.amount), 0));
      const reqDiscount = Math.max(0, input.discountAmount || 0);
      const reqWaiver = Math.max(0, input.waiverAmount || 0);

      if (toPaisa(reqDiscount) + toPaisa(reqWaiver) > toPaisa(originalAmount)) {
        throw new Error('INVALID_DISCOUNT: Discount and waiver combined cannot exceed original fee amount');
      }

      // Discount & Waiver Authorization (OWNER vs Non-OWNER)
      const isOwner = actorRole === 'OWNER';
      if (!isOwner && (reqDiscount > 0 || reqWaiver > 0)) {
        // Staff/Admin cannot silently apply discounts — obligation remains at originalAmount
        isDiscountPending = true;
      }
      const allocated = allocateAdjustments(pricedLines, isOwner ? reqDiscount : 0, isOwner ? reqWaiver : 0);
      const appliedDiscount = fromPaisa(allocated.reduce((s, l) => s + toPaisa(l.discountAmount), 0));
      const appliedWaiver = fromPaisa(allocated.reduce((s, l) => s + toPaisa(l.waiverAmount), 0));
      const finalAmount = fromPaisa(allocated.reduce((s, l) => s + toPaisa(l.finalAmount), 0));

      for (const [idx, line] of allocated.entries()) {
        const lineDue =
          line.dueAfterDays > 0
            ? new Date(admissionDate.getTime() + line.dueAfterDays * 24 * 60 * 60 * 1000)
            : invoiceDueDate;

        const created = await tx.studentFeeAssignment.create({
          data: {
            coachingCenterId,
            branchId: input.branchId,
            studentId: student.id,
            feeStructureId,
            batchId: input.batchId || null,
            courseId: pricingCourseId,
            academicSessionId: input.academicSessionId,
            name: line.name,
            description: assignmentDescription,
            originalAmount: line.amount,
            discountAmount: line.discountAmount,
            waiverAmount: line.waiverAmount,
            finalAmount: line.finalAmount,
            dueDate: lineDue,
            status: 'PENDING',
            createdById: actorId,
          },
        });
        feeAssignments.push(created);

        // Record discount/waiver history
        if (isOwner) {
          if (line.discountAmount > 0) {
            await tx.feeDiscount.create({
              data: {
                coachingCenterId,
                studentFeeAssignmentId: created.id,
                type: 'DISCOUNT',
                amount: line.discountAmount,
                reason: input.discountReason?.trim() || 'Approved by Owner at admission',
                createdById: actorId,
              },
            });
          }
          if (line.waiverAmount > 0) {
            await tx.feeDiscount.create({
              data: {
                coachingCenterId,
                studentFeeAssignmentId: created.id,
                type: 'WAIVER',
                amount: line.waiverAmount,
                reason: input.discountReason?.trim() || 'Approved by Owner at admission',
                createdById: actorId,
              },
            });
          }
        } else if (isDiscountPending && idx === 0) {
          // The pending request is recorded once, against the first line, at the full requested amount.
          if (reqDiscount > 0) {
            await tx.feeDiscount.create({
              data: {
                coachingCenterId,
                studentFeeAssignmentId: created.id,
                type: 'DISCOUNT',
                amount: reqDiscount,
                reason: `[PENDING_APPROVAL: Requested by Staff] ${input.discountReason?.trim() || 'Admission discount request'}`,
                createdById: actorId,
              },
            });
          }
          if (reqWaiver > 0) {
            await tx.feeDiscount.create({
              data: {
                coachingCenterId,
                studentFeeAssignmentId: created.id,
                type: 'WAIVER',
                amount: reqWaiver,
                reason: `[PENDING_APPROVAL: Requested by Staff] ${input.discountReason?.trim() || 'Admission waiver request'}`,
                createdById: actorId,
              },
            });
          }
        }
      }
      feeAssignment = feeAssignments[0];

      // Generate Invoice
      const invoiceNumber = await generateInvoiceNumber(tx, coachingCenterId);
      const invoiceNotes = isDiscountPending
        ? `[PENDING_APPROVAL] Discount request of ৳${reqDiscount} submitted by staff. Pending Owner approval.`
        : input.remarks?.trim() || null;

      invoice = await tx.feeInvoice.create({
        data: {
          coachingCenterId,
          branchId: input.branchId,
          studentId: student.id,
          invoiceNumber,
          invoiceDate: admissionDate,
          dueDate: invoiceDueDate,
          subtotalAmount: originalAmount,
          discountAmount: appliedDiscount,
          waiverAmount: appliedWaiver,
          totalAmount: finalAmount,
          paidAmount: 0,
          dueAmount: finalAmount,
          status: finalAmount <= 0 ? 'PAID' : 'ISSUED',
          notes: invoiceNotes,
          createdById: actorId,
          items: {
            create: allocated.map((line, idx) => ({
              studentFeeAssignmentId: feeAssignments[idx].id,
              description: line.name,
              quantity: 1,
              unitAmount: line.amount,
              discountAmount: line.discountAmount,
              amount: line.finalAmount,
              displayOrder: idx,
            })),
          },
        },
        include: { items: true },
      });
    }

    // 12. Initial Payment (if provided)
    let payment = null;
    let receiptNumber = null;

    if (input.initialPayment && input.initialPayment.amount > 0) {
      if (!invoice) {
        throw new Error('PAYMENT_ERROR: Cannot record payment without an invoice');
      }

      const payAmount = input.initialPayment.amount;
      if (payAmount > Number(invoice.dueAmount)) {
        throw new Error('OVERPAYMENT: Payment amount cannot exceed the invoice payable amount');
      }

      const method = input.initialPayment.paymentMethod;
      const txId = input.initialPayment.transactionId?.trim() || null;
      const idempotencyKey = input.initialPayment.idempotencyKey?.trim() || null;

      if (idempotencyKey) {
        const existingPayment = await tx.payment.findFirst({
          where: { coachingCenterId, idempotencyKey },
        });
        if (existingPayment) {
          throw new Error('IDEMPOTENT_RETRY: Payment with this idempotency key has already been recorded');
        }
      }

      if (method !== 'CASH' && method !== 'OTHER' && txId) {
        const dupTx = await tx.payment.findFirst({
          where: { coachingCenterId, paymentMethod: method, transactionId: txId },
        });
        if (dupTx) {
          throw new Error(`DUPLICATE_TRANSACTION: Transaction ID ${txId} has already been recorded for ${method}`);
        }
      }

      receiptNumber = await generateReceiptNumber(tx, coachingCenterId);

      payment = await tx.payment.create({
        data: {
          coachingCenterId,
          branchId: input.branchId,
          studentId: student.id,
          invoiceId: invoice.id,
          receiptNumber,
          amount: payAmount,
          paymentMethod: method,
          transactionId: txId,
          referenceNumber: input.initialPayment.referenceNumber?.trim() || null,
          senderMobile: input.initialPayment.senderMobile?.trim() || null,
          bankName: input.initialPayment.bankName?.trim() || null,
          chequeNumber: input.initialPayment.chequeNumber?.trim() || null,
          paymentDate: new Date(),
          notes: input.initialPayment.notes?.trim() || null,
          status: 'COMPLETED',
          collectedById: actorId,
          idempotencyKey,
        },
      });

      const remainingDue = Math.max(0, Number(invoice.dueAmount) - payAmount);
      const newStatus = remainingDue <= 0 ? 'PAID' : 'PARTIAL';

      invoice = await tx.feeInvoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount: payAmount,
          dueAmount: remainingDue,
          status: newStatus,
        },
      });

      // The payment is applied to the invoice as a whole; mirror it onto the
      // fee lines in order so each line's status is accurate (a single-line
      // admission behaves exactly as before).
      let unallocated = toPaisa(payAmount);
      for (const fa of feeAssignments) {
        const lineFinal = toPaisa(Number(fa.finalAmount));
        const covered = Math.min(unallocated, lineFinal);
        unallocated -= covered;
        if (covered > 0) {
          await tx.studentFeeAssignment.update({
            where: { id: fa.id },
            data: { status: covered >= lineFinal ? 'PAID' : 'PARTIAL' },
          });
        }
      }
    }

    // 13. Record Audit Logs
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
        guardianId: primaryGuardian.id,
        batchId: assignedBatch?.id || null,
      },
    });

    for (const fa of feeAssignments) {
      await recordAuditLog({
        coachingCenterId,
        userId: actorId,
        action: 'STUDENT_FEE_ASSIGNED',
        entity: 'StudentFeeAssignment',
        entityId: fa.id,
        details: {
          studentId: student.id,
          name: fa.name,
          finalAmount: Number(fa.finalAmount),
          courseId: fa.courseId,
        },
      });
    }

    if (isDiscountPending) {
      await recordAuditLog({
        coachingCenterId,
        userId: actorId,
        action: 'DISCOUNT_REQUESTED',
        entity: 'FeeDiscount',
        entityId: feeAssignment?.id || student.id,
        details: {
          studentId: student.id,
          discountAmount: input.discountAmount,
          waiverAmount: input.waiverAmount,
          status: 'PENDING_APPROVAL',
        },
      });
    }

    if (payment) {
      await recordAuditLog({
        coachingCenterId,
        userId: actorId,
        action: 'PAYMENT_CREATED',
        entity: 'Payment',
        entityId: payment.id,
        details: {
          receiptNumber: payment.receiptNumber,
          amount: Number(payment.amount),
          paymentMethod: payment.paymentMethod,
        },
      });
    }

    return {
      ...student,
      enrollment,
      primaryGuardian,
      batch: assignedBatch,
      feeAssignment,
      feeAssignments,
      invoice,
      payment,
      receiptNumber,
      isDiscountPending,
    };
  }, {
    maxWait: 10000,
    timeout: 30000,
  });
  } catch (err: any) {
    if (admissionIdempotencyKey) {
      const isUniqueErr =
        err?.code === 'P2002' &&
        ((Array.isArray(err?.meta?.target) && err.meta.target.includes('idempotencyKey')) ||
          String(err?.meta?.target || '').includes('idempotencyKey'));
      if (isUniqueErr) {
        await new Promise((r) => setTimeout(r, 150));
        const replay = await getAdmissionByIdempotencyKey(coachingCenterId, admissionIdempotencyKey);
        if (replay) return replay;
      }
    }
    throw err;
  }
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
    // Phase 11.4: re-activating a student takes a plan slot again.
    if (rawInput.status === 'ACTIVE' && existing.status !== 'ACTIVE') await checkStudentLimit(tx, coachingCenterId);

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
        // Phase 10.5: this path previously skipped capacity enforcement
        // entirely — a full batch could always be over-filled by
        // re-enrolling a student here.
        const targetBatch = await tx.batch.findFirst({ where: { id: ne.batchId, coachingCenterId }, select: { capacity: true } });
        if (targetBatch) {
          await assertBatchHasCapacity(tx, ne.batchId, targetBatch.capacity);
        }
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
  const [sessions, branches, programs, courses, batches, boards, feeStructures] = await Promise.all([
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
        billingType: true,
        // Phase 11.2: pricing for the wizard's fee step (display only — the
        // server re-reads it at admission time and never trusts these numbers).
        feeItems: {
          where: { isActive: true },
          orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
          select: { id: true, name: true, banglaName: true, amount: true, isRequired: true, isActive: true },
        },
        installments: {
          orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
          select: { name: true, banglaName: true, amount: true, dueAfterDays: true },
        },
      },
    }),
    prisma.batch.findMany({
      where: { coachingCenterId, status: 'ACTIVE' },
      include: {
        _count: {
          select: {
            studentBatches: { where: { status: 'ACTIVE' } },
          },
        },
        classSchedules: {
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            dayOfWeek: true,
            startTime: true,
            endTime: true,
            room: { select: { id: true, name: true, code: true } },
          },
        },
        batchTeacherAssignments: {
          select: {
            teacher: { select: { id: true, name: true, banglaName: true } },
            subject: { select: { id: true, name: true, banglaName: true } },
          },
        },
      },
    }),
    prisma.educationBoard.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, banglaName: true, code: true },
    }),
    prisma.feeStructure.findMany({
      where: { coachingCenterId, isActive: true },
      orderBy: { amount: 'asc' },
      select: {
        id: true,
        name: true,
        banglaName: true,
        code: true,
        feeType: true,
        amount: true,
        frequency: true,
        dueDay: true,
        lateFee: true,
        branchId: true,
        academicSessionId: true,
        academicClassId: true,
        courseId: true,
      },
    }),
  ]);

  return {
    sessions,
    branches,
    programs,
    courses: courses.map((c) => ({
      ...c,
      fee: Number(c.fee),
      feeItems: c.feeItems.map((f) => ({ ...f, amount: Number(f.amount) })),
      installments: c.installments.map((i) => ({ ...i, amount: Number(i.amount) })),
    })),
    batches: batches.map((b) => ({
      ...b,
      enrolledCount: b._count.studentBatches,
      availableSeats: Math.max(0, b.capacity - b._count.studentBatches),
    })),
    boards,
    feeStructures,
  };
}

// ------------------------------------------------------------------
// Phase 10.10: dedicated, audited student status changes + bulk operation.
// Status changes previously went through the generic updateStudent() and
// were folded into a generic STUDENT_UPDATED audit entry with no
// previous/new/reason trail — this gives status changes their own audited,
// bulk-safe path without touching updateStudent's existing behavior.
// ------------------------------------------------------------------

/** Never deletes the student or any historical record — only the status column changes. */
export async function updateStudentStatus(
  coachingCenterId: string,
  user: SessionUser,
  studentId: string,
  newStatus: string,
  reason?: string
): Promise<StudentBulkOpResult> {
  if (!(STUDENT_STATUSES as readonly string[]).includes(newStatus)) {
    return { studentId, success: false, reason: 'INVALID_STATUS' };
  }

  const student = await prisma.student.findFirst({ where: { id: studentId, coachingCenterId } });
  if (!student) return { studentId, success: false, reason: 'STUDENT_NOT_FOUND' };

  try {
    assertBranchAccess(user, student.branchId);
  } catch {
    return { studentId, success: false, reason: 'FORBIDDEN_BRANCH' };
  }

  if (student.status === newStatus) {
    return { studentId, success: true, skipped: true, reason: 'UNCHANGED' };
  }

  await prisma.$transaction(async (tx) => {
    // Phase 11.4: re-activating a student takes a plan slot again (deactivating never does).
    if (newStatus === 'ACTIVE') await checkStudentLimit(tx, coachingCenterId);
    await tx.student.update({ where: { id: studentId }, data: { status: newStatus } });
  });

  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: 'STUDENT_STATUS_CHANGED',
    entity: 'Student',
    entityId: studentId,
    details: { previousStatus: student.status, newStatus, reason: reason?.trim() || null },
  });

  return { studentId, success: true };
}

export interface BulkStatusChangeInput {
  studentIds: string[];
  newStatus: string;
  reason?: string;
}

/**
 * Each student is its own independent operation (never one all-or-nothing
 * transaction across the whole selection) — a single unauthorized or
 * already-in-that-status row must never block or roll back the rest of a
 * legitimate bulk change (AGENTS.md Phase 10.10 §5/§26/§27).
 */
export async function bulkUpdateStudentStatus(
  coachingCenterId: string,
  user: SessionUser,
  input: BulkStatusChangeInput
): Promise<StudentBulkOpResult[]> {
  const results: StudentBulkOpResult[] = [];
  for (const studentId of input.studentIds) {
    try {
      results.push(await updateStudentStatus(coachingCenterId, user, studentId, input.newStatus, input.reason));
    } catch (error) {
      results.push({ studentId, success: false, reason: error instanceof Error ? error.message : 'UNKNOWN_ERROR' });
    }
  }
  return results;
}
