import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { getTemplateById, resolveCommunicationScope, updateTemplate } from '@/lib/services/communication.service';
import { communicationTemplateSchema } from '@/lib/validations/communication-template';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ templateId: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { templateId } = await params;
    const scope = resolveCommunicationScope(coachingCenterId, user);
    const template = await getTemplateById(scope, templateId);
    return NextResponse.json({ success: true, template });
  } catch (error) {
    return apiErrorResponse(error, '/api/communication/templates/[templateId] GET');
  }
}

export async function PUT(request: Request, { params }: Ctx) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { templateId } = await params;
    const body = await request.json().catch(() => null);
    const parsed = communicationTemplateSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);
    const scope = resolveCommunicationScope(coachingCenterId, user);
    const template = await updateTemplate(scope, templateId, parsed.data);
    return NextResponse.json({ success: true, template });
  } catch (error) {
    return apiErrorResponse(error, '/api/communication/templates/[templateId] PUT');
  }
}
