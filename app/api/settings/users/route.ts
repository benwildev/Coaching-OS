import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { userCreateSchema } from '@/lib/validations/auth';
import { getUsersByTenant, createUser, updateUserStatus } from '@/lib/services/user.service';

export async function GET() {
  try {
    const { coachingCenterId } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);

    const users = await getUsersByTenant(coachingCenterId);
    return NextResponse.json({ success: true, users });
  } catch {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);

    const body = await req.json();
    const parsed = userCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Invalid user data' },
        { status: 400 }
      );
    }

    const newUser = await createUser(coachingCenterId, parsed.data, user.userId);
    return NextResponse.json({ success: true, user: newUser });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create user' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);

    const body = await req.json();
    const { targetUserId, status } = body;

    if (!targetUserId || !status) {
      return NextResponse.json({ success: false, error: 'Missing parameters' }, { status: 400 });
    }

    // Owner cannot deactivate themselves
    if (targetUserId === user.userId) {
      return NextResponse.json(
        { success: false, error: 'You cannot change your own status' },
        { status: 400 }
      );
    }

    const updated = await updateUserStatus(coachingCenterId, targetUserId, status, user.userId);
    return NextResponse.json({ success: true, user: updated });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update user' },
      { status: 500 }
    );
  }
}
