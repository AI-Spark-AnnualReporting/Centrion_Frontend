# Spec: Earnings Report — Frontend (Preview & Publish)

## Overview
The final screen (mockup 4), replacing the `EarningsPreviewPage` placeholder. It generates the report
(triggers Part 4's producer and shows progress), renders the assembled sections, lets the user edit a
section inline, export DOCX/PDF, and approve-and-lock. One screen, two backends: Part 4 (produce,
sections) and Part 5 (content edit, export, approve). Product UI is indigo (D-05); the **exported
file** is brand-styled by the backend — that distinction stays server-side, the preview does not
restyle to violet/cyan.

## Depends on
- Part 4 backend: `POST /earnings/reports/{id}/produce` (async 202 + `agent_runs` poll), `POST .../sections/{code}/produce`, `GET .../sections`
- Part 5 backend: `PATCH .../sections/{code}/content`, `POST .../export`, `POST .../approve`
- Part 3 frontend (routing, api module, `useAuth`), Part 2 patterns (poll/optimistic idioms)
- Quarterly's preview/produce screen, if one exists to mirror

## Step 0 — capture the live content shape (this is the one I've been holding for)
Hit `GET /earnings/reports/{id}/sections` on a produced Shell Q4-2023 report and record, exactly:
1. The **`content` shape per section type**. Documented from the backend Step 0 as polymorphic: prose sections = a plain string; table/kpi = `{title, rows:[{code, label, current_display, prior_display, change_pct, change_direction}]}`; cover = `{template_key, layout, values:{title, period_label, logo_url, prepared_on}}`. **Confirm** — parse a live response, don't trust this list.
2. Whether the response carries **`feeder`/citations and confidence/flag** per section. The backend appends the `"· p.1"` citation suffix at *assemble/export* time, not in produced content — so if the preview is to show citations, it reads them from `feeder`. Confirm `feeder` is in the `GET /sections` payload; if not, citations appear only in the exported file (note that in the UI).
3. `status` vocabulary per section (`pending|drafting|produced|needs_input|empty`) and the `agent_runs` poll shape for `POST /produce`.
4. The `POST /approve` **409 blocker-list** body shape, and the `POST /export` response (raw bytes + `Content-Disposition`, per the plan).

## Mockup-vs-reality gap to resolve before building
Mockup 4's Overview shows **KPI cards** (Revenue / Net Income / EBITDA Margin / EPS with deltas). But
Part 4 produces `overview_highlights` via the reused quarterly hybrid producer, which emits **prose**,
not a KPI envelope — and there are **no deltas** in the data (Shell is `comparative_status='none'`).
So as built, Overview renders as prose with no KPI cards and no deltas. Two honest options:
- **(A) v1: render what's produced** — Overview as prose. No KPI cards. Simplest, ships now, matches the data.
- **(B) Add KPI cards** — requires a **backend** change: the producer emits a `kpi` envelope for `overview_highlights` (values from the figure context, deltas omitted). Not a frontend-only fix.

Recommend **A for this spec**, with B tracked as a producer enhancement. **Do not** have the frontend
synthesize KPI cards from prose or fill deltas the data doesn't have (D-12). Confirm the choice before building.

## Routes
- `/earnings/:reportId/preview` — now the real screen (was a Part 3 placeholder)

## Templates
Top to bottom, per mockup 4 (adapted to what's produced):
1. **Generate state** — if any `included` section isn't `produced`, show a "Generate report" action (or auto-trigger) → `POST /produce` → poll → per-section progress (`drafting → produced`/`needs_input`). A `needs_input` section is surfaced, not hidden.
2. **Assembled preview** — a section-nav rail (cover, then included+produced sections in `display_order`) and the rendered document body. (The mockup's page-thumbnail rail implies true pagination; v1 uses a **section rail**, not rendered pages — true pages are the PDF. Flag this simplification.)
3. **Per-section render** by content shape: cover → cover block; table/kpi envelope → a table of `label` + `current_display` **only** (omit prior/change columns — no deltas); prose → prose. Citations from `feeder` if present.
4. **Actions** — per-section edit + regenerate; document-level Export (DOCX/PDF) and Approve & lock.

## Files to change
- `src/types/earnings.ts` — `ProducedSection`, `SectionsResponse`, content-shape union (prose | table envelope | cover), `ExportFormat`, approve blocker type
- `src/lib/api.ts` — `getEarningsSections`, `produceEarningsReport` (+ poll), `produceEarningsSection`, `patchEarningsSectionContent`, `exportEarningsReport` (returns a blob), `approveEarningsReport`
- `src/App.tsx` — point `/earnings/:reportId/preview` at the real page

## Files to create
- `src/pages/earnings/EarningsPreviewPage.tsx` — orchestrates generate → render → edit → export → approve
- `src/components/earnings/SectionRail.tsx` — cover + section nav
- `src/components/earnings/SectionRenderer.tsx` — dispatch by content shape (prose / table / cover)
- `src/components/earnings/SectionTable.tsx` — `label` + `current_display`, **no delta columns**; citation chips from feeder if present
- `src/components/earnings/EditableProse.tsx` — inline edit → `PATCH content`; grounding-flag acknowledge
- `src/components/earnings/GenerateProgress.tsx` — per-section produce status while polling
- `src/components/earnings/PublishBar.tsx` — Export (docx/pdf) + Approve & lock, with blocker surfacing
- `src/pages/earnings/__tests__/earnings-preview.test.tsx`

## New dependencies
No new dependencies. No pagination/rendering library — section rail + scroll, not rendered pages.

## Rules for implementation
- Field names from Step 0 — no assumptions (this whole screen is the shape we've been guessing at).
- **Render only what's produced.** Never synthesize KPI cards, deltas, or citations the data doesn't carry (D-12). Table rows show `current_display` only; if `prior_display`/`change_pct` are null, **no delta column renders at all** — not a blank one.
- **Citations** come from `feeder` if the payload has it; if not, state in the UI that full provenance is in the export, and don't fake inline citations.
- A `needs_input`/unproduced section is shown as such — the preview can't claim a section is done when it isn't.
- Inline edit: `PATCH content`, mark edited; if the response carries a grounding violation flag, surface it with an **acknowledge** control (the backend flags, doesn't block — D-08). An unacknowledged flag will block approve; reflect that.
- Regenerate a section warns if it was edited (don't silently clobber a manual edit).
- **Export** downloads the returned bytes as a file (respect `Content-Disposition`); no client-side rendering of the document.
- **Approve**: on 409, render the blocker list plainly ("Cash flow detail not produced", "Overview has an unacknowledged figure flag") and don't navigate away. On success, reflect the locked state — a locked report is read-only (edit/regenerate/approve disabled; export still allowed).
- Product UI indigo + existing primitives (D-05); the exported file's brand styling is the backend's job — don't restyle the preview.
- Guard null `companyId`; loading / generating / empty / error states.

## Tests to write

### Unit tests
File: `src/pages/earnings/__tests__/earnings-preview.test.tsx`

| Case | Input | Expected |
|---|---|---|
| content dispatch | a table envelope | renders a table of label + current_display, **no** delta column |
| content dispatch | a prose string | renders prose |
| content dispatch | a cover envelope | renders the cover block |
| no fabricated delta | rows with `change_pct: null` | no delta column appears anywhere |
| needs_input | a section `status='needs_input'` | shown as needing input, not as done |

### Route tests
(RTL, `@/lib/api` mocked)
- Unproduced report → shows Generate; triggering it calls `produceEarningsReport` and shows per-section progress
- Produced report → renders the section rail + bodies from a mocked `GET /sections`
- Editing a section calls `patchEarningsSectionContent`; a returned grounding flag shows an acknowledge control
- Export click calls `exportEarningsReport` and triggers a file download (blob)
- Approve on a gate-failing report (mocked 409 with blockers) renders the blocker list and does not lock the UI
- Approve success reflects the locked, read-only state
- Null `companyId` guarded

## Definition of done
- [ ] Preview screen replaces the placeholder and renders produced sections from `GET /sections`
- [ ] Content dispatches correctly by shape (cover / table / prose); tables show current values with **no** delta columns
- [ ] Overview renders as produced (prose, per option A) — no synthesized KPI cards or deltas
- [ ] Citations render from `feeder` if present, else the UI points to the export; nothing faked
- [ ] Generate flow polls and shows per-section status; `needs_input` sections are surfaced
- [ ] Inline edit persists and surfaces/acknowledges grounding flags; regenerate warns on edited sections
- [ ] Export downloads DOCX/PDF; Approve gates with a readable blocker list and locks to read-only on success
- [ ] Indigo/product primitives only; no violet/cyan in the preview UI
- [ ] `npx vitest run src/pages/earnings` passes