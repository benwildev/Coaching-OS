// Design tokens — ported 1:1 from the Coaching OS prototype (Main.dc.html § 1 TOKENS).
// Demo data / demo brand only.

export const TOKENS = {
  color: {
    imperialBlue: '#00296b',
    frenchBlue: '#003f88',
    steelAzure: '#00509d',
    schoolBusYellow: '#fdc500',
    gold: '#ffd500',
    navyDeep: '#001d4d',
    blueLight: '#8fb3de',
    blueTint: '#e6effa',
    blueTint2: '#e9eef7',
    yellowTint: '#fff6cc',
    amberText: '#7a5200',
    amberLine: '#b38f00',
    page: '#f5f8fd',
    ink: '#00296b',
    body: '#1f2d44',
    muted: '#55637a',
    line: '#d8e1ee',
    surface: '#ffffff',
  },
  typography: {
    display: "'Bricolage Grotesque', 'Segoe UI', system-ui, sans-serif",
    body: "'Hind Siliguri', 'Segoe UI', system-ui, sans-serif",
    scale: { xs: 11, sm: 12.5, base: 14, md: 16, lg: 20, xl: 26, xxl: 34, hero: 44 },
  },
  spacing: [4, 8, 12, 16, 20, 24, 32, 40, 48],
  radius: { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 },
  shadow: {
    card: '0 1px 2px rgba(0,31,77,.06), 0 6px 20px -12px rgba(0,31,77,.25)',
    pop: '0 18px 48px -16px rgba(0,31,77,.35)',
  },
  breakpoints: { mobile: '< 720px', tablet: '720–1179px', desktop: '≥ 1180px' },
} as const;

export const C = TOKENS.color;

export type ToneKey = 'teal' | 'gold' | 'cyan' | 'pink' | 'neutral';

export const TONE_BG: Record<string, string> = {
  teal: '#e6f6f2',
  gold: '#fff6cc',
  cyan: '#e6effa',
  pink: '#fbe7ef',
  neutral: '#eef2f8',
};
export const TONE_FG: Record<string, string> = {
  teal: '#0a6f5c',
  gold: '#7a5200',
  cyan: '#00509d',
  pink: '#a4144f',
  neutral: '#55637a',
};
