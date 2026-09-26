import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { resolveCommunicationScope, setTemplateActive } from '@/lib/services/communication.service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ templateId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { templateId } = await params;
    const body = await request.json().catch(() => null);
    if (typeof body?.isActive !== 'boolean') {
      return validationErrorResponse({ isActive: ['isActive must be a boolean'] });
    }
    const scope = resolveCommunicationScope(coachingCenterId, user);
    const template = await setTemplateActive(scope, templateId, body.isActive);
    return NextResponse.json({ success: true, template });
  } catch (error) {
    return apiErrorResponse(error, '/api/communication/templates/[templateId]/active POST');
  }
}
