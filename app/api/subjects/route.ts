import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId } = await requireTenant();
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
  } catch (error: any) {
    console.error('[API /api/subjects GET] Error:', error);
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const body = await request.json();
    const { academicClassId, academicGroupId, name, banglaName, code } = body;

    if (!academicClassId || !name?.trim() || !code?.trim()) {
      return NextResponse.json(
        { success: false, error: 'academicClassId, name, and code are required' },
        { status: 400 }
      );
    }

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
  } catch (error: any) {
    console.error('[API /api/subjects POST] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create subject' },
      { status: 500 }
    );
  }
}

