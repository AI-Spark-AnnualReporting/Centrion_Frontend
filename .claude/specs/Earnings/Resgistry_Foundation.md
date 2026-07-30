# Spec: Earnings Report — Part 6A Frontend (Comparatives + 19-Section Outline)

## Overview
Reflect the registry foundation on the existing screens: show prior-period + delta columns on the
figures review screen, render the 19 registry sections on the outline screen grouped by priority and
filtered by sector, and let the preview render the expanded section set. No new screens — updates to
Parts 2, 3, and 5 frontends.

## Depends on
- Part 6A backend (comparative fields on figures; 19-section sector-filtered outline)
- Parts 2/3/5 frontends (built)
- D-17 (comparatives required), D-18 (sector), D-12 (no fabricated deltas)

## Step 0 — capture live shapes
1. `GET .../figures` — the new comparative fields (`prior_value`, `prior_period`, `change_pct`, `comparative_status`) — exact names + scale.
2. `GET .../outline` — 19 sections now carry `requirement` (required/recommended/optional) and are sector-filtered. Confirm the priority field and whether excluded-by-sector sections are omitted or returned flagged.

## Routes
No new routes.

## Templates
- **Figures review (Part 2 screen)** — add a **Prior** column and a **Δ / YoY** column. A figure with `comparative_status='none'` shows `—` in both, never a computed delta. Delta colour: up/down/flat, but only when a real `change_pct` exists.
- **Outline (Part 3 screen)** — render up to 19 sections, grouped by `requirement` (Required / Recommended / Optional). Sector-excluded sections don't appear. Required sections remain locked-on (Part 3 rule).
- **Preview (Part 5 screen)** — renders whatever sections produced; sections still `pending` (awaiting Part 6C producers) show a "generation pending" state, not empty and not faked.

## Files to change
- `src/types/earnings.ts` — add comparative fields to `EarningsFigure`; `requirement` on outline sections
- `src/components/earnings/FigureTable.tsx` — Prior + Δ columns, no-delta path
- `src/pages/earnings/helpers.ts` — `formatDelta(change_pct, comparative_status)` → `'—'` when none; `deltaTone`
- `src/components/earnings/OutlineGroup.tsx` — group by priority; handle up to 19 sections
- `src/pages/earnings/EarningsPreviewPage.tsx` / `SectionRenderer.tsx` — render the expanded set; `pending` state

## Files to create
None.

## New dependencies
No new dependencies.

## Rules for implementation
- **Never render a delta the data doesn't carry** (D-12). `comparative_status='none'` → `—`, not `0%`, not a computed value.
- Delta direction/colour comes from `change_pct` sign, only when present.
- Outline priority grouping is Required / Recommended / Optional; Required stays locked-on.
- A `pending` section (no producer yet) is shown as pending, distinct from produced and from empty.
- Field names from Step 0 — no assumptions.
- Indigo/product primitives (D-05); no violet/cyan.

## Tests to write
### Unit tests
| Function | Input | Expected |
|---|---|---|
| `formatDelta` | `(0.114, 'yoy')` | `'+11.4%'` with up tone |
| `formatDelta` | `(null, 'none')` | `'—'`, no tone |
| outline grouping | mixed requirement | three groups Required/Recommended/Optional |

### Route tests (RTL, mocked)
- Figures table shows Prior + Δ; a `none` row renders `—` in both, not a number
- Outline renders the sector-filtered sections grouped by priority; a `pending` section shows pending in preview
- No fabricated delta appears anywhere for Shell's data

## Definition of done
- [ ] Review screen shows Prior + Δ columns; `none` rows show `—` (Shell = no deltas, honestly)
- [ ] Outline renders the 19 registry sections, sector-filtered, grouped by priority
- [ ] Preview renders produced sections and shows `pending` for those awaiting Part 6C
- [ ] No delta is ever computed or shown where the data has none
- [ ] Indigo only; `npx vitest run src/pages/earnings` passes