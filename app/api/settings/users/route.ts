import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { userCreateSchema } from '@/lib/validations/auth';
import { getUsersByTenant, createUser, updateUserStatus } from '@/lib/services/user.service';
import { apiErrorResponse } from '@/lib/api-error';

export async function GET() {
  try {
    const { coachingCenterId } = await requireTenant();
    await requirePermission('settings.users.read');

    const users = await getUsersByTenant(coachingCenterId);
    return NextResponse.json({ success: true, users });
  } catch (error) {
    return apiErrorResponse(error, '/api/settings/users GET');
  }
}

export async function POST(req: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('settings.users.create');

    const body = await req.json();
    const parsed = userCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Invalid user data' },
        { status: 400 }
      );
    }

    // Phase 10.4: createUser itself re-checks role==='OWNER' vs actorRole —
    // this call just supplies the caller's real role, never trusting a
    // client-controlled field for it.
    const newUser = await createUser(coachingCenterId, parsed.data, user.userId, user.role);
    return NextResponse.json({ success: true, user: newUser });
  } catch (error) {
    return apiErrorResponse(error, '/api/settings/users POST');
  }
}

export async function PATCH(req: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('settings.users.update');

    const body = await req.json();
    const { targetUserId, status } = body;

    if (!targetUserId || !status) {
      return NextResponse.json({ success: false, error: 'Missing parameters' }, { status: 400 });
    }
    if (status !== 'ACTIVE' && status !== 'INACTIVE' && status !== 'SUSPENDED') {
      return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
    }

    // Owner cannot deactivate themselves
    if (targetUserId === user.userId) {
      return NextResponse.json(
        { success: false, error: 'You cannot change your own status' },
        { status: 400 }
      );
    }

    // Phase 10.4: updateUserStatus itself checks that only an OWNER may
    // touch another OWNER's status, and that the last active OWNER can
    // never be removed — this call just supplies the caller's real role.
    const updated = await updateUserStatus(coachingCenterId, targetUserId, status, user.userId, user.role);
    return NextResponse.json({ success: true, user: updated });
  } catch (error) {
    return apiErrorResponse(error, '/api/settings/users PATCH');
  }
}
