import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

const createSubjectSchema = z.object({
  academicClassId: z.string().min(1),
  academicGroupId: z.string().min(1).optional().or(z.literal('')),
  name: z.string().trim().min(1).max(200),
  banglaName: z.string().trim().max(200).optional().or(z.literal('')),
  code: z.string().trim().min(1).max(30),
});

export async function GET(request: Request) {
  try {
    const { coachingCenterId } = await requireTenant();
    await requirePermission('courses.read');
    const { searchParams } = new URL(request.url);

    const classId = searchParams.get('classId');
    const groupId = searchParams.get('groupId');
    const batchId = searchParams.get('batchId');

    const where: any = { coachingCenterId };

    if (classId) {
      where.academicClassId = classId;
      if (groupId) {
        where.OR = [{ academicGroupId: groupId }, { academicGroupId: null }];
      }
    }

    if (batchId) {
      // Find subjects assigned to this batch
      const batchSubjects = await prisma.batchSubject.findMany({
        where: { batchId },
        select: { subjectId: true },
      });
      if (batchSubjects.length > 0) {
        where.id = { in: batchSubjects.map((bs) => bs.subjectId) };
      }
    }

    const subjects = await prisma.subject.findMany({
      where,
      select: {
        id: true,
        name: true,
        banglaName: true,
        code: true,
        academicClassId: true,
        academicGroupId: true,
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ success: true, subjects });
  } catch (error) {
    return apiErrorResponse(error, '/api/subjects GET');
  }
}

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    // Phase 10.5: previously any authenticated tenant user (incl. TEACHER)
    // could create subjects; academic setup is an office-staff action.
    await requirePermission('batches.update');
    const body = await request.json().catch(() => null);
    const parsed = createSubjectSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);
    const { academicClassId, academicGroupId, name, banglaName, code } = parsed.data;

    // Verify class belongs to this coaching center
    const targetClass = await prisma.academicClass.findFirst({
      where: { id: academicClassId, coachingCenterId },
    });

    if (!targetClass) {
      return NextResponse.json(
        { success: false, error: 'Academic class not found' },
        { status: 404 }
      );
    }

    // Check code uniqueness within this class
    const existing = await prisma.subject.findUnique({
      where: {
        academicClassId_code: {
          academicClassId,
          code: code.trim().toUpperCase(),
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'A subject with this code already exists in this class' },
        { status: 409 }
      );
    }

    const subject = await prisma.subject.create({
      data: {
        coachingCenterId,
        academicClassId,
        academicGroupId: academicGroupId || null,
        name: name.trim(),
        banglaName: banglaName?.trim() || null,
        code: code.trim().toUpperCase(),
      },
      select: {
        id: true,
        name: true,
        banglaName: true,
        code: true,
        academicClassId: true,
        academicGroupId: true,
      },
    });

    return NextResponse.json({ success: true, subject });
  } catch (error) {
    return apiErrorResponse(error, '/api/subjects POST');
  }
}

