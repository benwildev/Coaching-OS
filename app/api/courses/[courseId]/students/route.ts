import { NextResponse } from 'next/server';
import { requireTenant, requireRole, resolveEffectiveBranchId } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import prisma from '@/lib/db';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  props: { params: Promise<{ courseId: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF', 'TEACHER']);

    const { courseId } = await props.params;
    const course = await prisma.course.findFirst({
      where: { id: courseId, coachingCenterId },
      select: { id: true, name: true, code: true },
    });
    if (!course) {
      return NextResponse.json({ success: false, error: 'Course not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const branchId = resolveEffectiveBranchId(user, searchParams.get('branch') || undefined);

    const where: Prisma.StudentEnrollmentWhereInput = {
      coachingCenterId,
      courseId,
      ...(branchId ? { branchId } : {}),
    };

    const enrollments = await prisma.studentEnrollment.findMany({
      where,
      orderBy: { admissionDate: 'desc' },
      include: {
        student: {
          select: {
            id: true,
            studentIdCode: true,
            name: true,
            banglaName: true,
            phone: true,
            status: true,
            branch: { select: { id: true, name: true } },
            studentGuardians: {
              where: { isPrimary: true },
              include: { guardian: { select: { id: true, name: true, phone: true } } },
              take: 1,
            },
            studentBatches: {
              where: { status: 'ACTIVE' },
              include: { batch: { select: { id: true, name: true, code: true } } },
              take: 1,
            },
          },
        },
        branch: { select: { id: true, name: true } },
        academicSession: { select: { id: true, name: true } },
      },
    });

    const students = enrollments.map((e) => ({
      id: e.student.id,
      enrollmentId: e.id,
      studentId: e.student.id,
      studentIdCode: e.student.studentIdCode,
      name: e.student.name,
      banglaName: e.student.banglaName,
      phone: e.student.phone,
      status: e.status,
      studentStatus: e.student.status,
      admissionDate: e.admissionDate,
      branchName: e.branch?.name || e.student.branch?.name || '—',
      sessionName: e.academicSession?.name || '—',
      guardianName: e.student.studentGuardians[0]?.guardian?.name || '—',
      guardianPhone: e.student.studentGuardians[0]?.guardian?.phone || '—',
      batchName: e.student.studentBatches[0]?.batch?.name || 'Unassigned',
      batchCode: e.student.studentBatches[0]?.batch?.code || null,
    }));

    return NextResponse.json({
      success: true,
      course: { id: course.id, name: course.name, code: course.code },
      count: students.length,
      students,
    });
  } catch (error) {
    return apiErrorResponse(error, '/api/courses/[courseId]/students GET');
  }
}
