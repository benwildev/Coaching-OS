import { NextResponse } from 'next/server';
import { requireTenant, requirePermission, assertBranchAccess, resolveEffectiveBranchId } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getRoomsList, createRoom } from '@/lib/services/room.service';
import { roomSchema } from '@/lib/validations/room';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('routine.read');
    const { searchParams } = new URL(request.url);
    // Phase 10.5: previously trusted ?branch= verbatim.
    const rooms = await getRoomsList(coachingCenterId, resolveEffectiveBranchId(user, searchParams.get('branch') || undefined));
    return NextResponse.json({ success: true, rooms });
  } catch (error) {
    return apiErrorResponse(error, '/api/rooms GET');
  }
}

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('routine.manage');

    const body = await request.json();
    const validated = roomSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    assertBranchAccess(user, validated.data.branchId);

    const room = await createRoom(coachingCenterId, validated.data, user.userId);
    return NextResponse.json({ success: true, room }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, '/api/rooms POST');
  }
}
