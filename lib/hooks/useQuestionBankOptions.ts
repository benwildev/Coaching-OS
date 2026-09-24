'use client';

import { useEffect, useMemo, useState } from 'react';

export interface NamedOption {
  id: string;
  name: string;
  banglaName?: string | null;
}

export interface GroupOption extends NamedOption {
  academicClassId: string;
}

export interface ClassOption extends NamedOption {
  academicProgramId: string;
  groups: GroupOption[];
}

export interface ProgramOption extends NamedOption {
  classes: ClassOption[];
}

export interface SubjectOption extends NamedOption {
  code: string;
  academicClassId: string;
  academicGroupId: string | null;
  papers: Array<NamedOption & { paperNumber: number }>;
}

export interface BatchOption extends NamedOption {
  code: string;
  academicClassId: string;
  academicGroupId: string | null;
  academicSessionId: string;
}

export interface QuestionBankOptions {
  sessions: Array<NamedOption & { isCurrent: boolean }>;
  programs: ProgramOption[];
  batches: BatchOption[];
  subjects: SubjectOption[];
  creators: NamedOption[];
  restrictedToTeacherSubjects: boolean;
}

const EMPTY: QuestionBankOptions = {
  sessions: [],
  programs: [],
  batches: [],
  subjects: [],
  creators: [],
  restrictedToTeacherSubjects: false,
};

/**
 * Academic hierarchy (sessions → programs → classes → groups, batches) plus
 * the subjects the current user may use (teachers only get their authorized
 * subjects — enforced server-side).
 */
export function useQuestionBankOptions() {
  const [options, setOptions] = useState<QuestionBankOptions>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/academic/options').then((r) => (r.ok ? r.json() : ({} as any))),
      fetch('/api/questions/options').then((r) => (r.ok ? r.json() : ({} as any))),
    ])
      .then(([academic, qb]) => {
        if (cancelled) return;
        setOptions({
          sessions: academic.sessions || [],
          programs: academic.programs || [],
          batches: academic.batches || [],
          subjects: qb.subjects || [],
          creators: qb.creators || [],
          restrictedToTeacherSubjects: !!qb.restrictedToTeacherSubjects,
        });
      })
      .catch(() => {
        /* leave empty — pages show their own empty states */
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const allClasses = useMemo(() => options.programs.flatMap((p) => p.classes || []), [options.programs]);

  return { options, loading, allClasses };
}
