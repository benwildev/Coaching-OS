import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { requireSuperAdmin, type PlatformSessionUser } from './platform-session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { getClientIp } from '@/lib/services/rate-limit.service';

/**
 * Wraps a /api/super-admin/* handler: verifies the PLATFORM session first (a
 * tenant staff/portal cookie is never consulted, so no tenant role passes),
 * then maps service errors to safe responses. Handlers receive the verified
 * admin and the caller IP for audit. Tenant ids / plan ids in the URL or body
 * are still validated by the services (existence checks) — nothing is trusted.
 */
export function superAdminRoute<Ctx = unknown>(
  tag: string,
  handler: (args: { admin: PlatformSessionUser; req: Request; ctx: Ctx; ip: string | null }) => Promise<Response>
) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      const admin = await requireSuperAdmin();
      return await handler({ admin, req, ctx, ip: getClientIp(req) });
    } catch (error) {
      return apiErrorResponse(error, tag);
    }
  };
}

export async function parseBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: Response }> {
  const raw = await req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, response: validationErrorResponse(parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>) };
  }
  return { ok: true, data: parsed.data };
}

export const ok = (body: Record<string, unknown>, status = 200) => NextResponse.json({ success: true, ...body }, { status });

/**
 * Phase 11.5: a POST/PUT subscription-operation route. Verifies the platform session,
 * validates the body with the operation's schema, and hands the service the acting
 * admin (for the audit trail) and the tenant id from the URL. The tenant id is still
 * verified to exist inside the service — nothing from the request is trusted.
 */
export function subscriptionOpRoute<S extends z.ZodTypeAny>(
  tag: string,
  schema: S,
  run: (args: { ctx: { adminId: string; adminName: string; ipAddress: string | null }; tenantId: string; data: z.infer<S> }) => Promise<unknown>
) {
  return superAdminRoute<{ params: Promise<{ id: string }> }>(tag, async ({ admin, req, ctx, ip }) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, schema);
    if (!body.ok) return body.response;
    const result = await run({ ctx: { adminId: admin.adminId, adminName: admin.name, ipAddress: ip }, tenantId: id, data: body.data });
    return ok({ result });
  });
}
