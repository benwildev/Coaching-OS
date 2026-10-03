import { NextResponse } from 'next/server';
import { requireTenant, requirePermission, assertBranchAccess } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { issueCertificate, listCertificatesForStudent } from '@/lib/services/certificate.service';
import { issueCertificateSchema } from '@/lib/validations/bulk-student';
import { assertTeacherCanAccessStudent } from '@/lib/auth/teacher-scope';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ studentId: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('students.certificates');
    const { studentId } = await params;

    const student = await prisma.student.findFirst({ where: { id: studentId, coachingCenterId }, select: { branchId: true } });
    if (!student) return NextResponse.json({ success: false, error: 'STUDENT_NOT_FOUND' }, { status: 404 });
    assertBranchAccess(user, student.branchId);
    await assertTeacherCanAccessStudent(user, studentId);

    const certificates = await listCertificatesForStudent(coachingCenterId, studentId);
    return NextResponse.json({ success: true, certificates });
  } catch (error) {
    return apiErrorResponse(error, '/api/students/[studentId]/certificates GET');
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('students.certificates');
    const { studentId } = await params;
    await assertTeacherCanAccessStudent(user, studentId);
    const body = await request.json().catch(() => null);
    const parsed = issueCertificateSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);

    const certificate = await issueCertificate(coachingCenterId, user, studentId, parsed.data.type);
    return NextResponse.json({ success: true, certificate }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, '/api/students/[studentId]/certificates POST');
  }
}
