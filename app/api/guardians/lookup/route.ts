import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import prisma from '@/lib/db';
import { normalizeBdPhone, isValidBdPhone } from '@/lib/validations/student';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['OWNER', 'ADMIN', 'STAFF'] as const;

function isBranchScoped(user: { role: string; branchId: string | null }) {
  return user.role !== 'OWNER' && user.role !== 'ADMIN' && !!user.branchId;
}

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole([...ALLOWED_ROLES]);

    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone') || searchParams.get('q');

    if (!phone) {
      return NextResponse.json({ error: 'Phone parameter is required' }, { status: 400 });
    }

    const normalized = normalizeBdPhone(phone);
    if (!isValidBdPhone(normalized)) {
      return NextResponse.json({ found: false, guardian: null });
    }

    const guardian = await prisma.guardian.findFirst({
      where: {
        coachingCenterId,
        phone: normalized,
      },
      include: {
        studentGuardians: {
          include: {
            student: {
              select: {
                id: true,
                name: true,
                banglaName: true,
                studentIdCode: true,
                status: true,
                branch: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    if (!guardian) {
      return NextResponse.json({ found: false, guardian: null });
    }

    // Branch-locked staff must only see this guardian's children in their own
    // branch — otherwise a phone-number lookup becomes a cross-branch PII
    // oracle for every other child linked to the same guardian.
    const visibleStudentGuardians = isBranchScoped(user)
      ? guardian.studentGuardians.filter((sg) => sg.student.branch?.id === user.branchId)
      : guardian.studentGuardians;

    const childList = visibleStudentGuardians.map((sg) => ({
      studentId: sg.student.id,
      name: sg.student.name,
      banglaName: sg.student.banglaName,
      studentIdCode: sg.student.studentIdCode,
      status: sg.student.status,
      branchName: sg.student.branch?.name,
    }));

    return NextResponse.json({
      found: true,
      guardian: {
        id: guardian.id,
        name: guardian.name,
        banglaName: guardian.banglaName,
        phone: guardian.phone,
        altPhone: guardian.altPhone,
        whatsapp: guardian.whatsapp,
        email: guardian.email,
        occupation: guardian.occupation,
        address: guardian.address,
        relationship: guardian.relationship,
        preferredChannel: guardian.preferredChannel,
        children: childList,
        students: childList,
      },
    });
  } catch (error) {
    return apiErrorResponse(error, '/api/guardians/lookup GET');
  }
}
