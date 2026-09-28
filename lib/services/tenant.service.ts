import prisma from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { recordAuditLog } from './audit.service';
import { seedStandardSubjectsForCenter } from './academic.service';
import type { SetupWizardInput } from '@/lib/validations/setup';

export async function isSetupCompleted(): Promise<boolean> {
  try {
    const centerCount = await prisma.coachingCenter.count();
    return centerCount > 0;
  } catch (error) {
    console.error('[TenantService] Failed to check setup status:', error);
    // Phase 10.4: fail CLOSED. The old behavior (return false) sent every
    // visitor to the unauthenticated /setup wizard — which mints a brand
    // new OWNER account — during any database hiccup. Treating "we could
    // not confirm" as "setup completed" instead means an outage produces a
    // visible error page, not an open door to creating a new tenant/owner.
    return true;
  }
}

export async function getCoachingCenter(id: string) {
  return prisma.coachingCenter.findUnique({
    where: { id },
    include: {
      branches: true,
      brandingSetting: true,
      systemSettings: true,
    },
  });
}

export async function updateCoachingCenter(
  id: string,
  data: {
    name?: string;
    banglaName?: string;
    phone?: string;
    email?: string;
    website?: string;
    address?: string;
    city?: string;
    district?: string;
    logo?: string;
  },
  userId?: string
) {
  const updated = await prisma.coachingCenter.update({
    where: { id },
    data,
  });

  await recordAuditLog({
    coachingCenterId: id,
    userId,
    action: 'COACHING_CENTER_UPDATED',
    entity: 'CoachingCenter',
    entityId: id,
    details: data,
  });

  return updated;
}

/**
 * `enforceSingleton` gates the "only one center may ever be bootstrapped"
 * rule enforced below. Only `/api/setup` (the actual bootstrap wizard)
 * passes it — verification scripts call this function directly to create
 * several independent throwaway tenants for testing, which is a legitimate,
 * unrelated use of the same "create a coaching center" logic and must not
 * be blocked by it.
 */
