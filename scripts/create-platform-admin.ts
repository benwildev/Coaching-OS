import 'dotenv/config';
import prisma from '../lib/db';
import { createPlatformAdmin } from '../lib/services/platform-auth.service';

/**
 * Provisions a Super Admin (platform administrator). There is deliberately no
 * default account and no signup page — the first platform admin is created
 * out-of-band by an operator with database access:
 *
 *   PLATFORM_ADMIN_EMAIL=you@agency.com PLATFORM_ADMIN_NAME="Your Name" \
 *   PLATFORM_ADMIN_PASSWORD='at-least-12-characters' \
 *   npx tsx scripts/create-platform-admin.ts
 *
 * The password is read from the environment, hashed, and never printed or logged.
 */
async function main() {
  const email = process.env.PLATFORM_ADMIN_EMAIL;
  const name = process.env.PLATFORM_ADMIN_NAME || 'Platform Admin';
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  if (!email || !password) {
    console.error('PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD are required.');
    process.exit(1);
  }
  const admin = await createPlatformAdmin({ email, name, password });
  console.log(`Platform admin created: ${admin.email} (${admin.id})`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
