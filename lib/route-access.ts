/**
 * Phase 14.2 — page-level authorization table.
 *
 * Hiding a sidebar entry is not security: every staff page is also checked
 * against this table by the app shell, which renders the Forbidden state
 * instead of the page (so the page never mounts and never fetches its data).
 * The API behind every page enforces its own permission independently.
 *
 * First matching rule wins, so specific rules precede general ones.
 *   ':x'  matches exactly one path segment
 *   '**'  (last segment) matches the rest of the path (including nothing)
 */
import { canAny, type PermissionCode, type PermissionSubject } from '@/lib/auth/permissions';
import { REPORT_PERMISSIONS, SETTINGS_PERMISSIONS } from '@/lib/navigation';

export type RouteRequirement =
  | { type: 'permission'; any: readonly PermissionCode[] }
  | { type: 'owner' } // immutable Owner-only page (not a catalog permission)
  | { type: 'authenticated' }; // any signed-in staff user; its data is gated by its own API

const P = (...any: PermissionCode[]): RouteRequirement => ({ type: 'permission', any });
const OWNER: RouteRequirement = { type: 'owner' };
const AUTH: RouteRequirement = { type: 'authenticated' };

export const ROUTE_RULES: readonly { pattern: string; requirement: RouteRequirement }[] = [
  // '/' only redirects to /dashboard, which carries its own rule.
  { pattern: '/', requirement: AUTH },
  { pattern: '/dashboard/**', requirement: P('dashboard.read') },

  { pattern: '/students/new', requirement: P('students.create') },
  { pattern: '/students/promote', requirement: P('students.promote') },
  { pattern: '/students/id-cards/**', requirement: P('students.id_card') },
  { pattern: '/students/:id/edit', requirement: P('students.update') },
  { pattern: '/students/:id/certificates/**', requirement: P('students.certificates') },
  { pattern: '/students/:id/id-card', requirement: P('students.id_card') },
  { pattern: '/students/**', requirement: P('students.read') },

  { pattern: '/courses/**', requirement: P('courses.read') },
  { pattern: '/batches/new', requirement: P('batches.create') },
  { pattern: '/batches/**', requirement: P('batches.read') },
  // A teacher's own profile (incl. their pay history) lives here and is served by a detail API that is not permission-gated.
  { pattern: '/teachers/:id', requirement: AUTH },
  { pattern: '/teachers', requirement: P('teachers.read') },
  { pattern: '/routine/**', requirement: P('routine.read') },

  { pattern: '/attendance/teacher', requirement: P('teacher_attendance.read') },
  { pattern: '/attendance/alerts', requirement: P('attendance.alerts.read') },
  { pattern: '/attendance/**', requirement: P('attendance.read') },

  { pattern: '/exams/new', requirement: P('exams.create') },
  { pattern: '/exams/:id/publish', requirement: P('exams.publish') },
  { pattern: '/exams/:id/subjects/:sid/marks', requirement: P('exams.marks.enter') },
  { pattern: '/exams/**', requirement: P('exams.read') },
  { pattern: '/results/**', requirement: P('results.read') },

  { pattern: '/fees/structures/new', requirement: P('fees.structures.create') },
  { pattern: '/fees/structures/**', requirement: P('fees.structures.read') },
  { pattern: '/fees/invoices/new', requirement: P('fees.invoices.create') },
  { pattern: '/fees/collect', requirement: P('fees.collect') },
  { pattern: '/fees/discounts', requirement: P('fees.discount.request', 'fees.discount.approve') },
  { pattern: '/fees/reports/**', requirement: P('fees.reports.read') },
  { pattern: '/fees/**', requirement: P('fees.read') },
  { pattern: '/salary/**', requirement: P('salary.read') },
  { pattern: '/finance/expenses/**', requirement: P('expenses.read') },
  { pattern: '/finance/expenses', requirement: P('expenses.read') },
  { pattern: '/finance/**', requirement: P('finance.dashboard.read') },

  { pattern: '/homework/new', requirement: P('homework.create') },
  { pattern: '/homework/:id/edit', requirement: P('homework.update') },
  { pattern: '/homework/**', requirement: P('homework.read') },
  { pattern: '/materials/new', requirement: P('materials.create') },
  { pattern: '/materials/:id/edit', requirement: P('materials.update') },
  { pattern: '/materials/**', requirement: P('materials.read') },
  { pattern: '/questions/new', requirement: P('questions.create') },
  { pattern: '/questions/:id/edit', requirement: P('questions.update') },
  { pattern: '/questions/**', requirement: P('questions.read') },
  { pattern: '/question-papers/new', requirement: P('question_papers.create') },
  { pattern: '/question-papers/**', requirement: P('question_papers.read') },

  { pattern: '/notices/new', requirement: P('notices.create') },
  { pattern: '/notices/:id/edit', requirement: P('notices.update') },
  { pattern: '/notices/**', requirement: P('notices.read') },
  { pattern: '/notifications/**', requirement: P('notifications.read') },

  { pattern: '/communication/templates/new', requirement: P('communication.templates.manage') },
  { pattern: '/communication/templates/**', requirement: P('communication.templates.read') },
  { pattern: '/communication/logs/**', requirement: P('communication.logs.read') },
  { pattern: '/communication', requirement: P('communication.templates.read', 'communication.logs.read') },

  { pattern: '/reports/students/**', requirement: P('reports.students.read') },
  { pattern: '/reports/attendance/**', requirement: P('reports.attendance.read') },
  { pattern: '/reports/exams/**', requirement: P('reports.exams.read') },
  { pattern: '/reports/teachers/**', requirement: P('reports.teachers.read') },
  { pattern: '/reports/batches/**', requirement: P('reports.batches.read') },
  { pattern: '/reports/finance/**', requirement: P('reports.finance.read') },
  { pattern: '/reports/communications/**', requirement: P('reports.communication.read') },
  { pattern: '/reports', requirement: P(...REPORT_PERMISSIONS) },

  { pattern: '/settings/roles-permissions', requirement: OWNER },
  { pattern: '/settings/subscription', requirement: P('settings.subscription.read') },
  // STAFF reviews manual payment submissions here through fees.read; gateway credentials need payment_gateways.read.
  { pattern: '/settings/payment-gateways', requirement: P('settings.payment_gateways.read', 'fees.read') },
  { pattern: '/settings/communication', requirement: P('settings.communication.update') },
  // Per-user notification preferences live here; the policy section is gated by its own API/UI permission.
  { pattern: '/settings/notifications', requirement: AUTH },
  { pattern: '/settings', requirement: P(...SETTINGS_PERMISSIONS) },
];