export async function completeInitialSetup(input: SetupWizardInput, options: { enforceSingleton?: boolean } = {}) {
  // 1. Check if coaching center with this code already exists
  const existing = await prisma.coachingCenter.findUnique({
    where: { code: input.centerCode },
  });
  if (existing) {
    throw new Error('A coaching center with this code already exists');
  }

  // 2. Hash owner password
  const passwordHash = hashPassword(input.ownerPassword);

  // 3. Perform setup inside a transactional sequence
  const result = await prisma.$transaction(async (tx) => {
    if (options.enforceSingleton) {
      // Phase 10.4: serialize concurrent first-run setup attempts. The
      // route calls isSetupCompleted() before this, but that check-then-act
      // has a race — two requests landing in the same window could both
      // pass it and each mint an independent tenant + OWNER. A Postgres
      // advisory lock held for the rest of this transaction means only one
      // setup attempt is ever inside this transaction at a time; the loser
      // re-checks and fails cleanly instead of creating a second center.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7270010001)`;
      const alreadySetup = await tx.coachingCenter.count();
      if (alreadySetup > 0) {
        throw new Error('Coaching Center setup has already been completed');
      }
    }

    // A. Create Coaching Center
    const center = await tx.coachingCenter.create({
      data: {
        name: input.centerName,
        banglaName: input.centerBanglaName,
        code: input.centerCode.toUpperCase(),
        phone: input.centerPhone,
        email: input.centerEmail || undefined,
        address: input.centerAddress,
        city: input.centerCity,
        district: input.centerDistrict,
        logo: input.logoUrl,
      },
    });

    // B. Create Main Branch
    const branch = await tx.branch.create({
      data: {
        coachingCenterId: center.id,
        name: input.branchName,
        banglaName: input.branchBanglaName,
        code: input.branchCode.toUpperCase(),
        phone: input.centerPhone,
        address: input.branchAddress || input.centerAddress,
        isMain: true,
      },
    });

    // C. Create Default Roles for this center
    const ownerRole = await tx.role.create({
      data: {
        coachingCenterId: center.id,
        name: 'Owner',
        code: 'OWNER',
        description: 'Complete administrative ownership of the coaching center',
        isSystem: true,
      },
    });

    await tx.role.createMany({
      data: [
        {
          coachingCenterId: center.id,
          name: 'Administrator',
          code: 'ADMIN',
          description: 'Center management, operations, and academic administration',
          isSystem: true,
        },
        {
          coachingCenterId: center.id,
          name: 'Staff',
          code: 'STAFF',
          description: 'Front desk, fee receipts, and attendance tracking',
          isSystem: true,
        },
        {
          coachingCenterId: center.id,
          name: 'Teacher',
          code: 'TEACHER',
          description: 'Teaching faculty, marks entry, and batch schedule access',
          isSystem: true,
        },
      ],
    });

    // D. Create Owner User
    const owner = await tx.user.create({
      data: {
        coachingCenterId: center.id,
        branchId: branch.id,
        email: input.ownerEmail.toLowerCase(),
        phone: input.ownerPhone,
        name: input.ownerName,
        banglaName: input.ownerBanglaName,
        passwordHash,
        status: 'ACTIVE',
      },
    });

    // E. Assign Owner Role
    await tx.roleAssignment.create({
      data: {
        userId: owner.id,
        roleId: ownerRole.id,
        branchId: branch.id,
      },
    });

    // F. Create Initial Academic Session
    const session = await tx.academicSession.create({
      data: {
        coachingCenterId: center.id,
        name: input.sessionName,
        banglaName: input.sessionBanglaName || `শিক্ষাবর্ষ ${input.sessionName}`,
        startDate: new Date(input.sessionStartDate),
        endDate: new Date(input.sessionEndDate),
        isCurrent: true,
      },
    });

    // G. Create Branding Settings
    await tx.brandingSetting.create({
      data: {
        coachingCenterId: center.id,
        primaryColor: input.primaryColor || '#063B78',
        secondaryColor: '#00296b',
        accentColor: input.accentColor || '#FFD200',
        logoUrl: input.logoUrl,
      },
    });

    // H. Seed Academic Programs & Classes based on Bangladesh standards
    if (input.selectedPrograms.includes('SSC')) {
      const sscProgram = await tx.academicProgram.create({
        data: {
          coachingCenterId: center.id,
          name: 'Secondary School Certificate (SSC)',
          banglaName: 'মাধ্যমিক স্কুল সার্টিফিকেট (এসএসসি)',
          code: 'SSC',
          description: 'Class 9 and 10 secondary education coaching program',
        },
      });

      const class9 = await tx.academicClass.create({
        data: {
          coachingCenterId: center.id,
          academicProgramId: sscProgram.id,
          name: 'Class 9',
          banglaName: 'নবম শ্রেণি',
          code: 'CLASS_9',
          order: 9,
        },
      });

      const class10 = await tx.academicClass.create({
        data: {
          coachingCenterId: center.id,
          academicProgramId: sscProgram.id,
          name: 'Class 10',
          banglaName: 'দশম শ্রেণি',
          code: 'CLASS_10',
          order: 10,
        },
      });

      // Groups for Class 9 & 10
      for (const cl of [class9, class10]) {
        await tx.academicGroup.createMany({
          data: [
            { coachingCenterId: center.id, academicClassId: cl.id, name: 'Science', banglaName: 'বিজ্ঞান', code: 'SCIENCE' },
            { coachingCenterId: center.id, academicClassId: cl.id, name: 'Business Studies', banglaName: 'ব্যবসায় শিক্ষা', code: 'BUSINESS_STUDIES' },
            { coachingCenterId: center.id, academicClassId: cl.id, name: 'Humanities', banglaName: 'মানবিক', code: 'HUMANITIES' },
          ],
        });
      }
    }

    if (input.selectedPrograms.includes('HSC')) {
      const hscProgram = await tx.academicProgram.create({
        data: {
          coachingCenterId: center.id,
          name: 'Higher Secondary Certificate (HSC)',
          banglaName: 'উচ্চ মাধ্যমিক সার্টিফিকেট (এইচএসসি)',
          code: 'HSC',
          description: 'Class 11 and 12 higher secondary coaching program',
        },
      });

      const class11 = await tx.academicClass.create({
        data: {
          coachingCenterId: center.id,
          academicProgramId: hscProgram.id,
          name: 'Class 11',
          banglaName: 'একাদশ শ্রেণি',
          code: 'CLASS_11',
          order: 11,
        },
      });

      const class12 = await tx.academicClass.create({
        data: {
          coachingCenterId: center.id,
          academicProgramId: hscProgram.id,
          name: 'Class 12',
          banglaName: 'দ্বাদশ শ্রেণি',
          code: 'CLASS_12',
          order: 12,
        },
      });

      for (const cl of [class11, class12]) {
        await tx.academicGroup.createMany({
          data: [
            { coachingCenterId: center.id, academicClassId: cl.id, name: 'Science', banglaName: 'বিজ্ঞান', code: 'SCIENCE' },
            { coachingCenterId: center.id, academicClassId: cl.id, name: 'Business Studies', banglaName: 'ব্যবসায় শিক্ষা', code: 'BUSINESS_STUDIES' },
            { coachingCenterId: center.id, academicClassId: cl.id, name: 'Humanities', banglaName: 'মানবিক', code: 'HUMANITIES' },
          ],
        });
      }
    }

    if (input.selectedPrograms.includes('ADMISSION')) {
      const admProgram = await tx.academicProgram.create({
        data: {
          coachingCenterId: center.id,
          name: 'University & College Admission',
          banglaName: 'বিশ্ববিদ্যালয় ও কলেজ ভর্তি প্রস্তুতি',
          code: 'ADMISSION',
          description: 'Medical, Engineering, and General University Admission Coaching',
        },
      });

      await tx.academicClass.createMany({
        data: [
          { coachingCenterId: center.id, academicProgramId: admProgram.id, name: 'Medical Admission', banglaName: 'মেডিকেল ভর্তি প্রস্তুতি', code: 'MED_ADM', order: 1 },
          { coachingCenterId: center.id, academicProgramId: admProgram.id, name: 'Engineering Admission (BUET/CKRUET)', banglaName: 'প্রকৌশল ভর্তি প্রস্তুতি', code: 'ENG_ADM', order: 2 },
          { coachingCenterId: center.id, academicProgramId: admProgram.id, name: 'University Admission (DU "Ka/Kha/Ga")', banglaName: 'বিশ্ববিদ্যালয় ভর্তি প্রস্তুতি', code: 'UNI_ADM', order: 3 },
        ],
      });
    }

    // I. Seed Education Boards (if not already seeded)
    const boardsCount = await tx.educationBoard.count();
    if (boardsCount === 0) {
      await tx.educationBoard.createMany({
        data: [
          { name: 'Dhaka', banglaName: 'ঢাকা', code: 'DHAKA', isGeneral: true },
          { name: 'Chattogram', banglaName: 'চট্টগ্রাম', code: 'CTG', isGeneral: true },
          { name: 'Rajshahi', banglaName: 'রাজশাহী', code: 'RAJ', isGeneral: true },
          { name: 'Cumilla', banglaName: 'কুমিল্লা', code: 'COM', isGeneral: true },
          { name: 'Jashore', banglaName: 'যশোর', code: 'JAS', isGeneral: true },
          { name: 'Sylhet', banglaName: 'সিলেট', code: 'SYL', isGeneral: true },
          { name: 'Barishal', banglaName: 'বরিশাল', code: 'BAR', isGeneral: true },
          { name: 'Dinajpur', banglaName: 'দিনাজপুর', code: 'DIN', isGeneral: true },
          { name: 'Mymensingh', banglaName: 'ময়মনসিংহ', code: 'MYM', isGeneral: true },
          { name: 'Madrasah', banglaName: 'মাদ্রাসা', code: 'MADRASAH', isGeneral: false },
          { name: 'Technical', banglaName: 'কারিগরি', code: 'TECHNICAL', isGeneral: false },
        ],
      });
    }

    // J. Default System Settings
    await tx.systemSetting.createMany({
      data: [
        { coachingCenterId: center.id, key: 'timezone', value: 'Asia/Dhaka', group: 'REGION' },
        { coachingCenterId: center.id, key: 'currency', value: 'BDT', group: 'REGION' },
        { coachingCenterId: center.id, key: 'currency_symbol', value: '৳', group: 'REGION' },
        { coachingCenterId: center.id, key: 'date_format', value: 'DD/MM/YYYY', group: 'REGION' },
        { coachingCenterId: center.id, key: 'language', value: 'bn', group: 'REGION' },
      ],
    });

    return {
      center,
      branch,
      owner,
      session,
    };
  }, {
    maxWait: 15000,
    timeout: 60000,
  });

  // Automatically seed standard NCTB curriculum subjects
  try {
    await seedStandardSubjectsForCenter(result.center.id);
  } catch (err) {
    console.error('[TenantService] Non-blocking error seeding standard subjects:', err);
  }

  return result;
}
