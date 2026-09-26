import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import type { CommunicationChannel } from '@prisma/client';
import type { SessionUser } from '@/lib/auth/session';
import { recordAuditLog } from './audit.service';
import { getCommunicationProvider } from './communication/providers';
import { interpolate, SAMPLE_TEMPLATE_VARIABLES } from './template-interpolation';
import { DEFAULT_EVENT_COPY, isNotificationEvent, type NotificationEvent, type TemplateVariable } from '@/lib/notifications/events';
import type { CommunicationTemplateInput } from '@/lib/validations/communication-template';

export interface CommunicationScope {
  coachingCenterId: string;
  user: SessionUser;
}

export function resolveCommunicationScope(coachingCenterId: string, user: SessionUser): CommunicationScope {
  return { coachingCenterId, user };
}

// ------------------------------------------------------------------
// Templates
// ------------------------------------------------------------------

export interface TemplateListParams {
  page?: number;
  pageSize?: number;
  channel?: string;
  triggerEvent?: string;
  isActive?: boolean;
}

export async function listTemplates(scope: CommunicationScope, params: TemplateListParams = {}) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(params.pageSize) || 20));

  const where: Prisma.CommunicationTemplateWhereInput = { coachingCenterId: scope.coachingCenterId };
  if (params.channel) where.channel = params.channel as CommunicationChannel;
  if (params.triggerEvent) where.triggerEvent = params.triggerEvent;
  if (params.isActive !== undefined) where.isActive = params.isActive;

  const [total, templates] = await Promise.all([
    prisma.communicationTemplate.count({ where }),
    prisma.communicationTemplate.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { createdBy: { select: { id: true, name: true } } },
    }),
  ]);

  return { templates, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}

export async function getTemplateById(scope: CommunicationScope, templateId: string) {
  const template = await prisma.communicationTemplate.findFirst({
    where: { id: templateId, coachingCenterId: scope.coachingCenterId },
    include: { createdBy: { select: { id: true, name: true } } },
  });
  if (!template) throw new Error('TEMPLATE_NOT_FOUND');
  return template;
}

function assertTemplateManageable(user: SessionUser) {
  if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
    throw new Error('TEMPLATE_ACCESS_DENIED: only Owner or Admin can manage communication templates');
  }
}

export async function createTemplate(scope: CommunicationScope, input: CommunicationTemplateInput) {
  assertTemplateManageable(scope.user);
  const created = await prisma.communicationTemplate.create({
    data: {
      coachingCenterId: scope.coachingCenterId,
      title: input.title,
      channel: input.channel,
      bodyEn: input.bodyEn,
      bodyBn: input.bodyBn,
      triggerEvent: input.triggerEvent,
      isActive: input.isActive ?? true,
      createdById: scope.user.userId,
    },
  });

  await recordAuditLog({
    coachingCenterId: scope.coachingCenterId,
    userId: scope.user.userId,
    action: 'TEMPLATE_CREATED',
    entity: 'CommunicationTemplate',
    entityId: created.id,
    details: { channel: created.channel, triggerEvent: created.triggerEvent },
  });

  return created;
}

export async function updateTemplate(scope: CommunicationScope, templateId: string, input: CommunicationTemplateInput) {
  assertTemplateManageable(scope.user);
  const existing = await prisma.communicationTemplate.findFirst({
    where: { id: templateId, coachingCenterId: scope.coachingCenterId },
  });
  if (!existing) throw new Error('TEMPLATE_NOT_FOUND');

  const updated = await prisma.communicationTemplate.update({
    where: { id: templateId },
    data: {
      title: input.title,
      channel: input.channel,
      bodyEn: input.bodyEn,
      bodyBn: input.bodyBn,
      triggerEvent: input.triggerEvent,
    },
  });

  await recordAuditLog({
    coachingCenterId: scope.coachingCenterId,
    userId: scope.user.userId,
    action: 'TEMPLATE_UPDATED',
    entity: 'CommunicationTemplate',
    entityId: templateId,
    details: { channel: updated.channel, triggerEvent: updated.triggerEvent },
  });

  return updated;
}

