import { superAdminRoute, ok } from '@/lib/auth/super-admin-route';
import { getSubscriptionHistory } from '@/lib/services/subscription-ops.service';

export const dynamic = 'force-dynamic';

export const GET = superAdminRoute<{ params: Promise<{ id: string }> }>('/api/super-admin/.../subscription/history GET', async ({ ctx }) => {
  const { id } = await ctx.params;
  return ok({ history: await getSubscriptionHistory(id) });
});
