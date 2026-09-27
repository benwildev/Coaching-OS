import prisma from '@/lib/db';
import type { RoleCode } from '@prisma/client';
import { resolveEffectiveBranchId, type SessionUser } from '@/lib/auth/session';
import { getTeacherByUserId } from '@/lib/services/teacher.service';
import { getTeacherAuthorizedSubjectIds } from '@/lib/services/exam-result.service';
import type { ReportFilters } from './filters';

/**
 * Report authorization reuses the existing Phase 1–9 model — no second
 * permission system:
 *   - roles gate each category (mirrors the matching module's API routes),
 *   - resolveEffectiveBranchId() pins branch-scoped STAFF/TEACHER to their branch,
 *   - a TEACHER is limited to the batches/subjects of their ACTIVE
 *     BatchTeacherAssignments (+ TeacherSubject for batch-less exams), the same
 *     rule assertTeacherSubjectAccess() enforces for marks entry.
 */

export type ReportCategory = 'students' | 'attendance' | 'finance' | 'exams' | 'teachers' | 'batches' | 'communications';

export const REPORT_CATEGORIES: ReportCategory[] = ['students', 'attendance', 'finance', 'exams', 'teachers', 'batches', 'communications'];

// Finance mirrors the Phase 5 fee read routes (OWNER/ADMIN/STAFF);
// communications mirrors /api/communication/logs (OWNER/ADMIN/STAFF).
const CATEGORY_ROLES: Record<ReportCategory, RoleCode[]> = {
  students: ['OWNER', 'ADMIN', 'STAFF', 'TEACHER'],
  attendance: ['OWNER', 'ADMIN', 'STAFF', 'TEACHER'],
  finance: ['OWNER', 'ADMIN', 'STAFF'],
  exams: ['OWNER', 'ADMIN', 'STAFF', 'TEACHER'],
  teachers: ['OWNER', 'ADMIN', 'STAFF', 'TEACHER'],
  batches: ['OWNER', 'ADMIN', 'STAFF', 'TEACHER'],
  communications: ['OWNER', 'ADMIN', 'STAFF'],
};

export function canAccessCategory(role: RoleCode, category: ReportCategory): boolean {
  return CATEGORY_ROLES[category].includes(role);
}

/** Cross-branch financial comparison: center-wide roles only. */
export function canCompareBranches(role: RoleCode): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

/** Fee figures inside non-finance reports (e.g. batch report). */
export function canViewFinance(role: RoleCode): boolean {
  return canAccessCategory(role, 'finance');
}

/** Unpublished ("internal") result data: never for TEACHER in reports. */
export function canViewInternalResults(role: RoleCode): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'STAFF';
}

export interface TeacherScope {
  teacherId: string | null;
  batchIds: string[];
  subjectIds: string[];
  pairs: Array<{ batchId: string; subjectId: string }>;
}

export interface ReportScope {
  coachingCenterId: string;
  user: SessionUser;
  role: RoleCode;
  /** Effective branch filter; undefined = every branch the caller may see. */
  branchId?: string;
  branchLocked: boolean;
  /** Present only for TEACHER callers. */
  teacher?: TeacherScope;
}

export async function resolveTeacherScope(coachingCenterId: string, user: SessionUser): Promise<TeacherScope> {
  const teacher = await getTeacherByUserId(coachingCenterId, user.userId);
  if (!teacher) return { teacherId: null, batchIds: [], subjectIds: [], pairs: [] };
  const [assignments, subjectIds] = await Promise.all([
    prisma.batchTeacherAssignment.findMany({
      where: { coachingCenterId, teacherId: teacher.id, status: 'ACTIVE' },
      select: { batchId: true, subjectId: true },
    }),
    getTeacherAuthorizedSubjectIds(coachingCenterId, user),
  ]);
  return {
    teacherId: teacher.id,
    batchIds: Array.from(new Set(assignments.map((a) => a.batchId))),
    subjectIds: subjectIds ?? [],
    pairs: assignments,
  };
}

export async function resolveReportScope(
  coachingCenterId: string,
  user: SessionUser,
  category: ReportCategory,
  filters: Pick<ReportFilters, 'branchId' | 'batchId' | 'subjectId' | 'teacherId'>
): Promise<ReportScope> {
  if (!canAccessCategory(user.role, category)) throw new Error('FORBIDDEN_REPORT');

  const branchLocked = user.role !== 'OWNER' && user.role !== 'ADMIN' && !!user.branchId;
  const branchId = resolveEffectiveBranchId(user, filters.branchId);
  if (branchLocked && filters.branchId && filters.branchId !== user.branchId) {
    throw new Error('FORBIDDEN_BRANCH');
  }
  if (branchId) {
    const exists = await prisma.branch.count({ where: { id: branchId, coachingCenterId } });
    if (!exists) throw new Error('FORBIDDEN_BRANCH');
  }

  const scope: ReportScope = { coachingCenterId, user, role: user.role, branchId, branchLocked };

  if (user.role === 'TEACHER') {
    const teacher = await resolveTeacherScope(coachingCenterId, user);
    if (filters.batchId && !teacher.batchIds.includes(filters.batchId)) throw new Error('FORBIDDEN_TEACHER_SCOPE');
    if (filters.subjectId && !teacher.subjectIds.includes(filters.subjectId)) throw new Error('FORBIDDEN_TEACHER_SCOPE');
    if (filters.teacherId && filters.teacherId !== teacher.teacherId) throw new Error('FORBIDDEN_TEACHER_SCOPE');
    scope.teacher = teacher;
  }

  return scope;
}

/** Sentinel id that matches nothing — used when a scope is legitimately empty. */
export const NO_MATCH_ID = '00000000-0000-0000-0000-000000000000';
