# Plan: Upload documents to an existing quarterly report (like ESG)

## Context

ESG reports already let a user add new source documents to an **existing** report
from the Generate form (a "Source" dropdown: *Generate report from DB* vs
*Upload new documents*). Quarterly reports had no such path — picking an existing
quarterly report from the form's year dropdown just navigated straight to its
Coverage Map.

The backend was recently fixed so `POST /reports/{company_id}/{report_id}/documents`
now correctly processes documents for **quarterly** reports too (previously it
silently routed them through the wrong pipeline). This is the same endpoint ESG
already uses — no new route.

Goal: mirror the ESG experience inside the **quarterly Generate form**
(`QuarterlyReportForm`). When the user picks an existing quarterly report, let
them choose to either open it or upload up to 5 new documents (subject to the
backend's "max 5 total across the report" cap), then hand off to the existing
processing screen which already returns to the refreshed Coverage Map.

## What already exists (reuse — do NOT rebuild)

- **API client** — `reports.addDocuments(companyId, reportId, { files })` in
  `src/lib/api.ts:717` already POSTs `files[]` to the exact endpoint and returns a
  normalised `PipelineHandle` (handles 202 new-run and 409 already-running;
  400/422 fall through to `ApiError` whose `.body.detail` we already read).
- **Processing handoff** — `ProcessingPage` (`src/pages/ProcessingPage.tsx:83`)
  already special-cases `reportType: "quarterly"` and, on completion, navigates to
  `/quarterly-report/{reportId}/coverage` (the refreshed coverage view the backend
  brief asks for).
- **Existing doc count** — `QuarterlyCoverageResponse.summary.documents_count`
  (`src/types/quarterly.ts:26`) lets us enforce "max 5 total" client-side.
- **Multi-file uploader UI** — the tile grid + 5-cap + auto-dismiss "file limit"
  popup we just built inside `QuarterlyReportForm` (the `files` state, `acceptFiles`,
  `removeFile`, `MAX_DOCUMENTS`, `showFileCapWarning`, the upload zone and tile grid).
- **ESG reference pattern** — `ReportsPage.tsx:445-497` (Branch A "open from DB" /
  Branch C "upload new documents") and the Source `<select>` at `ReportsPage.tsx:1206-1219`.

## File to modify

`src/components/reports/QuarterlyReportForm.tsx` (single file — all plumbing already
exists elsewhere).

## Implementation

The form's "Reporting Year" dropdown currently navigates to coverage the moment an
existing report is selected (`handlePeriodChange` → `navigate(.../coverage)` at
~line 200). Change it to mirror ESG instead:

1. **Select an existing report → enter "existing" mode (don't navigate yet).**
   - Add state: `selectedReportId: string | null` and
     `existingSource: 'open' | 'upload'` (default `'open'`).
   - In `handlePeriodChange`, when a real report id is chosen, set
     `selectedReportId` instead of navigating. Keep the `+ Add new…` sentinel
     behavior (new-report flow) unchanged.
   - Provide a way back out (an `×` next to the dropdown that clears
     `selectedReportId`, like the year picker's clear button).

2. **Show a "Source" dropdown when `selectedReportId` is set** (copy ESG's at
   `ReportsPage.tsx:1206`): options *Open report* (`open`) and
   *Upload new documents* (`upload`).

3. **Fetch the existing doc count when an existing report is selected.**
   - Call `quarterlyReports.getCoverage(companyId, selectedReportId)` (add
     `quarterlyReports` to the api import) to read `summary.documents_count` and
     `period_label`.
   - Derive `remainingSlots = MAX_DOCUMENTS - documents_count`. Cap the uploader at
     `remainingSlots` (reuse the existing cap logic, swapping the constant for the
     computed remaining count). Show a small hint: "{documents_count}/5 used — you
     can add {remainingSlots} more". Handle the fetch failing gracefully (fall back
     to a flat 5-cap and let the backend 422 message surface).

4. **Hide the new-report-only inputs in existing+upload mode.**
   - When `selectedReportId` is set, hide the Quarter selector and the Report Areas
     grid (the backend reads the report's stored config; only files matter), exactly
     as ESG ignores form values for uploads. Keep them for the new-report flow.

5. **Branch the submit (`triggerGenerate`).**
   - `selectedReportId && existingSource === 'open'` → `navigate('/quarterly-report/${selectedReportId}/coverage')` (preserves the old behavior).
   - `selectedReportId && existingSource === 'upload'` → call
     `reportsApi.addDocuments(companyId, selectedReportId, { files })`, then navigate
     to `/reports/processing` with `ProcessingPageState` including
     `reportType: 'quarterly'`, `reportId: handle.reportId ?? selectedReportId`,
     `period` from the fetched `period_label`, `runId/pollUrl/...` from the handle
     (mirror `ReportsPage.tsx:472-487`). ProcessingPage takes it from there.
   - else (new report) → existing `generateQuarterly` path, unchanged.
   - Update `canGenerate` / `disabledReason` so upload mode only needs `hasFiles`
     (not areas/year), and `remainingSlots > 0`.

6. **Error handling.** Keep the `ApiError.body.detail` extraction already in the
   catch block so the backend messages surface verbatim:
   - 422 → "This report already has X documents. Maximum is 5."
   - 400 → "Report is published and cannot accept new documents."
   - 409 → normalised to `isExisting` handle (resume polling) — already handled by
     `postPipeline`, so it flows to the processing screen like ESG.

## Verification

1. `npm run dev`, open Reports → **Quarterly** tab.
2. In the Generate form, pick an existing quarterly report from the year dropdown:
   - Confirm it no longer jumps to coverage; a **Source** dropdown appears.
   - "Open report" + Generate → lands on that report's Coverage Map (old behavior).
3. Choose "Upload new documents":
   - Quarter + Report Areas inputs hide; uploader shows "N/5 used".
   - Add files beyond the remaining slots → the "file limit" popup caps the list.
   - Submit → processing screen (quarterly skin) → on completion returns to the
     **refreshed** Coverage Map with the new `documents_count`/figures.
4. Error paths: upload to a report already at 5 docs → 422 message shown; upload
   while a run is in progress → resumes polling (409); published report → 400 message.
5. Confirm the **new report** flow (+ Add new… → year/quarter/areas/files → Generate)
   is unchanged.
