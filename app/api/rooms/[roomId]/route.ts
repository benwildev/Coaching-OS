import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { getRoomById, updateRoom } from '@/lib/services/room.service';
import { roomUpdateSchema } from '@/lib/validations/room';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, props: { params: Promise<{ roomId: string }> }) {
  try {
    const { coachingCenterId } = await requireTenant();
    const { roomId } = await props.params;
    const room = await getRoomById(coachingCenterId, roomId);
    if (!room) return NextResponse.json({ success: false, error: 'Room not found' }, { status: 404 });
    return NextResponse.json({ success: true, room });
  } catch {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
}

export async function PUT(request: Request, props: { params: Promise<{ roomId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);

    const { roomId } = await props.params;
    const body = await request.json();
    const validated = roomUpdateSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const room = await updateRoom(coachingCenterId, roomId, validated.data, user.userId);
    return NextResponse.json({ success: true, room });
  } catch (error: any) {
    console.error('[API /api/rooms/[roomId] PUT] Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to update room' }, { status: 400 });
  }
}
