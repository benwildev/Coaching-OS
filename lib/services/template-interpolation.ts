import { TEMPLATE_VARIABLES, type TemplateVariable } from '@/lib/notifications/events';

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/**
 * Replaces `{{var}}` placeholders using only the TEMPLATE_VARIABLES allowlist.
 * Any other `{{...}}` token (unknown variable, or accidental script-like
 * text) is left as literal text — never evaluated, never thrown (AGENTS.md
 * §20: "Unknown variables should not execute anything").
 */
export function interpolate(template: string, vars: Partial<Record<TemplateVariable, string>>): string {
  return template.replace(PLACEHOLDER, (match, name: string) => {
    if (!(TEMPLATE_VARIABLES as readonly string[]).includes(name)) return match;
    const value = vars[name as TemplateVariable];
    return value !== undefined && value !== null ? String(value) : match;
  });
}

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);
}

/**
 * Renders a fully-interpolated message for use as an email HTML body.
 * CommunicationTemplate bodies are plain text by contract (no intentional
 * markup — schema stores them as plain @db.Text), so it's safe and simplest
 * to HTML-escape the entire rendered string (guarding against injected
 * markup from any interpolated value, e.g. a guardian/student name) rather
 * than trying to distinguish "trusted template text" from "escaped values"
 * at the placeholder level. Newlines become <br> for basic HTML rendering.
 */
export function interpolateHtml(template: string, vars: Partial<Record<TemplateVariable, string>>): string {
  return escapeHtml(interpolate(template, vars)).replace(/\n/g, '<br>');
}

export const SAMPLE_TEMPLATE_VARIABLES: Record<TemplateVariable, string> = {
  studentName: 'Rahim Uddin',
  guardianName: 'Karim Uddin',
  invoiceNumber: 'INV-2026-000123',
  amount: '2,500',
  dueAmount: '1,200',
  paymentDate: '24/09/2026',
  examName: 'HSC Physics Weekly Test 11',
  examDate: '30/09/2026',
  resultDate: '05/10/2026',
  noticeTitle: 'Notice: Class Reschedule for Eid Holiday',
  batchName: 'HSC Physics Morning',
  subjectName: 'Physics',
  className: 'Class 11',
  date: '30/09/2026',
  time: '10:00 AM',
};
