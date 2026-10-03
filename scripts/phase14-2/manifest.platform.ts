import type { RouteAuthEntry } from './types';

const OA = ['OWNER', 'ADMIN'] as const;
const OAS = ['OWNER', 'ADMIN', 'STAFF'] as const;
const O = ['OWNER'] as const;

export const entries: RouteAuthEntry[] = [
  // ---------------- communication ----------------
  { route: '/api/communication/logs', method: 'GET', oldRoles: [...OAS], permissions: ['communication.logs.read'], note: 'Branch pinning of branch-locked non-OWNER/ADMIN users inside listCommunicationLogs is Phase 14.3 data scope, untouched.' },
  { route: '/api/communication/retry/[id]', method: 'POST', oldRoles: [...OA], permissions: ['communication.retry'] },
  { route: '/api/communication/templates', method: 'GET', oldRoles: [...OAS], permissions: ['communication.templates.read'] },
  { route: '/api/communication/templates', method: 'POST', oldRoles: [...OA], permissions: ['communication.templates.manage'], note: 'Route gate was OWNER/ADMIN/STAFF but createTemplate (assertTemplateManageable) denied STAFF; effective OWNER/ADMIN.' },
  { route: '/api/communication/templates/[templateId]', method: 'GET', oldRoles: 'ANY', permissions: null, note: 'No route or service gate today (any staff incl. TEACHER can read one template by id). Phase 14.3 template read access finding: preserved, not gated.' },
  { route: '/api/communication/templates/[templateId]', method: 'PUT', oldRoles: [...OA], permissions: ['communication.templates.manage'], note: 'Previously service-gated only (assertTemplateManageable); route gate added, service now uses can().' },
  { route: '/api/communication/templates/[templateId]/active', method: 'POST', oldRoles: [...OA], permissions: ['communication.templates.manage'], note: 'Previously service-gated only; route gate added, service now uses can().' },
  { route: '/api/communication/templates/[templateId]/preview', method: 'POST', oldRoles: 'ANY', permissions: null, note: 'No gate today; part of the Phase 14.3 template read access finding, preserved.' },

  // ---------------- portal-accounts ----------------
  { route: '/api/portal-accounts', method: 'GET', oldRoles: [...OA], permissions: ['portal_accounts.manage'] },
  { route: '/api/portal-accounts', method: 'POST', oldRoles: [...OA], permissions: ['portal_accounts.manage'] },
  { route: '/api/portal-accounts/[portalAccountId]', method: 'PATCH', oldRoles: [...OA], permissions: ['portal_accounts.manage'] },
  { route: '/api/portal-accounts/[portalAccountId]/reset-link', method: 'POST', oldRoles: [...OA], permissions: ['portal_accounts.manage'] },

  // ---------------- reports ----------------
  { route: '/api/reports/options', method: 'GET', oldRoles: 'ANY', permissions: null, note: 'Per-user filter options (already narrowed to what the caller may select; response lists the categories the caller can open). Feature-gated ADVANCED_REPORTS. Ungated by design.' },
  {
    route: '/api/reports/[category]', method: 'GET', oldRoles: 'ANY', permissions: null,
    note: 'Gate is per category (see the /api/reports/[category]#<category> pseudo-entries below): route calls requirePermission(CATEGORY_PERMISSION[category]) after filter parsing and resolveReportScope re-checks via can(). Retained: branch-lock, TEACHER batch/subject/teacher scope, canCompareBranches (OWNER/ADMIN), canViewInternalResults (not TEACHER).',
  },
  { route: '/api/reports/[category]#students', method: 'GET', oldRoles: ['OWNER', 'ADMIN', 'STAFF', 'TEACHER'], permissions: ['reports.students.read'], note: 'pseudo-entry for one category of the dynamic route' },
  { route: '/api/reports/[category]#attendance', method: 'GET', oldRoles: ['OWNER', 'ADMIN', 'STAFF', 'TEACHER'], permissions: ['reports.attendance.read'], note: 'pseudo-entry' },
  { route: '/api/reports/[category]#exams', method: 'GET', oldRoles: ['OWNER', 'ADMIN', 'STAFF', 'TEACHER'], permissions: ['reports.exams.read'], note: 'pseudo-entry' },
  { route: '/api/reports/[category]#teachers', method: 'GET', oldRoles: [...OAS], permissions: ['reports.teachers.read'], note: 'pseudo-entry' },
  { route: '/api/reports/[category]#batches', method: 'GET', oldRoles: ['OWNER', 'ADMIN', 'STAFF', 'TEACHER'], permissions: ['reports.batches.read'], note: 'pseudo-entry. Fee figures and the batchFees drill-down inside it additionally need reports.finance.read (canViewFinance), same as before (OWNER/ADMIN/STAFF).' },
  { route: '/api/reports/[category]#finance', method: 'GET', oldRoles: [...OAS], permissions: ['reports.finance.read'], note: 'pseudo-entry. The branch-compare view stays OWNER/ADMIN (canCompareBranches).' },
  { route: '/api/reports/[category]#communications', method: 'GET', oldRoles: [...OAS], permissions: ['reports.communication.read'], note: 'pseudo-entry; category key is communications, permission is reports.communication.read' },

  // ---------------- settings ----------------
  { route: '/api/settings/academic', method: 'GET', oldRoles: 'ANY', permissions: null, note: 'Open reference data (programs/sessions/boards) used by many non-settings pages; settings.academic.read (ADMIN only) would deny STAFF/TEACHER. Parity: ungated.' },
  { route: '/api/settings/academic', method: 'POST', oldRoles: [...OA], permissions: ['settings.academic.update'] },
  { route: '/api/settings/audit', method: 'GET', oldRoles: [...OA], permissions: ['settings.users.read'], note: 'No audit entry in catalog; settings.users.read chosen by parity (ADMIN only). Catch block moved from blanket 401 to apiErrorResponse.' },
  { route: '/api/settings/branding', method: 'GET', oldRoles: 'ANY', permissions: null, note: 'Branding is shown app-wide; settings.branding.read (ADMIN only) would deny STAFF/TEACHER. Parity: ungated.' },
  { route: '/api/settings/branding', method: 'POST', oldRoles: [...OA], permissions: ['settings.branding.update'] },
  { route: '/api/settings/communication', method: 'GET', oldRoles: [...OA], permissions: ['settings.communication.update'], note: 'No read code in catalog; update used for GET by parity.' },
  { route: '/api/settings/communication', method: 'PATCH', oldRoles: [...OA], permissions: ['settings.communication.update'], note: 'Service assertCommunicationSettingsManageable now uses can().' },
  { route: '/api/settings/communication/balance', method: 'GET', oldRoles: [...OA], permissions: ['settings.communication.update'] },
  { route: '/api/settings/communication/credentials', method: 'PUT', oldRoles: [...OA], permissions: ['settings.communication.update'] },
  { route: '/api/settings/communication/report', method: 'GET', oldRoles: [...OA], permissions: ['settings.communication.update'] },
  { route: '/api/settings/communication/test', method: 'POST', oldRoles: [...OA], permissions: ['settings.communication.update'] },
  { route: '/api/settings/manual-payments', method: 'GET', oldRoles: [...OAS], permissions: ['fees.read'], note: 'No catalog entry for manual payment instructions; fees.read matches OWNER/ADMIN/STAFF.' },
  { route: '/api/settings/manual-payments', method: 'PUT', oldRoles: [...OA], permissions: ['settings.payment_gateways.update'] },
  { route: '/api/settings/notifications', method: 'GET', oldRoles: 'ANY', permissions: null, note: 'Per-user preferences ungated. Admin-only parts (tenant policies, channelsConfigured) now depend on can(user, settings.notification_policy.update) instead of OWNER/ADMIN role.' },
  { route: '/api/settings/notifications', method: 'PUT', oldRoles: 'ANY', permissions: null, note: 'Per-user preferences ungated. If the body includes policies, updateNotificationPolicies (service) requires settings.notification_policy.update (403 NOTIFICATION_POLICY_ACCESS_DENIED as before).' },
  { route: '/api/settings/notifications', method: 'PATCH', oldRoles: 'ANY', permissions: null, note: 'Delegates to PUT; same notes.' },
  { route: '/api/settings/notifications/policies', method: 'GET', oldRoles: [...OA], permissions: ['settings.notification_policy.update'] },
  { route: '/api/settings/notifications/policies', method: 'PUT', oldRoles: [...OA], permissions: ['settings.notification_policy.update'], note: 'Previously service-gated only; route gate added (before body validation), service now uses can().' },
  { route: '/api/settings/notifications/policies', method: 'PATCH', oldRoles: [...OA], permissions: ['settings.notification_policy.update'], note: 'Delegates to PUT.' },
  { route: '/api/settings/payment-gateways', method: 'GET', oldRoles: [...OA], permissions: ['settings.payment_gateways.read'] },
  { route: '/api/settings/payment-gateways', method: 'PUT', oldRoles: [...OA], permissions: ['settings.payment_gateways.update'] },
  { route: '/api/settings/payment-gateways/[provider]/test', method: 'POST', oldRoles: [...OA], permissions: ['settings.payment_gateways.update'] },
  { route: '/api/settings/payment-gateways/[provider]/toggle', method: 'POST', oldRoles: [...OA], permissions: ['settings.payment_gateways.update'] },
  { route: '/api/settings/profile', method: 'GET', oldRoles: 'ANY', permissions: null, note: 'Center profile is read app-wide; settings.profile.read (ADMIN only) would deny STAFF/TEACHER. Parity: ungated.' },
  { route: '/api/settings/profile', method: 'POST', oldRoles: [...OA], permissions: ['settings.profile.update'] },
  { route: '/api/settings/roles-permissions', method: 'GET', oldRoles: [...O], permissions: null, ownerOnlyRole: true, note: 'Immutable Owner-only; untouched.' },
  { route: '/api/settings/roles-permissions/[role]', method: 'PUT', oldRoles: [...O], permissions: null, ownerOnlyRole: true, note: 'Immutable Owner-only; untouched.' },
  { route: '/api/settings/roles-permissions/[role]/reset', method: 'POST', oldRoles: [...O], permissions: null, ownerOnlyRole: true, note: 'Immutable Owner-only; untouched.' },
  { route: '/api/settings/subscription', method: 'GET', oldRoles: [...O], permissions: ['settings.subscription.read'], note: 'settings.subscription.read is ownerLocked, so OWNER-only exactly as before.' },
  { route: '/api/settings/users', method: 'GET', oldRoles: [...OA], permissions: ['settings.users.read'], note: 'Catch block moved from blanket 401 to apiErrorResponse.' },
  { route: '/api/settings/users', method: 'POST', oldRoles: [...OA], permissions: ['settings.users.create'], note: 'createUser rule (only an OWNER may create an OWNER) retained role-based.' },
  { route: '/api/settings/users', method: 'PATCH', oldRoles: [...OA], permissions: ['settings.users.update'], note: 'updateUserStatus OWNER-target protection and LAST_OWNER protection retained role-based.' },
];
