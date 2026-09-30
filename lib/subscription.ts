/**
 * Phase 11.4 — pure (no DB, no Next) subscription rules, shared by the server
 * services and the browser so a limit shown in a screen is derived by exactly
 * the code that enforces it.
 *
 * COUNTING RULES (what consumes a limit) — the single documented definition:
 *  - Students        : Student.status = ACTIVE (inactive / dropped-out / completed do not count)
 *  - Teachers        : Teacher.status = ACTIVE
 *  - Staff accounts  : User with role ADMIN or STAFF and status ACTIVE. OWNER accounts are
 *                      never counted (a tenant can always have its owner) and TEACHER-role
 *                      accounts are covered by the Teachers limit, not this one.
 *  - Portal accounts : PortalAccount.status = ACTIVE (student + guardian accounts together;
 *                      independent of the Student record count)
 *  - Branches        : Branch.status = ACTIVE
 *  - Messages        : CommunicationLog rows of that channel created in the current Dhaka
 *                      calendar month with status QUEUED (reserved / in flight), SENT or
 *                      DELIVERED. FAILED and SKIPPED never consume quota; a retry updates the
 *                      SAME row, so a message that is retried until it succeeds counts once.
 *  - Storage         : sum of Media.size for the tenant
 *
 * PRECEDENCE: tenant overrides → plan snapshot on the tenant's subscription → unlimited.
 * A tenant with no subscription row is a LEGACY tenant: unrestricted, all features.
 */

export const LIMIT_KEYS = [
  'maxStudents',
  'maxTeachers',
  'maxStaffUsers',
  'maxPortalAccounts',
  'maxBranches',
  'maxSms',
  'maxWhatsapp',
  'maxEmail',
  'maxStorageMb',
] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];
/** null = unlimited */
export type Limits = Record<LimitKey, number | null>;

export const FEATURE_KEYS = [
  'ATTENDANCE',
  'FEES',
  'HOMEWORK',
  'EXAMS',
  'STUDY_MATERIALS',
  'COMMUNICATION',
  'ADVANCED_REPORTS',
  'ONLINE_PAYMENT',
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type Features = Record<FeatureKey, boolean>;

export const SUBSCRIPTION_STATUSES = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'EXPIRED', 'CANCELLED'] as const;
export type StoredStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export type EffectiveStatus = StoredStatus | 'LEGACY';

export const emptyLimits = (): Limits =>
  Object.fromEntries(LIMIT_KEYS.map((k) => [k, null])) as Limits;

export const allFeatures = (value: boolean): Features =>
  Object.fromEntries(FEATURE_KEYS.map((k) => [k, value])) as Features;

/** Coerces stored JSON / API input to a clean Limits object (invalid → unlimited-null is NOT assumed: invalid becomes null only when absent). */
export function normalizeLimits(raw: unknown): Limits {
  const out = emptyLimits();
  if (raw && typeof raw === 'object') {
    for (const k of LIMIT_KEYS) {
      const v = (raw as Record<string, unknown>)[k];
      out[k] = typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;
    }
  }
  return out;
}

/** Features not mentioned are OFF (an explicit plan is opt-in). */
export function normalizeFeatures(raw: unknown): Features {
  const out = allFeatures(false);
  if (raw && typeof raw === 'object') {
    for (const k of FEATURE_KEYS) out[k] = (raw as Record<string, unknown>)[k] === true;
  }
  return out;
}

export interface SubscriptionSnapshot {
  planCode: string;
  planName: string;
  planBanglaName?: string | null;
  version: number;
  limits: Limits;
  features: Features;
}

