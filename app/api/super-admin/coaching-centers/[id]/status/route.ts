import { superAdminRoute, parseBody, ok } from '@/lib/auth/super-admin-route';
import { setTenantStatus } from '@/lib/services/platform-tenant.service';
import { opTenantStatusSchema } from '@/lib/validations/platform';

export const dynamic = 'force-dynamic';

export const PUT = superAdminRoute<{ params: Promise<{ id: string }> }>('/api/super-admin/coaching-centers/[id]/status PUT', async ({ admin, req, ctx, ip }) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, opTenantStatusSchema);
  if (!body.ok) return body.response;
  return ok({ result: await setTenantStatus(admin.adminId, id, body.data.status, body.data.reason, ip) });
});
