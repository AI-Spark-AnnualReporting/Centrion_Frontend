# Tick/cross summary table on Upload Previous Reports

**Date:** 2026-11-02 · **Repo:** Centrion_Frontend only · **Branch:** pre-staging (current)
**Builds on:** `Centriton/.claude/plans/annual-report-extraction-panel.md` (the extraction section + endpoint)

## Goal
A small table at the top of the "What we extracted from your annual report" section, with 4 columns.
Each cell shows ✓ when something was extracted and ✗ when nothing was. Clicking a cell opens a popup
with everything for that column.

| Column | ✓ when | Popup shows |
|---|---|---|
| Tone | the tone paragraph, the tone profile or the example sentences exist | Writing tone, the 10 tone settings, the example sentences |
| Dashboard data | revenue/profit was read from at least one report | Revenue and profit, per report |
| Previous outline | the company has section rows (what the cycle's "Previous" option reads) | The sections, the contents page per report, and the flat outline list |
| Suggested departments | at least one department was suggested | The department cards (reason, quote, match) |

Themes and highlights are NOT part of any column or popup, as asked.

## Steps
1. `src/components/reports/AnnualReportExtraction.tsx`
   - New `ExtractionSummaryTable`: one header row with the 4 column names, and one row of ✓/✗ buttons
     (green check / red cross from lucide-react). It sits at the top of the section.
   - Four small "has data" helpers, one per column: `hasTone`, `hasDashboardData`,
     `hasPreviousOutline`, `hasSuggestedDepartments`.
   - The popup uses the existing shared `src/components/ui/dialog.tsx`. Each popup reuses the
     blocks the section already draws, so nothing is written twice.
   - A cross is clickable too, and its popup then shows the existing "Nothing was extracted" text.
2. `src/test/annual-report-extraction.test.tsx`: new tests
   - the full data shows 4 ticks
   - empty data shows 4 crosses
   - clicking "Tone" opens a popup with the tone paragraph
   - the "Previous outline" popup lists the sections
3. Run vitest on this file plus the upload-reports page test, eslint, and `tsc -p tsconfig.app.json`.
   35 type errors already exist elsewhere; compare against that.
4. Notes: a line in `Features/Annual Report Extraction Panel.md`.

## Not changed
- The backend: all the data is already in the existing endpoint's response.
- The long list of blocks under the table stays as it is, including Themes and Highlights.
  Say if they should go too.

## Ripple effect
- Only this section changes. No other page uses this component.
- Example: SABIC today shows Tone ✓, Dashboard data ✓/✗ (whatever was read), Previous outline ✗ and
  Suggested departments ✗. Clicking "Previous outline" shows "No sections were created from this report."

## Change (same day): popup fix + only the table
- The shared `ui/dialog` sits at z-index 50, under the app shell, so the popup never showed. It is replaced by the
  app's own modal shell (fixed, z-index 1400, Escape and click-outside close), the same as ApproveConfirmDialog.
- The whole column (name + icon) is the click target.
- The long list of blocks under the table is removed. Only the table stays, and the details live in the popups.
  The now-unused Block, Themes and Highlights code is deleted.
