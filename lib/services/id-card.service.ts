import prisma from '@/lib/db';

/**
 * ID cards (Phase 10.10) — rendered on demand from live data, no persisted
 * row (unlike a Certificate, there's no reprintable "number" semantic to
 * keep stable). No student photo → the caller renders a neutral initials
 * avatar (the same pattern the student directory already uses), never a
 * fabricated photograph. No PDF dependency — printed via the browser like
 * every other document in this app.
 */

const STUDENT_SELECT = {
  id: true,
  studentIdCode: true,
  name: true,
  banglaName: true,
  photoUrl: true,
  branchId: true,
  status: true,
  branch: { select: { id: true, name: true, banglaName: true } },
  enrollments: {
    where: { status: 'ENROLLED' as const },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    include: { academicSession: true, academicProgram: true, academicClass: true, academicGroup: true },
  },
  studentBatches: {
    where: { status: 'ACTIVE' as const },
    take: 1,
    include: { batch: { select: { id: true, name: true } } },
  },
  studentGuardians: {
    where: { isPrimary: true },
    take: 1,
    include: { guardian: { select: { name: true, phone: true } } },
  },
} as const;

async function getBrandingAndCenter(coachingCenterId: string) {
  const [coachingCenter, branding] = await Promise.all([
    prisma.coachingCenter.findUnique({ where: { id: coachingCenterId }, select: { name: true, banglaName: true, address: true, phone: true } }),
    prisma.brandingSetting.findUnique({ where: { coachingCenterId }, select: { logoUrl: true, primaryColor: true, accentColor: true } }),
  ]);
  return { coachingCenter, branding };
}

export async function getIdCardData(coachingCenterId: string, studentId: string) {
  const student = await prisma.student.findFirst({ where: { id: studentId, coachingCenterId }, select: STUDENT_SELECT });
  if (!student) return null;
  const { coachingCenter, branding } = await getBrandingAndCenter(coachingCenterId);
  return { student, coachingCenter, branding };
}

const MAX_BULK_ID_CARDS = 300;

/** `branchId`, when given, silently narrows the result set to that branch — a branch-locked caller never sees another branch's cards among a mixed selection. */
export async function getIdCardDataBulk(coachingCenterId: string, studentIds: string[], branchId?: string) {
  const ids = studentIds.slice(0, MAX_BULK_ID_CARDS);
  const students = await prisma.student.findMany({
    where: { id: { in: ids }, coachingCenterId, ...(branchId ? { branchId } : {}) },
    select: STUDENT_SELECT,
  });
  const { coachingCenter, branding } = await getBrandingAndCenter(coachingCenterId);
  return { students, coachingCenter, branding };
}
