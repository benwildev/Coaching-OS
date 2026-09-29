import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/auth/session';
import { assertBranchAccess } from '@/lib/auth/session';
import { recordAuditLog } from './audit.service';
import { getCommunicationProvider } from './communication/providers';
import { MAX_RETRY_ATTEMPTS, computeNextRetryAt } from './communication/retry-config';
import { escapeHtml } from './template-interpolation';
import { resolveProviderCredentials } from './communication-settings.service';

export class RetryError extends Error {}

/**
 * Resends the exact message already stored on a FAILED CommunicationLog row
 * — retries never re-render the template from scratch (guardian/student
 * details may have changed since; a retry's job is to redeliver what was
 * already queued, not to re-decide content) and never create a second log
 * row, preserving the same idempotity identity as the original dispatch.
 *
 * Concurrency-safe: claims the row with an atomic `updateMany` guarded on
 * the current status before doing any provider call, so two simultaneous
 * retry attempts (two admin clicks, or a manual retry racing the scheduled
 * sweep) can never both send.
 */
async function claimAndResend(logId: string) {
  const claimed = await prisma.communicationLog.updateMany({
    where: { id: logId, status: 'FAILED' },
    data: { status: 'QUEUED' },
  });
  if (claimed.count !== 1) return null; // already claimed by a concurrent retry, or no longer FAILED

  const log = await prisma.communicationLog.findUniqueOrThrow({ where: { id: logId } });

  const provider = getCommunicationProvider(log.channel);
  const to = log.channel === 'EMAIL' ? log.recipientEmail! : log.recipientPhone!;
  const credentials = await resolveProviderCredentials(log.coachingCenterId, log.channel);
  const result = await provider.send(
    {
      to,
      body: log.message,
      htmlBody: log.channel === 'EMAIL' ? escapeHtml(log.message).replace(/\n/g, '<br>') : undefined,
    },
    credentials
  );

  const attemptCount = log.attemptCount + 1;
  const nextRetryAt = result.status === 'FAILED' && result.retryable ? computeNextRetryAt(attemptCount) : null;

  const updated = await prisma.communicationLog.update({
    where: { id: logId },
    data: {
      status: result.status,
      provider: result.provider ?? log.provider,
      providerMessageId: result.providerMessageId ?? log.providerMessageId,
      errorCode: result.errorCode ?? null,
      errorMessage: result.errorMessage ?? null,
      retryable: result.retryable ?? null,
      attemptCount,
      lastAttemptAt: new Date(),
      nextRetryAt,
      sentAt: result.status === 'SENT' ? new Date() : log.sentAt,
    },
  });

  return { previousStatus: 'FAILED' as const, updated };
}

export async function retryCommunication(coachingCenterId: string, user: SessionUser, logId: string) {
  const log = await prisma.communicationLog.findFirst({ where: { id: logId, coachingCenterId } });
  if (!log) throw new RetryError('COMMUNICATION_LOG_NOT_FOUND');
  assertBranchAccess(user, log.branchId);

  if (log.status !== 'FAILED') throw new RetryError('COMMUNICATION_NOT_FAILED');
  if (!log.retryable) throw new RetryError('COMMUNICATION_NOT_RETRYABLE');
  if (log.attemptCount >= MAX_RETRY_ATTEMPTS) throw new RetryError('COMMUNICATION_RETRY_LIMIT_REACHED');

  const outcome = await claimAndResend(logId);
  if (!outcome) throw new RetryError('COMMUNICATION_RETRY_ALREADY_IN_PROGRESS');

  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: 'COMMUNICATION_RETRIED',
    entity: 'CommunicationLog',
    entityId: logId,
    details: { manual: true, previousStatus: outcome.previousStatus, attemptCount: outcome.updated.attemptCount, newStatus: outcome.updated.status },
  });

  return outcome.updated;
}

/**
 * Scheduled sweep for automatic retries — invoked by an external scheduler
 * (Vercel Cron or any cron hitting /api/communication/retry/process-due)
 * rather than an in-app queue. Bounded batch size so one sweep can never run
 * unbounded.
 */
export async function processDueRetries(batchSize = 50) {
  const due = await prisma.communicationLog.findMany({
    where: { status: 'FAILED', retryable: true, attemptCount: { lt: MAX_RETRY_ATTEMPTS }, nextRetryAt: { lte: new Date() } },
    take: batchSize,
    select: { id: true, coachingCenterId: true },
  });

  let succeeded = 0;
  let stillFailed = 0;
  let skipped = 0;

  for (const row of due) {
    const outcome = await claimAndResend(row.id);
    if (!outcome) {
      skipped++;
      continue;
    }
    if (outcome.updated.status === 'SENT') succeeded++;
    else stillFailed++;

    await recordAuditLog({
      coachingCenterId: row.coachingCenterId,
      userId: null,
      action: 'COMMUNICATION_RETRIED',
      entity: 'CommunicationLog',
      entityId: row.id,
      details: { manual: false, previousStatus: 'FAILED', attemptCount: outcome.updated.attemptCount, newStatus: outcome.updated.status },
    });
  }

  return { processed: due.length, succeeded, stillFailed, skipped };
}
