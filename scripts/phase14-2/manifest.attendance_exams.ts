import type { RouteAuthEntry } from './types';

const ALL = ['OWNER', 'ADMIN', 'STAFF', 'TEACHER'] as const;
const AS = ['OWNER', 'ADMIN', 'STAFF'] as const;
const A = ['OWNER', 'ADMIN'] as const;
const SCOPE = 'Teacher assignment/self scope retained in route (assertTeacherSelfAccess / getTeacherByUserId).';

export const entries: RouteAuthEntry[] = [
  // ---- attendance ----
  { route: '/api/attendance', method: 'GET', oldRoles: [...ALL], permissions: ['attendance.read'], note: 'Previously ungated (any authenticated user). TEACHER sees only own classes (retained scope).' },
  { route: '/api/attendance/history', method: 'GET', oldRoles: [...ALL], permissions: ['attendance.read'], note: 'Previously ungated. TEACHER pinned to own teacherId (retained scope).' },
  { route: '/api/attendance/alerts', method: 'GET', oldRoles: [...ALL], permissions: ['attendance.alerts.read'], note: 'Previously ungated. Phase 14.3 scope gap left unchanged.' },
  { route: '/api/attendance/batch/[batchId]', method: 'GET', oldRoles: [...ALL], permissions: ['attendance.read'], note: 'Previously ungated. Phase 14.3 scope gap left unchanged.' },
  { route: '/api/attendance/student/[studentId]', method: 'GET', oldRoles: [...ALL], permissions: ['attendance.read'], note: 'Phase 14.3 scope gap left unchanged.' },
  { route: '/api/attendance/sessions', method: 'POST', oldRoles: [...ALL], permissions: ['attendance.create'], note: SCOPE },
  { route: '/api/attendance/sessions/[sessionId]', method: 'GET', oldRoles: [...ALL], permissions: ['attendance.read'], note: 'Previously ungated. ' + SCOPE },
  { route: '/api/attendance/sessions/[sessionId]', method: 'PUT', oldRoles: [...ALL], permissions: ['attendance.update'], note: SCOPE },
  { route: '/api/attendance/sessions/[sessionId]/students/[studentId]', method: 'PUT', oldRoles: [...ALL], permissions: ['attendance.update'], note: SCOPE },
  { route: '/api/attendance/sessions/[sessionId]/complete', method: 'POST', oldRoles: [...ALL], permissions: ['attendance.update'], note: 'Completing is part of taking attendance (old gate = all roles); chosen by parity. ' + SCOPE },
  { route: '/api/attendance/sessions/[sessionId]/reopen', method: 'POST', oldRoles: [...A], permissions: ['attendance.reopen'] },
  { route: '/api/attendance/threshold', method: 'GET', oldRoles: [...ALL], permissions: ['attendance.read'], note: 'Previously ungated read of the center threshold.' },
  { route: '/api/attendance/threshold', method: 'PUT', oldRoles: [...A], permissions: ['attendance.threshold.update'] },
  { route: '/api/attendance/teacher', method: 'GET', oldRoles: [...AS], permissions: ['teacher_attendance.read'], residualDeny: ['TEACHER'], note: 'List is administrative; TEACHER holds teacher_attendance.read by default for self-history only, so a retained TEACHER denial (FORBIDDEN_TEACHER_SCOPE) keeps the old decision.' },
  { route: '/api/attendance/teacher', method: 'POST', oldRoles: [...AS], permissions: ['teacher_attendance.create'] },
  { route: '/api/attendance/teacher/[teacherId]', method: 'GET', oldRoles: [...ALL], permissions: ['teacher_attendance.read'], note: 'TEACHER limited to own record via assertTeacherSelfAccess (retained scope).' },
  { route: '/api/attendance/teacher/[teacherId]', method: 'POST', oldRoles: [...AS], permissions: ['teacher_attendance.create'] },

  // ---- exams ----
  { route: '/api/exams', method: 'GET', oldRoles: [...ALL], permissions: ['exams.read'], note: 'Previously ungated.' },
  { route: '/api/exams', method: 'POST', oldRoles: [...AS], permissions: ['exams.create'] },
  { route: '/api/exams/eligible-students', method: 'GET', oldRoles: [...AS], permissions: ['exams.create'], note: 'Used by the create-exam flow; exams.read would over-grant TEACHER, so exams.create (AS-) matches parity without a residual check.' },
  { route: '/api/exams/[examId]', method: 'GET', oldRoles: [...ALL], permissions: ['exams.read'], note: 'getExamById hides other-subject marks from TEACHER (retained scope).' },
  { route: '/api/exams/[examId]', method: 'PUT', oldRoles: [...AS], permissions: ['exams.update'] },
  { route: '/api/exams/[examId]/schedule', method: 'POST', oldRoles: [...AS], permissions: ['exams.update'] },
  { route: '/api/exams/[examId]/start', method: 'POST', oldRoles: [...AS], permissions: ['exams.update'], note: 'Service also requires exams.reopen when the current status is PUBLISHED or COMPLETED->ONGOING (old OWNER/ADMIN).' },
  { route: '/api/exams/[examId]/complete', method: 'POST', oldRoles: [...AS], permissions: ['exams.update'] },
  { route: '/api/exams/[examId]/publish', method: 'POST', oldRoles: [...A], permissions: ['exams.publish'] },
  { route: '/api/exams/[examId]/publish-status', method: 'GET', oldRoles: [...AS], permissions: ['exams.update'], note: 'Publish-readiness check for the staff exam workflow; exams.read would over-grant TEACHER and exams.publish would under-grant STAFF; exams.update (AS-) matches parity.' },
  { route: '/api/exams/[examId]/cancel', method: 'POST', oldRoles: [...A], permissions: ['exams.cancel'] },
  { route: '/api/exams/[examId]/reopen', method: 'POST', oldRoles: [...A], permissions: ['exams.reopen'] },
  { route: '/api/exams/[examId]/subjects', method: 'GET', oldRoles: [...ALL], permissions: ['exams.read'] },
  { route: '/api/exams/[examId]/subjects', method: 'POST', oldRoles: [...AS], permissions: ['exams.update'] },
  { route: '/api/exams/[examId]/subjects/[examSubjectId]', method: 'PUT', oldRoles: [...AS], permissions: ['exams.update'] },
  { route: '/api/exams/[examId]/subjects/[examSubjectId]', method: 'DELETE', oldRoles: [...AS], permissions: ['exams.update'] },
  { route: '/api/exams/[examId]/subjects/[examSubjectId]/results', method: 'GET', oldRoles: [...ALL], permissions: ['exams.marks.enter'], note: 'Previously gated only inside the service (assertTeacherSubjectAccess: all roles; TEACHER needs batch/subject assignment, retained).' },
  { route: '/api/exams/[examId]/subjects/[examSubjectId]/results', method: 'PUT', oldRoles: [...ALL], permissions: ['exams.marks.enter'], note: 'TEACHER assignment scope retained. Editing after PUBLISHED additionally requires exams.publish in exam-result.service (old OWNER/ADMIN).' },

  // ---- results ----
  { route: '/api/results', method: 'GET', oldRoles: [...ALL], permissions: ['results.read'], note: 'TEACHER limited via getTeacherResultAccessWhere (retained scope).' },
  { route: '/api/results/batch/[batchId]', method: 'GET', oldRoles: [...ALL], permissions: ['results.read'], note: 'TEACHER needs ACTIVE batch assignment (retained scope).' },
  { route: '/api/results/student/[studentId]', method: 'GET', oldRoles: [...ALL], permissions: ['results.read'], note: 'TEACHER limited via getTeacherResultAccessWhere (retained scope).' },
];
