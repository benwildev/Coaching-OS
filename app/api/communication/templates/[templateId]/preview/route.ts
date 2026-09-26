import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { previewTemplate, resolveCommunicationScope } from '@/lib/services/communication.service';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: Promise<{ templateId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { templateId } = await params;
    const scope = resolveCommunicationScope(coachingCenterId, user);
    const preview = await previewTemplate(scope, templateId);
    return NextResponse.json({ success: true, preview });
  } catch (error) {
    return apiErrorResponse(error, '/api/communication/templates/[templateId]/preview POST');
  }
}
