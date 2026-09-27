'use client';

import Icon from '@/components/Icon';
import { EmptyState, Pager } from '@/components/PageHeader';
import { useApp } from '@/lib/store';
import { DICTIONARY, localizeNumber } from '@/lib/i18n';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Server/client sort key; omit for unsortable columns. */
  sortKey?: string;
  align?: 'left' | 'right';
  /** Shown as the card title on mobile. */
  primary?: boolean;
}

/**
 * Report table: real <table> on ≥md and in print; compact label/value
 * cards on phones (no horizontal page overflow). Sorting is delegated to
 * the report API through onSort so the sort applies to the full result
 * set, not just the visible page.
 */
export default function ReportTable<T>({
  columns,
  rows,
  rowKey,
  sort,
  dir,
  onSort,
  page,
  totalPages,
  total,
  onPage,
  emptyMessage,
  footer,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, i: number) => string;
  sort?: string;
  dir?: 'asc' | 'desc';
  onSort?: (key: string, dir: 'asc' | 'desc') => void;
  page?: number;
  totalPages?: number;
  total?: number;
  onPage?: (p: number) => void;
  emptyMessage: string;
  footer?: React.ReactNode;
}) {
  const { lang } = useApp();
  const C = DICTIONARY[lang].common;
  if (rows.length === 0) return <EmptyState message={emptyMessage} icon="info" />;
  const primary = columns.find((c) => c.primary) ?? columns[0];

  const header = (c: Column<T>) => {
    if (!c.sortKey || !onSort) return c.header;
    const active = sort === c.sortKey;
    const nextDir = active && dir === 'asc' ? 'desc' : 'asc';
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 font-inherit hover:text-[#063b78]"
        onClick={() => onSort(c.sortKey!, nextDir)}
        aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        {c.header}
        <Icon name={active ? (dir === 'asc' ? 'up' : 'down') : 'sort'} size={12} className={active ? 'text-[#063b78]' : 'text-[#94a3b8]'} />
      </button>
    );
  };

  return (
    <div>
      <div className="hidden md:block print:block overflow-x-auto scroll">
        <table className="tbl report-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.align === 'right' ? 'ra' : undefined}>
                  {header(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={rowKey(r, i)} className="trow">
                {columns.map((c) => (
                  <td key={c.key} className={c.align === 'right' ? 'ra num' : undefined}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer}
        </table>
      </div>

      <ul className="md:hidden print:hidden flex flex-col divide-y divide-[#edf1f7]">
        {rows.map((r, i) => (
          <li key={rowKey(r, i)} className="px-4 py-3">
            <div className="font-bold text-[#092f63] text-[14px] mb-1.5 break-words">{primary.cell(r)}</div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px]">
              {columns
                .filter((c) => c !== primary)
                .map((c) => (
                  <div key={c.key} className="min-w-0">
                    <dt className="text-[#64748b] text-[11px] font-semibold uppercase tracking-wide truncate">{c.header}</dt>
                    <dd className="text-[#1f2d44] break-words">{c.cell(r)}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ul>

      {onPage && page && totalPages && total !== undefined && (
        <Pager
          page={page}
          totalPages={totalPages}
          total={total}
          onPage={onPage}
          labels={{ previous: C.previous, next: C.next, page: C.page, of: C.of, results: C.results }}
          formatNumber={(n) => localizeNumber(lang, n)}
        />
      )}
    </div>
  );
}
