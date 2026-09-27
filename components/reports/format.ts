import { DICTIONARY, formatBDT, formatDhakaDate, localizeNumber, pickLocalized, type Locale } from '@/lib/i18n';

/** Display-only formatting for report values. Money arrives as an exact decimal string. */
export function makeFormat(lang: Locale) {
  const D = DICTIONARY[lang] as any;
  return {
    money: (v: string | number | null | undefined) => (v === null || v === undefined ? '—' : formatBDT(Number(v), lang)),
    /** Full-precision taka (no lakh/crore abbreviation) for tables. */
    moneyFull: (v: string | number | null | undefined) => {
      if (v === null || v === undefined) return '—';
      const s = `৳${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      return lang === 'bn' ? localizeNumber('bn', s) : s;
    },
    num: (v: number | null | undefined) => (v === null || v === undefined ? '—' : localizeNumber(lang, v.toLocaleString('en-IN'))),
    pct: (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${localizeNumber(lang, v)}%`),
    date: (v: string | Date | null | undefined) => (v ? localizeNumber(lang, formatDhakaDate(v)) : '—'),
    ymd: (v: string | null | undefined) => (v ? localizeNumber(lang, `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}`) : '—'),
    name: (o: { name?: string | null; banglaName?: string | null } | null | undefined) => (o ? pickLocalized(lang, o.name, o.banglaName) || '—' : '—'),
    /** Enum label from an existing dictionary section, falling back to the stored value (never invented). */
    label: (section: string, value: string | null | undefined) => {
      if (!value) return '—';
      return (D[section] && D[section][value]) || value;
    },
  };
}

export type Fmt = ReturnType<typeof makeFormat>;

export function periodLabel(fmt: Fmt, bucket: string, granularity: string, lang: Locale) {
  if (granularity === 'month') {
    const d = new Date(`${bucket}T00:00:00.000Z`);
    return new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
  }
  return fmt.ymd(bucket);
}
