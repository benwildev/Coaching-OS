import { NextResponse } from 'next/server';
import { requireTenant, requireRole, resolveEffectiveBranchId } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getStudentsList } from '@/lib/services/student.service';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || searchParams.get('query') || searchParams.get('search') || '';
    const branchId = resolveEffectiveBranchId(user, searchParams.get('branch') || undefined);

    if (!query.trim()) {
      return NextResponse.json({ success: true, count: 0, students: [] });
    }

    // Reuse existing robust getStudentsList to search by name, ID code, phone, guardian phone
    const studentListResult = await getStudentsList(coachingCenterId, {
      search: query.trim(),
      branchId,
      pageSize: 20,
    });

    const studentIds = studentListResult.students.map((s) => s.id);
    if (studentIds.length === 0) {
      return NextResponse.json({ success: true, count: 0, students: [] });
    }

    // Aggregate payable invoices for these students
    const invoices = await prisma.feeInvoice.findMany({
      where: {
        coachingCenterId,
        studentId: { in: studentIds },
        status: { in: ['ISSUED', 'PARTIAL', 'OVERDUE'] },
        ...(branchId ? { branchId } : {}),
      },
      select: {
        id: true,
        studentId: true,
        dueAmount: true,
        status: true,
      },
    });

    // Map dues per student
    const studentDueMap = new Map<string, { totalDue: number; invoiceCount: number }>();
    for (const inv of invoices) {
      const prev = studentDueMap.get(inv.studentId) || { totalDue: 0, invoiceCount: 0 };
      studentDueMap.set(inv.studentId, {
        totalDue: prev.totalDue + Number(inv.dueAmount),
        invoiceCount: prev.invoiceCount + 1,
      });
    }

    const students = studentListResult.students.map((s) => {
      const dueInfo = studentDueMap.get(s.id) || { totalDue: 0, invoiceCount: 0 };
      const latestEnrollment = s.enrollments?.[0];
      const activeBatch = s.studentBatches?.[0]?.batch;
      const primaryGuardian = s.studentGuardians?.[0]?.guardian;

      return {
        id: s.id,
        name: s.name,
        banglaName: s.banglaName,
        studentIdCode: s.studentIdCode,
        phone: s.phone,
        guardianName: primaryGuardian?.name || null,
        guardianPhone: primaryGuardian?.phone || null,
        courseName: latestEnrollment?.course?.name || null,
        courseBanglaName: latestEnrollment?.course?.banglaName || null,
        batchName: activeBatch?.name || null,
        batchCode: activeBatch?.code || null,
        branchName: s.branch?.name || null,
        totalDue: dueInfo.totalDue,
        payableInvoiceCount: dueInfo.invoiceCount,
      };
    });

    return NextResponse.json({
      success: true,
      count: students.length,
      students,
    });
  } catch (error) {
    return apiErrorResponse(error, '/api/fees/collect/students GET');
  }
}
