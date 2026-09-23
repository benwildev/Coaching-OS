/* eslint-disable @typescript-eslint/no-explicit-any */
import { DATA, MONTHS, MONTH_FULL } from './data';
import { sum, round1, pctStr, grp, tkShort, tkFull, sparkPath, arcPath, niceMax, wave } from './format';
import { ic } from './icons';

/* ---------- 3. SELECTORS: scope = one class (or all of Class 9–12) ---------- */
export function scopeOf(clsId: string) {
  const all = DATA.classes;
  const list = clsId === 'all' ? all : all.filter((b: any) => b.id === clsId);
  const tot = (k: string) => sum(list.map((b: any) => b[k]));
  const att = { exp: sum(list.map((b: any) => b.att.exp)), p: sum(list.map((b: any) => b.att.p)), l: sum(list.map((b: any) => b.att.l)), a: sum(list.map((b: any) => b.att.a)) };
  const orgStudents = sum(all.map((b: any) => b.students));
  const k = clsId === 'all' ? -1 : all.findIndex((b: any) => b.id === clsId);
  const S = DATA.series;
  const scale = (arr: number[], last: number, key: number) => arr.map((v, i) => (i === 11 ? last : k < 0 ? v : v * (last / arr[11]) * wave(i, k + key)));
  const students = tot('students');
  const att30 = sum(list.map((b: any) => b.att30 * b.att.exp)) / att.exp;
  const orgAtt30 = sum(all.map((b: any) => b.att30 * b.att.exp)) / sum(all.map((b: any) => b.att.exp));
  const share = students / orgStudents;
  const collectedShare = tot('collected') / sum(all.map((b: any) => b.collected));
  return {
    id: clsId, list, isAll: clsId === 'all', share, collectedShare,
    students, admissions: tot('admissions'), batches: tot('batches'), batchDelta: tot('batchDelta'), teachers: clsId === 'all' ? DATA.org.teachers : tot('teachers'),
    classesToday: tot('classesToday'), exams14: tot('exams14'), examsWeek: tot('examsWeek'), collected: tot('collected'),
    billed: tot('billed'), outstanding: tot('outstanding'), overdue: tot('overdue'), att, att30,
    attRate: ((att.p + att.l) / att.exp) * 100,
    series: {
      students: scale(S.students, students, 0).map(Math.round),
      admissions: scale(S.admissions, tot('admissions'), 1).map(Math.round),
      billed: scale(S.billed, tot('billed'), 2).map(round1),
      collected: scale(S.collected, tot('collected'), 3).map(round1),
      attendance: S.attendance.map((v: number, i: number) => round1(v + (att30 - orgAtt30) + (k < 0 ? 0 : 0.8 * Math.sin(i * 1.3 + k)))),
    },
  };
}
export type Scope = ReturnType<typeof scopeOf>;

