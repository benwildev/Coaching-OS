import 'dotenv/config';
import prisma from '../lib/db';
import { hashPassword } from '../lib/auth/password';

async function seedStudent() {
  console.log('Seeding student account and portal credentials...');

  const center = await prisma.coachingCenter.findFirst();
  if (!center) throw new Error('No coaching center found. Run setup first.');

  const branch = await prisma.branch.findFirst({ where: { coachingCenterId: center.id } });
  if (!branch) throw new Error('No branch found.');

  const session = await prisma.academicSession.findFirst({ where: { coachingCenterId: center.id } });
  if (!session) throw new Error('No academic session found.');

  const program = await prisma.academicProgram.findFirst({ where: { coachingCenterId: center.id, code: 'SSC' } })
    || await prisma.academicProgram.findFirst({ where: { coachingCenterId: center.id } });
  if (!program) throw new Error('No academic program found.');

  const academicClass = await prisma.academicClass.findFirst({ where: { academicProgramId: program.id, code: 'CLASS_10' } })
    || await prisma.academicClass.findFirst({ where: { academicProgramId: program.id } });
  if (!academicClass) throw new Error('No academic class found.');

  // Find or create batch
  let batch = await prisma.batch.findFirst({
    where: { coachingCenterId: center.id, name: 'Class 10 Science - Morning Batch' },
  });

  if (!batch) {
    batch = await prisma.batch.create({
      data: {
        coachingCenterId: center.id,
        branchId: branch.id,
        academicSessionId: session.id,
        academicProgramId: program.id,
        academicClassId: academicClass.id,
        name: 'Class 10 Science - Morning Batch',
        code: 'C10-SCI-AM',
        capacity: 40,
        startDate: new Date('2026-01-01'),
        status: 'ACTIVE',
      },
    });
    console.log('Created batch:', batch.name);
  }

  // Find or create Student
  let student = await prisma.student.findFirst({
    where: { coachingCenterId: center.id, email: 'student@alokito.edu.bd' },
  });

  if (!student) {
    student = await prisma.student.create({
      data: {
        coachingCenterId: center.id,
        branchId: branch.id,
        studentIdCode: 'ACC-26-00001',
        name: 'Tanvir Ahmed',
        banglaName: 'তানভীর আহমেদ',
        gender: 'Male',
        bloodGroup: 'B+',
        dob: new Date('2009-04-15'),
        religion: 'Islam',
        nationality: 'Bangladeshi',
        phone: '01711000001',
        email: 'student@alokito.edu.bd',
        schoolName: 'Dhaka Residential Model College',
        address: 'House 12, Road 4, Dhanmondi, Dhaka',
        status: 'ACTIVE',
      },
    });
    console.log('Created student:', student.name, 'with ID Code:', student.studentIdCode);
  } else {
    console.log('Found existing student:', student.name);
  }

  // Find or create Guardian
  let guardian = await prisma.guardian.findFirst({
    where: { coachingCenterId: center.id, phone: '01711000002' },
  });

  if (!guardian) {
    guardian = await prisma.guardian.create({
      data: {
        coachingCenterId: center.id,
        name: 'Rafiqul Ahmed',
        banglaName: 'রফিকুল আহমেদ',
        relationship: 'Father',
        phone: '01711000002',
        email: 'guardian@alokito.edu.bd',
        occupation: 'Government Service',
        address: 'House 12, Road 4, Dhanmondi, Dhaka',
        isPrimary: true,
        preferredChannel: 'SMS',
      },
    });
    console.log('Created guardian:', guardian.name);
  }

  // Link student with guardian
  const studentGuardian = await prisma.studentGuardian.findUnique({
    where: { studentId_guardianId: { studentId: student.id, guardianId: guardian.id } },
  });
  if (!studentGuardian) {
    await prisma.studentGuardian.create({
      data: {
        studentId: student.id,
        guardianId: guardian.id,
        relationship: 'Father',
        isPrimary: true,
        canPickup: true,
        isEmergencyContact: true,
        canReceiveNotifications: true,
        preferredChannel: 'SMS',
      },
    });
    console.log('Linked student and guardian');
  }

  // Enroll student
  const enrollment = await prisma.studentEnrollment.findFirst({
    where: { studentId: student.id, academicSessionId: session.id },
  });
  if (!enrollment) {
    await prisma.studentEnrollment.create({
      data: {
        coachingCenterId: center.id,
        branchId: branch.id,
        studentId: student.id,
        academicSessionId: session.id,
        academicProgramId: program.id,
        academicClassId: academicClass.id,
        rollNumber: '101',
        admissionDate: new Date('2026-01-10'),
        status: 'ENROLLED',
      },
    });
    console.log('Enrolled student in class 10');
  }

  // Add to batch
  const studentBatch = await prisma.studentBatch.findFirst({
    where: { studentId: student.id, batchId: batch.id },
  });
  if (!studentBatch) {
    await prisma.studentBatch.create({
      data: {
        coachingCenterId: center.id,
        studentId: student.id,
        batchId: batch.id,
        rollCode: '01',
        joinedAt: new Date('2026-01-15'),
        status: 'ACTIVE',
      },
    });
    console.log('Assigned student to batch');
  }

  // Create Student Portal Account
  const studentPasswordHash = hashPassword('student123');
  const existingStudentAccount = await prisma.portalAccount.findUnique({
    where: { studentId: student.id },
  });

  if (existingStudentAccount) {
    await prisma.portalAccount.update({
      where: { id: existingStudentAccount.id },
      data: {
        email: student.email,
        phone: student.phone,
        passwordHash: studentPasswordHash,
        status: 'ACTIVE',
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
    console.log('Updated existing student portal account password to "student123"');
  } else {
    await prisma.portalAccount.create({
      data: {
        coachingCenterId: center.id,
        portalType: 'STUDENT',
        studentId: student.id,
        email: student.email,
        phone: student.phone,
        passwordHash: studentPasswordHash,
        status: 'ACTIVE',
      },
    });
    console.log('Created student portal account (student@alokito.edu.bd / student123)');
  }

  // Create Guardian Portal Account
  const guardianPasswordHash = hashPassword('guardian123');
  const existingGuardianAccount = await prisma.portalAccount.findUnique({
    where: { guardianId: guardian.id },
  });

  if (existingGuardianAccount) {
    await prisma.portalAccount.update({
      where: { id: existingGuardianAccount.id },
      data: {
        email: guardian.email,
        phone: guardian.phone,
        passwordHash: guardianPasswordHash,
        status: 'ACTIVE',
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
    console.log('Updated existing guardian portal account password to "guardian123"');
  } else {
    await prisma.portalAccount.create({
      data: {
        coachingCenterId: center.id,
        portalType: 'GUARDIAN',
        guardianId: guardian.id,
        email: guardian.email,
        phone: guardian.phone,
        passwordHash: guardianPasswordHash,
        status: 'ACTIVE',
      },
    });
    console.log('Created guardian portal account (guardian@alokito.edu.bd / guardian123)');
  }

  // Add sample notices
  const existingNotice = await prisma.notice.findFirst({ where: { coachingCenterId: center.id } });
  if (!existingNotice) {
    await prisma.notice.create({
      data: {
        coachingCenterId: center.id,
        branchId: branch.id,
        title: 'Monthly Model Test Schedule - October 2026',
        banglaTitle: 'মাসিক মডেল টেস্ট সময়সূচি - অক্টোবর ২০২৬',
        content: 'All students are requested to prepare for the upcoming monthly assessment test starting next Monday.',
        targetAudience: 'ALL_STUDENTS',
        isPublished: true,
        publishedAt: new Date(),
        status: 'PUBLISHED',
      },
    });
    console.log('Created sample notice for student portal');
  }

  // Add sample study material
  const physicsSubject = await prisma.subject.findFirst({
    where: { coachingCenterId: center.id, name: { contains: 'Physics' } },
  });
  if (physicsSubject) {
    const existingMaterial = await prisma.studyMaterial.findFirst({ where: { coachingCenterId: center.id } });
    if (!existingMaterial) {
      await prisma.studyMaterial.create({
        data: {
          coachingCenterId: center.id,
          branchId: branch.id,
          academicClassId: academicClass.id,
          subjectId: physicsSubject.id,
          title: 'Physics Chapter 5: Force & Laws of Motion (Lecture Sheet)',
          banglaTitle: 'পদার্থবিজ্ঞান অধ্যায় ৫: বল ও গতির সূত্রাবলী',
          description: 'Comprehensive formulas, mathematical problems and board question solutions for Chapter 5.',
          fileUrl: 'https://example.com/physics-ch5-notes.pdf',
          type: 'DOCUMENT',
          status: 'PUBLISHED',
          publishedAt: new Date(),
        },
      });
      console.log('Created sample study material for student portal');
    }
  }

  console.log('\n=========================================');
  console.log('STUDENT PORTAL ACCOUNT READY!');
  console.log('Sign-in URL: /login (email + password)');
  console.log('Student ID Code: ACC-26-00001');
  console.log('Student Email: student@alokito.edu.bd');
  console.log('Student Phone: 01711000001');
  console.log('Student Password: student123');
  console.log('=========================================');
}

seedStudent()
  .catch((err) => {
    console.error('Error seeding student:', err);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
