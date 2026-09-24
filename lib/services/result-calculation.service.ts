import prisma from '@/lib/db';

export interface GradeRule {
  minPercentage: number;
  maxPercentage: number;
  grade: string;
  gradePoint: number;
}

export interface GradingConfig {
  scale: GradeRule[];
  overallFailIfAnyFailed: boolean;
  tieBreakingOrder: 'TOTAL_MARKS' | 'HIGHER_GPA' | 'ROLL';
}

export const DEFAULT_BANGLADESH_GRADING_SCALE: GradeRule[] = [
  { minPercentage: 80, maxPercentage: 100, grade: 'A+', gradePoint: 5.0 },
  { minPercentage: 70, maxPercentage: 79.99, grade: 'A', gradePoint: 4.0 },
  { minPercentage: 60, maxPercentage: 69.99, grade: 'A-', gradePoint: 3.5 },
  { minPercentage: 50, maxPercentage: 59.99, grade: 'B', gradePoint: 3.0 },
  { minPercentage: 40, maxPercentage: 49.99, grade: 'C', gradePoint: 2.0 },
  { minPercentage: 33, maxPercentage: 39.99, grade: 'D', gradePoint: 1.0 },
  { minPercentage: 0, maxPercentage: 32.99, grade: 'F', gradePoint: 0.0 },
];

export const DEFAULT_GRADING_CONFIG: GradingConfig = {
  scale: DEFAULT_BANGLADESH_GRADING_SCALE,
  overallFailIfAnyFailed: true,
  tieBreakingOrder: 'TOTAL_MARKS',
};

/**
 * Fetch grading configuration for a coaching center from system settings or fallback to default
 */
export async function getCoachingCenterGradingConfig(
  coachingCenterId: string
): Promise<GradingConfig> {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: {
        coachingCenterId_key: {
          coachingCenterId,
          key: 'grading_system',
        },
      },
    });

    if (setting?.value) {
      const parsed = JSON.parse(setting.value);
      if (Array.isArray(parsed.scale) && parsed.scale.length > 0) {
        return {
          scale: parsed.scale,
          overallFailIfAnyFailed: parsed.overallFailIfAnyFailed ?? true,
          tieBreakingOrder: parsed.tieBreakingOrder ?? 'TOTAL_MARKS',
        };
      }
    }
  } catch (error) {
    console.error('[ResultCalculation] Failed to load custom grading config, using default:', error);
  }

  return DEFAULT_GRADING_CONFIG;
}

/**
 * Standard centralized grade calculation (Section 13 specification)
 * calculateGrade(marks, totalMarks, gradingConfig)
 */
export function calculateGrade(
  marks: number | null | undefined,
  totalMarks: number,
  config: GradingConfig = DEFAULT_GRADING_CONFIG
): {
  grade: string;
  gpa: number;
  percentage: number;
} {
  const res = calculateSubjectGrade(marks, totalMarks, 0, config);
  return {
    grade: res.grade,
    gpa: res.gpa,
    percentage: res.percentage,
  };
}

/**
 * Calculate Grade, Grade Point, and Pass/Fail status for a single subject
 */
export function calculateSubjectGrade(
  marksObtained: number | null | undefined,
  totalMarks: number,
  passMarks: number,
  config: GradingConfig = DEFAULT_GRADING_CONFIG
): {
  grade: string;
  gpa: number;
  isPassed: boolean;
  percentage: number;
} {
  if (marksObtained === null || marksObtained === undefined || isNaN(marksObtained)) {
    return { grade: 'F', gpa: 0, isPassed: false, percentage: 0 };
  }

  const safeTotal = totalMarks > 0 ? totalMarks : 100;
  const percentage = Math.min(100, Math.max(0, (marksObtained / safeTotal) * 100));
  const isPassed = marksObtained >= passMarks;

  // If failed by pass marks, grade is F and GP is 0
  if (!isPassed) {
    return {
      grade: 'F',
      gpa: 0.0,
      isPassed: false,
      percentage: Number(percentage.toFixed(2)),
    };
  }

  // Find matching grade rule
  const matchedRule = config.scale.find(
    (r) => percentage >= r.minPercentage && percentage <= r.maxPercentage
  );

  if (matchedRule) {
    return {
      grade: matchedRule.grade,
      gpa: matchedRule.gradePoint,
      isPassed: true,
      percentage: Number(percentage.toFixed(2)),
    };
  }

  // Fallback for edge cases >= 80
  if (percentage >= 80) {
    return { grade: 'A+', gpa: 5.0, isPassed: true, percentage: Number(percentage.toFixed(2)) };
  }

  return { grade: 'F', gpa: 0.0, isPassed: false, percentage: Number(percentage.toFixed(2)) };
}

