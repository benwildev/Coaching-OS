import { z } from 'zod';
import { subscriptionOpRoute } from '@/lib/auth/super-admin-route';
import { resyncToLatestPlan } from '@/lib/services/subscription-ops.service';

export const dynamic = 'force-dynamic';

const schema = z.object({
  reason: z.string().trim().min(3, 'A reason is required').max(300),
  confirm: z.literal(true, { error: 'Confirmation is required' }),
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
});

export const POST = subscriptionOpRoute('/api/super-admin/.../subscription/resync POST', schema, ({ ctx, tenantId, data }) =>
  resyncToLatestPlan(ctx, tenantId, { reason: data.reason, idempotencyKey: data.idempotencyKey })
);
