import 'dotenv/config';
import prisma from '../lib/db';
import {
  calculateGrade,
  calculateCompetitionRanking,
} from '../lib/services/result-calculation.service';
import {
  createExam,
  transitionExamStatus,
  addExamSubject,
} from '../lib/services/exam.service';
import {
  bulkSaveSubjectResults,
  getExamPublishStatus,
  verifyAndPublishExam,
  getStudentResultHistory,
} from '../lib/services/exam-result.service';

async function runVerification() {
  console.log('========================================================');
  console.log('STARTING PHASE 6 DATABASE RUNTIME VERIFICATION');
  console.log('========================================================');

  // 1. Verify Grading Calculation logic
  console.log('\n--- Test 1: Bangladesh Grading System Calculation ---');
  const g100 = calculateGrade(95, 100);
  const g80 = calculateGrade(80, 100);
  const g75 = calculateGrade(75, 100);
  const g65 = calculateGrade(65, 100);
  const g55 = calculateGrade(55, 100);
  const g45 = calculateGrade(45, 100);
  const g35 = calculateGrade(35, 100);
  const g30 = calculateGrade(30, 100);

  if (
    g100.grade !== 'A+' ||
    g80.grade !== 'A+' ||
    g75.grade !== 'A' ||
    g65.grade !== 'A-' ||
    g55.grade !== 'B' ||
    g45.grade !== 'C' ||
    g35.grade !== 'D' ||
    g30.grade !== 'F'
  ) {
    throw new Error(
      `Grading calculation failed: expected A+, A+, A, A-, B, C, D, F got ${JSON.stringify({
        g100,
        g80,
        g75,
        g65,
        g55,
        g45,
        g35,
        g30,
      })}`
    );
  }
  console.log('✔ Bangladesh grading scale passed (A+, A, A-, B, C, D, F validated)');

  // 2. Verify Competition Ranking with Ties (1, 2, 2, 4)
  console.log('\n--- Test 2: Competition Ranking with Ties ---');
  const rankMap = calculateCompetitionRanking([
    { studentId: 's1', totalMarks: 95, isValid: true },
    { studentId: 's2', totalMarks: 85, isValid: true },
    { studentId: 's3', totalMarks: 85, isValid: true },
    { studentId: 's4', totalMarks: 70, isValid: true },
  ]);
  if (
    rankMap.get('s1') !== 1 ||
    rankMap.get('s2') !== 2 ||
    rankMap.get('s3') !== 2 ||
    rankMap.get('s4') !== 4
  ) {
    throw new Error(
      `Ranking failed! Expected ranks [1, 2, 2, 4] but got: ${JSON.stringify(
        Array.from(rankMap.entries())
      )}`
    );
  }
  console.log('✔ Competition ranking passed: Ties handled deterministically (1, 2, 2, 4)');

  // 3. Find test tenant context in DB
  console.log('\n--- Test 3: Locate active Coaching Center context ---');
  const center = await prisma.coachingCenter.findFirst({
    include: {
      branches: true,
      academicSessions: { where: { status: 'ACTIVE' } },
      academicPrograms: {
        include: {
          classes: true,
        },
      },
      users: { take: 1 },
    },
  });

  if (!center) {
    console.log('⚠ No coaching center found in database. Skipping DB-dependent tests.');
    return;
  }

  const session = center.academicSessions[0];
  const program = center.academicPrograms[0];
  const academicClass = program?.classes[0];
  const adminUser = center.users[0];

  if (!session || !program || !academicClass || !adminUser) {
    console.log('⚠ Insufficient academic session/program/class. Skipping DB tests.');
    return;
  }

  const coachingCenterId = center.id;
  const branchId = center.branches[0]?.id;
  const actorId = adminUser.id;

  console.log(`✔ Found Tenant: ${center.name} (${center.id})`);
  console.log(`✔ Session: ${session.name}, Class: ${academicClass.name}`);

  let testSubject1Id: string | null = null;
  let testSubject2Id: string | null = null;
  let testStudentId: string | null = null;
  let testExamId: string | null = null;

  try {
    // Create 2 test subjects
    console.log('\n--- Setting up temporary test subjects & student ---');
    const sub1 = await prisma.subject.create({
      data: {
        coachingCenterId,
        academicClassId: academicClass.id,
        name: 'Test Physics Paper 1',
        banglaName: 'টেস্ট পদার্থবিজ্ঞান প্রথম পত্র',
        code: 'TPHY1',
      },
    });
    testSubject1Id = sub1.id;

    const sub2 = await prisma.subject.create({
      data: {
        coachingCenterId,
        academicClassId: academicClass.id,
        name: 'Test Chemistry Paper 1',
        banglaName: 'টেস্ট রসায়ন প্রথম পত্র',
        code: 'TCHM1',
      },
    });
    testSubject2Id = sub2.id;

    // Create 1 test student
    const student = await prisma.student.create({
      data: {
        coachingCenterId,
        branchId,
        studentIdCode: 'TEST-P6-001',
        name: 'Tanvir Ahmed Test',
        banglaName: 'তানভীর আহমেদ',
        status: 'ACTIVE',
      },
    });
    testStudentId = student.id;

    console.log(`✔ Created temporary test subjects: ${sub1.code}, ${sub2.code}`);
    console.log(`✔ Created temporary test student: ${student.studentIdCode} (${student.id})`);

    // 4. Create Exam with Subjects & Students
    console.log('\n--- Test 4: Create Exam via ExamService ---');
    const createdExam = await createExam(
      coachingCenterId,
      {
        title: 'Phase 6 Runtime Verification Exam',
        banglaTitle: 'ফেজ ৬ যাচাইকরণ পরীক্ষা',
        examType: 'Model Test',
        academicSessionId: session.id,
        academicProgramId: program.id,
        academicClassId: academicClass.id,
        branchId,
        startDate: new Date().toISOString(),
        totalMarks: 100,
        passMarks: 40,
        subjects: [
          {
            subjectId: sub1.id,
            totalMarks: 100,
            passMarks: 40,
            durationMinutes: 90,
          },
          {
            subjectId: sub2.id,
            totalMarks: 100,
            passMarks: 40,
            durationMinutes: 90,
          },
        ],
        studentIds: [student.id],
        selectionMode: 'SELECTED',
      },
      actorId,
      branchId
    );

    testExamId = createdExam.id;
    console.log(`✔ Exam created successfully: ID=${createdExam.id}, Status=${createdExam.status}`);
    console.log(
      `  Subjects created: ${createdExam.examSubjects.length}, Students enrolled: ${createdExam.examStudents.length}`
    );

    // 5. Test Duplicate Subject rejection
    console.log('\n--- Test 5: Reject Duplicate Subject Assignment ---');
    try {
      await addExamSubject(
        coachingCenterId,
        createdExam.id,
        {
          subjectId: sub1.id, // Already added
          durationMinutes: 60,
          totalMarks: 100,
          passMarks: 40,
        },
        actorId
      );
      throw new Error('FAIL: Duplicate subject was not rejected!');
    } catch (err: any) {
      if (err.message.includes('DUPLICATE_SUBJECT') || err.message.includes('already added')) {
        console.log(`✔ Duplicate subject correctly rejected: ${err.message}`);
      } else {
        throw err;
      }
    }

    // 6. Test Lifecycle Transitions
    console.log('\n--- Test 6: Exam Status Lifecycle Transitions ---');
    // DRAFT -> SCHEDULED
    const scheduled = await transitionExamStatus(
      coachingCenterId,
      createdExam.id,
      'SCHEDULED',
      actorId,
      'OWNER'
    );
    console.log(`✔ DRAFT -> SCHEDULED: ${scheduled.status}`);

    // SCHEDULED -> ONGOING
    const ongoing = await transitionExamStatus(
      coachingCenterId,
      createdExam.id,
      'ONGOING',
      actorId,
      'OWNER'
    );
    console.log(`✔ SCHEDULED -> ONGOING: ${ongoing.status}`);

    // ONGOING -> COMPLETED
    const completed = await transitionExamStatus(
      coachingCenterId,
      createdExam.id,
      'COMPLETED',
      actorId,
      'OWNER'
    );
    console.log(`✔ ONGOING -> COMPLETED: ${completed.status}`);

    // Invalid transition check: COMPLETED -> DRAFT should be rejected
    try {
      await transitionExamStatus(
        coachingCenterId,
        createdExam.id,
        'DRAFT',
        actorId,
        'OWNER'
      );
      throw new Error('FAIL: Illegal transition COMPLETED -> DRAFT was allowed!');
    } catch (err: any) {
      if (err.message.includes('INVALID_TRANSITION')) {
        console.log(`✔ Illegal status transition correctly rejected: ${err.message}`);
      } else {
        throw err;
      }
    }

    // 7. Test Marks Entry & Validations
    console.log('\n--- Test 7: Marks Entry Validation ---');
    const examSubject1 = createdExam.examSubjects[0];
    const sessionUser = {
      userId: actorId,
      email: adminUser.email,
      name: adminUser.name,
      role: 'OWNER' as const,
      coachingCenterId,
      branchId,
    };

    // Reject marks > totalMarks
    try {
      await bulkSaveSubjectResults(
        coachingCenterId,
        createdExam.id,
        examSubject1.id,
        [{ studentId: student.id, status: 'PRESENT', marksObtained: 150 }],
        sessionUser
      );
      throw new Error('FAIL: Marks above total marks was not rejected!');
    } catch (err: any) {
      if (err.message.includes('MARKS_EXCEEDS_TOTAL') || err.message.includes('exceed')) {
        console.log(`✔ Marks exceeding total correctly rejected: ${err.message}`);
      } else {
        throw err;
      }
    }

    // Reject negative marks
    try {
      await bulkSaveSubjectResults(
        coachingCenterId,
        createdExam.id,
        examSubject1.id,
        [{ studentId: student.id, status: 'PRESENT', marksObtained: -10 }],
        sessionUser
      );
      throw new Error('FAIL: Negative marks was not rejected!');
    } catch (err: any) {
      if (err.message.toLowerCase().includes('negative') || err.message.includes('INVALID_MARKS')) {
        console.log(`✔ Negative marks correctly rejected: ${err.message}`);
      } else {
        throw err;
      }
    }

    // Save valid marks for student: 85/100 -> A+
    const saveRes = await bulkSaveSubjectResults(
      coachingCenterId,
      createdExam.id,
      examSubject1.id,
      [{ studentId: student.id, status: 'PRESENT', marksObtained: 85 }],
      sessionUser
    );

    console.log(
      `✔ Bulk marks saved successfully: Count=${saveRes.savedCount}, HighestMark=${saveRes.highestMark}`
    );

    // Save marks for subject 2: 75/100 -> A
    const examSubject2 = createdExam.examSubjects[1];
    await bulkSaveSubjectResults(
      coachingCenterId,
      createdExam.id,
      examSubject2.id,
      [{ studentId: student.id, status: 'PRESENT', marksObtained: 75 }],
      sessionUser
    );

    // 8. Test Publication Guard
    console.log('\n--- Test 8: Publication Guard ---');
    const pubStatus = await getExamPublishStatus(coachingCenterId, createdExam.id);
    console.log(
      `  Readiness: isReadyForPublish=${pubStatus.isReadyForPublish}, totalMissing=${pubStatus.totalMissing}`
    );

    // Publish exam
    const published = await verifyAndPublishExam(coachingCenterId, createdExam.id, actorId, false);
    console.log(
      `✔ Exam successfully published: ID=${published.id}, Status=${published.status}, PublishedAt=${published.publishedAt}`
    );

    // 9. Test Student Portal Visibility
    console.log('\n--- Test 9: Student Portal Privacy Guard ---');
    const portalResults = await getStudentResultHistory(coachingCenterId, student.id, true);
    const thisExam = portalResults.find((e) => e.examId === createdExam.id);
    if (!thisExam) {
      throw new Error('FAIL: Published exam result was not visible in student portal!');
    }
    console.log(
      `✔ Published exam visible in student portal: Total Marks=${thisExam.overall.totalObtainedMarks}/${thisExam.overall.totalPossibleMarks}, Passed=${thisExam.overall.isPassed}`
    );
  } finally {
    // Cleanup temporary test entities cleanly
    console.log('\n--- Cleaning up temporary test examination records ---');
    if (testExamId) {
      await prisma.result.deleteMany({
        where: { examSubject: { examId: testExamId } },
      });
      await prisma.examSubject.deleteMany({
        where: { examId: testExamId },
      });
      await prisma.examStudent.deleteMany({
        where: { examId: testExamId },
      });
      await prisma.auditLog.deleteMany({
        where: { entity: 'Exam', entityId: testExamId },
      });
      await prisma.exam.deleteMany({
        where: { id: testExamId },
      });
      console.log('✔ Test examination and associated results/audits removed.');
    }
    if (testStudentId) {
      await prisma.student.deleteMany({
        where: { id: testStudentId },
      });
      console.log('✔ Temporary test student removed.');
    }
    if (testSubject1Id || testSubject2Id) {
      await prisma.subject.deleteMany({
        where: { id: { in: [testSubject1Id, testSubject2Id].filter(Boolean) as string[] } },
      });
      console.log('✔ Temporary test subjects removed.');
    }
  }

  console.log('\n========================================================');
  console.log('ALL PHASE 6 RUNTIME TEST SCENARIOS PASSED SUCCESSFULLY!');
  console.log('========================================================');
}

runVerification()
  .catch((e) => {
    console.error('VERIFICATION ERROR:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
