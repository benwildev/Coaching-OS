// Formatting / small math helpers — ported from Main.dc.html § helpers.

export const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
export const grp = (n: number) => Math.round(n).toLocaleString('en-IN');

/** Money: taka in. ≥1 lakh → "৳4.82 L", otherwise full "৳48,200". */
export const tkCompact = (taka: number) => {
  const lakh = taka / 100000;
  if (Math.abs(taka) >= 100000) {
    return lakh >= 100 ? '৳' + (lakh / 100).toFixed(2) + ' Cr' : '৳' + lakh.toFixed(lakh >= 10 ? 1 : 2) + ' L';
  }
  return '৳' + Math.round(taka).toLocaleString('en-IN');
};

export const niceMax = (v: number) => {
  const p = Math.pow(10, Math.floor(Math.log10(v || 1)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
};

export const initials = (name: string) =>
  name
    .replace(/^Md\.\s*/, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

export const sparkPath = (arr: number[], w = 100, h = 30) => {
  const mn = Math.min(...arr),
    mx = Math.max(...arr),
    r = mx - mn || 1;
  return arr
    .map((v, i) => (i ? 'L' : 'M') + ((i * w) / (arr.length - 1)).toFixed(1) + ' ' + (h - 3 - ((v - mn) / r) * (h - 6)).toFixed(1))
    .join(' ');
};

export const ring = (pct: number, r: number) => {
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, pct));
  return { dash: ((c * v) / 100).toFixed(1) + ' ' + c.toFixed(1), c: c.toFixed(1) };
};

/** Amount in words, South-Asian style (for receipts): 6400 -> "Six thousand four hundred taka only" */
export function takaWords(n: number): string {
  const a = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const two = (x: number): string => (x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? '-' + a[x % 10] : ''));
  const three = (x: number): string => (x >= 100 ? a[Math.floor(x / 100)] + ' hundred' + (x % 100 ? ' ' + two(x % 100) : '') : two(x));
  n = Math.round(n);
  if (!n) return 'Zero taka only';
  const parts: string[] = [];
  const cr = Math.floor(n / 1e7),
    lk = Math.floor((n % 1e7) / 1e5),
    th = Math.floor((n % 1e5) / 1000),
    rest = n % 1000;
  if (cr) parts.push(two(cr) + ' crore');
  if (lk) parts.push(two(lk) + ' lakh');
  if (th) parts.push(two(th) + ' thousand');
  if (rest) parts.push(three(rest));
  const w = parts.join(' ');
  return w.charAt(0).toUpperCase() + w.slice(1) + ' taka only';
}

/** Deterministic PRNG (mulberry-ish LCG) so the demo dataset is stable across renders/builds. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Detects whether a string contains any Bengali Unicode characters (U+0980 to U+09FF)
 */
export function hasBangla(str?: string | null): boolean {
  if (!str) return false;
  return /[\u0980-\u09FF]/.test(str);
}

/**
 * Strips all Bengali Unicode characters from text
 */
export function stripBangla(str?: string | null): string {
  if (!str) return '';
  return str.replace(/[\u0980-\u09FF]/g, '');
}

/**
 * Detects whether a string contains English / Latin alphabet characters (a-z, A-Z)
 */
export function hasEnglish(str?: string | null): boolean {
  if (!str) return false;
  return /[a-zA-Z]/.test(str);
}

/**
 * Strips English / Latin alphabet characters from text
 */
export function stripEnglish(str?: string | null): string {
  if (!str) return '';
  return str.replace(/[a-zA-Z]/g, '');
}

/**
 * Converts Bengali numerals (০-৯) to English numerals (0-9)
 */
export function toEnglishNumeral(str?: string | null): string {
  if (!str) return '';
  const bnToEnMap: Record<string, string> = {
    '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
    '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9',
  };
  return String(str).replace(/[০-৯]/g, (d) => bnToEnMap[d] ?? d);
}


