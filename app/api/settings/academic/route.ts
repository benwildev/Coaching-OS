import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import {
  getAcademicPrograms,
  getAcademicSessions,
  createAcademicProgram,
  createAcademicClass,
  createAcademicSession,
  getEducationBoards,
} from '@/lib/services/academic.service';

export async function GET() {
  try {
    const { coachingCenterId } = await requireTenant();
    const [programs, sessions, boards] = await Promise.all([
      getAcademicPrograms(coachingCenterId),
      getAcademicSessions(coachingCenterId),
      getEducationBoards(),
    ]);

    return NextResponse.json({
      success: true,
      programs,
      sessions,
      boards,
    });
  } catch (error) {
    return apiErrorResponse(error, '/api/settings/academic GET');
  }
}

export async function POST(req: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('settings.academic.update');

    const body = await req.json();
    const { type, data } = body;

    if (type === 'PROGRAM') {
      const program = await createAcademicProgram(coachingCenterId, data, user.userId);
      return NextResponse.json({ success: true, item: program });
    }

    if (type === 'CLASS') {
      const academicClass = await createAcademicClass(coachingCenterId, data, user.userId);
      return NextResponse.json({ success: true, item: academicClass });
    }

    if (type === 'SESSION') {
      const session = await createAcademicSession(
        coachingCenterId,
        {
          name: data.name,
          banglaName: data.banglaName,
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate),
          isCurrent: data.isCurrent,
        },
        user.userId
      );
      return NextResponse.json({ success: true, item: session });
    }

    return NextResponse.json({ success: false, error: 'Unknown entity type' }, { status: 400 });
  } catch (error) {
    return apiErrorResponse(error, '/api/settings/academic POST');
  }
}
