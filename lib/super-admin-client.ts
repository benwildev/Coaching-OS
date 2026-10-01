/** Browser helper for the Super Admin console. A 401 means the platform session ended → back to the platform login. */
export async function saApi<T = Record<string, any>>(
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<{ ok: boolean; status: number; data: T & { success?: boolean; error?: string; message?: string } }> {
  const res = await fetch(path, {
    method: init?.method ?? 'GET',
    headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 401 && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.assign('/login');
  }
  const data = (await res.json().catch(() => ({}))) as T & { success?: boolean; error?: string; message?: string };
  return { ok: res.ok, status: res.status, data };
}

/** Empty string → unlimited (null). */
export const toLimit = (v: string): number | null => (v.trim() === '' ? null : Math.max(0, Math.floor(Number(v)) || 0));
export const fromLimit = (v: number | null | undefined): string => (v === null || v === undefined ? '' : String(v));
