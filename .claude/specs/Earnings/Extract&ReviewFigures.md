# Spec: Earnings Report — Part 2 Frontend (Extract & Review Figures)

## Overview
Build "Extract earnings data" (mockup 2), replacing the Part 1 placeholder extract page. Shows the
selected source reports, loads the reviewed figure set from the backend (first load triggers the
backend resolve), renders the metric table (value, period, source, confidence) with per-figure
flags, supports inline edit of values, and on Continue routes to the outline screen (Part 3
placeholder). Indigo + existing primitives — no violet/cyan (Part 1 decision).

## Depends on
- Part 2 backend: `GET /earnings/reports/{id}/figures`, `PATCH /earnings/reports/{id}/figures/{figureId}`
- Part 1 frontend: routing, the single `src/lib/api.ts` earnings client, `useAuth()`
- Quarterly review/table patterns and primitives, if any exist to reuse

## Step 0 — capture live shapes before wiring types (Part 1 lesson)
Hit `GET` and `PATCH` with a token and record: the figure object fields (`metric_key`, `label`,
`value`, `unit`, `period`, `source_document_id` + any source label, `source_ref`, `confidence`
scale, `is_derived`, `derivation`, `flag`), the list wrapper (`{figures:[...]}` vs bare array),
and the `PATCH` request/response bodies. Wire exact field names — do not assume.

## Routes
- `/earnings/:reportId/extract` — now the real page (was a placeholder in Part 1)
- On Continue → `/earnings/:reportId/outline` (Part 3 placeholder added here)

## Templates
The screen renders, top to bottom:
1. **Selected system reports** — the chosen sources with count + coverage badge + a Preview affordance.
2. **Extracted financial data** — a table: metric | value + unit | period | source (`doc label · ref`, or `Derived · formula`) | confidence (bar + %, flag-coloured) | edit. A caption: values below 90% are flagged for review, click to correct.

## Files to change
- `src/types/earnings.ts` — add `EarningsFigure`, `EarningsFiguresResponse`
- `src/lib/api.ts` — extend the earnings client: `getEarningsFigures(companyId, reportId)`, `patchEarningsFigure(companyId, reportId, figureId, { value, unit? })`
- `src/App.tsx` — point `/earnings/:reportId/extract` at the real page; add `/earnings/:reportId/outline` (static-before-param ordering as in Part 1)
- `src/pages/earnings/helpers.ts` — add `isFlagged(confidence, edited)`, `formatFigureValue(value, unit)`

## Files to create
- `src/pages/earnings/EarningsExtractPage.tsx` — replaces the placeholder: loads figures (spinner while first-load resolves), renders `SelectedSourcesHeader` + `FigureTable`, Continue handler.
- `src/pages/earnings/EarningsOutlinePage.tsx` — minimal Part 3 placeholder (heading + "coming in Part 3") so Continue doesn't 404.
- `src/components/earnings/SelectedSourcesHeader.tsx` — chosen sources, count, coverage badge, Preview.
- `src/components/earnings/FigureTable.tsx` — the metric rows.
- `src/components/earnings/ConfidenceBadge.tsx` — bar + %; green ≥ 90, amber < 90, red < 85 (match mockup); "manual"/dash when confidence is null (edited).
- `src/components/earnings/EditableValueCell.tsx` — click-to-edit; commits via `patchEarningsFigure`; optimistic update with rollback on `ApiError`.
- `src/pages/earnings/__tests__/earnings-extract.test.tsx` — Vitest + RTL, mock `@/lib/api`, `fireEvent` (no user-event dep).

## New dependencies
No new dependencies.

## Rules for implementation
- Indigo + existing primitives only; no violet/cyan. Reuse `.card`, table styles, `.badge`/`.b-gn`/`.b-am`/`.b-rd`.
- Field names must match the Step 0 live shapes (`metric_key`, `source_document_id`, `is_derived`) — no assumptions (Part 6/7 wrapper/field lesson).
- Flag colour comes from the backend `flag` when present; otherwise derive from confidence (`< 85` red, `< 90` amber, else green). When confidence is null (edited), show "manual"/dash — never invent a number.
- Inline edit: `PATCH` a single figure; on success clear its flag; optimistic with rollback on error.
- Derived rows show `Derived · <formula>` in the source column; the derivation isn't editable, though the value still is (an edit becomes a manual override).
- Continue is always enabled; if any figure is still flagged, show a confirm ("N figures below 90% confidence — continue anyway?"). Non-blocking. On confirm → navigate to `/earnings/:reportId/outline`.
- Handle loading / empty / error states; guard null `companyId` from `useAuth()`.

## Tests to write

### Unit tests
File: `src/pages/earnings/__tests__/earnings-extract.test.tsx` (helper cases)

| Function | Input | Expected output |
|---|---|---|
| `isFlagged` | `(84, false)` | `true` |
| `isFlagged` | `(99, false)` | `false` |
| `isFlagged` | `(null, true)` | `false` |
| `formatFigureValue` | `(4182.6, 'SAR M')` | `'4,182.6 SAR M'` |

### Route tests
(RTL, `@/lib/api` mocked)
- Renders the table from a mocked `GET`, including a derived row and a `< 90` flagged row styled amber/red
- Editing a value calls `patchEarningsFigure` and the row's flag clears
- Continue with a remaining flag shows the confirm; confirming navigates to `/earnings/:reportId/outline`
- Continue with no flags navigates directly
- Null `companyId` is guarded (no crash)

## Definition of done
- [ ] Extract page loads real figures (first load triggers the backend resolve) and replaces the Part 1 placeholder
- [ ] Table matches mockup 2: metric, value + unit, period, source (`doc · ref` / `Derived · formula`), confidence with flag colour
- [ ] Free Cash Flow shows as Derived; a `< 90` figure is visibly flagged
- [ ] Inline edit persists via `PATCH` and clears the flag
- [ ] Continue routes to the outline placeholder (with the confirm when flags remain)
- [ ] Indigo / existing primitives only; no violet/cyan
- [ ] `earnings-extract` suite passes under `vitest run src/pages/earnings`