import 'dotenv/config';
import prisma from '../lib/db';
import type { SessionUser } from '../lib/auth/session';
import {
  getUnreadCount,
  getNotifications,
  markAllAsRead,
  markAsRead,
  notifyUser,
  notifyUsers,
  resolveNotificationScope,
} from '../lib/services/notification.service';
import {
  createNotice,
  getNoticeById,
  resolveNoticeScope,
  transitionNoticeStatus,
} from '../lib/services/notice.service';
import { resolveNoticeRecipients } from '../lib/services/notice-recipients.service';
import {
  createTemplate,
  dispatchToGuardian,
  resolveCommunicationScope,
} from '../lib/services/communication.service';
import { interpolate } from '../lib/services/template-interpolation';
import { markStudentAttendance } from '../lib/services/attendance.service';
import { createInvoice } from '../lib/services/invoice.service';
import { createPayment } from '../lib/services/payment.service';
import { verifyAndPublishExam } from '../lib/services/exam-result.service';
import { resolveMaterialScope, transitionMaterialStatus } from '../lib/services/study-material.service';

/**
 * Phase 8 runtime verification against the configured database.
 * Every record it creates is tagged/tracked and removed in `finally`.
 */

const TAG = `P8VERIFY-${Date.now()}`;
let passed = 0;

function ok(label: string) {
  passed += 1;
  console.log(`✔ ${label}`);
}

