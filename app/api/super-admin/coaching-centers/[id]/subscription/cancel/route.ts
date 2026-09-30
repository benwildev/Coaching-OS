import { subscriptionOpRoute } from '@/lib/auth/super-admin-route';
import { cancelSubscription } from '@/lib/services/subscription-ops.service';
import { opCancelSchema } from '@/lib/validations/platform';

export const dynamic = 'force-dynamic';

export const POST = subscriptionOpRoute('/api/super-admin/.../subscription/cancel POST', opCancelSchema, ({ ctx, tenantId, data }) =>
  cancelSubscription(ctx, tenantId, { reason: data.reason, idempotencyKey: data.idempotencyKey })
);
