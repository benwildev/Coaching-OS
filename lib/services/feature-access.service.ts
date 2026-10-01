import { loadTenantSubscription } from './subscription.service';
import prisma from '@/lib/db';
import type { FeatureKey } from '@/lib/subscription';

/**
 * Plan-controlled feature access. Hiding a menu item is presentation only — the
 * API handlers call requireFeature() so a request for a feature the plan does
 * not include is refused server-side regardless of what the UI shows.
 * Legacy tenants (no subscription) have every feature.
 */
export async function hasFeature(coachingCenterId: string, feature: FeatureKey): Promise<boolean> {
  const state = await loadTenantSubscription(prisma, coachingCenterId);
  return state.features[feature] === true;
}

export async function requireFeature(coachingCenterId: string, feature: FeatureKey): Promise<void> {
  if (!(await hasFeature(coachingCenterId, feature))) {
    throw new Error('FEATURE_NOT_ENABLED: This feature is not included in your current plan. Please contact your administrator to upgrade.');
  }
}

