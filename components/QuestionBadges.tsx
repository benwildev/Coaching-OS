'use client';

import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';

const DIFFICULTY_TONE: Record<string, string> = {
  EASY: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
  HARD: 'bg-rose-50 text-rose-700 border-rose-200',
};

export function QuestionTypeBadge({ type }: { type: string }) {
  const { lang } = useApp();
  const label = (DICTIONARY[lang].questionType as Record<string, string>)[type] || type;
  return (
    <span className="inline-flex items-center rounded-md border border-[#c9d8ec] bg-[#eef4fb] text-[#063b78] px-2 py-0.5 text-[11.5px] font-bold whitespace-nowrap">
      {label}
    </span>
  );
}

export function DifficultyBadge({ difficulty }: { difficulty: string | null | undefined }) {
  const { lang } = useApp();
  if (!difficulty) return null;
  const label = (DICTIONARY[lang].questionDifficulty as Record<string, string>)[difficulty] || difficulty;
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11.5px] font-bold whitespace-nowrap ${
        DIFFICULTY_TONE[difficulty] || 'bg-slate-50 text-slate-600 border-slate-200'
      }`}
    >
      {label}
    </span>
  );
}

export const MATERIAL_TYPE_ICON: Record<string, string> = {
  PDF: 'file',
  VIDEO: 'play',
  IMAGE: 'eye',
  DOCUMENT: 'doc',
  NOTE: 'book',
  LINK: 'globe',
  LECTURE_SHEET: 'file',
};
