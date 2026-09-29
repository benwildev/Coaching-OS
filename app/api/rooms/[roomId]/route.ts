import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getRoomById, updateRoom } from '@/lib/services/room.service';
import { roomUpdateSchema } from '@/lib/validations/room';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, props: { params: Promise<{ roomId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { roomId } = await props.params;
    const room = await getRoomById(coachingCenterId, roomId);
    if (!room) return NextResponse.json({ success: false, error: 'Room not found' }, { status: 404 });
    // Phase 10.5: previously no branch check at all.
    assertBranchAccess(user, room.branchId);
    return NextResponse.json({ success: true, room });
  } catch (error) {
    return apiErrorResponse(error, '/api/rooms/[roomId] GET');
  }
}

export async function PUT(request: Request, props: { params: Promise<{ roomId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);

    const { roomId } = await props.params;

    // Phase 10.5: previously no branch check at all — a branch-locked
    // STAFF could edit any room in any branch of the tenant.
    const existing = await getRoomById(coachingCenterId, roomId);
    if (!existing) return NextResponse.json({ success: false, error: 'Room not found' }, { status: 404 });
    assertBranchAccess(user, existing.branchId);

    const body = await request.json();
    const validated = roomUpdateSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    if (validated.data.branchId) {
      assertBranchAccess(user, validated.data.branchId);
    }

    const room = await updateRoom(coachingCenterId, roomId, validated.data, user.userId);
    return NextResponse.json({ success: true, room });
  } catch (error) {
    return apiErrorResponse(error, '/api/rooms/[roomId] PUT');
  }
}
