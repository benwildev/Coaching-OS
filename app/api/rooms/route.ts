import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess } from '@/lib/auth/session';
import { getRoomsList, createRoom } from '@/lib/services/room.service';
import { roomSchema } from '@/lib/validations/room';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId } = await requireTenant();
    const { searchParams } = new URL(request.url);
    const rooms = await getRoomsList(coachingCenterId, searchParams.get('branch') || undefined);
    return NextResponse.json({ success: true, rooms });
  } catch {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);

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
  } catch (error: any) {
    console.error('[API /api/rooms POST] Error:', error);
    const status = error.message?.startsWith('FORBIDDEN') ? 403 : 400;
    return NextResponse.json({ success: false, error: error.message || 'Failed to create room' }, { status });
  }
}
