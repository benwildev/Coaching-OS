import { subscriptionOpRoute } from '@/lib/auth/super-admin-route';
import { changePlan, previewPlanChange } from '@/lib/services/subscription-ops.service';
import { opChangePlanSchema } from '@/lib/validations/platform';

export const dynamic = 'force-dynamic';

// `preview: true` returns what the change would do (limits before/after, over-limit
// counts, whether overrides would be cleared) without applying anything.
export const POST = subscriptionOpRoute('/api/super-admin/.../subscription/change-plan POST', opChangePlanSchema, async ({ ctx, tenantId, data }) => {
  if (data.preview) return { preview: await previewPlanChange(tenantId, data.planId, data.keepOverrides) };
  return changePlan(ctx, tenantId, { planId: data.planId, keepOverrides: data.keepOverrides, reason: data.reason as string, idempotencyKey: data.idempotencyKey });
});
