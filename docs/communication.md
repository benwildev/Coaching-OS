# Communication Delivery Engine (Phase 10.8)

This extends the existing communication pipeline (`CommunicationTemplate`, `CommunicationLog`, the `CommunicationProvider` interface, sibling-safe recipient resolution) with real vendor integrations, a bounded retry engine, provider settings, and a WhatsApp delivery webhook. It does **not** replace or duplicate any of that existing architecture.

## 1. Supported channels — status matrix

| Channel | Implemented | Vendor | Configured by default | Production-ready |
|---|---|---|---|---|
| SMS | Yes | SMS.BD (`api.sms.net.bd`-compatible REST API) | No — requires env vars | Only after you verify the endpoint contract against your real SMS.BD account (see caveat below) and set credentials |
| WhatsApp | Yes | Official WhatsApp Business Cloud API (Meta Graph API) | No — requires env vars | Yes, for plain-text messages within an open session; template messages for cold outreach are **not implemented** (see §6) |
| Email | Yes | Gmail SMTP via nodemailer | No — requires env vars | Yes, once a Gmail App Password is configured |

**Caveat**: the SMS.BD endpoint contract (`/sendsms`, `/user/balance/`, response shape) was taken from SMS.BD's public API documentation, not verified against a live account. Confirm it matches your actual SMS.BD dashboard docs before your first production send.

Every provider reports one of these states, never fakes a send:
- **Not configured** — required env vars are missing; `send()` always returns `SKIPPED`.
- **Configured + sent** — the vendor accepted the message (`status: SENT`).
- **Configured + failed** — the vendor rejected it or a network/timeout error occurred (`status: FAILED`).
- **Disabled** — the tenant has turned the channel off in Communication Settings, even though it's configured (`status: SKIPPED`, `errorMessage: CHANNEL_DISABLED`).

## 2. Provider configuration: per-tenant UI credentials, with an env-var fallback

Since the original Phase 10.8 writeup, credentials can also be entered per-tenant from **Settings → Communication** (Owner/Admin only), not only via server-side env vars:

- `CommunicationProviderConfig` (one row per `(coachingCenterId, channel)`) stores the tenant's credentials as a single AES-256-GCM-encrypted JSON blob — see `lib/services/crypto.service.ts`. The encryption key (`CREDENTIALS_ENCRYPTION_KEY`, required once any tenant saves credentials this way) lives in a server-side env var, same "no default/fallback" posture as `AUTH_SECRET`.
- Resolution order per send: **tenant-saved value first, then the matching env var** (`lib/services/communication-settings.service.ts:resolveProviderCredentials`). A tenant that never opens the settings page keeps working exactly as before, off the env vars alone.
- Editable fields per channel (`PROVIDER_CREDENTIAL_FIELDS`): SMS — `apiKey`, `senderId`, `baseUrl`; WhatsApp — `token`, `phoneNumberId`, `apiVersion`; Email — `smtpHost`, `smtpPort`, `smtpUser`, `smtpPass`, `fromName`. WhatsApp's `appSecret`/`webhookVerifyToken` are deliberately **not** tenant-editable — they belong to the one Meta App that owns the webhook subscription (shared across whichever tenants use that App), and a webhook must verify a payload's signature before it can even know which tenant it's for, so those two stay env-var-only globals.
- `PUT /api/settings/communication/credentials` (Owner/Admin only) saves credentials — a field omitted from the request keeps its previously-saved value, an explicit empty string clears it. **No API response ever echoes a saved value back** — `GET /api/settings/communication` reports only `configured`/`enabled` and, per field, `set: boolean`, never the value itself.

For env-var-only deployments (no tenant has used the settings UI), see `.env.example` for the full list: `SMS_PROVIDER_API_KEY`, `SMS_SENDER_ID`, `SMS_PROVIDER_BASE_URL`, `WHATSAPP_BUSINESS_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_API_VERSION`, `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`, `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASS`, `EMAIL_FROM_NAME`, `CRON_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`, `COMMUNICATION_MOCK_MODE` (test-only).

Credentials are never returned to a browser and never logged, whether they came from the database or an env var.

## 3. Bangladesh phone number handling

`lib/utils/phone.ts` — `normalizeBangladeshPhone()` is the single shared utility used by both SMS and WhatsApp before every send. It accepts `01[3-9]XXXXXXXX`, `8801[3-9]XXXXXXXX`, and `+8801[3-9]XXXXXXXX`, and normalizes to both E.164 (`+8801...`, stored on the log) and bare MSISDN (`8801...`, sent to the vendor APIs). Anything else is rejected explicitly (`INVALID_PHONE`) — never silently altered or guessed.

## 4. Delivery status semantics