export interface OverrideMeta {
  reason: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

export interface SubscriptionOverrides {
  limits?: Partial<Record<LimitKey, number | null>>;
  features?: Partial<Record<FeatureKey, boolean>>;
  /** Who/why/when per overridden key (display names, never internal ids). Ignored by limit resolution. */
  meta?: { limits?: Partial<Record<LimitKey, OverrideMeta>>; features?: Partial<Record<FeatureKey, OverrideMeta>> };
}

/** overrides → snapshot. A key present in overrides (including explicit null = unlimited) wins. */
export function resolveLimits(snapshot: Limits | null, overrides?: SubscriptionOverrides | null): Limits {
  const base = snapshot ? { ...snapshot } : emptyLimits();
  const o = overrides?.limits;
  if (o) {
    for (const k of LIMIT_KEYS) {
      if (Object.prototype.hasOwnProperty.call(o, k)) {
        const v = o[k];
        base[k] = v === null || v === undefined ? null : v;
      }
    }
  }
  return base;
}

export function resolveFeatures(snapshot: Features | null, overrides?: SubscriptionOverrides | null): Features {
  const base = snapshot ? { ...snapshot } : allFeatures(false);
  const o = overrides?.features;
  if (o) for (const k of FEATURE_KEYS) if (typeof o[k] === 'boolean') base[k] = o[k] as boolean;
  return base;
}

export interface StatusInput {
  status: StoredStatus;
  endDate: Date | string;
}

/**
 * The status the tenant is actually in right now. TRIAL / ACTIVE / PAST_DUE whose
 * end date has passed are EXPIRED — computed on every read from the database, so
 * no scheduler is needed and a renewal takes effect instantly.
 */
export function computeEffectiveStatus(sub: StatusInput | null, now: Date = new Date()): EffectiveStatus {
  if (!sub) return 'LEGACY';
  if (sub.status === 'CANCELLED' || sub.status === 'EXPIRED') return sub.status;
  return new Date(sub.endDate).getTime() < now.getTime() ? 'EXPIRED' : sub.status;
}

/**
 * Whether the tenant may GROW (create students/teachers/accounts/branches, send
 * messages). Read access, login, payment collection and history are never gated
 * by this. PAST_DUE is a grace state and still grows.
 */
export function statusAllowsGrowth(status: EffectiveStatus): boolean {
  return status === 'LEGACY' || status === 'TRIAL' || status === 'ACTIVE' || status === 'PAST_DUE';
}

/** Asia/Dhaka is UTC+6 with no DST, so month boundaries are fixed offsets. */
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

export function dhakaMonthBounds(now: Date = new Date()): { start: Date; end: Date; label: string } {
  const dhaka = new Date(now.getTime() + DHAKA_OFFSET_MS);
  const y = dhaka.getUTCFullYear();
  const m = dhaka.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1) - DHAKA_OFFSET_MS);
  const end = new Date(Date.UTC(y, m + 1, 1) - DHAKA_OFFSET_MS);
  return { start, end, label: `${y}-${String(m + 1).padStart(2, '0')}` };
}

export type UsageLevel = 'unlimited' | 'normal' | 'near' | 'critical' | 'reached';

/** UX thresholds only (80 / 90 / 100 %). Nothing is blocked before 100 %. */
export function usageLevel(used: number, limit: number | null): UsageLevel {
  if (limit === null) return 'unlimited';
  if (limit <= 0) return used > 0 || limit === 0 ? 'reached' : 'normal';
  const pct = (used / limit) * 100;
  if (pct >= 100) return 'reached';
  if (pct >= 90) return 'critical';
  if (pct >= 80) return 'near';
  return 'normal';
}

export const usagePercent = (used: number, limit: number | null): number =>
  limit === null || limit <= 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));

export const RESOURCE_LIMIT: Record<'STUDENT' | 'TEACHER' | 'STAFF' | 'PORTAL' | 'BRANCH', LimitKey> = {
  STUDENT: 'maxStudents',
  TEACHER: 'maxTeachers',
  STAFF: 'maxStaffUsers',
  PORTAL: 'maxPortalAccounts',
  BRANCH: 'maxBranches',
};
export type LimitedResource = keyof typeof RESOURCE_LIMIT;

export const CHANNEL_LIMIT = { SMS: 'maxSms', WHATSAPP: 'maxWhatsapp', EMAIL: 'maxEmail' } as const;
export type MessageChannel = keyof typeof CHANNEL_LIMIT;

// ------------------------------------------------------------------
// Phase 11.5 — subscription operations (pure rules)
// ------------------------------------------------------------------

