# Spec: Earnings Report — Part 3 Frontend (Arrange Outline)

## Overview
Build "Arrange your report outline" (mockup 3), replacing the Part 2 outline placeholder. Load the
outline from the backend, show included sections (reorderable, toggleable) and an "Available to add"
group for optional sections, grey out optionals with no backing data, and on Continue save the
arrangement and route to the preview screen (Part 4/5 placeholder). Indigo + existing primitives
(D-05).

## Depends on
- Part 3 backend: `GET /earnings/reports/{id}/outline`, `PUT /earnings/reports/{id}/outline`
- Part 2 frontend (routing, api module, `useAuth`)
- Quarterly outline/section-picker UI, if one exists to reuse

## Step 0 — capture the live shape
Hit `GET /outline` on a report with resolved figures and record: the section object fields
(`section_code`, `title`, `section_number`, `display_order`, `included`, `requirement`, `available`,
`source_type`/`mode` hints), the list wrapper, and the `PUT` request body shape. Wire exact names.

## Routes
- `/earnings/:reportId/outline` — now the real page (was a Part 2 placeholder)
- On Continue → `/earnings/:reportId/preview` (Part 4/5 placeholder added here)

## Templates
Two groups, per mockup 3:
1. **Report sections** — included sections in order, each a card: number, title, description, page hint, any `source_type` hint chips, a reorder control, and an include toggle. `requirement='required'` sections show the toggle **on and disabled** (can't be removed).
2. **Available to add** — optional sections not included. An optional with `available=true` is addable (toggle on); with `available=false` it's greyed with a short reason ("no data for this section"), toggle disabled.

Reorder: the mockup shows up/down chevrons per card. Use chevron up/down as the primary reorder (no new drag-and-drop dependency — Part 1 lesson). If quarterly already ships a reorder mechanism, reuse it; otherwise chevrons only.

## Files to change
- `src/types/earnings.ts` — `OutlineSection`, `OutlineResponse`, `SaveOutlinePayload`
- `src/lib/api.ts` — `getEarningsOutline(reportId)`, `saveEarningsOutline(reportId, sections)`
- `src/App.tsx` — point `/earnings/:reportId/outline` at the real page; add `/earnings/:reportId/preview` placeholder route

## Files to create
- `src/pages/earnings/EarningsOutlinePage.tsx` — replaces the placeholder: loads outline, holds section order + inclusion in state, reorder + toggle handlers, Continue → `saveEarningsOutline` → navigate to preview
- `src/pages/earnings/EarningsPreviewPage.tsx` — minimal Part 4/5 placeholder
- `src/components/earnings/OutlineSectionCard.tsx` — one section row (number, title, description, chips, reorder chevrons, toggle)
- `src/components/earnings/OutlineGroup.tsx` — "Report sections" vs "Available to add" grouping
- `src/pages/earnings/__tests__/earnings-outline.test.tsx`

## New dependencies
No new dependencies. Specifically: **no drag-and-drop library** — chevron reorder only.

## Rules for implementation
- Indigo + existing primitives; no violet/cyan (D-05).
- Field names from Step 0 — no assumptions.
- A `required` section's toggle is on and disabled; the user cannot exclude it.
- An optional with `available=false` is greyed, toggle disabled, with a brief reason — never silently addable. The screen must not offer a section the backend said has no data (D-12).
- Reorder applies within the included set; order is sent to `PUT` as array order.
- Continue: `saveEarningsOutline` then navigate to `/earnings/:reportId/preview`. On a `422` (e.g. stale include of an unavailable optional), surface the message and refetch rather than pushing on.
- Guard null `companyId`; loading / empty / error states.
- Don't fabricate page/source citations on cards — show only `source_type`/`mode` hints the backend provides.

## Tests to write

### Unit tests
File: `src/pages/earnings/__tests__/earnings-outline.test.tsx`

| Case | Input | Expected |
|---|---|---|
| grouping | sections with mixed `included` | included ones in "Report sections", the rest in "Available to add" |
| required toggle | a `requirement='required'` section | toggle rendered on + disabled |
| unavailable optional | `available=false` | greyed, toggle disabled, reason shown |
| reorder | move an included section up | order index changes in state |

### Route tests
(RTL, `@/lib/api` mocked)
- Renders included sections in order and the available-to-add group from a mocked `GET`
- `segment_deep_dive` with `available=false` renders greyed and cannot be toggled on
- Toggling an available optional on, reordering, then Continue calls `saveEarningsOutline` with the new order + inclusion and navigates to `/earnings/:reportId/preview`
- A required section cannot be toggled off
- Null `companyId` guarded

## Definition of done
- [ ] Outline screen replaces the placeholder and renders the two groups from `GET /outline`
- [ ] Required sections are on and locked; optionals toggle; unavailable optionals are greyed with a reason
- [ ] Reorder via chevrons; order persists through `PUT` and a re-load
- [ ] Continue saves and routes to the preview placeholder
- [ ] `segment_deep_dive` shows greyed (no segment data) for Shell Q4-2023
- [ ] Indigo / existing primitives only; no new drag-and-drop dependency
- [ ] `npx vitest run src/pages/earnings` passes