- `QUEUED` — created, not yet attempted (or currently mid-attempt during a retry).
- `SENT` — the provider **accepted** the message. This is the terminal success state for SMS and Email.
- `DELIVERED` — the provider confirmed the recipient's device received it. **Only WhatsApp supports this**, via its delivery-status webhook (§7). SMS.BD's public API has no webhook (only a poll-based report endpoint, not implemented this phase); Gmail SMTP has no delivery confirmation at all.
- `FAILED` — the provider rejected the message, or a network/timeout error occurred.
- `SKIPPED` — never attempted: no recipient address, channel disabled for this tenant, or provider not configured.

## 5. Retry behavior (no queue infrastructure)

Every `CommunicationLog` row tracks `attemptCount`, `lastAttemptAt`, `nextRetryAt`, `errorCode`, `retryable`. A `FAILED` result is classified `retryable` (temporary provider/network error) or not (invalid recipient, rejected credentials, permanently rejected message) by each provider adapter.

- **Bounded**: at most 3 attempts total (`MAX_RETRY_ATTEMPTS`, `lib/services/communication/retry-config.ts`).
- **Backoff**: 5 min → 30 min → 2 h between attempts, computed from `nextRetryAt` (a plain database timestamp — no Redis/BullMQ/queue).
- **Manual retry**: `POST /api/communication/retry/[id]` (OWNER/ADMIN only) — available in the Communication Logs UI as a "Retry" button on eligible rows.
- **Scheduled retry**: `POST /api/communication/retry/process-due`, authorized by a shared secret (`x-cron-secret` header matching `CRON_SECRET`), meant to be invoked by an external scheduler (e.g. a Vercel Cron entry in `vercel.json`, or any cron/uptime service) every 5–10 minutes. There is no in-app worker — this endpoint **must** be wired to an external trigger for automatic retries to actually happen; without it, only manual retry works.
- **Concurrency-safe**: every retry (manual or scheduled) first atomically claims the log row (`UPDATE ... WHERE status = 'FAILED'`, only proceeding if exactly one row was claimed), so two simultaneous retries can never both resend the same message.

## 6. Idempotency

Unchanged from the existing architecture: `CommunicationLog`'s unique index on `(guardianId, studentId, channel, event, sourceType, sourceId)` is the authoritative dedup key, enforced by the database (a duplicate `dispatchToGuardian` call for the same event/source is a harmless no-op, caught as Postgres error `P2002`). A retry never creates a new log row — it resends the exact stored `message` on the existing row.

## 7. WhatsApp delivery webhook

`app/api/webhooks/whatsapp/route.ts`:
- `GET` handles Meta's subscription verification handshake (`WHATSAPP_WEBHOOK_VERIFY_TOKEN`).
- `POST` receives delivery-status callbacks, verifies `X-Hub-Signature-256` (HMAC-SHA256 with `WHATSAPP_APP_SECRET`) and rejects anything unsigned or mismatched, matches the payload's `providerMessageId` against an existing `CommunicationLog` row (never trusts any tenant/guardian/student id from the payload itself), and idempotently updates `DELIVERED`/`FAILED` — a replayed or out-of-order webhook can never regress an already-`DELIVERED` row.

## 8. Known limitations / deferred items

- **WhatsApp template messages** for business-initiated contact outside an open 24-hour session are not implemented — only plain-text messages, which work within an open session or a sandbox number. Adding template support is a follow-up.
- **SMS delivery confirmation** beyond "provider accepted" is not implemented — SMS.BD's report endpoint could be polled in a future phase; this was deferred to keep scope bounded.
- **Email delivery confirmation** is not possible with plain SMTP; `SENT` is the terminal state for this channel.
- Communication history filtering by `guardianId`/`studentId`/`branchId` is supported at the API level (`/api/communication/logs`) but has no dedicated dropdown in the UI yet (channel/status/search filters and free-text search are already in the UI).

## 9. Security summary

- Provider credentials live either as server-side env vars or as AES-256-GCM-encrypted per-tenant DB rows (§2) — either way, never returned by any API response, never logged (log lines include channel/provider/event/status/error code, never secrets).
- `/api/settings/communication*` (view and manage provider config) is OWNER/ADMIN only, not just secret-masked — STAFF/TEACHER get a 403, not a redacted view.
- Manual retry is OWNER/ADMIN only; the scheduled sweep endpoint uses a constant-time shared-secret comparison, not session auth, since it's called by infrastructure rather than a person.
- Every settings mutation (enable/disable a channel, test connection, manual/automatic retry) is written to the existing `AuditLog`.
- Tenant/branch isolation is unchanged: all queries are scoped by `coachingCenterId` resolved from the session, and branch-scoped users are restricted via the existing `assertBranchAccess`/`resolveEffectiveBranchId` helpers — no client-supplied id is ever trusted.
