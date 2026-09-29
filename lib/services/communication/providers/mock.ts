import type { CommunicationChannel } from '@prisma/client';
import type { CommunicationMessage, CommunicationResult } from './types';

/**
 * Test-only deterministic provider simulation. NEVER enabled in production —
 * gated behind COMMUNICATION_MOCK_MODE, which scripts/verify-phase10-8.ts
 * sets on its own process so send/failure/retry logic can be exercised
 * end-to-end without calling a real paid vendor (AGENTS.md Phase 10.8
 * §27/§35: mocks are allowed only in tests, and a provider must never fake
 * delivery in production).
 *
 * Convention: the message *body* (not `to`) carries the marker, since `to`
 * must be a strictly-formatted phone number or email address for SMS/
 * WhatsApp/Email respectively and can't reliably smuggle a test marker —
 * the body has no such format constraint on any channel.
 */
export function isMockModeEnabled(): boolean {
  return process.env.COMMUNICATION_MOCK_MODE === '1';
}

export function getMockResult(channel: CommunicationChannel, message: CommunicationMessage): CommunicationResult {
  const provider = channel.toLowerCase();
  if (message.body.includes('FAILTEST_RETRYABLE')) {
    return { status: 'FAILED', provider, errorCode: 'MOCK_TEMPORARY_ERROR', errorMessage: 'Simulated temporary provider error (mock mode)', retryable: true };
  }
  if (message.body.includes('FAILTEST_PERMANENT')) {
    return { status: 'FAILED', provider, errorCode: 'MOCK_PERMANENT_ERROR', errorMessage: 'Simulated permanent provider error (mock mode)', retryable: false };
  }
  return { status: 'SENT', provider, providerMessageId: `mock-${channel}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, retryable: null };
}
