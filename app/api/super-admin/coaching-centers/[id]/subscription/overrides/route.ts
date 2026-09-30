import { subscriptionOpRoute } from '@/lib/auth/super-admin-route';
import { updateOverrides } from '@/lib/services/subscription-ops.service';
import { opOverridesSchema } from '@/lib/validations/platform';

export const dynamic = 'force-dynamic';

export const PUT = subscriptionOpRoute('/api/super-admin/.../subscription/overrides PUT', opOverridesSchema, ({ ctx, tenantId, data }) =>
  updateOverrides(ctx, tenantId, data)
);
