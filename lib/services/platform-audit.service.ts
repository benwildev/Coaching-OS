import prisma from '@/lib/db';
import type { Prisma } from '@prisma/client';

const SECRET_KEY = /pass(word)?|secret|token|hash|authorization|cookie|api[-_]?key/i;

/** Recursively drops any field that looks like a credential. Defence in depth: callers should not pass secrets at all. */
export function scrubSecrets(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => scrubSecrets(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY.test(k)) continue;
    out[k] = scrubSecrets(v, depth + 1);
  }
  return out;
}

export interface PlatformAuditParams {
  adminId?: string | null;
  coachingCenterId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

/** Platform-owned audit trail (separate from the tenant AuditLog). Never throws. */
export async function recordPlatformAudit(params: PlatformAuditParams): Promise<void> {
  try {
    await prisma.platformAuditLog.create({
      data: {
        platformAdminId: params.adminId ?? null,
        coachingCenterId: params.coachingCenterId ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        details: params.details ? (scrubSecrets(params.details) as Prisma.InputJsonValue) : undefined,
        ipAddress: params.ipAddress ?? null,
      },
    });
  } catch (error) {
    console.error('[PlatformAudit] Failed to record platform audit log:', error);
  }
}
