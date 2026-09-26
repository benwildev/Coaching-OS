import { NextResponse } from 'next/server';

/**
 * Maps a service error ("CODE" or "CODE: human detail") to an HTTP response.
 * Only known application codes are echoed back; anything else (e.g. a raw
 * database error) becomes a generic 500 so internals never reach the client.
 */
const KNOWN_CODE = /^[A-Z][A-Z0-9_]+$/;

const CONFLICT_CODES = new Set([
  'QUESTION_IN_USE',
  'QUESTION_PAPER_FINALIZED',
  'QUESTION_PAPER_ARCHIVED',
  'QUESTION_ALREADY_ARCHIVED',
  'QUESTION_PAPER_ALREADY_ARCHIVED',
  'MATERIAL_ALREADY_ARCHIVED',
  'QUESTION_ALREADY_SELECTED',
  'INVALID_TRANSITION',
  'NOTICE_ALREADY_PUBLISHED',
]);

// Portal (student/guardian) auth codes that don't fit the generic suffix
// rules below.
const FORBIDDEN_PORTAL_CODES = new Set(['STUDENT_NOT_LINKED', 'PORTAL_ACCOUNT_DISABLED']);
const RATE_LIMITED_CODES = new Set(['PORTAL_ACCOUNT_LOCKED']);
const UNAUTHORIZED_PORTAL_CODES = new Set(['PORTAL_INVALID_CREDENTIALS']);

export function apiErrorResponse(error: unknown, logTag: string) {
  const raw = error instanceof Error ? error.message : String(error);
  const code = raw.split(':')[0].trim();

  if (!KNOWN_CODE.test(code)) {
    console.error(`[API ${logTag}] Unexpected error:`, error);
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR', message: 'Internal server error' }, { status: 500 });
  }

  const message = raw.includes(':') ? raw.slice(raw.indexOf(':') + 1).trim() : code;
  let status = 400;
  if (code === 'UNAUTHORIZED' || code === 'TENANT_NOT_FOUND' || UNAUTHORIZED_PORTAL_CODES.has(code)) status = 401;
  else if (code.startsWith('FORBIDDEN') || code.endsWith('ACCESS_DENIED') || FORBIDDEN_PORTAL_CODES.has(code)) status = 403;
  else if (code.endsWith('NOT_FOUND')) status = 404;
  else if (CONFLICT_CODES.has(code)) status = 409;
  else if (RATE_LIMITED_CODES.has(code)) status = 429;

  if (status >= 500 || status === 400) console.warn(`[API ${logTag}] ${raw}`);
  return NextResponse.json({ success: false, error: code, message }, { status });
}

export function validationErrorResponse(fieldErrors: Record<string, string[] | undefined>) {
  return NextResponse.json(
    { success: false, error: 'VALIDATION_FAILED', message: 'Validation failed', details: fieldErrors },
    { status: 400 }
  );
}