export async function setTemplateActive(scope: CommunicationScope, templateId: string, isActive: boolean) {
  assertTemplateManageable(scope.user);
  const existing = await prisma.communicationTemplate.findFirst({
    where: { id: templateId, coachingCenterId: scope.coachingCenterId },
  });
  if (!existing) throw new Error('TEMPLATE_NOT_FOUND');

  const updated = await prisma.communicationTemplate.update({ where: { id: templateId }, data: { isActive } });

  await recordAuditLog({
    coachingCenterId: scope.coachingCenterId,
    userId: scope.user.userId,
    action: isActive ? 'TEMPLATE_ACTIVATED' : 'TEMPLATE_DEACTIVATED',
    entity: 'CommunicationTemplate',
    entityId: templateId,
    details: null,
  });

  return updated;
}

/** Interpolates with clearly-labeled sample data. Saves nothing (AGENTS.md §21). */
export async function previewTemplate(scope: CommunicationScope, templateId: string) {
  const template = await getTemplateById(scope, templateId);
  return {
    isSampleData: true,
    sampleVariables: SAMPLE_TEMPLATE_VARIABLES,
    en: interpolate(template.bodyEn, SAMPLE_TEMPLATE_VARIABLES),
    bn: interpolate(template.bodyBn, SAMPLE_TEMPLATE_VARIABLES),
  };
}

// ------------------------------------------------------------------
// Logs
// ------------------------------------------------------------------

export interface LogListParams {
  page?: number;
  pageSize?: number;
  channel?: string;
  event?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export async function listCommunicationLogs(scope: CommunicationScope, params: LogListParams = {}) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));

  const and: Prisma.CommunicationLogWhereInput[] = [{ coachingCenterId: scope.coachingCenterId }];
  if (params.channel) and.push({ channel: params.channel as CommunicationChannel });
  if (params.event) and.push({ event: params.event });
  if (params.status) and.push({ status: params.status });
  if (params.dateFrom || params.dateTo) {
    const range: Prisma.DateTimeFilter = {};
    if (params.dateFrom) range.gte = new Date(params.dateFrom);
    if (params.dateTo) range.lte = new Date(params.dateTo);
    and.push({ createdAt: range });
  }
  const s = params.search?.trim();
  if (s) {
    and.push({
      OR: [
        { recipientPhone: { contains: s, mode: 'insensitive' } },
        { recipientEmail: { contains: s, mode: 'insensitive' } },
        { guardian: { name: { contains: s, mode: 'insensitive' } } },
        { student: { name: { contains: s, mode: 'insensitive' } } },
      ],
    });
  }
  const where: Prisma.CommunicationLogWhereInput = { AND: and };

  const [total, logs] = await Promise.all([
    prisma.communicationLog.count({ where }),
    prisma.communicationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        guardian: { select: { id: true, name: true, phone: true } },
        student: { select: { id: true, name: true, studentIdCode: true } },
        template: { select: { id: true, title: true } },
      },
    }),
  ]);

  return { logs, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}

// ------------------------------------------------------------------
// Dispatch
// ------------------------------------------------------------------

// A duplicate (guardianId, channel, event, sourceType, sourceId) is expected
// and harmless — it means this exact event already dispatched to this
// guardian (AGENTS.md §18/§40), same contract as the Notification unique
// index in notification.service.ts.
function isDuplicateLogError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export interface DispatchToGuardianInput {
  coachingCenterId: string;
  branchId?: string | null;
  guardianId: string;
  studentId?: string | null;
  noticeId?: string | null;
  event: NotificationEvent;
  vars: Partial<Record<TemplateVariable, string>>;
  triggeredById?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
}

/**
 * Resolves the guardian's preferred channel + active template for this
 * event, creates the CommunicationLog row first (QUEUED), then calls the
 * provider and updates that same row — the external call never lives inside
 * a DB transaction (AGENTS.md §37/§47). Never throws.
 */
