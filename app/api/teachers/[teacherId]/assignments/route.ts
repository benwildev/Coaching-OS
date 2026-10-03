import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { assignTeacherToBatches } from '@/lib/services/teacher.service';
import { teacherAssignmentCreateSchema } from '@/lib/validations/teacher';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const payloadSchema = z.union([
  teacherAssignmentCreateSchema,
  z.array(teacherAssignmentCreateSchema),
  z.object({
    assignments: z.array(teacherAssignmentCreateSchema).min(1),
  }),
]);

export async function POST(request: Request, props: { params: Promise<{ teacherId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('teachers.assignments');

    const { teacherId } = await props.params;
    const body = await request.json();

    const validated = payloadSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    let items;
    if (Array.isArray(validated.data)) {
      items = validated.data;
    } else if ('assignments' in validated.data) {
      items = validated.data.assignments;
    } else {
      items = [validated.data];
    }

    const created = await assignTeacherToBatches(coachingCenterId, teacherId, items, user.userId, user);
    return NextResponse.json({ success: true, assignments: created }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, '/api/teachers/[teacherId]/assignments POST');
  }
}
