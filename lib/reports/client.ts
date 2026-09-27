'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReportOptions } from './options';

/** Client helpers for report pages. Filter state lives in the URL so drill-downs, back/forward and reloads keep it. */

let optionsCache: Promise<ReportOptions | null> | null = null;

export function useReportOptions() {
  const [options, setOptions] = useState<ReportOptions | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!optionsCache) {
      optionsCache = fetch('/api/reports/options')
        .then(async (r) => (r.ok ? ((await r.json()).options as ReportOptions) : null))
        .catch(() => null);
    }
    let alive = true;
    optionsCache.then((o) => {
      if (!alive) return;
      if (!o) {
        optionsCache = null;
        setFailed(true);
      }
      setOptions(o);
    });
    return () => {
      alive = false;
    };
  }, []);
  return { options, failed };
}

export type ReportParams = Record<string, string>;

/** Current URL query as a plain object. */
export function useReportParams(): [ReportParams, (next: ReportParams) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const params = useMemo(() => {
    const o: ReportParams = {};
    searchParams.forEach((v, k) => {
      if (v) o[k] = v;
    });
    return o;
  }, [searchParams]);
  const setParams = useCallback(
    (next: ReportParams) => {
      const q = new URLSearchParams();
      Object.entries(next).forEach(([k, v]) => {
        if (v) q.set(k, v);
      });
      const qs = q.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname]
  );
  return [params, setParams];
}

export function reportUrl(category: string, params: ReportParams, extra: ReportParams = {}) {
  const q = new URLSearchParams();
  Object.entries({ ...params, ...extra }).forEach(([k, v]) => {
    if (v) q.set(k, v);
  });
  return `/api/reports/${category}?${q.toString()}`;
}

export interface ReportState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/** Fetches one report view; aborts stale requests when filters change. */
export function useReport<T = any>(category: string, params: ReportParams, enabled = true): ReportState<T> {
  const url = reportUrl(category, params);
  const [state, setState] = useState<ReportState<T>>({ data: null, loading: enabled, error: null });
  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    fetch(url, { signal: ctrl.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.success) {
          setState({ data: null, loading: false, error: body.error || 'LOAD_FAILED' });
          return;
        }
        setState({ data: body.data as T, loading: false, error: null });
      })
      .catch((e) => {
        if (e?.name !== 'AbortError') setState({ data: null, loading: false, error: 'LOAD_FAILED' });
      });
    return () => ctrl.abort();
  }, [url, enabled]);
  return state;
}

/** Fetches the CSV export and saves it (keeps error handling in-page instead of navigating to a JSON error). */
export async function downloadCsv(category: string, params: ReportParams, lang: string): Promise<string | null> {
  const res = await fetch(reportUrl(category, params, { format: 'csv', lang, page: '', pageSize: '' }));
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return body.error || 'LOAD_FAILED';
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] || `report_${category}.csv`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return null;
}
