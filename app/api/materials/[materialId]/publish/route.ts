import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { resolveMaterialScope, transitionMaterialStatus } from '@/lib/services/study-material.service';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: Promise<{ materialId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { materialId } = await params;
    const scope = await resolveMaterialScope(coachingCenterId, user);
    const material = await transitionMaterialStatus(scope, materialId, 'PUBLISHED');
    return NextResponse.json({ success: true, material });
  } catch (error) {
    return apiErrorResponse(error, '/api/materials/[materialId]/publish POST');
  }
}
