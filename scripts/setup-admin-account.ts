import prisma from '../lib/db';
import { hashPassword } from '../lib/auth/password';
import { authenticateByEmail } from '../lib/services/unified-auth.service';

async function main() {
  const center = await prisma.coachingCenter.findFirst({
    where: { code: 'ACC' },
    include: { branches: true, roles: true }
  });

  if (!center) {
    throw new Error('Coaching Center ACC not found.');
  }

  const defaultPassword = 'Admin@123456';
  const passwordHash = hashPassword(defaultPassword);
  const mainBranch = center.branches.find(b => b.code === 'MAIN') || center.branches[0];

  const adminRole = center.roles.find(r => r.code === 'ADMIN') || await prisma.role.create({
    data: {
      coachingCenterId: center.id,
      name: 'Administrator',
      code: 'ADMIN',
      isSystem: true
    }
  });

  const ownerRole = center.roles.find(r => r.code === 'OWNER');

  // 1. Ensure Owner password is known and unlocked
  const owner = await prisma.user.findFirst({
    where: { coachingCenterId: center.id, email: 'farhana@alokito.edu.bd' }
  });

  if (owner) {
    await prisma.user.update({
      where: { id: owner.id },
      data: {
        passwordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
        status: 'ACTIVE',
        sessionVersion: { increment: 1 }
      }
    });
    console.log('✔ Updated Owner account (farhana@alokito.edu.bd)');
  }

  // 2. Ensure Admin user exists with ADMIN role
  const adminEmail = 'admin@alokito.edu.bd';
  let adminUser = await prisma.user.findFirst({
    where: { coachingCenterId: center.id, email: adminEmail }
  });

  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: {
        coachingCenterId: center.id,
        branchId: mainBranch?.id,
        email: adminEmail,
        phone: '01712000001',
        name: 'System Admin',
        banglaName: 'সিস্টেম অ্যাডমিন',
        passwordHash,
        status: 'ACTIVE',
        sessionVersion: 1,
        roleAssignments: {
          create: {
            roleId: adminRole.id,
            branchId: mainBranch?.id
          }
        }
      }
    });
    console.log('✔ Created new Admin account (admin@alokito.edu.bd)');
  } else {
    await prisma.user.update({
      where: { id: adminUser.id },
      data: {
        passwordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
        status: 'ACTIVE',
        sessionVersion: { increment: 1 }
      }
    });
    // Ensure role assignment
    const hasAdminRole = await prisma.roleAssignment.findFirst({
      where: { userId: adminUser.id, roleId: adminRole.id }
    });
    if (!hasAdminRole) {
      await prisma.roleAssignment.create({
        data: {
          userId: adminUser.id,
          roleId: adminRole.id,
          branchId: mainBranch?.id
        }
      });
    }
    console.log('✔ Updated existing Admin account (admin@alokito.edu.bd)');
  }

  // 3. Test authenticateByEmail for both
  console.log('\n--- Verifying Authentication ---');
  const authAdmin = await authenticateByEmail(adminEmail, defaultPassword);
  console.log('Admin Auth Result:', authAdmin.ok && authAdmin.kind === 'STAFF' ? `SUCCESS (Role: ${authAdmin.staff.role})` : `FAILED: ${authAdmin.ok ? 'Not staff' : authAdmin.reason}`);

  const authOwner = await authenticateByEmail('farhana@alokito.edu.bd', defaultPassword);
  console.log('Owner Auth Result:', authOwner.ok && authOwner.kind === 'STAFF' ? `SUCCESS (Role: ${authOwner.staff.role})` : `FAILED: ${authOwner.ok ? 'Not staff' : authOwner.reason}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
