import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Reversible at-rest encryption for tenant-supplied provider credentials
 * (SMS/WhatsApp/Email API keys entered via the Communication Settings UI).
 * Same "no usable fallback, fail loudly" philosophy as lib/auth/secret.ts —
 * there is no hardcoded default key, and a missing/short
 * CREDENTIALS_ENCRYPTION_KEY refuses to encrypt or decrypt anything rather
 * than silently using a weak key.
 *
 * AES-256-GCM: a fresh random 12-byte IV per encryption, the 16-byte GCM
 * auth tag is stored alongside the ciphertext so tampering is detected on
 * decrypt (not just confidentiality — integrity too). Output format is a
 * single string: `v1:<iv>:<authTag>:<ciphertext>`, each part base64.
 */

const MIN_KEY_LENGTH = 32;
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

let cachedKey: Buffer | null = null;

function resolveKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!secret || secret.trim().length < MIN_KEY_LENGTH) {
    throw new Error(
      `CREDENTIALS_ENCRYPTION_KEY_NOT_CONFIGURED: CREDENTIALS_ENCRYPTION_KEY must be set to a random string of at least ${MIN_KEY_LENGTH} characters ` +
        'before provider credentials can be saved or read. Generate one (e.g. `openssl rand -hex 32`) and set it in the environment — there is no default.'
    );
  }
  // SHA-256 expands/normalizes any operator-supplied secret to exactly 32
  // bytes, the key length aes-256-gcm requires.
  cachedKey = createHash('sha256').update(secret).digest();
  return cachedKey;
}

export function encryptSecret(plaintext: string): string {
  const key = resolveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptSecret(encoded: string): string {
  const key = resolveKey();
  const parts = encoded.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('CREDENTIALS_DECRYPT_FAILED: unrecognized ciphertext format');
  }
  const [, ivB64, authTagB64, ciphertextB64] = parts;
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()]);
  return plaintext.toString('utf8');
}

/** Encrypts a whole credentials object as one JSON blob — one encrypt/decrypt per channel, not per field. */
export function encryptCredentials(credentials: Record<string, string | undefined>): string {
  return encryptSecret(JSON.stringify(credentials));
}

export function decryptCredentials(encoded: string): Record<string, string | undefined> {
  return JSON.parse(decryptSecret(encoded));
}
