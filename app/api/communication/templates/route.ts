import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { createTemplate, listTemplates, resolveCommunicationScope } from '@/lib/services/communication.service';
import { communicationTemplateSchema } from '@/lib/validations/communication-template';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const sp = new URL(request.url).searchParams;
    const scope = resolveCommunicationScope(coachingCenterId, user);
    const result = await listTemplates(scope, {
      page: Number(sp.get('page')) || 1,
      pageSize: Number(sp.get('pageSize')) || 20,
      channel: sp.get('channel') || undefined,
      triggerEvent: sp.get('triggerEvent') || undefined,
      isActive: sp.has('isActive') ? sp.get('isActive') === '1' : undefined,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/communication/templates GET');
  }
}

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const body = await request.json().catch(() => null);
    const parsed = communicationTemplateSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);
    const scope = resolveCommunicationScope(coachingCenterId, user);
    const template = await createTemplate(scope, parsed.data);
    return NextResponse.json({ success: true, template }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, '/api/communication/templates POST');
  }
}
