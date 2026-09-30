# Production Readiness Checklist

Written after the Phase 11 security/production-readiness audit. This is an operational checklist for whoever deploys this app — it documents what exists in this repo today, what's an explicit deployment-time decision, and what's an operational dependency outside the codebase (Neon, the hosting platform, an external scheduler).

## 1. Environment Variables

See `.env.example` for the full annotated list. Every genuinely security-sensitive variable (`AUTH_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`, `CRON_SECRET`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `DATABASE_URL`) has **no fallback** — the app (and `prisma.config.ts` CLI tooling) throws loudly at startup/first-use rather than silently running with a weak default. Generate real values per environment with `openssl rand -hex 32`; never reuse the placeholders, never commit real values.

| Variable | Required? | Notes |
|---|---|---|
| `DATABASE_URL` | **Required** | Use Neon's **pooled** connection string (the `-pooler` hostname), not the direct one — this app is queried per-request from a serverless/Node environment and the pooled endpoint avoids exhausting Neon's connection limit. |
| `AUTH_SECRET` | **Required** | Signs both staff and portal session JWTs (via independently-derived sub-keys). No fallback. |
| `NEXT_PUBLIC_APP_URL` | Required | Public app URL, client-visible. |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | Required for uploads | No fallback — uploads fail closed (`CLOUDINARY_NOT_CONFIGURED`) if any is missing. |
| `CREDENTIALS_ENCRYPTION_KEY` | Required once any tenant saves provider credentials via the UI | No fallback. |
| `SMS_*` / `WHATSAPP_*` / `EMAIL_*` | Optional per channel | Each channel honestly reports "Not configured" (never fakes delivery) until its env vars or a tenant's own saved credentials are present. |
| `CRON_SECRET` | Required for the retry-sweep endpoint | Compared with `crypto.timingSafeEqual`; the sweep endpoint fails closed (401) if unset. |
| `COMMUNICATION_MOCK_MODE` | **Dev/test only** | Never set in production — every provider fakes success instead of sending. |
| `AUTH_BASE_URL` / `RESULT_AUTH_BASE_URL` | Dev/test only | Only read by `scripts/verify-phase*.ts` against a running dev server, not by the app itself. |

## 2. Database Migration

This project's migration workflow (do not deviate):

```bash
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script   # inspect first
npx prisma migrate deploy
npx prisma generate
```

**Never** run `prisma migrate dev` or `prisma db push` against this Neon database (both hang/cause drift here). **Never** run `prisma format` — the schema is hand-aligned.

There is currently **no automated `migrate deploy` step wired into any deploy pipeline** (no `vercel.json`, no CI workflow in this repo) — every schema migration is a deliberate, manually-run, gated step against the real database. This is a decision the deploying team should make explicitly (automatic migrate-on-deploy vs. manual gate) rather than leave implicit; as of this audit it is manual-only, which is the safer default for a financial/student-data system.

**Phase 11 audit finding (MEDIUM, deploy-time risk, not a data-loss risk):** `20260928140000_phase10_5_data_integrity/migration.sql` adds new UNIQUE indexes to tables that may already hold rows (`payments(coachingCenterId, paymentMethod, transactionId)`, a partial unique index on `student_batches` for active membership) with no dedup step. If a genuine pre-existing duplicate exists in a target database, `migrate deploy` will fail atomically (not corrupt data) at that step. Before running `migrate deploy` against any database that predates this migration, check for duplicates first, e.g.:
```sql
SELECT "coachingCenterId", "paymentMethod", "transactionId", count(*) FROM payments WHERE "transactionId" IS NOT NULL GROUP BY 1,2,3 HAVING count(*) > 1;
```
This dev database had none — deploy succeeded clean — but a fresh production database seeded independently should be checked before its first deploy of this migration.

## 3. Build

```bash
npm install       # triggers "postinstall": "prisma generate" — added in Phase 11
npm run build     # next build
npm start         # next start
```

