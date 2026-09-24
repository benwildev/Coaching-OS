import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import {
  deleteMaterial,
  getMaterialById,
  resolveMaterialScope,
  updateMaterial,
} from '@/lib/services/study-material.service';
import { updateMaterialSchema } from '@/lib/validations/study-material';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ materialId: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { materialId } = await params;
    const scope = await resolveMaterialScope(coachingCenterId, user);
    const material = await getMaterialById(scope, materialId);
    return NextResponse.json({ success: true, material });
  } catch (error) {
    return apiErrorResponse(error, '/api/materials/[materialId] GET');
  }
}

export async function PUT(request: Request, { params }: Ctx) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { materialId } = await params;
    const body = await request.json().catch(() => null);
    const parsed = updateMaterialSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);
    const scope = await resolveMaterialScope(coachingCenterId, user);
    const material = await updateMaterial(scope, materialId, parsed.data);
    return NextResponse.json({ success: true, material });
  } catch (error) {
    return apiErrorResponse(error, '/api/materials/[materialId] PUT');
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { materialId } = await params;
    const scope = await resolveMaterialScope(coachingCenterId, user);
    const result = await deleteMaterial(scope, materialId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/materials/[materialId] DELETE');
  }
}
