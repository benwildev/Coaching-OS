/**
 * RFC 4180 CSV writer for report exports.
 *  - UTF-8 with a BOM so Excel opens Bengali text correctly,
 *  - every text cell quoted/escaped,
 *  - spreadsheet formula injection neutralised for text cells beginning
 *    with = + - @ (numbers are written verbatim, so "-120.00" stays numeric),
 *  - money is written as plain fixed-2 decimal strings (e.g. 1250.50) with
 *    the currency in the header, never as a locale-formatted "৳১,২৫০" string.
 */

export type CsvCell = string | number | null | undefined;

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => CsvCell;
}

function escapeCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'number') return Number.isFinite(cell) ? String(cell) : '';
  let s = String(cell);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lines = [columns.map((c) => escapeCell(c.header)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => escapeCell(c.value(row))).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function csvFilename(category: string, view: string, from?: string, to?: string): string {
  const range = from && to ? `_${from}_${to}` : '';
  return `report_${category}_${view}${range}.csv`.replace(/[^a-zA-Z0-9_.-]/g, '_');
}
