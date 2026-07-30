# Spec: Earnings Report — Part 1 Frontend (Setup Screen)

## Overview
Builds the "Set up your earnings report" screen (mockup 1): report-type toggle,
variant-aware reporting-period selector, tone selector, and source selection
(upload vs use existing). On continue, it creates the draft via
`POST /earnings/reports` and routes to the extract screen. Mirrors the quarterly
setup screen's components and reuses the existing brand tokens and form
primitives — no new design system.

## Depends on
- Part 1 Backend: `POST /earnings/reports`, `GET /earnings/sources`
- Quarterly setup screen (mirrored components + shared form primitives)
- Existing document uploader (reused for the "upload new" source mode)
- Brand tokens: violet `#3C0866`, cyan `#5BC9E2`

## Routes
- `/earnings/setup` (new) — the setup screen
- On continue → navigate `/earnings/:reportId/extract` (screen built in Part 2)

## Database changes
No database changes.

## Templates
The Setup screen renders four blocks, matching mockup 1:
1. **Report type** — two cards: *Annual Earnings Report* ("Full-year performance across four quarters") and *Quarterly Earnings Report* ("Single-quarter earnings snapshot"). Single-select.
2. **Reporting period** — variant-aware. Annual: fiscal-year dropdown only. Quarterly: fiscal-year dropdown + quarter (Q1–Q4).
3. **Report tone** — 7 options, `Investor-focused` pre-selected. Single-select.
4. **Source selection** — two modes: *Upload new documents* (reuses the existing uploader) and *Use existing reports* (default; multiselect list from `GET /earnings/sources` with Full/Partial badges).

## Files to change
- Router/nav — add the `/earnings/setup` route and its entry point

## Files to create
Mirror the quarterly frontend layout; names below are indicative.
- `pages/earnings/Setup.tsx` — the 4-block form + continue handler
- `api/earnings.ts`:
  - `createEarningsReport(payload)` → `{ report_id }`
  - `getSelectableSources(companyId, period)` → `SelectableSource[]`
- `components/earnings/ReportTypeToggle.tsx`
- `components/earnings/PeriodSelector.tsx` — variant-aware
- `components/earnings/ToneSelector.tsx` — 7 options
- `components/earnings/SourcePicker.tsx` — upload tab + existing-reports multiselect with coverage badges
- Pure helpers (colocate or `utils/earnings.ts`):
  - `formatPeriodLabel(variant, fiscalYear, quarter?)` → `string` — `'FY 2025'` | `'Q3 2025'`
  - `canContinue(state)` → `boolean` — true only when type + period + tone + ≥1 source are set

## New dependencies
No new dependencies.

## Rules for implementation
- Mirror the quarterly setup screen's structure and reuse shared form primitives + brand tokens; no new design system
- Use CSS variables / brand tokens — never hardcode hex values in components
- The report-type toggle drives the period selector: Annual → fiscal-year only; Quarterly → fiscal-year + quarter
- Tone: exactly the 7 mockup options, `Investor-focused` default, single-select
- Source: *Use existing reports* is the default mode; require ≥1 selected source before continue; *Upload new* reuses the existing uploader (which triggers extraction) — do not build a second uploader
- Continue is disabled until `canContinue(state)` is true
- On continue: call `createEarningsReport`, then navigate to `/earnings/:reportId/extract`
- On `409`, show an "active report already exists for this period" message with a link to open the existing draft

## Tests to write

### Unit tests
File: `tests/earnings-setup.test.tsx`

| Function | Input | Expected output |
|---|---|---|
| `formatPeriodLabel` | `('annual', 2025)` | `'FY 2025'` |
| `formatPeriodLabel` | `('quarterly', 2025, 3)` | `'Q3 2025'` |
| `canContinue` | type + period + tone + 1 source | `true` |
| `canContinue` | no source selected | `false` |
| `canContinue` | no tone selected | `false` |
| `ToneSelector` (initial render) | mount | `Investor-focused` selected |

### Route tests
(React Testing Library, mocked API)
- Selecting *Annual Earnings Report* shows the fiscal-year dropdown only (no quarter control)
- Selecting *Quarterly Earnings Report* shows fiscal-year + quarter (Q1–Q4)
- *Use existing reports* is the default mode; the list loads from `getSelectableSources` and renders Full/Partial badges
- Continue is disabled until type + period + tone + ≥1 source are chosen
- Clicking Continue calls `createEarningsReport` and navigates to `/earnings/:reportId/extract`
- A `409` response renders the "active report exists" message with a link

## Definition of done
- [ ] Screen renders the four blocks matching mockup 1, using brand tokens `#3C0866` / `#5BC9E2`
- [ ] Annual toggle shows the FY dropdown only; Quarterly shows FY + quarter
- [ ] Tone shows exactly the 7 options with `Investor-focused` pre-selected
- [ ] Source list loads completed docs with Full/Partial badges; *Upload new* reuses the existing uploader
- [ ] Continue is disabled until type + period + tone + ≥1 source are set
- [ ] Continue creates the draft and routes to `/earnings/:reportId/extract`
- [ ] A `409` surfaces a clear message linking to the existing draft
- [ ] `tests/earnings-setup.test.tsx` passes