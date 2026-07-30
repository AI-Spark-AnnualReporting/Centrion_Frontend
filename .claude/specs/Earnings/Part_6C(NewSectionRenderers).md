# Spec: Earnings Report — Part 6C Frontend (New Section Renderers)

> Refreshed after 6A + 6B. Supersedes the earlier 6C draft.

## Overview
Render the new section content types in the preview: the management-commentary quote block, the
non-IFRS reconciliation table, the hardened MD&A, sector-scoped operational KPIs, and (when present)
the trend series. These plug into the existing `SectionRenderer` — the content shapes are the same
envelopes Part 5 / 6A already render, so this is new sub-renderers, not a new screen. The theme
throughout: **an omitted or gapped section reads as what it is — never a placeholder that implies
missing content is a bug.**

## Depends on
- 6C backend (the new sections produce in existing `.content` shapes)
- Part 5 / 6A preview (`SectionRenderer`, `SectionTable`, the pending/gap states)
- D-20, D-12, D-21

## Step 0 — capture live shapes (verify against the running 6C backend)
1. `GET /sections` on a produced report **with uploads** — confirm each new section's `.content` shape: quote block structure, reconciliation/bridge table envelope, trend series, and how an **omitted** section is represented (absent vs empty-with-reason).
2. Confirm citations travel for the new sections (feeder), same as Part 4/5.
3. Confirm the three "blank" states are distinguishable in the payload: **pending** (will produce), **gap** (line-item, with `gap_reason`), **omitted** (section produced nothing, by design).

## Routes
No new routes.

## Templates
New sub-renderers inside `SectionRenderer`:
- **Management commentary (S05)** — a quote block: verbatim text + attribution (name/title). If the backend omitted it, it simply doesn't appear — no placeholder, no "quote unavailable."
- **Non-IFRS reconciliation (S15)** — reported → adjustments → adjusted table, per line, cited.
- **MD&A (S08)** — the variance narrative; if the backend returned the "not disclosed" line, render it as-is, unembellished.
- **Operational KPIs (S06)** — sector-scoped KPI table (reuse `SectionTable`); out-of-catalog rows show as gaps with their reason.
- **Trend (S16)** — a multi-period series/table when present; absent when deferred.

## Files to change
- `src/types/earnings.ts` — content-shape union gains the new envelopes (quote, reconciliation, trend)
- `src/components/earnings/SectionRenderer.tsx` — dispatch the new shapes; handle omitted
- `src/components/earnings/QuoteBlock.tsx`, `ReconciliationTable.tsx` (new)

## Files to create
- `src/components/earnings/QuoteBlock.tsx`
- `src/components/earnings/ReconciliationTable.tsx`

## New dependencies
No new dependencies (no chart library — trend renders as a series/table; a chart is a later polish item).

## Rules for implementation
- **Three blanks, three readings** (D-12): *pending* (section will produce later), *gap* (line-item, show `gap_reason`), *omitted* (section deliberately produced nothing). They must not all collapse into one grey dash — that makes an honest report look broken. This is where 6A/6B's `gap_reason` work pays off.
- An **omitted** section (no quote) renders as **absent** — never a placeholder or a fabricated stand-in (D-20/D-12).
- Reconciliation/KPI tables render only backend-produced values, each cited; no computed deltas the data lacks.
- The MD&A "not disclosed" line renders verbatim — the frontend never fills the gap with its own prose.
- Field/shape names from Step 0; indigo only (D-05); reuse `SectionTable` where possible.

## Tests to write
### Route tests (RTL, `@/lib/api` mocked)
- A commentary section with a quote renders the quote block with attribution
- A report where commentary was omitted → **no** quote block, no placeholder
- A reconciliation section renders the reported→adjusted table with citations
- An MD&A "not disclosed" line renders as-is, unembellished (no padding)
- A deferred trend section is absent, not an empty chart
- pending vs gap vs omitted render as three visually distinct states

## Definition of done
- [ ] New content types render (quote block, reconciliation, MD&A, KPIs, trend-when-present)
- [ ] Omitted sections are absent — no placeholders, no fabricated quotes
- [ ] pending / gap / omitted are three distinct, legible states — an honest report doesn't look broken
- [ ] All figures in the new sections stay cited; no invented deltas or prose
- [ ] Indigo only; reuses existing renderers where possible
- [ ] `npx vitest run src/pages/earnings` passes