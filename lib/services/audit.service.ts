import prisma from '@/lib/db';

export interface AuditLogParams {
  coachingCenterId: string;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function recordAuditLog(params: AuditLogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        coachingCenterId: params.coachingCenterId,
        userId: params.userId,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        details: params.details ? JSON.stringify(params.details) : undefined,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  } catch (error) {
    // Audit logging should never crash the main application flow
    console.error('[AuditService] Failed to record audit log:', error);
  }
}

export async function getRecentAuditLogs(coachingCenterId: string, limit: number = 20) {
  try {
    return await prisma.auditLog.findMany({
      where: { coachingCenterId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  } catch (error) {
    console.error('[AuditService] Failed to fetch audit logs:', error);
    return [];
  }
}
