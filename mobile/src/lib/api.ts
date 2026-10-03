import { API_URL } from './config';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

/**
 * Calls the Coaching OS API with the portal Bearer token. Server errors come
 * back as `{ error: CODE, message }` (lib/api-error.ts) — or, on a few routes,
 * only `{ error: <free text> }` — so prefer `message`, fall back to `error`.
 */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: {
        Accept: 'application/json',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your internet connection.');
  }

  const data = await res.json().catch(() => null);
  if (!res.ok || (data && data.success === false)) {
    if (res.status === 401 && authToken) onUnauthorized?.();
    const code = typeof data?.error === 'string' ? data.error : 'REQUEST_FAILED';
    const details = data?.details && typeof data.details === 'object' ? Object.values(data.details).flat()[0] : undefined;
    const message = (typeof details === 'string' && details.replace(/^[A-Z_]+:\s*/, '')) || data?.message || code;
    throw new ApiError(res.status, code, message);
  }
  return data as T;
}

/** Student routes and a guardian's per-child routes return identical shapes. */
export function studentBase(childId?: string) {
  return childId ? `/api/portal/guardian/children/${childId}` : '/api/portal/student';
}
