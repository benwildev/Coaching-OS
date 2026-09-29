// Single shared Bangladesh phone normalization utility (Phase 10.8 §10).
// Every channel that sends to a phone number (SMS, WhatsApp) must go through
// this instead of re-implementing its own parsing — an invalid number must
// produce a clear, explicit rejection, never a silent guess.

const BD_LOCAL_PATTERN = /^01[3-9]\d{8}$/; // 01XXXXXXXXX, operator prefix 013-019
const BD_COUNTRY_CODE = '880';

export type PhoneNormalizationResult =
  | { valid: true; e164: string; msisdn880: string }
  | { valid: false; reason: string };

/**
 * Accepts common Bangladesh mobile formats:
 *   01712345678
 *   8801712345678
 *   +8801712345678
 * and normalizes to both E.164 (+8801712345678, for storage/display) and the
 * bare MSISDN form (8801712345678, no plus — what BD SMS/WhatsApp APIs
 * expect in their `to` field). Anything else is rejected with a reason
 * rather than altered.
 */
export function normalizeBangladeshPhone(input: string | null | undefined): PhoneNormalizationResult {
  if (!input || !input.trim()) {
    return { valid: false, reason: 'PHONE_EMPTY' };
  }

  const trimmed = input.trim().replace(/[\s-]/g, '');

  let local: string | null = null;
  if (BD_LOCAL_PATTERN.test(trimmed)) {
    local = trimmed;
  } else if (trimmed.startsWith('+' + BD_COUNTRY_CODE) && BD_LOCAL_PATTERN.test('0' + trimmed.slice(4))) {
    local = '0' + trimmed.slice(4);
  } else if (trimmed.startsWith(BD_COUNTRY_CODE) && BD_LOCAL_PATTERN.test('0' + trimmed.slice(3))) {
    local = '0' + trimmed.slice(3);
  }

  if (!local) {
    return { valid: false, reason: 'PHONE_INVALID_BD_FORMAT' };
  }

  const msisdn880 = BD_COUNTRY_CODE + local.slice(1);
  return { valid: true, e164: '+' + msisdn880, msisdn880 };
}