export function kpisFor(sc: Scope, range: { n: number }) {
  const n = range.n, s = sc.series;
  const last = (arr: number[], m: number) => arr.slice(12 - m);
  const prevSlice = (arr: number[], m: number) => arr.slice(12 - 2 * m, 12 - m);
  const admissions = sum(last(s.admissions, n));
  const admPrev = n === 1 ? s.admissions[10] * 0.9 : n === 12 ? DATA.series.prevYear.admissions * sc.share : sum(prevSlice(s.admissions, n));
  const fees = sum(last(s.collected, n));
  const feesPrev = n === 1 ? DATA.series.collectedSameDayLastMonth * sc.collectedShare : n === 12 ? DATA.series.prevYear.collected * sc.collectedShare : sum(prevSlice(s.collected, n));
  const billed = sum(last(s.billed, n));
  const stuDelta = ((s.students[11] - s.students[10]) / s.students[10]) * 100;
  const cmp = n === 1 ? 'vs same day last month' : n === 12 ? 'vs previous 12 months' : 'vs previous ' + n + ' months';
  const mk = (o: any) => Object.assign({ tone: 'teal', good: true }, o);
  const list = [
    mk({ id: 'students', short: 'Students', label: 'Total students', icon: 'users', value: grp(sc.students), num: sc.students, delta: pctStr(stuDelta), up: stuDelta >= 0, good: stuDelta >= 0, sub: 'vs last month', spark: s.students }),
    mk({ id: 'admissions', short: 'Admissions', label: n === 1 ? 'New admissions this month' : 'New admissions', icon: 'userplus', value: grp(admissions), num: admissions, delta: pctStr(((admissions - admPrev) / admPrev) * 100), up: admissions >= admPrev, good: admissions >= admPrev, sub: cmp, spark: s.admissions, tone: 'gold' }),
    mk({ id: 'batches', short: 'Batches', label: 'Active batches', icon: 'layers', value: grp(sc.batches), num: sc.batches, delta: '+' + sc.batchDelta, up: true, good: true, sub: 'opened this month', spark: s.students.map((v: number) => v / 26) }),
    mk({ id: 'attendance', short: 'Attendance', label: "Today's attendance", icon: 'calcheck', value: sc.attRate.toFixed(1) + '%', num: sc.attRate, suffix: '%', dec: 1, delta: pctStr(sc.attRate - sc.att30).replace('%', ' pts'), up: sc.attRate >= sc.att30, good: sc.attRate >= sc.att30, sub: 'vs 30-day average', spark: s.attendance, tone: 'cyan' }),
    mk({ id: 'fees', short: 'Collected', label: n === 1 ? 'Fees collected this month' : 'Fees collected', icon: 'wallet', value: tkShort(fees), num: fees, money: true, delta: pctStr(((fees - feesPrev) / feesPrev) * 100), up: fees >= feesPrev, good: fees >= feesPrev, sub: cmp, spark: s.collected, progress: Math.round((fees / billed) * 100), progressLabel: Math.round((fees / billed) * 100) + '% of ' + tkShort(billed) + ' billed', tone: 'cyan' }),
    mk({ id: 'outstanding', short: 'Outstanding', label: 'Outstanding fees', icon: 'alert', value: tkShort(sc.outstanding), num: sc.outstanding, money: true, delta: '+8.8%', up: true, good: false, sub: grp(sc.overdue) + ' students 30+ days late', spark: s.billed.map((b: number, i: number) => b - s.collected[i] * 0.93), tone: 'pink' }),
    mk({ id: 'exams', short: 'Exams', label: 'Upcoming exams', icon: 'grad', value: grp(sc.exams14), num: sc.exams14, delta: sc.examsWeek + ' this week', up: true, good: true, neutral: true, sub: 'next 14 days', spark: [3, 5, 4, 6, 5, 7, 6, 8, 6, 7, 9, sc.exams14], tone: 'gold' }),
    mk({ id: 'teachers', short: 'Teachers', label: 'Active teachers', icon: 'teacher', value: grp(sc.teachers), num: sc.teachers, delta: grp(sc.classesToday) + ' classes today', up: true, good: true, neutral: true, sub: 'teaching this week', spark: [120, 124, 126, 127, 130, 131, 133, 135, 136, 138, 140, 142].map((v) => v * sc.share), tone: 'teal' }),
  ];
  return list.map((k) => Object.assign(k, { sparkD: sparkPath(k.spark), sparkArea: sparkPath(k.spark) + ' L100 30 L0 30 Z', icon: ic(k.icon), deltaTone: k.neutral ? 'neutral' : k.good ? 'good' : 'bad' }));
}

/* ---------- 4. CHART BUILDERS (pure; return SVG geometry + tooltip) ---------- */
export const noTip = { show: false, left: '0%', top: 0, title: '', rows: [] as { k: string; v: string }[] };
function tipAt(xPct: number, top: number, title: string, rows: { k: string; v: string }[]) {
  return { show: true, left: Math.max(4, Math.min(72, xPct)).toFixed(1) + '%', top, title, rows };
}

export function feeChart(sc: Scope, range: { n: number }, mode: 'amount' | 'rate', W: number, tipI: number | null) {
  const H = W > 600 ? 262 : 232, L = 50, R = 12, T = 16, B = 30, win = range.n === 12 ? 12 : 6;
  const idx: number[] = [];
  for (let i = 12 - win; i < 12; i++) idx.push(i);
  const iw = W - L - R, ih = H - T - B, gw = iw / win, s = sc.series;
  const amount = mode === 'amount';
  const max = amount
    ? (() => { const v = Math.max(...idx.map((i) => s.billed[i])); const p = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 1.2, 1.6, 2, 2.4, 3.2, 4, 6, 8, 10]) if (m * p >= v) return m * p; return 10 * p; })()
    : 100;
  const min = amount ? 0 : 60;
  const y = (v: number) => T + ih - ((v - min) / (max - min)) * ih;
  const grid = [0, 1, 2, 3, 4].map((g) => { const v = min + ((max - min) * g) / 4; return { y: y(v).toFixed(1), label: amount ? (v >= 100 ? (v / 100).toFixed(1) + ' Cr' : Math.round(v) + ' L') : Math.round(v) + '%' }; });
  const bw = Math.min(20, gw * 0.3);
  const groups = idx.map((i, j) => {
    const gx = L + j * gw, cx = gx + gw / 2, rate = (s.collected[i] / s.billed[i]) * 100, inR = i >= 12 - range.n;
    return {
      key: 'f' + i, hx: gx.toFixed(1), hw: gw.toFixed(1), label: MONTHS[i], lx: cx.toFixed(1),
      bx: (cx - bw - 1.5).toFixed(1), by: y(s.billed[i]).toFixed(1), bh: (T + ih - y(s.billed[i])).toFixed(1),
      cx2: (cx + 1.5).toFixed(1), cy: y(s.collected[i]).toFixed(1), ch: (T + ih - y(s.collected[i])).toFixed(1), bw: bw.toFixed(1),
      px: cx.toFixed(1), py: y(Math.max(min, rate)).toFixed(1), op: inR ? 1 : 0.42, hot: tipI === j ? 1 : 0,
      aria: MONTH_FULL[i] + ': collected ' + tkFull(s.collected[i]) + ' of ' + tkFull(s.billed[i]) + ' billed',
    };
  });
  const lineD = groups.map((g, j) => (j ? 'L' : 'M') + g.px + ' ' + g.py).join(' ');
  let tip = noTip;
  if (tipI != null && groups[tipI]) {
    const i = idx[tipI];
    tip = tipAt(((L + tipI * gw + gw / 2) / W) * 100 + 2, 6, MONTH_FULL[i], [
      { k: 'Collected', v: tkFull(s.collected[i]) }, { k: 'Billed', v: tkFull(s.billed[i]) },
      { k: 'Collection rate', v: ((s.collected[i] / s.billed[i]) * 100).toFixed(1) + '%' },
    ]);
  }
  return { W, H, vb: '0 0 ' + W + ' ' + H, grid, groups, lineD, amount, rate: !amount, targetY: y(95).toFixed(1), base: (T + ih).toFixed(1), L, R: W - R, tip };
}

