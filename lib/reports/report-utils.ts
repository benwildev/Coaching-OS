import { Prisma } from '@prisma/client';
import type { CsvColumn } from './csv';
import type { ReportFilters } from './filters';
import type { ReportScope } from './access';
import { buildDhakaRange, defaultMonthRange, type DhakaRange } from './dates';

/** Money leaves the report layer as an exact fixed-2 decimal string, never a float. */
export function money(value: Prisma.Decimal | string | number | null | undefined): string {
  if (value === null || value === undefined) return '0.00';
  return new Prisma.Decimal(value).toFixed(2);
}

export function moneySub(a: Prisma.Decimal | string | null | undefined, b: Prisma.Decimal | string | null | undefined): string {
  return new Prisma.Decimal(a ?? 0).minus(new Prisma.Decimal(b ?? 0)).toFixed(2);
}

/** Raw-SQL COUNT() comes back as bigint. */
export function int(value: bigint | number | null | undefined): number {
  return value === null || value === undefined ? 0 : Number(value);
}

/** Ratio as a percentage with one decimal, or null when the denominator is 0 (never a fake 0%). */
export function pct(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function paginate<T>(rows: T[], page: number, pageSize: number): Paged<T> {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  return { rows: rows.slice((safePage - 1) * pageSize, safePage * pageSize), total, page: safePage, pageSize, totalPages };
}

type Sortable = string | number | null | undefined;

/** Stable in-memory sort for already-aggregated (small) report rows. */
export function sortRows<T>(rows: T[], accessor: ((row: T) => Sortable) | undefined, dir: 'asc' | 'desc' = 'asc'): T[] {
  if (!accessor) return rows;
  const factor = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const va = accessor(a);
    const vb = accessor(b);
    if (va === vb) return 0;
    if (va === null || va === undefined) return 1; // nulls last regardless of direction
    if (vb === null || vb === undefined) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * factor;
    return String(va).localeCompare(String(vb)) * factor;
  });
}

/** Resolves the requested range, defaulting to the current Dhaka month. */
export function resolveRange(filters: Pick<ReportFilters, 'dateFrom' | 'dateTo'>): DhakaRange {
  const def = defaultMonthRange();
  return buildDhakaRange(filters.dateFrom || def.from, filters.dateTo || def.to);
}

/** Optional range: only when the caller supplied at least one bound. */
export function resolveOptionalRange(filters: Pick<ReportFilters, 'dateFrom' | 'dateTo'>): DhakaRange | null {
  if (!filters.dateFrom && !filters.dateTo) return null;
  return resolveRange(filters);
}

export interface ViewContext {
  scope: ReportScope;
  filters: ReportFilters;
  forExport: boolean;
}

export interface ViewResult {
  data: unknown;
  export?: { columns: CsvColumn<any>[]; rows: any[] };
}

export type ViewHandler = (ctx: ViewContext) => Promise<ViewResult>;

export function pickName(lang: 'en' | 'bn', en?: string | null, bn?: string | null): string {
  if (lang === 'bn' && bn) return bn;
  return en || bn || '';
}
