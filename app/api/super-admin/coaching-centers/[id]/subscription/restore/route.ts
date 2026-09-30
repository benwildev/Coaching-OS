import { subscriptionOpRoute } from '@/lib/auth/super-admin-route';
import { restoreSubscription } from '@/lib/services/subscription-ops.service';
import { opRestoreSchema } from '@/lib/validations/platform';

export const dynamic = 'force-dynamic';

export const POST = subscriptionOpRoute('/api/super-admin/.../subscription/restore POST', opRestoreSchema, ({ ctx, tenantId, data }) =>
  restoreSubscription(ctx, tenantId, { duration: data.duration, reason: data.reason, idempotencyKey: data.idempotencyKey })
);
