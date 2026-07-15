# Part 7 — FRONTEND — Assembled Report Preview, Inline Edit & Export

## Overview
Show the full assembled report as one document — the chosen cover as the first page,
then all sections in order. The user can click a pencil icon to edit content inline
(edits persist to the DB). Buttons export the report to DOCX and PDF, structured with
the cover first, real tables, and the chosen brand colors.

## Depends On
- Backend Part 7:
  - `GET .../quarterly/{reportId}/assemble`
  - `PATCH .../quarterly/{reportId}/sections/{code}/content`
  - `GET .../quarterly/{reportId}/export?format=docx|pdf`
- Parts 5 (produced content) + 6 (cover template + brand colors).

## Files to Create / Change
- `AssembledReportPage.tsx` (or a final "Preview & Export" view).
- `src/lib/api.ts` — add `getAssembled / saveSectionContent / exportReport`.
- Reuse the cover renderer + table/prose renderers from Parts 5/6.

## Layout — the assembled document
- Render as a single scrollable document (like a real report), NOT a section rail.
- **Cover first** — the chosen cover design as the first "page" block, with the real
  company name + period, in the brand colors.
- Then each section in display_order:
  - Section heading in `brand.primary`.
  - table/kpi content → rendered table (aligned; header row in brand.primary).
  - prose content → paragraphs, dark body text.
- Apply brand colors via CSS variables (`--brand-primary`, `--brand-secondary`) so
  headings/accents use them; body stays dark.

## Inline editing (pencil icon)
- Each editable section shows a **pencil icon** on hover/focus.
- Click pencil → that section's text becomes **editable inline** (contentEditable or a
  textarea in place):
  - prose → edit the text directly.
  - table → allow editing cell values inline (or, for v1, edit prose sections inline
    and keep tables read-only if cell-editing is heavy — your call; recommend prose
    inline first).
- On blur / save → `saveSectionContent(code, editedContent)` → persists to DB.
  Show a subtle "Saved" indicator. Optimistic update; revert on failure.
- Edits persist — reloading shows the edited content.

## Cover in the preview
- The selected cover design (from Part 6) renders as the first page here.
- The "Choose cover design & colors" button (Part 6) is accessible here too, so the
  user can change cover/colors and see the assembled report update.

## Export
- **Export** button with a dropdown: **Word (.docx)** / **PDF**.
- Calls `exportReport(format)` → downloads the binary file (auth'd fetch → blob →
  download).
- Show a spinner while generating; error inline if it fails.
- The downloaded file must match the preview: cover first, aligned tables, brand
  headings, dark body.

## Behavior
- On mount: `getAssembled()` → render cover + ordered sections.
- Pencil → inline edit → save → persist.
- Change cover/colors (Part 6 popup) → re-render.
- Export → download DOCX/PDF.

## Integration test
1. Open the assembled view → cover is first (real company name + period, brand colors),
   sections follow in order with aligned tables + prose.
2. Click pencil on a prose section → edit text → blur → "Saved"; reload → edit persists.
3. Change cover design/colors → assembled preview updates (cover + heading colors).
4. Export Word → opens in Word: cover page 1, real aligned tables, brand-colored
   headings, dark body, correct figures.
5. Export PDF → same structure.

## Definition of Done
- Assembled report renders as one document, cover first, brand colors applied.
- Pencil-icon inline editing works and persists to the DB.
- Chosen cover design shows as the first page in the preview.
- Export produces structured DOCX + PDF: cover first, aligned tables, brand headings,
  dark readable body, correct company + figures.