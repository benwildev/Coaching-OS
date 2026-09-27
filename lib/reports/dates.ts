import { getCurrentDhakaDateString } from '@/lib/schedule';

/**
 * Report date-range semantics (Asia/Dhaka, UTC+6, no DST):
 *
 *   dateFrom=2026-09-01, dateTo=2026-09-30
 *
 * means the FULL local calendar days 01/09/2026 00:00 → 30/09/2026 23:59:59.999
 * in Asia/Dhaka. For timestamp columns (paymentDate, invoiceDate, refundDate,
 * createdAt, admissionDate …) that is the half-open UTC interval
 *
 *   [2026-08-31T18:00:00Z, 2026-09-30T18:00:00Z)
 *
 * For @db.Date columns (AttendanceSession.date, TeacherAttendance.date), which
 * the app already stores as the Dhaka calendar date at UTC midnight (see
 * lib/schedule.ts toDateOnly), the equivalent is date >= from AND date <= to.
 */

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const MAX_RANGE_DAYS = 732; // two years (+ leap day)
export const MAX_DAILY_BUCKET_DAYS = 93;

export interface DhakaRange {
  from: string; // YYYY-MM-DD (inclusive)
  to: string; // YYYY-MM-DD (inclusive)
  /** Timestamp-column bounds: gte start, lt endExclusive. */
  start: Date;
  endExclusive: Date;
  /** @db.Date-column bounds: gte dateFrom, lte dateTo. */
  dateFrom: Date;
  dateTo: Date;
  days: number;
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Start of a Dhaka local calendar day as a UTC instant. */
export function dhakaDayStart(ymd: string): Date {
  return new Date(new Date(`${ymd}T00:00:00.000Z`).getTime() - DHAKA_OFFSET_MS);
}

export function addDays(ymd: string, n: number): string {
  return new Date(new Date(`${ymd}T00:00:00.000Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

export function buildDhakaRange(from: string, to: string): DhakaRange {
  if (!isIsoDate(from) || !isIsoDate(to)) throw new Error('INVALID_DATE_RANGE: dates must be valid YYYY-MM-DD');
  if (from > to) throw new Error('INVALID_DATE_RANGE: start date must not be after end date');
  const dateFrom = new Date(`${from}T00:00:00.000Z`);
  const dateTo = new Date(`${to}T00:00:00.000Z`);
  const days = Math.round((dateTo.getTime() - dateFrom.getTime()) / DAY_MS) + 1;
  if (days > MAX_RANGE_DAYS) throw new Error(`INVALID_DATE_RANGE: range may not exceed ${MAX_RANGE_DAYS} days`);
  return {
    from,
    to,
    start: dhakaDayStart(from),
    endExclusive: dhakaDayStart(addDays(to, 1)),
    dateFrom,
    dateTo,
    days,
  };
}

export function todayDhaka(): string {
  return getCurrentDhakaDateString();
}

/** Default report range: 1st of the current Dhaka month → today. */
export function defaultMonthRange(): { from: string; to: string } {
  const today = todayDhaka();
  return { from: `${today.slice(0, 8)}01`, to: today };
}

/** The immediately preceding range of equal length (for explicit comparisons only). */
export function previousRange(range: DhakaRange): DhakaRange {
  return buildDhakaRange(addDays(range.from, -range.days), addDays(range.from, -1));
}

export type Granularity = 'day' | 'week' | 'month';

/**
 * Bucket key for a Dhaka calendar date. Weeks start on SATURDAY (the
 * Bangladesh working-week convention, matching lib/schedule.ts WEEK_ORDER).
 */
export function bucketKey(ymd: string, g: Granularity): string {
  if (g === 'day') return ymd;
  if (g === 'month') return `${ymd.slice(0, 7)}-01`;
  const d = new Date(`${ymd}T00:00:00.000Z`);
  const offset = (d.getUTCDay() + 1) % 7; // Sat=0, Sun=1 … Fri=6
  return addDays(ymd, -offset);
}

/** Every bucket key covering the range, in order — lets charts show true zero periods. */
export function enumerateBuckets(range: DhakaRange, g: Granularity): string[] {
  const keys: string[] = [];
  let cursor = bucketKey(range.from, g);
  const last = bucketKey(range.to, g);
  while (cursor <= last) {
    keys.push(cursor);
    if (g === 'day') cursor = addDays(cursor, 1);
    else if (g === 'week') cursor = addDays(cursor, 7);
    else {
      const [y, m] = cursor.split('-').map(Number);
      cursor = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    }
  }
  return keys;
}
