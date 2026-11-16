# Upload Previous Reports: 4 extraction chips on the latest report's row

**Repo:** Centrion_Frontend only, branch `pre-staging`. No backend change, no DB change, no endpoint change.
**Canonical copy:** on approval, copied to `Centrion_Frontend/.claude/plans/upload-list-extraction-chips.md`.

## Context
Your team lead wants the "Your Uploaded Reports" list to show what was pulled out of a report, right on the
file's row, as 4 categories:
1. **Contents**
2. **Departments**
3. **ESG**
4. **General info**: everything else (reading the file, tone, themes, highlights, company profile, revenue,
   net profit, assistant search index).

Each category shows a green tick, a red cross or a grey mark. Clicking one opens a popup with the details.
Your decision (2026-11-15): show the chips **only on the row of the latest report** (the file the last run
read). Older rows stay as they are, because results are only kept for the latest run.

## Where the data comes from (nothing new)
The page already loads `GET /companies/{id}/annual-report-extraction` and polls it every 2s while a run is
going (`useLiveExtraction`). Its `live` block has:
- `run.files`: which files the last run read
- `steps`: 11 rows, each with a state, a reason and a value

The chips are just those 11 steps grouped into 4 categories:

| Chip | Steps it is made from |
|---|---|
| Contents | `outline` |
| Departments | `departments` |
| ESG | `frameworks` |
| General info | `read`, `tone`, `themes`, `highlights`, `profile`, `revenue`, `net_profit`, `index` |

**Which row gets the chips:**
- the annual-report file in `live.run.files`
- an ESG file in the same run gets only the ESG chip
- a company onboarded before runs were recorded (`run` is null): the newest annual file

## How a chip looks
- **Green tick** = done. **Red cross** = failed. **Grey dash** = skipped or not run (e.g. "Upload a
  sustainability report…", or "your 2025 report is newer"). **Spinner** = still running (it updates live, because
  the data is polled).
- General info merges 8 steps:
  - spinner if any are running
  - red if any failed
  - green if any were done
  - grey otherwise
  - It also shows a small count like "6/8", so a red chip doesn't hide that most of it worked.
- Look: small rounded pill buttons in a row between the file name and the Download button, the same quiet
  style as the page. On a narrow screen they wrap under the file name. Each one is a real button, with a label
  read out by screen readers (e.g. "Contents: not extracted. Show details"), keyboard focus and a hover state.
- The card holding the latest report **opens by default** on this page, so the chips are visible without an
  extra click. Today every card starts closed.

## The popup (reuses the existing one)
Uses the same `SummaryPopup` the panel below already has (Esc and a click outside close it).
- **Contents:**
  - a status line (tick + "12 sections", or cross + the plain reason)
  - the sections list (`Sections`)
  - that file's contents page (`ContentsPage`)
- **Departments:** status line + suggested departments (`Departments`).
- **ESG:** status line + the frameworks found, or the reason none were.
- **General info:** the 8 rows using the existing `LiveStepsTable` (tick/cross + value, reason under any that
  failed).

## Files touched
| File | Change |
|---|---|
| `src/components/reports/extractionLive.ts` | New small pure helpers: `stepsForCategory`, `categoryState`, `latestReadDocumentIds`. |
| `src/components/reports/DocumentExtractionChips.tsx` (new) | The 4 chips + opening the popup for one. |
| `src/components/reports/AnnualReportExtraction.tsx` | Export `SummaryPopup`, `PopupPart`, `Sections`, `ContentsPage`, `Departments` (no change in how they work). New optional `onData` prop, called with each loaded result, so the page can share it with the list without a second request. |
| `src/components/docs/DocumentBankGroups.tsx` | `ReportCard` gets 2 optional props: `defaultExpanded` and `renderDocumentExtra(doc)`. `DocumentRow` draws that extra content when given. The Document Bank page (`/docs`) passes neither, so it doesn't change. |
| `src/components/reports/UploadedReportsList.tsx` | New optional `extraction` prop. Puts the chips on the latest report's row and opens that card. |
| `src/pages/UploadReportsPage.tsx` | Keeps the latest extraction result from `onData` and passes it to the list. Also reloads the list when a run **starts**, so a new file shows up straight away instead of only at the end (the gap in your screenshot). |
| tests (`src/test/…`, `src/pages/__tests__/…`) | Helpers, chip states, popup opens, `/docs` card unchanged. |
| `notes/…` | Feature note + Current Status (last step). |

## What could break (impact)
- **Document Bank page (`/docs`)** uses the same card. The new props are optional and default to today's
  behaviour, so nothing changes there. A test checks this.
- **The big "What we extracted" panel below** is unchanged and still shows the live 11-row table during a run.
  Example: during a run, the panel shows 7 of 11 done, and the latest row's chips show Contents spinning,
  General info green "6/8", and so on, both updating together because they use the same data.
- **No extra network requests:** the list reuses the panel's data.
- **Older files** get no chips. Your choice: only the latest run's results are stored.

## Verification
1. `npx vitest run` on the changed and new test files.
2. `npx tsc --noEmit -p tsconfig.app.json`.
3. Look at it in the real app on `localhost:8080/upload-reports` (testing cfg):
   - the chips on the Word file's row
   - each popup
   - a new upload: spinners, then ticks
   - `/docs` looks the same as before
