import { subscriptionOpRoute } from '@/lib/auth/super-admin-route';
import { renew } from '@/lib/services/subscription-ops.service';
import { opRenewSchema } from '@/lib/validations/platform';

export const dynamic = 'force-dynamic';

export const POST = subscriptionOpRoute('/api/super-admin/.../subscription/renew POST', opRenewSchema, ({ ctx, tenantId, data }) => renew(ctx, tenantId, data));
