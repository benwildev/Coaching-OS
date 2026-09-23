import { NextResponse } from 'next/server';
import { setupWizardSchema } from '@/lib/validations/setup';
import { completeInitialSetup, isSetupCompleted } from '@/lib/services/tenant.service';
import { createSessionToken, setSessionCookie } from '@/lib/auth/session';
import { recordAuditLog } from '@/lib/services/audit.service';

export async function POST(req: Request) {
  try {
    const alreadySetup = await isSetupCompleted();
    if (alreadySetup) {
      return NextResponse.json(
        { success: false, error: 'Coaching Center setup has already been completed.' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const parsed = setupWizardSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message || 'Invalid setup parameters',
          issues: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const result = await completeInitialSetup(parsed.data);

    // Create session token for the new owner
    const token = await createSessionToken({
      userId: result.owner.id,
      email: result.owner.email,
      phone: result.owner.phone,
      name: result.owner.name,
      banglaName: result.owner.banglaName,
      role: 'OWNER',
      coachingCenterId: result.center.id,
      branchId: result.branch.id,
    });

    await setSessionCookie(token);

    await recordAuditLog({
      coachingCenterId: result.center.id,
      userId: result.owner.id,
      action: 'INITIAL_SETUP_COMPLETED',
      entity: 'CoachingCenter',
      entityId: result.center.id,
      details: { centerName: result.center.name, centerCode: result.center.code },
    });

    return NextResponse.json({
      success: true,
      centerId: result.center.id,
      redirect: '/dashboard',
    });
  } catch (error: any) {
    console.error('[SetupRoute] Error during initial setup:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to complete coaching center setup' },
      { status: 500 }
    );
  }
}
