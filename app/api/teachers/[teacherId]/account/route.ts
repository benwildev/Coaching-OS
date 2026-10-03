import { NextResponse } from 'next/server';
import { requireTenant, requirePermission, assertBranchAccess } from '@/lib/auth/session';
import {
  getTeacherById,
  getEligibleTeacherAccounts,
  linkTeacherAccount,
  unlinkTeacherAccount,
} from '@/lib/services/teacher.service';
import { teacherAccountLinkSchema } from '@/lib/validations/teacher';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

// Phase 10.5: OWNER/ADMIN-only teacher <-> login account linking.

export async function GET(request: Request, props: { params: Promise<{ teacherId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('teachers.account');
    const { teacherId } = await props.params;

    const teacher = await getTeacherById(coachingCenterId, teacherId);
    if (!teacher) return NextResponse.json({ success: false, error: 'Teacher not found' }, { status: 404 });
    assertBranchAccess(user, teacher.branchId);

    const eligibleAccounts = teacher.userId ? [] : await getEligibleTeacherAccounts(coachingCenterId);

    return NextResponse.json({
      success: true,
      linked: !!teacher.userId,
      account: teacher.user ?? null,
      eligibleAccounts,
    });
  } catch (error) {
    return apiErrorResponse(error, '/api/teachers/[teacherId]/account GET');
  }
}

export async function POST(request: Request, props: { params: Promise<{ teacherId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('teachers.account');
    const { teacherId } = await props.params;

    const teacher = await getTeacherById(coachingCenterId, teacherId);
    if (!teacher) return NextResponse.json({ success: false, error: 'Teacher not found' }, { status: 404 });
    assertBranchAccess(user, teacher.branchId);

    const body = await request.json();
    const validated = teacherAccountLinkSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const result = await linkTeacherAccount(coachingCenterId, teacherId, validated.data, user.userId, user.role);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/teachers/[teacherId]/account POST');
  }
}

export async function DELETE(request: Request, props: { params: Promise<{ teacherId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('teachers.account');
    const { teacherId } = await props.params;

    const teacher = await getTeacherById(coachingCenterId, teacherId);
    if (!teacher) return NextResponse.json({ success: false, error: 'Teacher not found' }, { status: 404 });
    assertBranchAccess(user, teacher.branchId);

    await unlinkTeacherAccount(coachingCenterId, teacherId, user.userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, '/api/teachers/[teacherId]/account DELETE');
  }
}