export function enrollChart(sc: Scope, range: { n: number }, W: number, tipI: number | null) {
  const H = W > 500 ? 400 : 214, L = 50, R = 12, T = 18, B = 30, win = range.n === 12 ? 12 : 6, s = sc.series;
  const idx: number[] = [];
  for (let i = 12 - win; i < 12; i++) idx.push(i);
  const vals = idx.map((i) => s.students[i]);
  const lo = Math.floor((Math.min(...vals) * 0.97) / 50) * 50, hi = Math.ceil((Math.max(...vals) * 1.015) / 50) * 50;
  const iw = W - L - R, ih = H - T - B;
  const x = (j: number) => L + ((win as number) === 1 ? iw / 2 : (j * iw) / (win - 1));
  const y = (v: number) => T + ih - ((v - lo) / (hi - lo)) * ih;
  const pts = idx.map((i, j) => ({ key: 'e' + i, x: x(j).toFixed(1), y: y(s.students[i]).toFixed(1), label: MONTHS[i], hot: tipI === j ? 1 : 0, hx: (x(j) - iw / (win - 1) / 2).toFixed(1), hw: (iw / (win - 1)).toFixed(1), aria: MONTH_FULL[i] + ': ' + grp(s.students[i]) + ' active students' }));
  const line = pts.map((p, j) => (j ? 'L' : 'M') + p.x + ' ' + p.y).join(' ');
  const area = line + ' L' + pts[pts.length - 1].x + ' ' + (T + ih) + ' L' + pts[0].x + ' ' + (T + ih) + ' Z';
  const maxA = Math.max(...idx.map((i) => s.admissions[i]));
  const adm = idx.map((i, j) => { const h = (s.admissions[i] / maxA) * 34; return { key: 'a' + i, x: (x(j) - 5).toFixed(1), y: (T + ih - h).toFixed(1), h: h.toFixed(1) }; });
  const gn = [4, 5, 2, 3].find((k) => ((hi - lo) / k) % 10 === 0) || 3;
  const grid = Array.from({ length: gn + 1 }, (_, g) => { const v = lo + ((hi - lo) * g) / gn; return { y: y(v).toFixed(1), label: grp(v) }; });
  let tip = noTip;
  if (tipI != null && pts[tipI]) { const i = idx[tipI]; tip = tipAt((+pts[tipI].x / W) * 100 + 2, 6, MONTH_FULL[i], [{ k: 'Active students', v: grp(s.students[i]) }, { k: 'New admissions', v: grp(s.admissions[i]) }]); }
  const growth = ((s.students[11] - s.students[12 - win]) / s.students[12 - win]) * 100;
  return { W, H, vb: '0 0 ' + W + ' ' + H, pts, line, area, adm, grid, tip, base: (T + ih).toFixed(1), L, R: W - R, growth: pctStr(growth), win };
}

