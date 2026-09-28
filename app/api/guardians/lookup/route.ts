import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import prisma from '@/lib/db';
import { normalizeBdPhone, isValidBdPhone } from '@/lib/validations/student';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['OWNER', 'ADMIN', 'STAFF'] as const;

export async function GET(request: Request) {
  try {
    const { coachingCenterId } = await requireTenant();
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
        children: guardian.studentGuardians.map((sg) => ({
          studentId: sg.student.id,
          name: sg.student.name,
          banglaName: sg.student.banglaName,
          studentIdCode: sg.student.studentIdCode,
          status: sg.student.status,
          branchName: sg.student.branch?.name,
        })),
        students: guardian.studentGuardians.map((sg) => ({
          studentId: sg.student.id,
          name: sg.student.name,
          banglaName: sg.student.banglaName,
          studentIdCode: sg.student.studentIdCode,
          status: sg.student.status,
          branchName: sg.student.branch?.name,
        })),
      },
    });
  } catch (error: any) {
    console.error('[API /api/guardians/lookup GET] Error:', error);
    const status = error?.message === 'FORBIDDEN' ? 403 : 401;
    return NextResponse.json({ error: error?.message || 'Unauthorized' }, { status });
  }
}
