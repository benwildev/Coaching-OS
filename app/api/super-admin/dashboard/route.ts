import { superAdminRoute, ok } from '@/lib/auth/super-admin-route';
import { getPlatformDashboard } from '@/lib/services/platform-tenant.service';

export const dynamic = 'force-dynamic';

export const GET = superAdminRoute('/api/super-admin/dashboard GET', async () => ok({ dashboard: await getPlatformDashboard() }));