export type DurationUnit = 'MONTHS' | 'DAYS';
export interface Duration {
  unit: DurationUnit;
  value: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const addDays = (d: Date, days: number): Date => new Date(d.getTime() + days * DAY_MS);

/** Calendar-month arithmetic in UTC with day clamping: 31 Oct + 1 month = 30 Nov. */
export function addCalendarMonths(d: Date, months: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const targetYear = y + Math.floor(m / 12);
  const targetMonth = ((m % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(targetYear, targetMonth, Math.min(d.getUTCDate(), lastDay), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds())
  );
}

export const addDuration = (from: Date, d: Duration): Date => (d.unit === 'MONTHS' ? addCalendarMonths(from, d.value) : addDays(from, d.value));

/**
 * THE RENEWAL RULE (server-side only; the client never supplies dates):
 *  - still running (end date in the future)  → the new period is added AFTER the current end,
 *    so renewing early never shortens or wastes paid time (31 Oct + 1 month → 30 Nov);
 *  - already ended (end date in the past)    → the new period starts from NOW,
 *    so a long-expired tenant is not silently handed back-dated time.
 */
export function computeRenewalEnd(currentEnd: Date | null, now: Date, duration: Duration): Date {
  const base = currentEnd && currentEnd.getTime() > now.getTime() ? currentEnd : now;
  return addDuration(base, duration);
}

export interface OverLimit {
  key: LimitKey;
  used: number;
  limit: number;
  over: number;
}

const USAGE_FIELD: Record<LimitKey, string> = {
  maxStudents: 'students',
  maxTeachers: 'teachers',
  maxStaffUsers: 'staffUsers',
  maxPortalAccounts: 'portalAccounts',
  maxBranches: 'branches',
  maxSms: 'sms',
  maxWhatsapp: 'whatsapp',
  maxEmail: 'email',
  maxStorageMb: 'storageMb',
};
export const usageFieldOf = (k: LimitKey): string => USAGE_FIELD[k];

/** Limits the tenant currently exceeds. Existing records are never removed; only NEW creation is blocked. */
export function computeOverLimits(limits: Limits, usage: Record<string, number | string>): OverLimit[] {
  const out: OverLimit[] = [];
  for (const k of LIMIT_KEYS) {
    const limit = limits[k];
    if (limit === null) continue;
    const used = Number(usage[USAGE_FIELD[k]] ?? 0);
    if (used > limit) out.push({ key: k, used, limit, over: used - limit });
  }
  return out;
}

export type NoticeKind = 'NONE' | 'TRIAL_ENDS' | 'EXPIRING_SOON' | 'PAST_DUE' | 'EXPIRED' | 'CANCELLED' | 'SUSPENDED';
export interface SubscriptionNotice {
  kind: NoticeKind;
  endDate?: string;
  daysLeft?: number;
}
export const EXPIRING_SOON_DAYS = 7;

/** Which message a tenant should see. No prices or amounts are ever invented. */
export function subscriptionNotice(
  input: { tenantSuspended: boolean; status: EffectiveStatus; endDate: Date | string | null },
  now: Date = new Date()
): SubscriptionNotice {
  if (input.tenantSuspended) return { kind: 'SUSPENDED' };
  const end = input.endDate ? new Date(input.endDate) : null;
  const daysLeft = end ? Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY_MS)) : undefined;
  const endDate = end ? end.toISOString() : undefined;
  switch (input.status) {
    case 'TRIAL':
      return { kind: 'TRIAL_ENDS', endDate, daysLeft };
    case 'ACTIVE':
      return daysLeft !== undefined && daysLeft <= EXPIRING_SOON_DAYS ? { kind: 'EXPIRING_SOON', endDate, daysLeft } : { kind: 'NONE' };
    case 'PAST_DUE':
      return { kind: 'PAST_DUE', endDate, daysLeft };
    case 'EXPIRED':
      return { kind: 'EXPIRED', endDate };
    case 'CANCELLED':
      return { kind: 'CANCELLED', endDate };
    default:
      return { kind: 'NONE' };
  }
}