function assert(cond: unknown, label: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${label}`);
}

async function run() {
  console.log('========================================================');
  console.log('PHASE 8 RUNTIME VERIFICATION — Communication, Notifications & Notices');
  console.log('========================================================');

  const center = await prisma.coachingCenter.findFirst({
    where: { code: { not: { startsWith: 'P8V' } } },
    include: {
      branches: { take: 2 },
      academicSessions: { take: 1 },
      academicPrograms: { include: { classes: { include: { groups: true } } }, take: 5 },
      users: { take: 2, include: { roleAssignments: { include: { role: true } } } },
    },
  });
  const session = center?.academicSessions[0];
  const program = center?.academicPrograms.find((p) => p.classes.length > 0);
  const academicClass = program?.classes[0];
  const adminUser = center?.users[0];
  if (!center || !session || !program || !academicClass || !adminUser) {
    console.log('⚠ No coaching center with session/program/class/user found — cannot run DB tests.');
    process.exitCode = 1;
    return;
  }
  const cc = center.id;
  const branch = center.branches[0] || null;
  console.log(`Tenant: ${center.name} · Class: ${academicClass.name}`);

  const admin: SessionUser = {
    userId: adminUser.id,
    email: adminUser.email,
    name: adminUser.name,
    role: 'OWNER',
    coachingCenterId: cc,
    branchId: null,
  };

  const created = {
    userIds: [] as string[],
    notificationIds: new Set<string>(),
    noticeIds: new Set<string>(),
    templateIds: new Set<string>(),
    communicationLogIds: new Set<string>(),
    guardianId: null as string | null,
    studentId: null as string | null,
    subjectId: null as string | null,
    batchId: null as string | null,
    otherCenterId: null as string | null,
    invoiceId: null as string | null,
    examId: null as string | null,
    materialId: null as string | null,
    attendanceSessionId: null as string | null,
  };

  try {
    // ---------- fixtures ----------
    const secondUser = await prisma.user.create({
      data: { coachingCenterId: cc, email: `${TAG.toLowerCase()}-user2@verify.local`, passwordHash: 'x', name: `${TAG} User2` },
    });
    created.userIds.push(secondUser.id);

    const subject = await prisma.subject.create({
      data: { coachingCenterId: cc, academicClassId: academicClass.id, name: `${TAG} Subject`, code: `${TAG}-S` },
    });
    created.subjectId = subject.id;

    // Reuses an existing branch when the tenant has one; otherwise creates a
    // temp one (removed in cleanup by its TAG-prefixed code, regardless of
    // which branch was used for the rest of the fixtures).
    const targetBranch = branch || (await prisma.branch.create({ data: { coachingCenterId: cc, name: `${TAG} Branch`, code: `${TAG}-B` } }));

    const batch = await prisma.batch.create({
      data: {
        coachingCenterId: cc,
        branchId: targetBranch.id,
        academicSessionId: session.id,
        academicProgramId: program.id,
        academicClassId: academicClass.id,
        name: `${TAG} Batch`,
        code: `${TAG}-BATCH`,
        status: 'ACTIVE',
      },
    });
    created.batchId = batch.id;

    const student = await prisma.student.create({
      data: { coachingCenterId: cc, branchId: targetBranch.id, studentIdCode: `${TAG}-STU`, name: `${TAG} Student` },
    });
    created.studentId = student.id;

    const guardian = await prisma.guardian.create({
      data: { coachingCenterId: cc, name: `${TAG} Guardian`, relationship: 'Father', phone: '01700000000', preferredChannel: 'SMS' },
    });
    created.guardianId = guardian.id;

    await prisma.studentGuardian.create({
      data: { studentId: student.id, guardianId: guardian.id, relationship: 'Father', isPrimary: true, canReceiveNotifications: true, preferredChannel: 'SMS' },
    });

    await prisma.studentBatch.create({
      data: { coachingCenterId: cc, studentId: student.id, batchId: batch.id, status: 'ACTIVE' },
    });

    // ---------- 1-5. In-app notifications: create, retrieve, unread count, mark read, mark all read ----------
    console.log('\n--- 1-5. In-app notifications ---');
    const notifScope = resolveNotificationScope(cc, admin);
    await notifyUser({ coachingCenterId: cc, userId: admin.userId, type: 'GENERAL_ANNOUNCEMENT', title: `${TAG} n1`, body: 'body1' });
    await notifyUser({ coachingCenterId: cc, userId: admin.userId, type: 'GENERAL_ANNOUNCEMENT', title: `${TAG} n2`, body: 'body2' });
    const list1 = await getNotifications(notifScope, { pageSize: 50 });
    const mine = list1.notifications.filter((n) => n.title.startsWith(TAG));
    assert(mine.length === 2, 'both notifications retrieved');
    mine.forEach((n) => created.notificationIds.add(n.id));
    ok('Notification created and retrieved (2 rows)');

    const unread1 = await getUnreadCount(notifScope);
    assert(unread1 >= 2, 'unread count includes new notifications');
    ok(`Unread count reflects new notifications (${unread1})`);

    await markAsRead(notifScope, mine[0].id);
    const afterOneRead = await getNotifications(notifScope, { pageSize: 50 });
    assert(afterOneRead.notifications.find((n) => n.id === mine[0].id)?.isRead === true, 'first notification marked read');
    ok('markAsRead marks a single notification read');

    const markedCount = await markAllAsRead(notifScope);
    assert(markedCount >= 1, 'markAllAsRead affected remaining unread rows');
    const finalUnread = await getUnreadCount(notifScope);
    assert(finalUnread === 0, 'unread count is zero after mark-all-read');
    ok('markAllAsRead clears unread count to 0');

    // ---------- 6. Tenant isolation ----------
    console.log('\n--- 6. Tenant isolation ---');
    const otherCenter = await prisma.coachingCenter.create({
      data: { name: `${TAG} Other Center`, code: `${TAG}-OC`, phone: '01711111111' },
    });
    created.otherCenterId = otherCenter.id;
    const otherUser = await prisma.user.create({
      data: { coachingCenterId: otherCenter.id, email: `${TAG.toLowerCase()}-other@verify.local`, passwordHash: 'x', name: `${TAG} Other User` },
    });
    await notifyUser({ coachingCenterId: otherCenter.id, userId: otherUser.id, type: 'GENERAL_ANNOUNCEMENT', title: `${TAG} other-tenant`, body: 'x' });
    const crossTenantScope = resolveNotificationScope(cc, admin);
    const crossList = await getNotifications(crossTenantScope, { pageSize: 100 });
    assert(!crossList.notifications.some((n) => n.title === `${TAG} other-tenant`), 'other tenant notification not visible');
    ok('Notifications are tenant-isolated');

    // ---------- 7. Branch isolation ----------
    console.log('\n--- 7. Branch isolation ---');
    const branchUser: SessionUser = { ...admin, userId: secondUser.id, role: 'STAFF', branchId: targetBranch.id };
    const branchScope = resolveNoticeScope(cc, branchUser);
    const branchNotice = await createNotice(branchScope, {
      title: `${TAG} branch notice`, banglaTitle: null, content: 'x', banglaContent: null,
      targetAudience: 'BRANCH', branchId: targetBranch.id, academicSessionId: null, academicProgramId: null, academicClassId: null, academicGroupId: null, batchId: null, status: 'DRAFT',
    });
    created.noticeIds.add(branchNotice.id);
    const otherBranch = await prisma.branch.create({ data: { coachingCenterId: cc, name: `${TAG} Other Branch`, code: `${TAG}-OB` } });
    const otherBranchScopedUser: SessionUser = { ...admin, userId: secondUser.id, role: 'STAFF', branchId: otherBranch.id };
    const otherBranchScope = resolveNoticeScope(cc, otherBranchScopedUser);
    try {
      await getNoticeById(otherBranchScope, branchNotice.id);
      throw new Error('FAIL: branch-scoped user should not see another branch notice');
    } catch (e) {
      assert(e instanceof Error && e.message.startsWith('NOTICE_NOT_FOUND'), 'other-branch user correctly denied');
    }
    ok('Notices are branch-isolated for branch-scoped users');
    await prisma.branch.deleteMany({ where: { id: otherBranch.id } });

    // ---------- 8-9. Notice create + publish ----------
    console.log('\n--- 8-9. Notice create and publish ---');
    const adminNoticeScope = resolveNoticeScope(cc, admin);
    const notice = await createNotice(adminNoticeScope, {
      title: `${TAG} All Center Notice`, banglaTitle: `${TAG} বাংলা`, content: 'Hello all', banglaContent: 'হ্যালো',
      targetAudience: 'ALL_CENTER', branchId: null, academicSessionId: null, academicProgramId: null, academicClassId: null, academicGroupId: null, batchId: null, status: 'DRAFT',
    });
    created.noticeIds.add(notice.id);
    assert(notice.status === 'DRAFT', 'notice starts DRAFT');
    ok(`Notice created (${notice.id})`);

    await transitionNoticeStatus(adminNoticeScope, notice.id, 'PUBLISHED');
    const publishedNotice = await getNoticeById(adminNoticeScope, notice.id);
    assert(publishedNotice.status === 'PUBLISHED' && publishedNotice.isPublished === true, 'notice published');
    ok('Notice publish sets status=PUBLISHED and isPublished=true');

    // ---------- 10-11. Recipient resolution + duplicate removal ----------
    console.log('\n--- 10-11. Recipient resolution ---');
    const recipients = await resolveNoticeRecipients(cc, { targetAudience: 'ALL_CENTER', branchId: null });
    assert(recipients.userIds.includes(admin.userId), 'ALL_CENTER resolves staff users');
    assert(recipients.guardians.some((g) => g.guardianId === guardian.id), 'ALL_CENTER resolves guardians of active students');
    const dupCheck = new Set(recipients.guardians.map((g) => `${g.guardianId}:${g.studentId}`));
    assert(dupCheck.size === recipients.guardians.length, 'no duplicate guardian recipients');
    ok(`Recipients resolved: ${recipients.userIds.length} users, ${recipients.guardians.length} guardians, all unique`);

    // ---------- 12. Guardian notification preference (opt-out respected) ----------
    console.log('\n--- 12. Guardian notification preference ---');
    await prisma.studentGuardian.updateMany({ where: { studentId: student.id, guardianId: guardian.id }, data: { canReceiveNotifications: false } });
    const recipientsAfterOptOut = await resolveNoticeRecipients(cc, { targetAudience: 'ALL_CENTER', branchId: null });
    assert(!recipientsAfterOptOut.guardians.some((g) => g.guardianId === guardian.id), 'opted-out guardian excluded');
    ok('Guardian with canReceiveNotifications=false is excluded from recipients');
    await prisma.studentGuardian.updateMany({ where: { studentId: student.id, guardianId: guardian.id }, data: { canReceiveNotifications: true } });

    // ---------- 13-15. Templates + interpolation ----------
    console.log('\n--- 13-15. Templates and interpolation ---');
    const commScope = resolveCommunicationScope(cc, admin);
    const template = await createTemplate(commScope, {
      title: `${TAG} Template`, channel: 'SMS', bodyEn: 'Hello {{studentName}}, unknown {{notARealVar}}', bodyBn: 'হ্যালো {{studentName}}', triggerEvent: 'GENERAL_ANNOUNCEMENT', isActive: true,
    });
    created.templateIds.add(template.id);
    ok(`Template created (${template.id})`);

    const interpolated = interpolate(template.bodyEn, { studentName: 'Rahim' });
    assert(interpolated.includes('Rahim'), 'known variable interpolated');
    assert(interpolated.includes('{{notARealVar}}'), 'unknown variable left as literal text, not executed');
    ok('Template interpolation: known variable replaced, unknown variable left literal');

    // ---------- 16-17. Communication log + provider unavailable ----------
    console.log('\n--- 16-17. Communication log + provider unavailable ---');
    await dispatchToGuardian({
      coachingCenterId: cc, branchId: targetBranch.id, guardianId: guardian.id, studentId: student.id,
      event: 'GENERAL_ANNOUNCEMENT', vars: { studentName: student.name }, triggeredById: admin.userId,
      sourceType: 'VerifyScript', sourceId: `${TAG}-dispatch1`,
    });
    const log = await prisma.communicationLog.findFirst({ where: { coachingCenterId: cc, sourceType: 'VerifyScript', sourceId: `${TAG}-dispatch1` } });
    assert(!!log, 'communication log row created');
    if (log) created.communicationLogIds.add(log.id);
    assert(log?.status === 'SKIPPED', 'no live SMS provider configured — status is honestly SKIPPED, never SENT');
    assert(log?.errorMessage === 'PROVIDER_NOT_CONFIGURED', 'reason recorded as PROVIDER_NOT_CONFIGURED');
    ok(`CommunicationLog created with status=${log?.status} (never fakes delivery)`);

    // ---------- 18. Attendance event notification ----------
    console.log('\n--- 18. Attendance event (ABSENT) notification ---');
    const attendanceSession = await prisma.attendanceSession.create({
      data: { coachingCenterId: cc, branchId: targetBranch.id, batchId: batch.id, date: new Date(), type: 'CLASS', status: 'OPEN' },
    });
    created.attendanceSessionId = attendanceSession.id;
    await markStudentAttendance(cc, attendanceSession.id, student.id, { status: 'ABSENT' }, admin.userId);
    const attendanceLog = await prisma.communicationLog.findFirst({
      where: { coachingCenterId: cc, guardianId: guardian.id, event: 'ATTENDANCE_ABSENT', sourceType: 'StudentAttendance' },
      orderBy: { createdAt: 'desc' },
    });
    assert(!!attendanceLog, 'ATTENDANCE_ABSENT communication log created for guardian');
    if (attendanceLog) created.communicationLogIds.add(attendanceLog.id);
    ok('markStudentAttendance(ABSENT) triggers a guardian notification');

    // ---------- 19. Fee payment notification ----------
    console.log('\n--- 19. Fee payment notification ---');
    const invoice = await createInvoice(cc, {
      studentId: student.id, branchId: targetBranch.id, invoiceDate: new Date().toISOString(), dueDate: null,
      items: [{ description: `${TAG} fee`, quantity: 1, unitAmount: 100, discountAmount: 0 }],
      discountAmount: 0, waiverAmount: 0, notes: null, issueNow: true,
    } as any, admin.userId);
    created.invoiceId = invoice.id;
    const invoiceLog = await prisma.communicationLog.findFirst({ where: { coachingCenterId: cc, guardianId: guardian.id, event: 'FEE_INVOICE_CREATED', sourceType: 'FeeInvoice' } });
    if (invoiceLog) created.communicationLogIds.add(invoiceLog.id);
    assert(!!invoiceLog, 'FEE_INVOICE_CREATED communication log created');
    ok('createInvoice (issued) triggers a guardian notification');

    await createPayment(cc, invoice.id, { amount: 100, paymentMethod: 'CASH', paymentDate: new Date().toISOString() } as any, admin.userId);
    const paymentLog = await prisma.communicationLog.findFirst({ where: { coachingCenterId: cc, guardianId: guardian.id, event: 'FEE_PAYMENT_RECEIVED', sourceType: 'Payment' } });
    if (paymentLog) created.communicationLogIds.add(paymentLog.id);
    assert(!!paymentLog, 'FEE_PAYMENT_RECEIVED communication log created');
    ok('createPayment triggers a guardian notification');

    // ---------- 20. Result publication notification ----------
    console.log('\n--- 20. Result publication notification ---');
    const exam = await prisma.exam.create({
      data: {
        coachingCenterId: cc, branchId: targetBranch.id, academicSessionId: session.id, academicProgramId: program.id, academicClassId: academicClass.id, batchId: batch.id,
        title: `${TAG} Exam`, examType: 'WEEKLY', status: 'ONGOING', startDate: new Date(),
        examSubjects: { create: [{ subjectId: subject.id, totalMarks: 100, passMarks: 40 }] },
        examStudents: { create: [{ studentId: student.id }] },
      },
      include: { examSubjects: true },
    });
    created.examId = exam.id;
    await prisma.result.create({
      data: { examSubjectId: exam.examSubjects[0].id, studentId: student.id, marksObtained: 80, grade: 'A', gpa: 5, isPassed: true, status: 'PRESENT' },
    });
    await verifyAndPublishExam(cc, exam.id, admin.userId, false);
    const resultLog = await prisma.communicationLog.findFirst({ where: { coachingCenterId: cc, guardianId: guardian.id, event: 'RESULT_PUBLISHED', sourceType: 'Exam' } });
    if (resultLog) created.communicationLogIds.add(resultLog.id);
    assert(!!resultLog, 'RESULT_PUBLISHED communication log created');
    ok('verifyAndPublishExam triggers a guardian notification');

    // ---------- 21. Material publication notification ----------
    console.log('\n--- 21. Material publication notification ---');
    const material = await prisma.studyMaterial.create({
      data: {
        coachingCenterId: cc, branchId: targetBranch.id, academicClassId: academicClass.id, subjectId: subject.id, batchId: batch.id,
        title: `${TAG} Material`, type: 'NOTE', description: 'x', status: 'DRAFT',
      },
    });
    created.materialId = material.id;
    const materialScope = await resolveMaterialScope(cc, admin);
    await transitionMaterialStatus(materialScope, material.id, 'PUBLISHED');
    const materialLog = await prisma.communicationLog.findFirst({ where: { coachingCenterId: cc, guardianId: guardian.id, event: 'MATERIAL_PUBLISHED', sourceType: 'StudyMaterial' } });
    if (materialLog) created.communicationLogIds.add(materialLog.id);
    assert(!!materialLog, 'MATERIAL_PUBLISHED communication log created');
    ok('transitionMaterialStatus(PUBLISHED) triggers a guardian notification');

    // ---------- 22. Audit logging ----------
    console.log('\n--- 22. Audit logging ---');
    const auditActions = new Set(
      (
        await prisma.auditLog.findMany({
          where: { coachingCenterId: cc, entityId: { in: [notice.id, template.id] } },
          select: { action: true },
        })
      ).map((a) => a.action)
    );
    for (const a of ['NOTICE_CREATED', 'NOTICE_PUBLISHED', 'TEMPLATE_CREATED']) {
      assert(auditActions.has(a), `audit log ${a} recorded`);
    }
    ok(`Audit logs recorded: ${[...auditActions].sort().join(', ')}`);

    // ---------- 23. Notification duplicate protection ----------
    console.log('\n--- 23. Notification duplicate protection ---');
    const dupCount1 = await notifyUsers({
      coachingCenterId: cc, userIds: [admin.userId], type: 'DUPTEST', title: `${TAG} dup`, body: 'x', sourceType: 'VerifyScript', sourceId: `${TAG}-dup1`,
    });
    const dupCount2 = await notifyUsers({
      coachingCenterId: cc, userIds: [admin.userId], type: 'DUPTEST', title: `${TAG} dup`, body: 'x', sourceType: 'VerifyScript', sourceId: `${TAG}-dup1`,
    });
    assert(dupCount1 === 1 && dupCount2 === 0, 'second identical (userId, sourceType, sourceId, type) is skipped');
    const dupRows = await prisma.notification.findMany({ where: { coachingCenterId: cc, sourceType: 'VerifyScript', sourceId: `${TAG}-dup1` } });
    dupRows.forEach((n) => created.notificationIds.add(n.id));
    assert(dupRows.length === 1, 'exactly one notification row exists for the repeated event');
    ok('Duplicate (userId, sourceType, sourceId, type) notification is not re-created');
  } finally {
    // ---------- 24. Cleanup ----------
    console.log('\n--- 24. Cleanup ---');
    if (created.communicationLogIds.size) await prisma.communicationLog.deleteMany({ where: { id: { in: [...created.communicationLogIds] } } });
    await prisma.communicationLog.deleteMany({ where: { coachingCenterId: cc, sourceType: 'VerifyScript' } });
    if (created.templateIds.size) await prisma.communicationTemplate.deleteMany({ where: { id: { in: [...created.templateIds] } } });
    if (created.noticeIds.size) await prisma.notice.deleteMany({ where: { id: { in: [...created.noticeIds] } } });
    if (created.notificationIds.size) await prisma.notification.deleteMany({ where: { id: { in: [...created.notificationIds] } } });
    await prisma.notification.deleteMany({ where: { coachingCenterId: cc, title: { startsWith: TAG } } });
    if (created.materialId) await prisma.studyMaterial.deleteMany({ where: { id: created.materialId } });
    if (created.examId) {
      await prisma.result.deleteMany({ where: { examSubject: { examId: created.examId } } });
      await prisma.examStudent.deleteMany({ where: { examId: created.examId } });
      await prisma.examSubject.deleteMany({ where: { examId: created.examId } });
      await prisma.exam.deleteMany({ where: { id: created.examId } });
    }
    if (created.invoiceId) {
      await prisma.payment.deleteMany({ where: { invoiceId: created.invoiceId } });
      await prisma.feeInvoiceItem.deleteMany({ where: { invoiceId: created.invoiceId } });
      await prisma.feeDiscount.deleteMany({ where: { feeInvoiceId: created.invoiceId } });
      await prisma.feeInvoice.deleteMany({ where: { id: created.invoiceId } });
    }
    if (created.attendanceSessionId) {
      await prisma.studentAttendance.deleteMany({ where: { attendanceSessionId: created.attendanceSessionId } });
      await prisma.attendanceSession.deleteMany({ where: { id: created.attendanceSessionId } });
    }
    if (created.studentId) {
      await prisma.studentGuardian.deleteMany({ where: { studentId: created.studentId } });
      await prisma.studentBatch.deleteMany({ where: { studentId: created.studentId } });
      await prisma.student.deleteMany({ where: { id: created.studentId } });
    }
    if (created.guardianId) await prisma.guardian.deleteMany({ where: { id: created.guardianId } });
    if (created.batchId) await prisma.batch.deleteMany({ where: { id: created.batchId } });
    if (created.subjectId) await prisma.subject.deleteMany({ where: { id: created.subjectId } });
    await prisma.branch.deleteMany({ where: { coachingCenterId: cc, code: `${TAG}-B` } });
    if (created.otherCenterId) {
      await prisma.notification.deleteMany({ where: { coachingCenterId: created.otherCenterId } });
      await prisma.user.deleteMany({ where: { coachingCenterId: created.otherCenterId } });
      await prisma.coachingCenter.deleteMany({ where: { id: created.otherCenterId } });
    }
    if (created.userIds.length) await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });

    const leftovers = await Promise.all([
      prisma.notice.count({ where: { title: { startsWith: TAG } } }),
      prisma.notification.count({ where: { title: { startsWith: TAG } } }),
      prisma.communicationTemplate.count({ where: { title: { startsWith: TAG } } }),
      prisma.communicationLog.count({ where: { sourceType: 'VerifyScript' } }),
      prisma.student.count({ where: { studentIdCode: `${TAG}-STU` } }),
      prisma.subject.count({ where: { code: `${TAG}-S` } }),
      prisma.coachingCenter.count({ where: { name: { startsWith: TAG } } }),
    ]);
    if (leftovers.some((n) => n > 0)) {
      console.error('✘ Cleanup left records behind:', leftovers);
      process.exitCode = 1;
    } else {
      ok('All temporary records removed (0 leftovers)');
    }
  }

  console.log('\n========================================================');
  console.log(`PHASE 8 VERIFICATION PASSED — ${passed} checks`);
  console.log('========================================================');
}

run()
  .catch((e) => {
    console.error('\nVERIFICATION ERROR:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
