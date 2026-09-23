# Coaching OS — Alokito Coaching Centre (Next.js)

A Next.js (App Router, TypeScript, Tailwind v4) port of the "Coaching OS · Class 9–12 · Complete
prototype" Claude Design canvas artifact. All demo data, design tokens, and interactive behaviour
were ported from the original `.dc.html` source into a real, buildable Next.js app.

**Demo data only** — Alokito Coaching Centre, Dhanmondi, Dhaka is a fictional Class 9–12 (SSC & HSC)
coaching centre used purely to exercise the UI.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000. Demo sign-in (at `/login`) accepts OTP code `123456`.

```bash
npm run build   # production build — verified to compile with 0 TypeScript errors
npm run start   # serve the production build
```

## Structure

- `lib/tokens.ts` — design tokens (colours, type scale, spacing, radius, shadow)
- `lib/icons.ts` — Lucide-style 24px stroke icon path data
- `lib/format.ts` — money formatting (৳ lakh/crore), taka-in-words, sparkline/arc/ring SVG geometry
- `lib/data.ts` — the single source of truth: org/classes/batches info, a deterministically seeded
  640-student roster + 3-month fee ledger, teachers, exams, today's attendance register, and
  communication logs. Every dashboard number derives from this module, exactly as in the original.
- `lib/charts.ts` — `scopeOf()` (class-level data scoping), `kpisFor()`, and the five pure chart
  builders (fee, enrollment, hourly, donut, heatmap) that return plain SVG geometry
- `lib/store.tsx` — app-wide React context for the class filter, date range, sidebar collapse and
  toasts, persisted to `localStorage`
- `components/` — shared UI: `Icon`, `Counter` (animated), `KpiCard` (exec/hub/pulse variants),
  `AlertCard`, `ActivityItem`, `ChartCard`, `Chip`, the app shell (`Sidebar`, `TopBar`, `MobileNav`),
  and `components/charts/*` (SVG chart renderers)
- `app/` — one route per nav item: dashboard (`/`, with all three original concepts — Executive
  Command Center, Academic Performance Hub, Visual Operations Pulse), `students`, `batches`,
  `attendance`, `fees`, `exams`, `teachers`, `communication`, `reports`, `settings`, `login`

## Notes on the port

- This is a faithful **re-architecture**, not a mechanical line-by-line translation of the original
  `.dc.html` templating (`sc-for`/`sc-if`). The data model, design tokens, chart math, and page
  content are ported 1:1; page layouts and some deeper modals (e.g. the full Collect-fee flow,
  student admission form validation, exam mark-entry grid) were rebuilt more simply as real React
  state rather than reproducing every line of the original markup.
- No backend: all writes (collecting a fee, sending a message, admitting a student, etc.) are demo
  actions that show a toast rather than persisting anywhere, matching the original prototype's scope.
- `/login` renders inside the same app shell as every other page for simplicity, rather than as a
  fully separate unauthenticated layout.
- Target production stack per the original prototype's own notes: this port already uses
  React + TypeScript + Tailwind; Recharts and a real auth/API layer would be the next steps for a
  production build.
