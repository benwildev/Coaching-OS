import { superAdminRoute, parseBody, ok } from '@/lib/auth/super-admin-route';
import { deletePlan, getPlan, updatePlan } from '@/lib/services/plan.service';
import { planUpdateSchema } from '@/lib/validations/platform';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ planId: string }> };

export const GET = superAdminRoute<Ctx>('/api/super-admin/plans/[planId] GET', async ({ ctx }) => {
  const plan = await getPlan((await ctx.params).planId);
  if (!plan) throw new Error('PLAN_NOT_FOUND');
  return ok({ plan });
});

export const PUT = superAdminRoute<Ctx>('/api/super-admin/plans/[planId] PUT', async ({ admin, req, ctx, ip }) => {
  const body = await parseBody(req, planUpdateSchema);
  if (!body.ok) return body.response;
  return ok({ plan: await updatePlan(admin.adminId, (await ctx.params).planId, body.data, ip) });
});

export const DELETE = superAdminRoute<Ctx>('/api/super-admin/plans/[planId] DELETE', async ({ admin, ctx, ip }) => {
  await deletePlan(admin.adminId, (await ctx.params).planId, ip);
  return ok({});
});
