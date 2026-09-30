import { subscriptionOpRoute } from '@/lib/auth/super-admin-route';
import { manageTrial } from '@/lib/services/subscription-ops.service';
import { opTrialSchema } from '@/lib/validations/platform';

export const dynamic = 'force-dynamic';

export const POST = subscriptionOpRoute('/api/super-admin/.../subscription/trial POST', opTrialSchema, ({ ctx, tenantId, data }) => manageTrial(ctx, tenantId, data));
