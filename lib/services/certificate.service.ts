import prisma from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { assertBranchAccess, type SessionUser } from '@/lib/auth/session';
import { recordAuditLog } from './audit.service';

/**
 * Certificates (Phase 10.10). Only the number/type/date/issuer are
 * persisted — content (student name, class, branding) is always rendered
 * live at view/reprint time from Student/StudentEnrollment/BrandingSetting,
 * so a reprint reflects current official details under the same permanent
 * number. Numbering reuses the existing FinancialSequence atomic-upsert
 * pattern (lib/services/invoice.service.ts) with a new `type` value — no new
 * sequence table.
 *
 * Read functions here take no SessionUser and do no authorization — they are
 * shared by both staff API routes (which assertBranchAccess themselves after
 * loading the student) and portal routes (which use
 * assertGuardianOwnsStudent / a self-check instead, a different auth model
 * entirely). Only the mutation (issueCertificate) is staff-only and embeds
 * its own check, matching the Phase 10.9 cash-session.service.ts precedent.
 */

export const CERTIFICATE_TYPES = ['ENROLLMENT', 'COMPLETION', 'CHARACTER'] as const;
export type CertificateType = (typeof CERTIFICATE_TYPES)[number];

export async function generateCertificateNumber(tx: Prisma.TransactionClient, coachingCenterId: string): Promise<string> {
  const year = new Date().getFullYear();
  const sequence = await tx.financialSequence.upsert({
    where: { coachingCenterId_type_year: { coachingCenterId, type: 'CERTIFICATE', year } },
    create: { coachingCenterId, type: 'CERTIFICATE', year, currentNumber: 1 },
    update: { currentNumber: { increment: 1 } },
  });
  return `CERT-${year}-${String(sequence.currentNumber).padStart(6, '0')}`;
}

export async function issueCertificate(coachingCenterId: string, user: SessionUser, studentId: string, type: string) {
  if (!(CERTIFICATE_TYPES as readonly string[]).includes(type)) {
    throw new Error('INVALID_CERTIFICATE_TYPE');
  }
  const student = await prisma.student.findFirst({ where: { id: studentId, coachingCenterId } });
  if (!student) throw new Error('STUDENT_NOT_FOUND');
  assertBranchAccess(user, student.branchId);

  const certificate = await prisma.$transaction(async (tx) => {
    const certificateNumber = await generateCertificateNumber(tx, coachingCenterId);
    return tx.certificate.create({
      data: { coachingCenterId, branchId: student.branchId, studentId, type, certificateNumber, issuedById: user.userId },
    });
  });

  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: 'CERTIFICATE_GENERATED',
    entity: 'Certificate',
    entityId: certificate.id,
    details: { certificateNumber: certificate.certificateNumber, type, studentId },
  });

  return certificate;
}

export async function listCertificatesForStudent(coachingCenterId: string, studentId: string) {
  return prisma.certificate.findMany({
    where: { coachingCenterId, studentId },
    orderBy: { issueDate: 'desc' },
    include: { issuedBy: { select: { id: true, name: true } } },
  });
}

/** Joins the persisted number/type/date with LIVE student/academic/branding data for rendering. */
export async function getCertificateForRender(coachingCenterId: string, studentId: string, certificateId: string) {
  const certificate = await prisma.certificate.findFirst({
    where: { id: certificateId, coachingCenterId, studentId },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          banglaName: true,
          studentIdCode: true,
          branchId: true,
          dob: true,
          enrollments: {
            where: { status: 'ENROLLED' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { academicSession: true, academicProgram: true, academicClass: true, academicGroup: true, course: true },
          },
        },
      },
      branch: { select: { id: true, name: true, banglaName: true } },
      issuedBy: { select: { id: true, name: true } },
    },
  });
  if (!certificate) throw new Error('CERTIFICATE_NOT_FOUND');

  const [coachingCenter, branding] = await Promise.all([
    prisma.coachingCenter.findUnique({ where: { id: coachingCenterId }, select: { name: true, banglaName: true, address: true, phone: true, email: true } }),
    prisma.brandingSetting.findUnique({ where: { coachingCenterId }, select: { logoUrl: true } }),
  ]);

  return { certificate, coachingCenter, branding };
}