export async function dispatchToGuardian(input: DispatchToGuardianInput): Promise<void> {
  try {
    const guardian = await prisma.guardian.findFirst({
      where: { id: input.guardianId, coachingCenterId: input.coachingCenterId },
    });
    if (!guardian) return;

    // Respect canReceiveNotifications on the student<->guardian link when a
    // student is given; otherwise fall back to the guardian's own record.
    if (input.studentId) {
      const link = await prisma.studentGuardian.findFirst({
        where: { studentId: input.studentId, guardianId: input.guardianId },
        select: { canReceiveNotifications: true, preferredChannel: true },
      });
      if (link && !link.canReceiveNotifications) return;
    }

    const channel = guardian.preferredChannel;
    const recipient = channel === 'EMAIL' ? guardian.email : channel === 'WHATSAPP' ? guardian.whatsapp || guardian.phone : guardian.phone;
    if (!recipient) {
      try {
        await prisma.communicationLog.create({
          data: {
            coachingCenterId: input.coachingCenterId,
            branchId: input.branchId ?? null,
            guardianId: input.guardianId,
            studentId: input.studentId ?? null,
            noticeId: input.noticeId ?? null,
            triggeredById: input.triggeredById ?? null,
            channel,
            event: input.event,
            sourceType: input.sourceType ?? null,
            sourceId: input.sourceId ?? null,
            status: 'SKIPPED',
            errorMessage: 'NO_RECIPIENT_ADDRESS',
            message: '',
          },
        });
      } catch (error) {
        if (!isDuplicateLogError(error)) throw error;
      }
      return;
    }

    const template = isNotificationEvent(input.event)
      ? await prisma.communicationTemplate.findFirst({
          where: { coachingCenterId: input.coachingCenterId, triggerEvent: input.event, channel, isActive: true },
          orderBy: { createdAt: 'desc' },
        })
      : null;

    const defaultCopy = isNotificationEvent(input.event) ? DEFAULT_EVENT_COPY[input.event] : null;
    const bodyEn = template ? template.bodyEn : defaultCopy?.en.body ?? '';
    const bodyBn = template ? template.bodyBn : defaultCopy?.bn.body ?? '';
    const message = interpolate(`${bodyEn}\n${bodyBn}`, input.vars).trim();

    let log;
    try {
      log = await prisma.communicationLog.create({
        data: {
          coachingCenterId: input.coachingCenterId,
          branchId: input.branchId ?? null,
          templateId: template?.id ?? null,
          guardianId: input.guardianId,
          studentId: input.studentId ?? null,
          noticeId: input.noticeId ?? null,
          triggeredById: input.triggeredById ?? null,
          recipientPhone: channel === 'EMAIL' ? null : recipient,
          recipientEmail: channel === 'EMAIL' ? recipient : null,
          channel,
          event: input.event,
          sourceType: input.sourceType ?? null,
          sourceId: input.sourceId ?? null,
          status: 'QUEUED',
          message,
        },
      });
    } catch (error) {
      if (isDuplicateLogError(error)) return; // already dispatched for this event/source
      throw error;
    }

    await recordAuditLog({
      coachingCenterId: input.coachingCenterId,
      userId: input.triggeredById,
      action: 'COMMUNICATION_ATTEMPTED',
      entity: 'CommunicationLog',
      entityId: log.id,
      details: { event: input.event, channel },
    });

    const provider = getCommunicationProvider(channel);
    const result = await provider.send({ to: recipient, body: message });

    await prisma.communicationLog.update({
      where: { id: log.id },
      data: {
        status: result.status,
        provider: result.provider ?? null,
        providerMessageId: result.providerMessageId ?? null,
        errorMessage: result.errorMessage ?? null,
        sentAt: result.status === 'SENT' ? new Date() : null,
      },
    });

    await recordAuditLog({
      coachingCenterId: input.coachingCenterId,
      userId: input.triggeredById,
      action: result.status === 'SENT' ? 'COMMUNICATION_SENT' : 'COMMUNICATION_FAILED',
      entity: 'CommunicationLog',
      entityId: log.id,
      details: { event: input.event, channel, status: result.status, reason: result.errorMessage },
    });
  } catch (error) {
    // A communication failure must never break the business mutation that
    // triggered it (same contract as recordAuditLog).
    console.error('[CommunicationService] dispatchToGuardian failed:', error);
  }
}
