import type { RouteAuthEntry } from './types';

type Roles = NonNullable<Extract<RouteAuthEntry['oldRoles'], unknown[]>>;
const AST: Roles = ['OWNER', 'ADMIN', 'STAFF', 'TEACHER'];
const OAS: Roles = ['OWNER', 'ADMIN', 'STAFF'];
const OA: Roles = ['OWNER', 'ADMIN'];

export const entries: RouteAuthEntry[] = [
  // students
  { route: '/api/students', method: 'GET', oldRoles: AST, permissions: ['students.read'] },
  { route: '/api/students', method: 'POST', oldRoles: OAS, permissions: ['students.create'] },
  { route: '/api/students/[studentId]', method: 'GET', oldRoles: AST, permissions: ['students.read'] },
  { route: '/api/students/[studentId]', method: 'PUT', oldRoles: OAS, permissions: ['students.update'] },
  { route: '/api/students/bulk/batch-transfer', method: 'POST', oldRoles: OAS, permissions: ['students.transfer'] },
  { route: '/api/students/bulk/status', method: 'POST', oldRoles: OAS, permissions: ['students.archive'] },
  { route: '/api/students/promotion/candidates', method: 'GET', oldRoles: OAS, permissions: ['students.promote'] },
  { route: '/api/students/promotion', method: 'POST', oldRoles: OAS, permissions: ['students.promote'] },
  {
    route: '/api/students/id-cards/bulk',
    method: 'POST',
    oldRoles: OAS,
    permissions: ['students.id_card'],
    residualDeny: ['TEACHER'],
    note: 'students.id_card is AST by default (single-card route allows TEACHER) but bulk print was OWNER/ADMIN/STAFF only; retained TEACHER deny.',
  },
  { route: '/api/students/[studentId]/id-card', method: 'GET', oldRoles: OAS, permissions: ['students.id_card'] },
  { route: '/api/students/[studentId]/certificates', method: 'GET', oldRoles: OAS, permissions: ['students.certificates'] },
  { route: '/api/students/[studentId]/certificates', method: 'POST', oldRoles: OAS, permissions: ['students.certificates'] },
  { route: '/api/students/[studentId]/certificates/[certificateId]', method: 'GET', oldRoles: OAS, permissions: ['students.certificates'] },

  // courses
  { route: '/api/courses', method: 'GET', oldRoles: 'ANY', permissions: ['courses.read'], note: 'Previously no role gate (any authenticated user); courses.read is AST so parity holds.' },
  { route: '/api/courses', method: 'POST', oldRoles: OA, permissions: ['courses.create'] },
  { route: '/api/courses/[courseId]', method: 'GET', oldRoles: 'ANY', permissions: ['courses.read'], note: 'Previously no role gate.' },
  { route: '/api/courses/[courseId]', method: 'PUT', oldRoles: OA, permissions: ['courses.update'] },
  { route: '/api/courses/[courseId]', method: 'DELETE', oldRoles: OA, permissions: ['courses.delete'] },
  { route: '/api/courses/[courseId]/pricing', method: 'GET', oldRoles: OAS, permissions: ['fees.structures.read'], note: 'courses.read would over-grant TEACHER; fees.structures.read (AS-) matches and is semantically a fee-structure read.' },
  { route: '/api/courses/[courseId]/pricing', method: 'PUT', oldRoles: OA, permissions: ['courses.pricing.update'] },
  { route: '/api/courses/[courseId]/schedules', method: 'GET', oldRoles: AST, permissions: ['routine.read'] },
  { route: '/api/courses/[courseId]/students', method: 'GET', oldRoles: AST, permissions: ['students.read'] },
  { route: '/api/courses/[courseId]/subjects', method: 'PUT', oldRoles: OA, permissions: ['courses.update'] },

  // batches
  { route: '/api/batches', method: 'GET', oldRoles: 'ANY', permissions: ['batches.read'], note: 'Previously no role gate.' },
  { route: '/api/batches', method: 'POST', oldRoles: OAS, permissions: ['batches.create'] },
  { route: '/api/batches/options', method: 'GET', oldRoles: 'ANY', permissions: null, note: 'Open tenant reference data (dropdown options); intentionally ungated.' },
  { route: '/api/batches/[batchId]', method: 'GET', oldRoles: AST, permissions: ['batches.read'] },
  { route: '/api/batches/[batchId]', method: 'PUT', oldRoles: OAS, permissions: ['batches.update'] },
  { route: '/api/batches/[batchId]/students', method: 'POST', oldRoles: OAS, permissions: ['batches.update'] },
  { route: '/api/batches/[batchId]/students/[studentBatchId]', method: 'PUT', oldRoles: OAS, permissions: ['batches.update'] },
  { route: '/api/batches/[batchId]/subjects', method: 'PUT', oldRoles: OAS, permissions: ['batches.update'] },
  { route: '/api/batches/[batchId]/teachers', method: 'POST', oldRoles: OA, permissions: ['batches.assign_teacher'] },
  { route: '/api/batches/[batchId]/teachers/[assignmentId]', method: 'PUT', oldRoles: OA, permissions: ['batches.assign_teacher'] },

  // teachers
  { route: '/api/teachers', method: 'GET', oldRoles: OAS, permissions: ['teachers.read'], note: 'Phase 14.4 corrected defaults: TEACHER does not hold teachers.read; OWNER, ADMIN, STAFF hold teachers.read.' },
  { route: '/api/teachers', method: 'POST', oldRoles: OA, permissions: ['teachers.create'] },
  { route: '/api/teachers/assignment-options', method: 'GET', oldRoles: OAS, permissions: ['batches.update'], note: 'No catalog permission for this read; teachers.assignments is A-- (would drop STAFF). batches.update (AS-) matches (TENSION).' },
  { route: '/api/teachers/[teacherId]', method: 'GET', oldRoles: 'ANY', permissions: null, note: 'Own-profile detail endpoint for TEACHER/STAFF; role redaction of other teachers retained in code.' },
  { route: '/api/teachers/[teacherId]', method: 'PUT', oldRoles: OA, permissions: ['teachers.update'] },
  { route: '/api/teachers/[teacherId]', method: 'DELETE', oldRoles: OA, permissions: ['teachers.delete'] },
  { route: '/api/teachers/[teacherId]/account', method: 'GET', oldRoles: OA, permissions: ['teachers.account'] },
  { route: '/api/teachers/[teacherId]/account', method: 'POST', oldRoles: OA, permissions: ['teachers.account'] },
  { route: '/api/teachers/[teacherId]/account', method: 'DELETE', oldRoles: OA, permissions: ['teachers.account'] },
  { route: '/api/teachers/[teacherId]/assignments', method: 'POST', oldRoles: OA, permissions: ['teachers.assignments'] },
  { route: '/api/teachers/[teacherId]/assignments/[assignmentId]', method: 'DELETE', oldRoles: OA, permissions: ['teachers.assignments'] },

  // schedules / rooms / subjects / misc
  { route: '/api/schedules', method: 'GET', oldRoles: 'ANY', permissions: ['routine.read'], note: 'Previously no role gate.' },
  { route: '/api/schedules', method: 'POST', oldRoles: OAS, permissions: ['routine.manage'] },
  { route: '/api/schedules/[scheduleId]', method: 'PUT', oldRoles: OAS, permissions: ['routine.manage'] },
  { route: '/api/schedules/[scheduleId]', method: 'DELETE', oldRoles: OAS, permissions: ['routine.manage'] },
  { route: '/api/rooms', method: 'GET', oldRoles: 'ANY', permissions: ['routine.read'], note: 'Previously no role gate; rooms managed with the routine.' },
  { route: '/api/rooms', method: 'POST', oldRoles: OAS, permissions: ['routine.manage'] },
  { route: '/api/rooms/[roomId]', method: 'GET', oldRoles: 'ANY', permissions: ['routine.read'], note: 'Previously no role gate.' },
  { route: '/api/rooms/[roomId]', method: 'PUT', oldRoles: OAS, permissions: ['routine.manage'] },
  { route: '/api/subjects', method: 'GET', oldRoles: 'ANY', permissions: ['courses.read'], note: 'Previously no role gate; subjects are course structure.' },
  { route: '/api/subjects', method: 'POST', oldRoles: OAS, permissions: ['batches.update'], note: 'No dedicated permission; courses.update is A-- (would drop STAFF). batches.update (AS-) matches (TENSION).' },
  { route: '/api/subjects/seed', method: 'POST', oldRoles: OA, permissions: ['courses.update'] },
  { route: '/api/academic/options', method: 'GET', oldRoles: 'ANY', permissions: null, note: 'Open academic hierarchy reference data; session-only check retained.' },
  { route: '/api/guardians/lookup', method: 'GET', oldRoles: OAS, permissions: ['students.create'], note: 'Used by the admission form; students.create (AS-) matches. Branch scoping (isBranchScoped) untouched.' },
];
