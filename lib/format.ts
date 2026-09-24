// Formatting / small math helpers — ported from Main.dc.html § helpers.

export const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
export const round1 = (v: number) => Math.round(v * 10) / 10;
export const pctStr = (v: number, d = 1) => (v > 0 ? '+' : '') + v.toFixed(d) + '%';
export const grp = (n: number) => Math.round(n).toLocaleString('en-IN');

/** Money: lakh in, BDT out. ৳১,০২,৪০,০০০-style (South Asian grouping). */
export const tkFull = (lakh: number) => '৳' + Math.round(lakh * 100000).toLocaleString('en-IN');
export const tkShort = (lakh: number) =>
  lakh >= 100 ? '৳' + (lakh / 100).toFixed(2) + ' Cr' : '৳' + lakh.toFixed(lakh >= 10 ? 1 : 2) + ' L';

/** Money: taka in. ≥1 lakh → "৳4.82 L", otherwise full "৳48,200". */
export const tkCompact = (taka: number) => (Math.abs(taka) >= 100000 ? tkShort(taka / 100000) : '৳' + Math.round(taka).toLocaleString('en-IN'));

export const niceMax =(v: number) => {
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

export const wave = (i: number, k: number) => 1 + 0.035 * Math.sin(i * 1.7 + k * 2.3);

export const sparkPath = (arr: number[], w = 100, h = 30) => {
  const mn = Math.min(...arr),
    mx = Math.max(...arr),
    r = mx - mn || 1;
  return arr
    .map((v, i) => (i ? 'L' : 'M') + ((i * w) / (arr.length - 1)).toFixed(1) + ' ' + (h - 3 - ((v - mn) / r) * (h - 6)).toFixed(1))
    .join(' ');
};

export const arcPath = (cx: number, cy: number, r: number, a0: number, a1: number) => {
  const p = (a: number): [number, number] => [cx + r * Math.cos(a - Math.PI / 2), cy + r * Math.sin(a - Math.PI / 2)];
  const [x0, y0] = p(a0),
    [x1, y1] = p(a1);
  return 'M' + x0.toFixed(2) + ' ' + y0.toFixed(2) + ' A' + r + ' ' + r + ' 0 ' + (a1 - a0 > Math.PI ? 1 : 0) + ' 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2);
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
