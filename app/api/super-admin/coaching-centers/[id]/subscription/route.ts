import { superAdminRoute, parseBody, ok } from '@/lib/auth/super-admin-route';
import { assignSubscription } from '@/lib/services/platform-tenant.service';
import { getSubscriptionOverview } from '@/lib/services/subscription-ops.service';
import { subscriptionAssignSchema } from '@/lib/validations/platform';

export const dynamic = 'force-dynamic';

// Phase 11.5: the operational overview (plan value vs override vs effective, usage, over-limit, notice).
export const GET = superAdminRoute<{ params: Promise<{ id: string }> }>('/api/super-admin/coaching-centers/[id]/subscription GET', async ({ ctx }) => {
  const { id } = await ctx.params;
  const overview = await getSubscriptionOverview(id);
  if (!overview) throw new Error('COACHING_CENTER_NOT_FOUND');
  return ok({ ...overview });
});

// Phase 11.4 general-purpose upsert, kept for compatibility. New UI uses the explicit operations
// (assign / renew / extend / change-plan / trial / cancel / restore / overrides), which validate lifecycle
// transitions and require reasons.
export const PUT = superAdminRoute<{ params: Promise<{ id: string }> }>('/api/super-admin/coaching-centers/[id]/subscription PUT', async ({ admin, req, ctx, ip }) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, subscriptionAssignSchema);
  if (!body.ok) return body.response;
  return ok({ subscription: await assignSubscription(admin.adminId, id, body.data, ip) });
});
