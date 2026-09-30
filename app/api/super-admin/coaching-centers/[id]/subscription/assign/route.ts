import { subscriptionOpRoute } from '@/lib/auth/super-admin-route';
import { assignPlan } from '@/lib/services/subscription-ops.service';
import { opAssignSchema } from '@/lib/validations/platform';

export const dynamic = 'force-dynamic';

export const POST = subscriptionOpRoute('/api/super-admin/.../subscription/assign POST', opAssignSchema, ({ ctx, tenantId, data }) => assignPlan(ctx, tenantId, data));
