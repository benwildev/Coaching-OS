import { createHash } from 'node:crypto';

/**
 * JWT signing key resolution — Phase 10.4.
 *
 * There is NO usable fallback secret. Earlier versions of this file signed
 * every staff and portal token with a hardcoded string
 * ('coaching-os-bangladesh-production-secret-key-32chars') that also shipped
 * in .env.example — anyone who had read the source (or the example file)
 * could forge a valid session for any account, in any tenant, at any role.
 * That is fixed by requiring a real operator-provided secret and refusing to
 * start auth at all without one.
 *
 * Staff (coaching_os_session) and portal (coaching_os_portal_session) tokens
 * are signed with two independently-derived keys, both built from the one
 * operator-managed AUTH_SECRET via SHA-256 with a fixed, distinct label per
 * audience (a simple HKDF-style expansion). This means a staff-signed token
 * cryptographically cannot verify against the portal key and vice versa —
 * the audience separation does not depend solely on the `type` claim inside
 * the payload being checked correctly by every caller, it is enforced by the
 * signature itself. No second environment variable is required to get this
 * property.
 */

const MIN_SECRET_LENGTH = 32;

function resolveBaseSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.trim().length < MIN_SECRET_LENGTH) {
    // Never log the secret itself — only that it is missing/too short.
    throw new Error(
      `AUTH_SECRET_NOT_CONFIGURED: AUTH_SECRET must be set to a random string of at least ${MIN_SECRET_LENGTH} characters ` +
        'before the application can authenticate anyone. Generate one (e.g. `openssl rand -hex 32`) and set it in the ' +
        'environment — there is no default or development fallback.'
    );
  }
  return secret;
}

function deriveKey(audience: 'staff' | 'portal'): Uint8Array {
  const base = resolveBaseSecret();
  return new Uint8Array(createHash('sha256').update(`coaching-os:jwt:${audience}:${base}`).digest());
}

let staffKey: Uint8Array | null = null;
let portalKey: Uint8Array | null = null;

/**
 * Lazily resolved and memoized so importing this module (e.g. during
 * `next build`'s route-manifest collection) never throws — only actually
 * signing or verifying a token does, i.e. a real authentication attempt.
 */
export function getStaffSecretKey(): Uint8Array {
  if (!staffKey) staffKey = deriveKey('staff');
  return staffKey;
}

export function getPortalSecretKey(): Uint8Array {
  if (!portalKey) portalKey = deriveKey('portal');
  return portalKey;
}
