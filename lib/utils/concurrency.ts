/**
 * Runs `fn` over `items` with at most `limit` in flight at once. Used for
 * notification/communication fan-out (DB writes + external provider calls
 * per recipient) that must not run fully sequentially — which can hold an
 * HTTP request open for as long as recipients × per-item latency — nor
 * fully unbounded in parallel, which could spike DB connections or trip a
 * provider's own rate limit.
 */
export async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const item = items[cursor++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
