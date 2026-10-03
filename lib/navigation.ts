/**
 * Phase 14.2 — the ONE navigation configuration.
 *
 * Desktop sidebar, mobile drawer, mobile bottom bar and (via `lib/route-access.ts`)
 * the page guard all derive from the permission model; nothing else in the
 * codebase may keep its own list of staff modules or role filters.
 *
 * Visibility = tenant feature enabled  AND  permission granted.
 * (Hiding an item is presentation only — pages and APIs enforce permissions
 * themselves.)
 */
import { can, canAny, type PermissionCode, type PermissionSubject } from '@/lib/auth/permissions';

export interface NavItem {
  /** Key into DICTIONARY[lang].nav for the label. */
  id: string;
  icon: string;
  href: string;
  /**
   * Required permission. An array means "any of" (an aggregate entry whose
   * page contains several independently-permissioned areas). Omitted on a
   * pure parent (visibility then comes from its children).
   */
  permission?: PermissionCode | readonly PermissionCode[];
  /** Tenant feature flag (`currentCenter.features[feature] === false` hides the item). */
  feature?: string;
  /** Shown in the mobile bottom bar when visible (in config order). */
  bottom?: boolean;
  /** When present, the item is visible only if at least one child is. */
  children?: readonly NavItem[];
}

export const REPORT_PERMISSIONS = [
  'reports.students.read',
  'reports.attendance.read',
  'reports.exams.read',
  'reports.teachers.read',
  'reports.batches.read',
  'reports.finance.read',
  'reports.communication.read',
] as const satisfies readonly PermissionCode[];

export const SETTINGS_PERMISSIONS = [
  'settings.profile.read',
  'settings.academic.read',
  'settings.branding.read',
  'settings.users.read',
  'settings.payment_gateways.read',
  'settings.communication.update',
  'settings.notification_policy.update',
  'settings.subscription.read',
] as const satisfies readonly PermissionCode[];

export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'dashboard', icon: 'chart', href: '/dashboard', permission: 'dashboard.read', bottom: true },
  { id: 'students', icon: 'user', href: '/students', permission: 'students.read', bottom: true },
  { id: 'courses', icon: 'book', href: '/courses', permission: 'courses.read' },
  { id: 'batches', icon: 'layers', href: '/batches', permission: 'batches.read' },
  { id: 'routine', icon: 'calendar', href: '/routine', permission: 'routine.read' },
  { id: 'attendance', icon: 'check', href: '/attendance', permission: 'attendance.read', bottom: true },
  { id: 'fees', icon: 'wallet', href: '/fees', permission: 'fees.read', bottom: true },
  { id: 'salary', icon: 'banknote', href: '/salary', permission: 'salary.read' },
  { id: 'finance', icon: 'activity', href: '/finance', permission: ['finance.dashboard.read', 'expenses.read'] },
  { id: 'exams', icon: 'award', href: '/exams', permission: 'exams.read' },
  { id: 'questions', icon: 'target', href: '/questions', permission: 'questions.read' },
  { id: 'questionPapers', icon: 'file', href: '/question-papers', permission: 'question_papers.read' },
  { id: 'materials', icon: 'book', href: '/materials', permission: 'materials.read' },
  { id: 'homework', icon: 'calcheck', href: '/homework', permission: 'homework.read', feature: 'HOMEWORK' },
  { id: 'teachers', icon: 'grad', href: '/teachers', permission: 'teachers.read' },
  { id: 'notifications', icon: 'bell', href: '/notifications', permission: 'notifications.read' },
  { id: 'notices', icon: 'pin', href: '/notices', permission: 'notices.read' },
  {
    id: 'communication',
    icon: 'message',
    href: '/communication',
    permission: ['communication.templates.read', 'communication.logs.read'],
  },
  { id: 'reports', icon: 'doc', href: '/reports', permission: REPORT_PERMISSIONS, feature: 'ADVANCED_REPORTS' },
  { id: 'settings', icon: 'sliders', href: '/settings', permission: SETTINGS_PERMISSIONS },
];

export type FeatureFlags = Record<string, boolean> | null | undefined;

function permissionOk(user: PermissionSubject | null | undefined, permission: NavItem['permission']): boolean {
  if (permission === undefined) return true;
  return typeof permission === 'string' ? can(user, permission) : canAny(user, permission);
}

/** Feature flags only hide on an explicit `false` (unknown flag = enabled), as before. */
function featureOk(feature: string | undefined, features: FeatureFlags): boolean {
  return !feature || features?.[feature] !== false;
}

/**
 * The navigation a user may see. A logged-out / loading user (null) sees
 * NOTHING — there is no default role. A parent with children is visible only
 * if at least one child is, so no empty sections are ever left behind.
 */
export function filterNavigation(
  user: PermissionSubject | null | undefined,
  features: FeatureFlags,
  items: readonly NavItem[] = NAV_ITEMS
): NavItem[] {
  if (!user) return [];
  const out: NavItem[] = [];
  for (const item of items) {
    if (!featureOk(item.feature, features) || !permissionOk(user, item.permission)) continue;
    if (item.children) {
      const children = filterNavigation(user, features, item.children);
      if (children.length === 0) continue;
      out.push({ ...item, children });
    } else {
      out.push(item);
    }
  }
  return out;
}

/** Bottom-bar subset of an already-filtered navigation (same config, same permission result). */
export function bottomNavigation(visible: readonly NavItem[]): NavItem[] {
  return visible.filter((i) => i.bottom);
}

/** Active-route test shared by every navigation surface (exact match or a real path-segment prefix). */
export function isNavActive(pathname: string | null | undefined, href: string): boolean {
  if (!pathname) return false;
  if (href === '/dashboard') return pathname === '/' || pathname === '/dashboard' || pathname.startsWith('/dashboard/');
  return pathname === href || pathname.startsWith(`${href}/`);
}
