import { subscriptionOpRoute } from '@/lib/auth/super-admin-route';
import { extendSubscription } from '@/lib/services/subscription-ops.service';
import { opExtendSchema } from '@/lib/validations/platform';

export const dynamic = 'force-dynamic';

export const POST = subscriptionOpRoute('/api/super-admin/.../subscription/extend POST', opExtendSchema, ({ ctx, tenantId, data }) => extendSubscription(ctx, tenantId, data));
