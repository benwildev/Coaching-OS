import prisma from '@/lib/db';
import { recordAuditLog } from './audit.service';

export async function getAcademicSessions(coachingCenterId: string) {
  return prisma.academicSession.findMany({
    where: { coachingCenterId },
    orderBy: { startDate: 'desc' },
  });
}

export async function getCurrentAcademicSession(coachingCenterId: string) {
  return prisma.academicSession.findFirst({
    where: { coachingCenterId, isCurrent: true },
  });
}

export async function createAcademicSession(
  coachingCenterId: string,
  data: {
    name: string;
    banglaName?: string;
    startDate: Date;
    endDate: Date;
    isCurrent?: boolean;
  },
  userId?: string
) {
  if (data.isCurrent) {
    // Unset other current sessions
    await prisma.academicSession.updateMany({
      where: { coachingCenterId, isCurrent: true },
      data: { isCurrent: false },
    });
  }

  const session = await prisma.academicSession.create({
    data: {
      coachingCenterId,
      ...data,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId,
    action: 'ACADEMIC_SESSION_CREATED',
    entity: 'AcademicSession',
    entityId: session.id,
    details: { name: session.name },
  });

  return session;
}

export async function getAcademicPrograms(coachingCenterId: string) {
  return prisma.academicProgram.findMany({
    where: { coachingCenterId },
    orderBy: { createdAt: 'asc' },
    include: {
      classes: {
        orderBy: { order: 'asc' },
        include: {
          groups: true,
          subjects: {
            include: {
              papers: true,
            },
          },
        },
      },
    },
  });
}

export async function createAcademicProgram(
  coachingCenterId: string,
  data: {
    name: string;
    banglaName?: string;
    code: string;
    description?: string;
  },
  userId?: string
) {
  const program = await prisma.academicProgram.create({
    data: {
      coachingCenterId,
      name: data.name,
      banglaName: data.banglaName,
      code: data.code.toUpperCase(),
      description: data.description,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId,
    action: 'ACADEMIC_PROGRAM_CREATED',
    entity: 'AcademicProgram',
    entityId: program.id,
    details: data,
  });

  return program;
}

export async function createAcademicClass(
  coachingCenterId: string,
  data: {
    academicProgramId: string;
    name: string;
    banglaName?: string;
    code: string;
    order?: number;
  },
  userId?: string
) {
  const academicClass = await prisma.academicClass.create({
    data: {
      coachingCenterId,
      academicProgramId: data.academicProgramId,
      name: data.name,
      banglaName: data.banglaName,
      code: data.code.toUpperCase(),
      order: data.order ?? 0,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId,
    action: 'ACADEMIC_CLASS_CREATED',
    entity: 'AcademicClass',
    entityId: academicClass.id,
    details: data,
  });

  return academicClass;
}

export async function createAcademicGroup(
  coachingCenterId: string,
  data: {
    academicClassId: string;
    name: string;
    banglaName?: string;
    code: string;
  },
  userId?: string
) {
  const group = await prisma.academicGroup.create({
    data: {
      coachingCenterId,
      academicClassId: data.academicClassId,
      name: data.name,
      banglaName: data.banglaName,
      code: data.code.toUpperCase(),
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId,
    action: 'ACADEMIC_GROUP_CREATED',
    entity: 'AcademicGroup',
    entityId: group.id,
    details: data,
  });

  return group;
}

export async function createSubject(
  coachingCenterId: string,
  data: {
    academicClassId: string;
    academicGroupId?: string;
    name: string;
    banglaName?: string;
    code: string;
  },
  userId?: string
) {
  const subject = await prisma.subject.create({
    data: {
      coachingCenterId,
      academicClassId: data.academicClassId,
      academicGroupId: data.academicGroupId,
      name: data.name,
      banglaName: data.banglaName,
      code: data.code.toUpperCase(),
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId,
    action: 'SUBJECT_CREATED',
    entity: 'Subject',
    entityId: subject.id,
    details: data,
  });

  return subject;
}

export async function getEducationBoards() {
  return prisma.educationBoard.findMany({
    orderBy: { name: 'asc' },
  });
}
