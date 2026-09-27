'use client';

import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';
import { useReportOptions, useReportParams, type ReportParams } from '@/lib/reports/client';
import { makeFormat } from './format';

/** Shared state for a report page: URL params, current view, options, formatting and table handlers. */
export function useReportPage(defaultView: string, views?: string[]) {
  const { lang } = useApp();
  const [params, setParams] = useReportParams();
  const { options } = useReportOptions();
  const requested = params.view || defaultView;
  const view = views && !views.includes(requested) ? defaultView : requested;
  const query: ReportParams = { ...params, view, lang };
  const R = DICTIONARY[lang].reports;
  const fmt = makeFormat(lang);
  return {
    lang,
    R,
    D: DICTIONARY[lang] as any,
    fmt,
    params,
    setParams,
    options,
    view,
    query,
    setView: (v: string) => {
      const { sort: _s, dir: _d, page: _p, ...rest } = params;
      setParams({ ...rest, view: v });
    },
    onSort: (sort: string, dir: 'asc' | 'desc') => setParams({ ...params, sort, dir, page: '' }),
    onPage: (p: number) => setParams({ ...params, page: String(p) }),
    sort: params.sort,
    dir: (params.dir as 'asc' | 'desc' | undefined) ?? undefined,
  };
}
