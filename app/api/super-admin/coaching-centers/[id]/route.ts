import { superAdminRoute, ok } from '@/lib/auth/super-admin-route';
import { getTenantDetail } from '@/lib/services/platform-tenant.service';

export const dynamic = 'force-dynamic';

export const GET = superAdminRoute<{ params: Promise<{ id: string }> }>('/api/super-admin/coaching-centers/[id] GET', async ({ ctx }) => {
  const { id } = await ctx.params;
  const detail = await getTenantDetail(id);
  if (!detail) throw new Error('COACHING_CENTER_NOT_FOUND');
  return ok({ ...detail });
});
