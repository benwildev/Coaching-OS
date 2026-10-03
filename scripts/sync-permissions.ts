import 'dotenv/config';
import prisma from '../lib/db';
import { grantToAllTenants, syncAllTenants, realignTeacherBaseline } from '../lib/services/permission.service';
import { isConfigurableRole, isPermissionCode, type ConfigurableRole, type PermissionCode } from '../lib/auth/permissions';

/**
 * Phase 14.1 / 14.4 — idempotent permission catalog sync + tenant backfill.
 *
 *   npx tsx scripts/sync-permissions.ts
 *   npx tsx scripts/sync-permissions.ts --restore-missing-defaults
 *   npx tsx scripts/sync-permissions.ts --grant STAFF:teachers.read
 *
 * --grant is a one-off additive grant to EVERY tenant (used when a baseline
 * default is corrected after tenants were seeded). It only adds missing rows.
 *
 * Additive only: never deletes a Permission or a RolePermission. A role with
 * no rows is seeded with its baseline; a role that already has rows keeps
 * exactly what it has (an Owner's removals are not undone) and only receives
 * defaults for permission codes that are new in the catalog. The explicit
 * --restore-missing-defaults flag re-adds every missing baseline permission.
 */
async function main() {
  const grantArg = process.argv.find((a) => a.startsWith('--grant=')) ?? (process.argv.includes('--grant') ? `--grant=${process.argv[process.argv.indexOf('--grant') + 1]}` : '');
  if (grantArg) {
    const grants = grantArg
      .slice('--grant='.length)
      .split(',')
      .filter(Boolean)
      .map((pair) => {
        const [role, code] = pair.split(':');
        if (!isConfigurableRole(role) || !isPermissionCode(code)) throw new Error(`Bad --grant entry "${pair}" (expected ROLE:permission.code)`);
        return { role: role as ConfigurableRole, code: code as PermissionCode };
      });
    const r = await grantToAllTenants(prisma, grants);
    console.log(`Granted ${grants.map((g) => `${g.role}:${g.code}`).join(', ')}`);
    console.log(`Tenants: ${r.tenants}   Role permissions added: ${r.added}`);
    return;
  }
  const restoreMissing = process.argv.includes('--restore-missing-defaults');
  const summary = await syncAllTenants(prisma, { restoreMissing });
  const realign = await realignTeacherBaseline(prisma);

  console.log('Permissions:');
  console.log(`  Created:  ${summary.catalog.created}`);
  console.log(`  Updated:  ${summary.catalog.updated}`);
  console.log(`  Existing: ${summary.catalog.existing}`);
  console.log('\nTenants:');
  console.log(`  Processed: ${summary.tenants}`);
  console.log('\nRole permissions added:');
  console.log(`  ADMIN:   ${summary.added.ADMIN}`);
  console.log(`  STAFF:   ${summary.added.STAFF}`);
  console.log(`  TEACHER: ${summary.added.TEACHER}`);
  if (realign.removed > 0) {
    console.log(`\nTeacher baseline realigned: removed ${realign.removed} obsolete grants across ${realign.tenants} tenants.`);
  }
  if (restoreMissing) console.log('\n(mode: restore missing defaults)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
