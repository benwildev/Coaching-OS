import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getTenantSubscription } from '@/lib/services/subscription.service';
import { getTenantUsage } from '@/lib/services/usage.service';
import { computeOverLimits, subscriptionNotice } from '@/lib/subscription';

export const dynamic = 'force-dynamic';

/**
 * The tenant OWNER's read-only view of their own plan. Deliberately sanitized:
 * no subscription/plan ids, no other tenant, no platform data — just the plan
 * name, state, dates, this tenant's limits, this tenant's usage and features.
 * The tenant always comes from the session.
 */
export async function GET() {
  try {
    const { coachingCenterId } = await requireTenant();
    await requirePermission('settings.subscription.read');

    const [state, usage] = await Promise.all([getTenantSubscription(coachingCenterId), getTenantUsage(coachingCenterId)]);

    return NextResponse.json({
      success: true,
      subscription: {
        hasSubscription: state.hasSubscription,
        status: state.status,
        suspended: state.tenantSuspended,
        isTrial: state.storedStatus === 'TRIAL',
        planName: state.planName,
        planBanglaName: state.planBanglaName,
        startDate: state.startDate,
        endDate: state.endDate,
        canGrow: state.canGrow,
      },
      // Read-only guidance for the OWNER. No prices or amounts are ever invented here.
      notice: subscriptionNotice({ tenantSuspended: state.tenantSuspended, status: state.status, endDate: state.endDate }),
      overLimits: computeOverLimits(state.limits, usage as unknown as Record<string, number | string>),
      limits: state.limits,
      usage,
      features: state.features,
    });
  } catch (error) {
    return apiErrorResponse(error, '/api/settings/subscription GET');
  }
}