/** Paths that never use the staff shell / guard (own layouts, public, other session types). */
export function isUnguardedPath(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/forgot-password' ||
    pathname.startsWith('/setup') ||
    pathname.startsWith('/portal') ||
    pathname.startsWith('/super-admin') ||
    pathname.startsWith('/platform')
  );
}

function matches(pattern: string, path: string): boolean {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  for (let i = 0; i < p.length; i++) {
    if (p[i] === '**') return true;
    if (i >= s.length) return false;
    if (p[i].startsWith(':')) continue;
    if (p[i] !== s[i]) return false;
  }
  return p.length === s.length;
}

/**
 * The requirement for a staff page path. A path with no rule yields
 * `undefined`, which callers treat as FORBIDDEN (deny by default), so a newly
 * added page cannot silently ship unguarded.
 */
export function getRouteRequirement(pathname: string): RouteRequirement | undefined {
  const path = pathname.split('?')[0].replace(/\/+$/, '') || '/';
  return ROUTE_RULES.find((r) => matches(r.pattern, path))?.requirement;
}

export function canAccessRoute(user: PermissionSubject | null | undefined, pathname: string): boolean {
  if (!user) return false;
  const req = getRouteRequirement(pathname);
  if (!req) return false;
  if (req.type === 'authenticated') return true;
  if (req.type === 'owner') return user.role === 'OWNER';
  return canAny(user, req.any);
}