`prisma generate` is now wired into `postinstall` (Phase 11 fix — it was previously absent, which risked a stale or missing Prisma Client on a fresh install in a deploy pipeline like Vercel's). `next build` itself does not run migrations — see §2.

## 4. Seed / Initial Setup

There is no seeded "demo tenant" used in production. The real onboarding path is the `/setup` page → `POST /api/setup` → `completeInitialSetup()` (`lib/services/tenant.service.ts`), which creates the first coaching center, its main branch, the OWNER account, and (optionally) seeds standard SSC/HSC/Admission academic programs. `scripts/setup-admin-account.ts` and `scripts/seed-*.ts` are **development-only** convenience scripts hardcoded against a specific dev tenant code (`ACC`) — do not run them against production data. `setup-admin-account.ts` (Phase 11 fix) now refuses to run at all unless `CONFIRM_DEV_SCRIPT=yes-reset-dev-passwords` is set, so it can no longer silently overwrite a real owner/admin password if `DATABASE_URL` is accidentally pointed at production.

## 5. Authentication

- Staff and portal sessions are independently-keyed JWTs (`lib/auth/secret.ts` derives separate sub-keys per audience from `AUTH_SECRET`) — a token for one can never verify as the other.
- Every request re-reads the account's `sessionVersion` from the database and rejects a token whose embedded version doesn't match — logout, password change/reset, and account status changes all bump it, invalidating every outstanding session immediately.
- Real account lockout exists (5 failed attempts / 15 minutes, both staff and portal), with anti-enumeration design (generic error message, dummy-hash timing parity, `ACCOUNT_INACTIVE` revealed only after a correct password).
- **New in Phase 11**: IP-scoped rate limiting on `/api/auth/login` (30/15min) and `/api/auth/forgot-password` (5/15min), on top of the existing per-account lockout — see `lib/services/rate-limit.service.ts`.
- There is no staff self-service password reset by design — staff passwords are reset by the center's OWNER/ADMIN.

## 6. Provider Configuration (SMS / WhatsApp / Email)

See `docs/communication.md` for full setup. Summary: every channel resolves credentials as *tenant-saved value → environment variable → unconfigured*, and reports honestly when unconfigured rather than faking success. Tenant-saved credentials are encrypted at rest (AES-256-GCM, `CREDENTIALS_ENCRYPTION_KEY`) and never decrypted into any API response — only field metadata (`{key, label, secret, required, set: boolean}`) is ever returned to the browser.

**Known caveats carried forward from Phase 10.8** (audited in Phase 11, none are production blockers but all remain outstanding):
1. SMS.BD live-account verification remains outstanding — the API contract was built from public docs, not a live account; verify before the first real send.
2. SMS delivery-status polling remains deferred (no delivery-receipt reconciliation beyond what the provider's send-response already gives).
3. WhatsApp template-message support remains deferred (only session/free-form messages are implemented).
4. Discount/waiver approval workflow remains a future finance-governance item (currently a straight field on the invoice, no separate approval step).

## 7. Storage (Cloudinary)

All uploads go through the single server-side endpoint `POST /api/upload`, gated by an authenticated staff session, a per-scope MIME-type allowlist (SVG excluded — the classic stored-XSS-via-upload vector), and a per-scope byte-size cap. The destination Cloudinary folder is always `coaching-os/<the caller's own tenant id>/<hardcoded per-scope folder>` — never client-influenced beyond picking one of 7 known scope enums. There is no "upload by remote URL" path anywhere, so there's no SSRF vector through this endpoint.

**Known gaps** (non-blocking, worth a follow-up): `deleteFromCloudinary()` exists but is never called — replaced/removed media is never cleaned up from storage, so orphaned files will accumulate over time. The student-portal homework-attachment upload button currently targets the staff-only `/api/upload` endpoint and will 401 for a real logged-in student (fails safe, but the feature is non-functional as wired — no portal-specific upload route exists yet).

## 8. Communication (Cron / Scheduled Retry)

`POST /api/communication/retry/process-due` is the only HTTP-exposed scheduled-task endpoint. It requires the `CRON_SECRET` header compared via `crypto.timingSafeEqual`, and fails closed (401) if `CRON_SECRET` is unset — it will never run unauthenticated. Wire this to your platform's external scheduler (e.g. Vercel Cron, a GitHub Actions cron, or any HTTP-capable scheduler) at a cadence matching your desired retry latency (every few minutes is reasonable); the sweep itself is bounded (processes at most 50 due retries per call) and is safe to invoke more often than needed — it will simply no-op when nothing is due.

## 9. Backups

**There is no backup/restore automation in this repository** — no scripts, no cron config, no documentation of a restore runbook. The database is Neon-hosted, and Neon offers its own point-in-time-recovery / branching features, but **that is a platform-level setting configured in the Neon project console, not something this codebase verifies, enables, or tests.** Before going to production:
- Confirm Neon's PITR retention window for this specific project in the Neon console.
- Write down (outside this repo, in your ops runbook) the actual restore procedure and who owns it.
- Do not assume backups exist just because the database happens to be Neon-hosted — verify it explicitly for this project.

## 10. Monitoring

**No error-monitoring or observability SDK is installed** (no Sentry, no APM, no structured request logging). The only visibility into server-side exceptions today is whatever your hosting platform captures from stdout/stderr (`console.error` calls). Before production launch, add at minimum an error-tracking SDK (e.g. Sentry) so unhandled exceptions surface as alerts rather than silent log lines nobody is watching. A lightweight health-check endpoint now exists at `GET /api/health` (added in Phase 11) — it checks DB connectivity via `SELECT 1` and returns only `{status:'ok'|'error'}`, safe to point an uptime monitor or load balancer health probe at.

## 11. Rollback

There is no automated rollback mechanism (no blue/green config, no automated migration-down script in this repo). Rolling back a bad deploy is a manual, platform-level operation (e.g. redeploying the previous build on Vercel). Rolling back a bad **migration** is riskier and should be planned per-migration — additive migrations (the norm in this codebase, see `prisma/migrations/`) are trivially safe to leave in place even if the application code is rolled back; a destructive migration should never be deployed without an explicit, reviewed rollback plan for that specific change.

## 12. Security Headers

Configured in `next.config.ts` as of Phase 11: `Content-Security-Policy` (a non-nonce policy — see the code comment for why; it permits Cloudinary images and keeps every page eligible for static optimization), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/microphone/geolocation disabled — nothing in the app uses them). No CORS configuration exists, which is correct for this same-origin, cookie-authenticated app — do not add a permissive CORS policy, it would undermine the cookie-based auth model.

Note: this Next.js version renamed the `middleware.ts` file convention to `proxy.ts` — if a future change needs a request-level hook (e.g. a nonce-based CSP), create `proxy.ts`, not `middleware.ts`.

## 13. Domain / HTTPS

Not configured in this repository — this is entirely a hosting-platform concern (TLS termination, custom domain, HTTP→HTTPS redirect). `Strict-Transport-Security` is sent unconditionally (harmless over plain HTTP in dev; browsers only honor it once a request is already HTTPS), so once HTTPS is terminated correctly at the platform level, HSTS is already in effect with no further app-level change needed.

## 14. Cookie Configuration

Both the staff (`coaching_os_session`) and portal (`coaching_os_portal_session`) session cookies are `HttpOnly`, `SameSite=Lax`, `Path=/`, 7-day `Max-Age`, and `Secure` conditionally on `NODE_ENV === 'production'` (never forced in dev, which would break local HTTP testing — make sure your production deployment actually sets `NODE_ENV=production` so this activates). Logging in as one identity type explicitly clears the other's cookie, so a browser never carries both simultaneously.

## Summary: What's Actually Ready vs. What's an Explicit Operational Decision

**Solid today, verified by code inspection and the Phase 11 test suite:** tenant/branch isolation, portal/guardian/teacher authorization, financial concurrency, credential encryption, webhook signing, session invalidation, login abuse protection, security headers, rate limiting on auth endpoints.

**Explicit decisions the deploying team must make (not defects, just undecided):** automated vs. manual migration deploy (§2), Neon backup/PITR configuration (§9), which error-monitoring SDK to add (§10), domain/TLS setup (§13).

**Known non-blocking gaps carried forward for future work:** orphaned Cloudinary media on replace/delete, the non-functional portal homework-upload button, SMS.BD/WhatsApp-template items already tracked since Phase 10.8, and the owner dashboard's data-fetching approach (functionally correct and bounded, but architecturally heavier than the reports module's SQL-aggregation style — see the Phase 11 completion report's Performance Findings for detail).

## 15. Phase 11.1 Hardening & Gap Closure

Phase 11.1 closed the remaining consistency, authorization, and deployment-safety items identified during the Phase 11 security audit:

### A. Null-Branch Authorization Semantics (`assertBranchAccess` & `resolveEffectiveBranchId`)
- **Domain Policy**: Resources with `branchId == null` represent center-wide / unassigned resources. They are accessible by `OWNER` users and unassigned staff (`user.branchId == null`).
- **Enforcement**: Branch-restricted staff (`user.branchId != null`) are strictly denied (`FORBIDDEN_BRANCH`) when attempting to read, modify, or delete any resource where `resource.branchId == null`. Branch-locked users are confined strictly to their assigned branch.
- **Filtering**: `resolveEffectiveBranchId(user, requestedBranchId)` ensures that any branch-locked user has their effective branch resolved strictly to their assigned `user.branchId`, preventing scope widening via query parameters.
- **Verification**: Verified across an exhaustive 14-scenario matrix (OWNER, unassigned ADMIN, branch-locked ADMIN, unassigned STAFF, branch-locked STAFF, unassigned TEACHER, branch-locked TEACHER) in `verify-phase11-1.ts`.

### B. Exam Enrollment Authorization Hardening (`enrollStudentsToExam`)
- **Domain Authorization**: `enrollStudentsToExam` (`lib/services/exam.service.ts`) is fully hardened before future route exposure.
- **Rules Enforced**:
  - Validates tenant ownership of the exam, subjects, and all candidate students.
  - Exam status gate: Only `DRAFT` exams accept new enrollments (rejects `PUBLISHED`, `COMPLETED`, `CANCELLED` with `EXAM_NOT_DRAFT`).
  - Branch scoping: If the exam has a specific `branchId`, every student must belong to that exact branch (rejects mismatches with `BRANCH_MISMATCH`). Branch-locked actors must match the exam branch.
  - Student status & session eligibility: Students must have `status: ACTIVE` and be actively enrolled in the exam's academic session and class/program.
  - Concurrency & idempotency: Multi-student enrollment creates `ExamStudent` and draft `Result` rows in an atomic transaction with `skipDuplicates: true`, preventing unique-key violations or duplicate marks roster rows under concurrent execution.
- **Verification**: Verified across tenant isolation, branch mismatch, draft status, and concurrent enrollment scenarios in `verify-phase11-1.ts`.

### C. Homework Notification Policy Consistency (`HOMEWORK_PUBLISHED`)
- **Product Decision**: Both Students and Guardians receive `HOMEWORK_PUBLISHED` notifications by default.
- **Implementation**: In `lib/services/notification-policy.service.ts`, `POLICY_DEFINITIONS_CATALOG` for `HOMEWORK_PUBLISHED` defines `GUARDIAN` with `defaultEnabled: true`. Sibling-safe guardian deduplication in `notifyStudentGuardians` ensures guardians with multiple children in the same class/batch receive a single aggregated alert. Center administrators retain the ability to toggle guardian delivery OFF per tenant in notification policy settings.
- **Verification**: Phase 10.7 notification policy regression suite restored to 100% pass (33/32 checks passed).

### D. Migration Deduplication Safety Audit
- **Audit Findings**: Live database audit of all Phase 10.5 unique constraints (`student_batches_studentId_batchId_key`, `payments_coachingCenterId_idempotencyKey_key`, `attendance_sessions_batchId_sessionDate_key`, `communication_logs_providerMessageId_key`, `notifications_dedup_idx`) confirmed **0 duplicate records** exist.
- **Migration Policy**: Historical migrations in `prisma/migrations/` remain completely untouched to preserve migration ledger integrity. Fresh deployments from migration zero succeed deterministically, and existing production databases remain intact without requiring corrective deduplication scripts or resets.

### E. Phase 11.2.1 — Finance UX Completion & Admission Integrity
- **Admission Idempotency**:
  - `StudentEnrollment` carries a tenant-scoped `idempotencyKey` with a database-level unique constraint `@@unique([coachingCenterId, idempotencyKey])`.
  - Migration `20260930150000_phase11_2_1_admission_idempotency` deployed clean.
  - Safe replay behavior: when an admission request is repeated with the same `idempotencyKey`, the system detects the existing enrollment and returns the original student, enrollment, and invoice records without re-admitting the student or duplicating financial obligations.
- **Collect Payment Workflow**:
  - `/fees/collect` provides a fast cashier desk UI with instant student lookup, due balance preview, payment method selection, receipt generation, and print-ready receipt view.
  - `/api/fees/collect/students` searches students with outstanding balances, enforcing center-wide and branch boundary isolation for branch-locked staff.
  - Reuses the existing payment engine (`/api/fees/invoices/[invoiceId]/payments`), preserving payment idempotency, cash sessions, and receipt numbering.
- **Discounts & Waivers Management Workflow**:
  - Dedicated concession dashboard at `/fees/discounts` featuring summary KPI cards, status filters (Pending, Approved, Rejected, All), concession request modal, and Owner-only approval/rejection modals.
  - Role-based authorization: Owner can immediately approve/apply discounts or approve/reject pending requests. Staff and Admin submissions default to `PENDING_APPROVAL` without modifying student invoice balances.
  - Atomic approval: Updates concession to `APPROVED`, atomically decrements invoice balance and relevant student fee assignment, flags `OVERDUE` invoices as `PARTIAL` or `PAID`, and logs `DISCOUNT_APPROVED` audit entries with actor details.
  - Strict rejection: Updates concession to `REJECTED`, retains original invoice balance intact, and logs `DISCOUNT_REJECTED` audit entries.
- **Course Students & Schedule Tabs**:
  - Course details page (`/courses/[courseId]`) enriched with dedicated "Students" and "Schedule" tabs alongside existing course overview and fee structure.
  - API endpoints `/api/courses/[courseId]/students` and `/api/courses/[courseId]/schedules` enforce tenant and branch boundary isolation with 404 on cross-tenant access.
- **Verification & Regression**:
  - Full Phase 11.2.1 test suite (`scripts/verify-phase11-2-1.ts`) passed 12/12 checks across all deliverables.
  - Phase 11.1 regression suite (`scripts/verify-phase11-1.ts`) passed 25/25 checks.
  - Phase 11.2 course pricing suite (`scripts/verify-phase11-2.ts`) passed 9/9 checks.
  - TypeScript compiler (`tsc --noEmit`) and ESLint (`npm run lint`) passed with 0 errors.

## Phase 11.3 — Online Payment Gateway + Manual Payment Collection

- **Core Payment Model & Clear Separation**:
  - Maintained two completely separate payment channels:
    - **Admin / Staff Manual Payment Collection** (`/fees/collect`): Always available unconditionally. Supports `CASH`, `BKASH`, `NAGAD`, `BANK`, `CARD`, `OTHER`. Reuses existing payment engine and cash session architecture.
    - **Student / Guardian Online Payment**: Conditionally and dynamically discovered in student/guardian portals based on tenant's configured gateways (bKash Tokenized Checkout and/or SSLCommerz Hosted Checkout).
  - Manual payment instructions and manual payment submission review workflow are always available as a fallback in portal modals even when no online gateway is configured.
- **Security & Secret Handling**:
  - Credentials encrypted at rest using AES-256-GCM via `lib/services/crypto.service.ts` keyed by `CREDENTIALS_ENCRYPTION_KEY`.
  - Secrets are never returned to clients, logs, or API responses; responses return `isConfigured: true`, masked hints, and test statuses.
  - Only `OWNER` and `ADMIN` can view or mutate gateway configurations; staff and teacher attempts return 403 Forbidden.
- **Server-Authoritative Invoicing**:
  - Online gateway checkouts use server-calculated `dueAmount` directly from the database; frontend amount overrides are strictly ignored.
  - Verification validates return amounts against recorded transaction amounts; tampering causes immediate transaction failure.
- **bKash Tokenized Checkout Integration**:
  - Compliant with official bKash Tokenized Checkout API v1.2.0-beta (`grantToken`, `createPayment`, `executePayment`, `queryPayment`).
  - Supports sandbox and production environments with dynamic base URLs.
  - Handles bKash sandbox response quirks (unescaped control characters in JSON messages).
- **SSLCommerz Hosted Checkout Integration**:
  - Compliant with official SSLCommerz V4 API (`POST /gwprocess/v4/api.php` and server-to-server Order Validation API `/validator/api/validationserverAPI.php`).
  - Strict validation of `val_id`, `tran_id`, amount, and currency. Redirect responses alone are never trusted without server-side validation.
- **Financial Engine Integration & Idempotency**:
  - Verified gateway payments atomically invoke existing `createPayment()`, generating sequential `RCP-YYYY-xxxxxx` receipts, creating standard `Payment` records, and updating invoice status (`PAID` or `PARTIAL`).
  - Duplicate callbacks and IPN webhooks are strictly idempotent; repeat hits return the existing payment without duplicate ledger entries or double collections.
  - Overpayment protection blocks payments on already-settled invoices.
  - Seamlessly integrates with existing collection reports (`/api/fees/reports/collection`) and refund mechanisms (`refundPayment`).
- **Offline Manual Payment Submissions**:
  - Students/guardians can submit offline payment reference numbers, sender mobile numbers, transaction IDs, and receipts.
  - Admin/staff review queue (`/api/fees/manual-submissions` and `/settings/payment-gateways` submissions tab).
  - Approving a submission marks it `APPROVED` and invokes `createPayment()`, generating a receipt and updating the invoice.
  - Rejecting marks it `REJECTED` with reason, leaving invoice balance intact.
- **Verification & Regression**:
  - Phase 11.3 verification suite (`scripts/verify-phase11-3.ts`) passed all 50 scenarios (50/50).
  - Phase 11.1 regression suite (`scripts/verify-phase11-1.ts`) passed 25/25 scenarios.
  - Phase 11.2 regression suite (`scripts/verify-phase11-2.ts`) passed 9/9 scenarios.
  - Phase 11.2.1 regression suite (`scripts/verify-phase11-2-1.ts`) passed 12/12 scenarios.
  - TypeScript compiler (`tsc --noEmit`) and ESLint (`npm run lint` / `eslint --quiet`) passed with 0 errors.

## Summary: Current Production Status

**Solid & Hardened Today (Verified by Phases 10.4–11.1 Test Suites):**
- Tenant isolation across all entities
- Branch isolation & strict null-branch denial for branch-locked staff
- Student/guardian portal authorization & IDOR defense
- Teacher exam-result & subject roster scoping
- Financial concurrency & refund race prevention
- Credential encryption (AES-256-GCM) & webhook signature verification
- Session versioning, instant revocation, & rate limiting
- Notification alert policies & recipient controls
- Clean TypeScript compilation, linting, and Next.js production build

**Operational Prerequisites Before Production Deployment:**
1. Configure real secrets in production environment (`AUTH_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`, `CRON_SECRET`, etc.).
2. Set up Neon Point-in-Time Recovery (PITR) retention policy in the Neon console.
3. Configure external cron scheduler (e.g., Vercel Cron) targeting `/api/communication/retry/process-due` with `CRON_SECRET`.
4. Install an application monitoring / error tracking SDK (e.g., Sentry).
5. Verify live provider accounts for SMS.BD and Meta WhatsApp API.