/**
 * Calculate the highest mark obtained across a list of valid numerical marks
 */
export function calculateHighestMarks(marksList: (number | null | undefined)[]): number | null {
  const validMarks = marksList.filter(
    (m): m is number => m !== null && m !== undefined && !isNaN(m) && m >= 0
  );
  if (validMarks.length === 0) return null;
  return Math.max(...validMarks);
}

/**
 * Standard Competition Ranking (1, 2, 2, 4)
 * Assigns ranks to students based on their total marks.
 * Returns a Map from studentId to their rank.
 */
export function calculateCompetitionRanking(
  studentScores: Array<{
    studentId: string;
    totalMarks: number;
    isValid: boolean;
  }>
): Map<string, number> {
  const rankMap = new Map<string, number>();

  // Filter only valid scores
  const eligible = studentScores
    .filter((s) => s.isValid)
    .sort((a, b) => b.totalMarks - a.totalMarks);

  let currentRank = 1;
  for (let i = 0; i < eligible.length; i++) {
    if (i > 0 && eligible[i].totalMarks === eligible[i - 1].totalMarks) {
      // Tied with previous student: same rank
      rankMap.set(eligible[i].studentId, rankMap.get(eligible[i - 1].studentId)!);
    } else {
      // New distinct score: rank equals 1-based index
      currentRank = i + 1;
      rankMap.set(eligible[i].studentId, currentRank);
    }
  }

  return rankMap;
}

/**
 * Calculate overall exam results for a student across all subjects
 */
export function calculateOverallExamResult(
  subjectResults: Array<{
    marksObtained: number | null | undefined;
    totalMarks: number;
    passMarks: number;
    grade: string;
    gpa: number;
    isPassed: boolean;
    status: string;
  }>,
  config: GradingConfig = DEFAULT_GRADING_CONFIG
): {
  totalExamMarks: number;
  totalMarksObtained: number;
  overallPercentage: number;
  overallGrade: string;
  overallGpa: number;
  isPassed: boolean;
  hasIncomplete: boolean;
  hasAbsent: boolean;
} {
  if (subjectResults.length === 0) {
    return {
      totalExamMarks: 0,
      totalMarksObtained: 0,
      overallPercentage: 0,
      overallGrade: 'F',
      overallGpa: 0,
      isPassed: false,
      hasIncomplete: true,
      hasAbsent: false,
    };
  }

  let totalExamMarks = 0;
  let totalMarksObtained = 0;
  let totalGradePoints = 0;
  let hasFailedSubject = false;
  let hasIncomplete = false;
  let hasAbsent = false;

  for (const s of subjectResults) {
    totalExamMarks += s.totalMarks;

    if (s.status === 'ABSENT' || s.status === 'EXCUSED') {
      hasAbsent = true;
      hasFailedSubject = true;
      continue;
    }

    if (s.marksObtained === null || s.marksObtained === undefined) {
      hasIncomplete = true;
      continue;
    }

    totalMarksObtained += s.marksObtained;
    totalGradePoints += s.gpa;

    if (!s.isPassed || s.grade === 'F') {
      hasFailedSubject = true;
    }
  }

  const overallPercentage =
    totalExamMarks > 0 ? Number(((totalMarksObtained / totalExamMarks) * 100).toFixed(2)) : 0;

  const averageGpa =
    subjectResults.length > 0
      ? Number((totalGradePoints / subjectResults.length).toFixed(2))
      : 0;

  // Standard Bangladesh Board rule: if failing any subject, overall GPA is 0.00 and Grade is F
  const overallIsPassed = !hasFailedSubject && !hasIncomplete && !hasAbsent;
  let overallGpa = averageGpa;
  let overallGrade = 'F';

  if (config.overallFailIfAnyFailed && hasFailedSubject) {
    overallGpa = 0.0;
    overallGrade = 'F';
  } else {
    // Match overall percentage to grading scale
    const matched = config.scale.find(
      (r) => overallPercentage >= r.minPercentage && overallPercentage <= r.maxPercentage
    );
    overallGrade = matched ? matched.grade : overallPercentage >= 80 ? 'A+' : 'F';
  }

  return {
    totalExamMarks,
    totalMarksObtained,
    overallPercentage,
    overallGrade,
    overallGpa,
    isPassed: overallIsPassed,
    hasIncomplete,
    hasAbsent,
  };
}
