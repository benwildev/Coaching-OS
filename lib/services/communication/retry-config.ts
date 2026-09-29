// Shared retry policy — bounded attempts with increasing backoff, computed
// from DB timestamps rather than any external queue (Phase 10.8 §6).
export const MAX_RETRY_ATTEMPTS = 3;
const BACKOFF_MINUTES = [5, 30, 120]; // delay before retry #1, #2, #3

/** attemptNumber is the attempt that just finished (1-based). Returns null once retries are exhausted. */
export function computeNextRetryAt(attemptNumber: number): Date | null {
  if (attemptNumber >= MAX_RETRY_ATTEMPTS) return null;
  const minutes = BACKOFF_MINUTES[attemptNumber - 1] ?? BACKOFF_MINUTES[BACKOFF_MINUTES.length - 1];
  return new Date(Date.now() + minutes * 60_000);
}
