# Phase 14.2 migration brief (shared by all migration agents)

Project: Coaching OS (Next.js 16 — APIs/conventions may differ from your memory; follow the surrounding code).
Root: E:\Web Development Journey\Day 110 - Coaching\Coaching-OS  (Windows; files use CRLF — the Edit tool handles it; avoid whole-file rewrites).

## What exists (Phase 14.1 — DO NOT rebuild)
- lib/auth/permissions.ts: catalog, `PermissionCode` type, `can(user, code)`, `canAny`, `defaultPermissionsFor`, DEFAULT_ROLE_PERMISSIONS.
- lib/auth/session.ts: `requireTenant()`, `requireRole()`, `requirePermission(code)` (throws Error('FORBIDDEN') -> 403 via apiErrorResponse; OWNER always passes; unknown code denies), assertBranchAccess, resolveEffectiveBranchId, assertTeacherSelfAccess.
- SessionUser has `.permissions` (loaded fresh from DB on every request).
- scripts/phase14-2/permission-defaults.txt: for every permission, which of ADMIN/STAFF/TEACHER hold it BY DEFAULT (A/S/T). OWNER holds everything. `OWNER-ONLY` = ownerLocked (nobody else can ever hold it).

## Goal of this phase: AUTHORIZATION MIGRATION with ZERO change to effective behaviour at default permissions
Replace role-literal AUTHORIZATION (requireRole([...]), `user.role === ...` used to allow/deny, FINANCE_ROLES.has(role) etc.) with permission checks:
- Routes: `await requirePermission('x.y')` instead of `await requireRole([...])`. KEEP `requireTenant()` and every branch / teacher-assignment / ownership / business-state check exactly as is. Order: requireTenant -> requirePermission -> branch -> scope -> business rules.
- Routes that today have NO route-level gate but are gated inside a service (salary, compensation, notices, homework, etc.): ADD a route-level `requirePermission` too (so a user lacking the permission gets 403 before anything runs) AND migrate the service check to `can(user, code)` throwing the SAME error code it threw before (defence in depth; do not delete service checks).
- Services: replace `ROLES.has(user.role)` style authorization with `can(user, 'x.y')` from '@/lib/auth/permissions'.
- Do NOT blindly replace. KEEP role comparisons that are (a) teacher self/assignment SCOPE (`role === 'TEACHER'` selecting own records, assertTeacherSelfAccess, getTeacherAuthorized*), (b) "OWNER applies directly / others request" business logic — better expressed as can(user,'fees.discount.approve') when it is about discount approval, (c) immutable OWNER rules, (d) data-scope branch rules (isBranchScoped etc. — DO NOT touch, Phase 14.3).
- Error handling: if a migrated route's catch block turns every error into 401/500 (so FORBIDDEN would become 401), switch it to `apiErrorResponse(error, '<tag>')` from '@/lib/api-error' (FORBIDDEN*->403, UNAUTHORIZED->401). Do not otherwise change responses.
- Remove `requireRole` imports that become unused. Keep `requireRole(['OWNER'])` ONLY where it is an immutable Owner rule not in the catalog (explain in manifest).
- Do NOT touch: portal (`app/api/portal/**`), super-admin, payment gateway callbacks/ipn, webhooks, auth/*, health, setup, cron `process-due`, Prisma schema, UI pages/components (another agent), lib/auth/*, lib/store.tsx, navigation.
- Do NOT fix Phase 14.3 findings (teacher student scope, attendance alerts/batch/student scope, notice targeting, upload scope, template read access, branch helper consolidation/isBranchScoped, attendance date/weekday validation). Preserve those behaviours byte-for-byte except for the authorization gate itself.
- Do NOT invent permission codes. Use only codes in the catalog (see permission-defaults.txt). Never `question_papers.delete`, `communication.send`.

## PARITY RULE (most important)
For every gate you migrate, the NEW decision must equal the OLD decision for each of OWNER/ADMIN/STAFF/TEACHER when the role holds its DEFAULT permissions.
 old decision = what actually happened before (route gate AND service gate combined — READ THE CODE, do not assume).
 new decision = (role's default set contains every required permission) AND (role not in your retained residual role-scope checks).
Procedure per gate: find the permission whose default (A/S/T column) equals the old role set. If the semantically right permission over-grants (e.g. a role holds it by default but the old gate denied that role), then EITHER pick a different catalog permission whose defaults match and is semantically closest, OR use the right permission PLUS a retained scope check (e.g. `if (user.role === 'TEACHER') throw new Error('FORBIDDEN_TEACHER_SCOPE')` — comment why) and list it as `residualDeny`. If the right permission UNDER-grants (old gate allowed a role that default lacks) you must not silently drop access: choose another permission or report it as a TENSION. Never edit DEFAULT_ROLE_PERMISSIONS or the catalog — report instead.
A route may need two permissions (AND) when that is the only way to match.
Open reference data / per-user data (notifications, academic options, batches/options, ...): leave ungated, `permissions: null`, note why.

## Manifest (required deliverable)
Write `scripts/phase14-2/manifest.<yourgroup>.ts`:
```ts
import type { RouteAuthEntry } from './types';
export const entries: RouteAuthEntry[] = [
  { route: '/api/students', method: 'GET', oldRoles: ['OWNER','ADMIN','STAFF','TEACHER'], permissions: ['students.read'] },
  ...
];
```
One entry per exported HTTP handler (GET/POST/PUT/PATCH/DELETE) of every staff-facing route in YOUR scope (including ungated ones with permissions:null). Use the file path with Next dynamic segments verbatim, e.g. '/api/students/[studentId]'. `oldRoles` = effective roles allowed BEFORE your change (OWNER always included unless the old gate excluded it). Use 'ANY' for open-to-every-authenticated-user. Fill residualDeny / ownerOnlyRole / note as defined in scripts/phase14-2/types.ts. Be exact — a script compares old vs new for all four roles and will flag mismatches.

## Verification you must do
- Run `npx tsc --noEmit -p .` ONCE at the end (takes ~1 min; other agents edit other files concurrently — only fix errors in YOUR files).
- Do NOT run builds, dev servers, or DB scripts. Do NOT commit. Do NOT create other files besides the manifest (and edits).

## Final report (your last message) must contain, concisely
1. Files changed (routes + services).
2. Counts: routes migrated, services migrated.
3. Every retained role check (`requireRole`, `role ===`) with the reason (scope/business/owner-immutable).
4. TENSIONS / judgment calls: any gate where no catalog permission matched old behaviour exactly, what you chose, and the effect. Specifically verify (by reading actual code) and report on the three Phase-14.1 default judgment calls that touch your scope: (1) STAFF+teachers.read, (2) TEACHER+salary/compensation read, (3) STAFF+payment-gateway read.
5. Any old role gate you found that the Phase 14.0 audit got wrong.
