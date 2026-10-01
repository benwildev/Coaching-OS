import prisma from '../lib/db';
import { hashPassword } from '../lib/auth/password';

async function seedBrowserUser() {
  const center = await prisma.coachingCenter.findFirst({
    where: { code: 'DEMO12' },
    include: { branches: true },
  });

  if (!center) {
    console.error('Coaching center DEMO12 not found');
    process.exit(1);
  }

  const branch = center.branches[0];
  const role = await prisma.role.findFirst({
    where: { coachingCenterId: center.id, code: 'OWNER' },
  });

  if (!role) {
    console.error('Role OWNER not found for DEMO12');
    process.exit(1);
  }

  const email = 'test-admin@verify.local';
  const passwordHash = hashPassword('Password123#');

  let user = await prisma.user.findFirst({
    where: { coachingCenterId: center.id, email },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        coachingCenterId: center.id,
        branchId: branch?.id,
        email,
        name: 'Browser Test Admin',
        phone: '01799999999',
        passwordHash,
        status: 'ACTIVE',
        roleAssignments: {
          create: {
            roleId: role.id,
            branchId: branch?.id,
          },
        },
      },
    });
    console.log('Created test user:', user.email);
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        status: 'ACTIVE',
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
    console.log('Updated test user password:', user.email);
  }
}

seedBrowserUser().catch(console.error).finally(() => prisma.$disconnect());
