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
  'LAST_OWNER_PROTECTED',
  'TEACHER_ALREADY_LINKED',
  'USER_ALREADY_LINKED',
  'TEACHER_NOT_LINKED',
  'HOMEWORK_ALREADY_ARCHIVED',
  'HOMEWORK_HAS_SUBMISSIONS',
  'HOMEWORK_CLOSED',
  'HOMEWORK_NOT_DRAFT',
  'HOMEWORK_NOT_OPEN',
  'SUBMISSION_ALREADY_REVIEWED',
  'COMMUNICATION_RETRY_LIMIT_REACHED',
  'COMMUNICATION_RETRY_ALREADY_IN_PROGRESS',
  'CASH_SESSION_ALREADY_OPEN',
  'CASH_SESSION_ALREADY_CLOSED',
  'CASH_SESSION_CLOSED',
  'PLAN_IN_USE',
  'PLAN_CODE_EXISTS',
  'COMPENSATION_OVERLAP',
  'COMPENSATION_IN_USE',
  'COMPENSATION_ALREADY_ENDED',
  'SALARY_PERIOD_LOCKED',
  'SALARY_ALREADY_PAID',
  'SALARY_OVERPAYMENT',
  'SALARY_CANCELLED',
  'SALARY_CANNOT_CANCEL',
  'SALARY_CASH_SESSION_CLOSED',
]);

// Portal (student/guardian) auth codes that don't fit the generic suffix
// rules below.
const FORBIDDEN_PORTAL_CODES = new Set(['STUDENT_NOT_LINKED', 'PORTAL_ACCOUNT_DISABLED']);
// Phase 11.4: plan/subscription refusals — the caller is authenticated but the
// tenant's plan, subscription state or suspension does not permit the action.
const PLAN_REFUSAL_CODES = new Set(['SUBSCRIPTION_INACTIVE', 'FEATURE_NOT_ENABLED', 'TENANT_SUSPENDED']);
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
  else if (PLAN_REFUSAL_CODES.has(code) || code.endsWith('_LIMIT_REACHED')) status = 403;
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
