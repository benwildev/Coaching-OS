import { superAdminRoute, parseBody, ok } from '@/lib/auth/super-admin-route';
import { createTenant, listTenants } from '@/lib/services/platform-tenant.service';
import { tenantCreateSchema } from '@/lib/validations/platform';

export const dynamic = 'force-dynamic';

export const GET = superAdminRoute('/api/super-admin/coaching-centers GET', async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const result = await listTenants({
    search: sp.get('search') || undefined,
    category: sp.get('category') || undefined,
    planId: sp.get('planId') || undefined,
    kind: sp.get('kind') || undefined,
    page: Number(sp.get('page')) || 1,
    pageSize: Number(sp.get('pageSize')) || 20,
  });
  return ok({ ...result });
});

export const POST = superAdminRoute('/api/super-admin/coaching-centers POST', async ({ admin, req, ip }) => {
  const body = await parseBody(req, tenantCreateSchema);
  if (!body.ok) return body.response;
  const result = await createTenant(admin.adminId, body.data, ip);
  return ok({ ...result }, 201);
});
