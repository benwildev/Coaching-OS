import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import {
  createMaterial,
  getMaterialStats,
  listMaterials,
  resolveMaterialScope,
} from '@/lib/services/study-material.service';
import { createMaterialSchema } from '@/lib/validations/study-material';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const scope = await resolveMaterialScope(coachingCenterId, user);
    const sp = new URL(request.url).searchParams;
    const [result, stats] = await Promise.all([
      listMaterials(scope, {
        page: Number(sp.get('page')) || 1,
        pageSize: Number(sp.get('pageSize')) || 20,
        search: sp.get('search') || undefined,
        type: sp.get('type') || undefined,
        status: sp.get('status') || undefined,
        subjectId: sp.get('subject') || undefined,
        academicClassId: sp.get('class') || undefined,
        batchId: sp.get('batch') || undefined,
      }),
      sp.get('stats') === '1' ? getMaterialStats(scope) : Promise.resolve(undefined),
    ]);
    return NextResponse.json({ success: true, ...result, stats });
  } catch (error) {
    return apiErrorResponse(error, '/api/materials GET');
  }
}

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const body = await request.json().catch(() => null);
    const parsed = createMaterialSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);
    const scope = await resolveMaterialScope(coachingCenterId, user);
    const material = await createMaterial(scope, parsed.data);
    return NextResponse.json({ success: true, material }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, '/api/materials POST');
  }
}
