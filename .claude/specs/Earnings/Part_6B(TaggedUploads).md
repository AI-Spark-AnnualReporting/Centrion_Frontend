# Spec: Earnings Report — Part 6B Frontend (Tagged Uploads)

> Refreshed after 6A. Supersedes the earlier 6B draft.

## Overview
Make the "Upload new documents" tab real on the setup screen: upload a file, tag its type, and see it
join the source set alongside the DB reports — with the two **tracks** visually distinct so the user
understands official figures come from filings and narrative/adjusted content comes from their
uploads.

## Depends on
- 6B backend (`POST .../sources/upload`, extended `GET /sources`, two source sets on the draft)
- Part 1 frontend `SourcePicker` (built), D-19 (three-track), D-12

## Step 0 — capture live shapes (verify against the running 6B backend, not this spec)
1. `GET /sources` — the source object now carries a `track` (official / narrative-adjusted), a `type` (annual/interim/release/presentation/transcript/aggregator), and for uploads an `extraction_status`. Confirm exact field names.
2. `POST .../sources/upload` — multipart shape, the `type` field's allowed values, the response (new source + extraction state).
3. How the draft-create/update call now takes both `source_report_ids` and `source_document_ids`.

## Routes
No new routes (setup screen extended).

## Templates
- **Sources block (Part 1 screen)** — the "Upload new documents" tab becomes functional:
  - Drop-zone + a **type selector** (Annual / Interim / Press release / Presentation / Transcript). Reuse the existing `DocumentUploader`; don't build a second uploader.
  - Uploaded docs appear tagged, with an "extracting… / ready / failed" state until figures exist.
  - Two clearly-labelled groups: **Official sources** (DB reports) and **Narrative & adjusted** (uploads). The user should read at a glance that official numbers come from filings, not their upload.

## Files to change
- `src/types/earnings.ts` — source object gains `track`, `type`, `extraction_status`; draft payload gains `source_document_ids`
- `src/lib/api.ts` — `uploadEarningsSource(reportId, file, type)`; extend the sources normalizer; send both source sets on create/update
- `src/components/earnings/SourcePicker.tsx` — upload tab (drop-zone + type selector), track grouping, extracting state

## Files to create
None (reuse `DocumentUploader`).

## New dependencies
No new dependencies.

## Rules for implementation
- Reuse the existing uploader; add only the **type selector** and track grouping.
- Show an upload's extraction state honestly ("extracting…", "ready", "failed") — a freshly uploaded doc has no figures yet (D-12); never show it as a usable figure source before it's ready.
- Make the two tracks legible: **Official** (DB reports) vs **Narrative & adjusted** (uploads). A transcript is labelled narrative-only — no implication it provides figures.
- Field names from Step 0 — no assumptions (the recurring lesson).
- Indigo/product primitives (D-05); no violet/cyan.

## Tests to write
### Route tests (RTL, `@/lib/api` mocked)
- Upload tab: selecting a type + file calls `uploadEarningsSource` with the type; the new source appears tagged, in "extracting" state
- `GET /sources` renders DB reports and uploads in distinct, labelled groups (Official vs Narrative & adjusted)
- An upload still extracting shows its state, not figures
- A transcript upload is labelled narrative-only (no official-figure affordance)
- Continue sends both `source_report_ids` and `source_document_ids`

## Definition of done
- [ ] Upload tab works: file + type → uploaded, tagged, extracting state shown
- [ ] Sources list distinguishes Official (DB reports) from Narrative & adjusted (uploads)
- [ ] Extraction state shown honestly; no figures shown before they exist
- [ ] Draft persists both source sets; reuses the existing uploader; indigo only
- [ ] `npx vitest run src/pages/earnings` passes