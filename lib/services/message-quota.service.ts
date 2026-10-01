import prisma from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { CHANNEL_LIMIT, type MessageChannel } from '@/lib/subscription';
import { loadTenantSubscription, lockKey } from './subscription.service';
import { countMessages } from './usage.service';

/**
 * Message quota. No separate usage table: the CommunicationLog row IS the
 * meter. A log row in QUEUED / SENT / DELIVERED holds one unit; FAILED and
 * SKIPPED release / never take it. Creating the QUEUED row is the reservation,
 * and it happens under a per-tenant-per-channel advisory lock together with the
 * count, so two simultaneous sends at 4,999/5,000 cannot both get in.
 */

// Concurrent sends for one tenant/channel queue on the advisory lock, each holding a pooled
// connection while it waits. Prisma's default 2 s wait-to-start would drop a burst (e.g. a notice
// fanned out to many guardians) — dispatch never throws, so that would be silent message loss.
// The lock is held only for a count + insert, so a generous window is safe.
const QUOTA_TX_OPTIONS = { maxWait: 15000, timeout: 20000 } as const;

export type QuotaDenial = 'QUOTA_EXCEEDED' | 'SUBSCRIPTION_INACTIVE' | 'TENANT_SUSPENDED';

function denial(state: Awaited<ReturnType<typeof loadTenantSubscription>>, used: number, limit: number | null): QuotaDenial | null {
  if (state.tenantSuspended) return 'TENANT_SUSPENDED';
  if (!state.canGrow) return 'SUBSCRIPTION_INACTIVE';
  if (limit !== null && used >= limit) return 'QUOTA_EXCEEDED';
  return null;
}

/**
 * Atomically reserves one unit by creating the QUEUED log. Returns the created
 * log, or the reason it was refused (nothing is created on refusal — the caller
 * records a SKIPPED row through its normal skip path).
 */
export async function createQuotaCheckedLog(
  coachingCenterId: string,
  channel: MessageChannel,
  data: Prisma.CommunicationLogUncheckedCreateInput
): Promise<{ ok: true; log: Awaited<ReturnType<typeof prisma.communicationLog.create>> } | { ok: false; reason: QuotaDenial }> {
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `msg-quota:${coachingCenterId}:${channel}`);
    const state = await loadTenantSubscription(tx, coachingCenterId);
    const limit = state.limits[CHANNEL_LIMIT[channel]];
    const used = limit === null ? 0 : await countMessages(tx, coachingCenterId, channel);
    const reason = denial(state, used, limit);
    if (reason) return { ok: false as const, reason };
    const log = await tx.communicationLog.create({ data: { ...data, coachingCenterId, channel, status: 'QUEUED' } });
    return { ok: true as const, log };
  }, QUOTA_TX_OPTIONS);
}

/**
 * A retry flips FAILED → QUEUED, which takes a unit again (a FAILED row held
 * none). Same lock, same count; the status-guarded updateMany keeps the
 * existing "two concurrent retries can never both send" behaviour.
 */
export async function claimRetryWithQuota(
  coachingCenterId: string,
  channel: MessageChannel,
  logId: string
): Promise<{ claimed: boolean; reason: QuotaDenial | null }> {
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `msg-quota:${coachingCenterId}:${channel}`);
    const state = await loadTenantSubscription(tx, coachingCenterId);
    const limit = state.limits[CHANNEL_LIMIT[channel]];
    const used = limit === null ? 0 : await countMessages(tx, coachingCenterId, channel);
    const reason = denial(state, used, limit);
    if (reason) return { claimed: false, reason };
    const res = await tx.communicationLog.updateMany({ where: { id: logId, status: 'FAILED' }, data: { status: 'QUEUED' } });
    return { claimed: res.count === 1, reason: null };
  }, QUOTA_TX_OPTIONS);
}
