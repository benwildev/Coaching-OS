import prisma from '../lib/db';

async function main() {
  const center = await prisma.coachingCenter.findFirst({
    where: { code: 'ACC' },
    include: {
      branches: true,
      academicSessions: true,
      academicPrograms: {
        include: {
          classes: {
            include: { groups: true }
          }
        }
      }
    }
  });

  if (!center) {
    throw new Error('ACC Coaching Center not found');
  }

  const branch = center.branches.find(b => b.isMain) || center.branches[0];
  const session = center.academicSessions.find(s => s.isCurrent) || center.academicSessions[0];

  if (!branch || !session) {
    throw new Error('Branch or Session not found');
  }

  console.log(`Seeding batches for ${center.name} (${branch.name}, ${session.name})...`);

  for (const program of center.academicPrograms) {
    for (const cls of program.classes) {
      if (cls.groups.length > 0) {
        for (const grp of cls.groups) {
          const code = `${cls.name.replace(/\s+/g, '')}-${grp.name.slice(0, 3).toUpperCase()}-26`;
          const existing = await prisma.batch.findFirst({
            where: {
              coachingCenterId: center.id,
              branchId: branch.id,
              academicSessionId: session.id,
              academicClassId: cls.id,
              academicGroupId: grp.id,
            }
          });

          if (!existing) {
            await prisma.batch.create({
              data: {
                coachingCenterId: center.id,
                branchId: branch.id,
                academicSessionId: session.id,
                academicProgramId: program.id,
                academicClassId: cls.id,
                academicGroupId: grp.id,
                name: `${cls.name} ${grp.name} - Regular Batch`,
                banglaName: `${cls.banglaName || cls.name} ${grp.banglaName || grp.name} - রেগুলার ব্যাচ`,
                code,
                capacity: 45,
                status: 'ACTIVE',
              }
            });
            console.log(`✔ Created batch: ${cls.name} ${grp.name} (${code})`);
          } else {
            // Ensure it is ACTIVE
            if (existing.status !== 'ACTIVE') {
              await prisma.batch.update({
                where: { id: existing.id },
                data: { status: 'ACTIVE' }
              });
            }
            console.log(`• Batch exists: ${existing.name} (${existing.code})`);
          }
        }
      } else {
        // Class without groups (e.g. Admission classes)
        const code = `${cls.name.slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, '')}-REG-26`;
        const existing = await prisma.batch.findFirst({
          where: {
            coachingCenterId: center.id,
            branchId: branch.id,
            academicSessionId: session.id,
            academicClassId: cls.id,
          }
        });

        if (!existing) {
          await prisma.batch.create({
            data: {
              coachingCenterId: center.id,
              branchId: branch.id,
              academicSessionId: session.id,
              academicProgramId: program.id,
              academicClassId: cls.id,
              name: `${cls.name} - Intensive Batch`,
              banglaName: `${cls.banglaName || cls.name} - নিবিড় পরিচর্যা ব্যাচ`,
              code,
              capacity: 50,
              status: 'ACTIVE',
            }
          });
          console.log(`✔ Created batch: ${cls.name} (${code})`);
        } else {
          console.log(`• Batch exists: ${existing.name}`);
        }
      }
    }
  }

  const total = await prisma.batch.count({ where: { coachingCenterId: center.id } });
  console.log(`\nDone! Total active batches in center: ${total}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
