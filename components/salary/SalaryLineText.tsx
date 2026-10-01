'use client';

import { useApp } from '@/lib/store';
import { DICTIONARY, formatBDTExact, toBanglaNumeral } from '@/lib/i18n';

export interface SalaryLineView {
  type: 'MONTHLY_FIXED' | 'PER_BATCH' | 'PER_CLASS' | 'CUSTOM';
  unit: 'MONTH' | 'CLASS';
  quantity: number;
  rate: number;
  amount: number;
  courseName?: string | null;
  courseBanglaName?: string | null;
  batchName?: string | null;
  batchBanglaName?: string | null;
  subjectName?: string | null;
  subjectBanglaName?: string | null;
  notes?: string | null;
}

/** Course → Batch → Subject label of a salary line, in the active language. */
export function lineScope(line: SalaryLineView, lang: 'en' | 'bn'): string {
  if (!line.batchName) return line.notes || '';
  const pick = (en?: string | null, bn?: string | null) => (lang === 'bn' && bn ? bn : en || '');
  return [pick(line.courseName, line.courseBanglaName), pick(line.batchName, line.batchBanglaName), pick(line.subjectName, line.subjectBanglaName)]
    .filter(Boolean)
    .join(' → ');
}

/** One human sentence per line, e.g. "Per Class — Physics: 3 × ৳500 = ৳1,500". */
export default function SalaryLineText({ line }: { line: SalaryLineView }) {
  const { lang } = useApp();
  const c = DICTIONARY[lang].compensation;
  const money = (v: number) => formatBDTExact(v, lang);
  const scope = lineScope(line, lang);
  const qty = lang === 'bn' ? toBanglaNumeral(line.quantity) : String(line.quantity);
  const calc =
    line.type === 'PER_CLASS' ? `${qty} × ${money(line.rate)} = ${money(line.amount)}` : money(line.amount);
  return (
    <span>
      <strong>{c[line.type]}</strong>
      {scope ? ` — ${scope}` : ''}: {calc}
    </span>
  );
}
