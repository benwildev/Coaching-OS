import type { DayOfWeek } from '@prisma/client';

export const DHAKA_TZ = 'Asia/Dhaka';

/**
 * Bangladesh-conventional week order (Saturday first, Friday last).
 * Purely a display order — every day remains independently schedulable.
 */
export const WEEK_ORDER: DayOfWeek[] = [
  'SATURDAY',
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
];

export const DAY_LABELS: Record<DayOfWeek, { en: string; bn: string; short: string; shortBn: string }> = {
  SATURDAY: { en: 'Saturday', bn: 'শনিবার', short: 'Sat', shortBn: 'শনি' },
  SUNDAY: { en: 'Sunday', bn: 'রবিবার', short: 'Sun', shortBn: 'রবি' },
  MONDAY: { en: 'Monday', bn: 'সোমবার', short: 'Mon', shortBn: 'সোম' },
  TUESDAY: { en: 'Tuesday', bn: 'মঙ্গলবার', short: 'Tue', shortBn: 'মঙ্গল' },
  WEDNESDAY: { en: 'Wednesday', bn: 'বুধবার', short: 'Wed', shortBn: 'বুধ' },
  THURSDAY: { en: 'Thursday', bn: 'বৃহস্পতিবার', short: 'Thu', shortBn: 'বৃহঃ' },
  FRIDAY: { en: 'Friday', bn: 'শুক্রবার', short: 'Fri', shortBn: 'শুক্র' },
};

const JS_DAY_TO_ENUM: DayOfWeek[] = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

/**
 * Resolves "today" in Asia/Dhaka wall-clock time as a DayOfWeek, regardless
 * of the server or browser's local timezone.
 */
export function getCurrentDhakaDayOfWeek(date: Date = new Date()): DayOfWeek {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: DHAKA_TZ,
    weekday: 'short',
  }).format(date);
  const map: Record<string, DayOfWeek> = {
    Sun: 'SUNDAY',
    Mon: 'MONDAY',
    Tue: 'TUESDAY',
    Wed: 'WEDNESDAY',
    Thu: 'THURSDAY',
    Fri: 'FRIDAY',
    Sat: 'SATURDAY',
  };
  return map[weekday] || JS_DAY_TO_ENUM[date.getUTCDay()];
}

/** Parses "HH:mm" into minutes-since-midnight. Returns NaN on invalid input. */
export function parseTimeToMinutes(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time?.trim() || '');
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return NaN;
  return h * 60 + min;
}

/** True if two [start,end) minute ranges overlap. */
export function timeRangesOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number
): boolean {
  return startA < endB && startB < endA;
}

/** True if two optional date ranges (null = open-ended) overlap. */
export function dateRangesOverlap(
  startA: Date | null | undefined,
  endA: Date | null | undefined,
  startB: Date | null | undefined,
  endB: Date | null | undefined
): boolean {
  const aStart = startA ? startA.getTime() : -Infinity;
  const aEnd = endA ? endA.getTime() : Infinity;
  const bStart = startB ? startB.getTime() : -Infinity;
  const bEnd = endB ? endB.getTime() : Infinity;
  return aStart <= bEnd && bStart <= aEnd;
}

/** Formats "16:00" as "4:00 PM" (locale-aware for Bangla digits). */
export function formatTime12h(time: string, locale: 'en' | 'bn' = 'en'): string {
  const minutes = parseTimeToMinutes(time);
  if (Number.isNaN(minutes)) return time;
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mm = String(m).padStart(2, '0');
  if (locale === 'bn') {
    const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    const toBn = (s: string) => s.replace(/[0-9]/g, (d) => bnDigits[Number(d)]);
    return `${toBn(String(h12))}:${toBn(mm)} ${period === 'AM' ? 'AM' : 'PM'}`;
  }
  return `${h12}:${mm} ${period}`;
}

export function formatTimeRange(startTime: string, endTime: string, locale: 'en' | 'bn' = 'en'): string {
  return `${formatTime12h(startTime, locale)} – ${formatTime12h(endTime, locale)}`;
}

/**
 * Returns "today" as a YYYY-MM-DD string in Asia/Dhaka wall-clock time,
 * independent of the server or browser's local timezone.
 */
export function getCurrentDhakaDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: DHAKA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date); // en-CA formats as YYYY-MM-DD
}

/**
 * Returns "today" in Asia/Dhaka as a UTC-midnight Date, suitable for
 * comparison against/storage in a Prisma @db.Date column.
 */
export function getCurrentDhakaDateOnly(date: Date = new Date()): Date {
  return new Date(`${getCurrentDhakaDateString(date)}T00:00:00.000Z`);
}

/** Converts any date-like value to a UTC-midnight Date (for @db.Date columns). */
export function toDateOnly(value: string | Date): Date {
  if (value instanceof Date) {
    return new Date(`${value.toISOString().slice(0, 10)}T00:00:00.000Z`);
  }
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

/** True if a weekly schedule slot's effective date range actually covers `date`. */
export function isScheduleActiveOnDate(
  schedule: { effectiveStartDate: Date | null; effectiveEndDate: Date | null },
  date: Date
): boolean {
  if (schedule.effectiveStartDate && schedule.effectiveStartDate.getTime() > date.getTime()) return false;
  if (schedule.effectiveEndDate && schedule.effectiveEndDate.getTime() < date.getTime()) return false;
  return true;
}

export const DAY_ENUM_VALUES: DayOfWeek[] = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];
