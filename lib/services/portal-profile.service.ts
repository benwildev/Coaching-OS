import prisma from '@/lib/db';
import type { PortalSessionUser } from '@/lib/auth/portal-session';
import { recordAuditLog } from './audit.service';
import { assertGuardianOwnsStudent } from './portal-auth.service';
import type { StudentProfileUpdateInput, GuardianProfileUpdateInput } from '@/lib/validations/portal-auth';

async function fetchStudentProfileById(coachingCenterId: string, studentId: string) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, coachingCenterId },
    select: {
      id: true,
      studentIdCode: true,
      name: true,
      banglaName: true,
      phone: true,
      email: true,
      dob: true,
      address: true,
      photoUrl: true,
      branch: { select: { id: true, name: true } },
      enrollments: {
        where: { status: 'ENROLLED' },
        take: 1,
        select: {
          academicSession: { select: { id: true, name: true } },
          academicProgram: { select: { id: true, name: true, banglaName: true } },
          academicClass: { select: { id: true, name: true, banglaName: true } },
          academicGroup: { select: { id: true, name: true, banglaName: true } },
        },
      },
      studentBatches: {
        where: { status: 'ACTIVE' },
        select: { batch: { select: { id: true, name: true, banglaName: true, code: true } } },
      },
    },
  });
  if (!student) throw new Error('STUDENT_NOT_FOUND');
  return student;
}

export async function getStudentProfile(session: PortalSessionUser) {
  return fetchStudentProfileById(session.coachingCenterId, session.studentId!);
}

/** The core IDOR gate for every guardian → child route: verify the link before returning anything. */
export async function getChildProfileForGuardian(session: PortalSessionUser, studentId: string) {
  await assertGuardianOwnsStudent(session.coachingCenterId, session.guardianId!, studentId);
  return fetchStudentProfileById(session.coachingCenterId, studentId);
}

/** Only the fields the domain already allows portal users to touch — never tenant/branch/enrollment identity fields. */
export async function updateStudentProfile(session: PortalSessionUser, input: StudentProfileUpdateInput) {
  const updated = await prisma.student.update({
    where: { id: session.studentId! },
    data: { phone: input.phone, email: input.email, address: input.address, photoUrl: input.photoUrl },
  });

  await recordAuditLog({
    coachingCenterId: session.coachingCenterId,
    studentId: session.studentId,
    action: 'PORTAL_PROFILE_UPDATED',
    entity: 'Student',
    entityId: session.studentId,
    details: null,
  });

  return updated;
}

export async function getGuardianProfile(session: PortalSessionUser) {
  const guardian = await prisma.guardian.findFirst({
    where: { id: session.guardianId!, coachingCenterId: session.coachingCenterId },
    select: {
      id: true,
      name: true,
      banglaName: true,
      relationship: true,
      phone: true,
      altPhone: true,
      whatsapp: true,
      email: true,
      address: true,
      preferredChannel: true,
      studentGuardians: {
        select: {
          isPrimary: true,
          student: { select: { id: true, name: true, studentIdCode: true } },
        },
      },
    },
  });
  if (!guardian) throw new Error('GUARDIAN_NOT_FOUND');
  return guardian;
}

export async function updateGuardianProfile(session: PortalSessionUser, input: GuardianProfileUpdateInput) {
  const updated = await prisma.guardian.update({
    where: { id: session.guardianId! },
    data: { phone: input.phone, altPhone: input.altPhone, whatsapp: input.whatsapp, email: input.email, address: input.address },
  });

  await recordAuditLog({
    coachingCenterId: session.coachingCenterId,
    guardianId: session.guardianId,
    action: 'PORTAL_PROFILE_UPDATED',
    entity: 'Guardian',
    entityId: session.guardianId,
    details: null,
  });

  return updated;
}

/** All active children linked to this guardian — the sole "who can I see" gate for the guardian portal. */
export async function getGuardianChildren(session: PortalSessionUser) {
  const links = await prisma.studentGuardian.findMany({
    where: { guardianId: session.guardianId!, student: { coachingCenterId: session.coachingCenterId } },
    select: {
      isPrimary: true,
      student: {
        select: {
          id: true,
          studentIdCode: true,
          name: true,
          banglaName: true,
          photoUrl: true,
          status: true,
          enrollments: {
            where: { status: 'ENROLLED' },
            take: 1,
            select: {
              academicClass: { select: { id: true, name: true, banglaName: true } },
              academicGroup: { select: { id: true, name: true, banglaName: true } },
            },
          },
          studentBatches: {
            where: { status: 'ACTIVE' },
            take: 1,
            select: { batch: { select: { id: true, name: true, banglaName: true, code: true } } },
          },
        },
      },
    },
  });
  return links.map((l) => ({ isPrimary: l.isPrimary, student: l.student }));
}