export function hourlyChart(sc: Scope, W: number, tipI: number | null) {
  const H = 150, L = 8, R = 8, T = 14, B = 24, hrs: number[] = DATA.hourly, now = DATA.today.nowHourIndex;
  const doneSum = sum(hrs.slice(0, now + 1)), scale = (sc.att.p + sc.att.l) / doneSum;
  const vals = hrs.map((v) => Math.round(v * scale)), max = niceMax(Math.max(...vals));
  const iw = W - L - R, ih = H - T - B, gw = iw / hrs.length, bw = gw * 0.62;
  const bars = vals.map((v, i) => {
    const h = (v / max) * ih;
    return { key: 'h' + i, x: (L + i * gw + (gw - bw) / 2).toFixed(1), y: (T + ih - h).toFixed(1), w: bw.toFixed(1), h: Math.max(2, h).toFixed(1), done: i <= now, future: i > now, label: DATA.hours[i], lx: (L + i * gw + gw / 2).toFixed(1), hot: tipI === i ? 1 : 0, hx: (L + i * gw).toFixed(1), hw: gw.toFixed(1), aria: DATA.hours[i] + ': ' + v + (i <= now ? ' check-ins' : ' expected') };
  });
  let tip = noTip;
  if (tipI != null) tip = tipAt(((L + tipI * gw + gw / 2) / W) * 100 + 2, 0, DATA.hours[tipI] + (tipI <= now ? ' · checked in' : ' · expected'), [{ k: tipI <= now ? 'Students' : 'Expected', v: grp(vals[tipI]) }]);
  return { W, H, vb: '0 0 ' + W + ' ' + H, bars, base: (T + ih).toFixed(1), nowX: (L + now * gw + gw).toFixed(1), tip };
}

export function donutChart(sc: Scope, mode: 'amount' | 'txns', focus: string | null) {
  const f = sc.collectedShare;
  const items = DATA.payments.map((p: any) => ({ ...p, v: mode === 'amount' ? p.amount * f : Math.round(p.txns * f) }));
  const total = sum(items.map((i: any) => i.v));
  let a = 0;
  const gap = 0.025;
  const segs = items.map((it: any) => {
    const span = (it.v / total) * Math.PI * 2, a0 = a + gap, a1 = a + span - gap, mid = a + span / 2;
    a += span;
    const pct = (it.v / total) * 100, lr = 100;
    return {
      ...it, d: arcPath(100, 100, 74, a0, a1), pct: pct.toFixed(0) + '%',
      lx: (100 + lr * Math.cos(mid - Math.PI / 2)).toFixed(1), ly: (100 + lr * Math.sin(mid - Math.PI / 2) + 4).toFixed(1),
      op: focus && focus !== it.id ? 0.25 : 1, sw: focus === it.id ? 30 : 24,
      val: mode === 'amount' ? tkShort(it.v) : grp(it.v) + ' txns', full: mode === 'amount' ? tkFull(it.v) : grp(it.v) + ' transactions',
      pressed: focus === it.id ? 'true' : 'false', sel: focus === it.id,
    };
  });
  const fItem = segs.find((s: any) => s.id === focus);
  return { segs, center: fItem ? fItem.val : mode === 'amount' ? tkShort(total) : grp(total), centerLabel: fItem ? fItem.label + ' · ' + fItem.pct : mode === 'amount' ? 'collected this month' : 'transactions', digital: Math.round(((segs[0].v + segs[2].v + segs[3].v) / total) * 100) };
}

export function heatmap(sc: Scope) {
  const days = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'], weeks = ['22 Aug', '29 Aug', '5 Sep', '12 Sep', '19 Sep'];
  const k = sc.isAll ? 0 : DATA.classes.findIndex((b: any) => b.id === sc.id) + 1;
  const rows = weeks.map((w, wi) => ({
    key: 'w' + wi, week: w,
    cells: days.map((d, di) => {
      const future = wi === 4 && di > 2;
      if (future) return { key: 'c' + wi + di, v: '', future: true, style: 'background: repeating-linear-gradient(135deg, #eef2f8 0 4px, #ffffff 4px 8px); color: #8795ab;', aria: d + ' ' + w + ': upcoming' };
      let v = sc.att30 + 3.2 * Math.sin(wi * 2.1 + di * 1.3 + k) - (di === 5 ? 2.4 : 0) + (di === 0 ? 1.1 : 0);
      if (wi === 4 && di === 2) v = sc.attRate;
      v = Math.max(70, Math.min(98, v));
      const t = (v - 78) / 18, lvl = t < 0.25 ? 0 : t < 0.5 ? 1 : t < 0.75 ? 2 : 3;
      const bg = ['#fff1b3', '#d4e2f4', '#8fb3de', '#003f88'][lvl], fg = lvl === 3 ? '#ffffff' : lvl === 0 ? '#7a5200' : '#001d4d';
      return { key: 'c' + wi + di, v: v.toFixed(0), future: false, style: 'background: ' + bg + '; color: ' + fg + ';', aria: d + ' ' + w + ': ' + v.toFixed(1) + '% present', low: lvl === 0 };
    }),
  }));
  return { days, rows };
}
