import { superAdminRoute, parseBody, ok } from '@/lib/auth/super-admin-route';
import { createPlan, listPlans } from '@/lib/services/plan.service';
import { planSchema } from '@/lib/validations/platform';

export const dynamic = 'force-dynamic';

export const GET = superAdminRoute('/api/super-admin/plans GET', async () => ok({ plans: await listPlans() }));

export const POST = superAdminRoute('/api/super-admin/plans POST', async ({ admin, req, ip }) => {
  const body = await parseBody(req, planSchema);
  if (!body.ok) return body.response;
  return ok({ plan: await createPlan(admin.adminId, body.data, ip) }, 201);
});
