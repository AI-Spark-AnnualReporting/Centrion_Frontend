# Quarterly Report — Full Feature Documentation

This document describes **everything** currently implemented for the Quarterly
Report feature in the Centrion frontend: the end-to-end flow, every page, every
component, the data model, and every API endpoint the frontend talks to.

Quarterly is a **document-first** report: the operator uploads financial
statements, an AI pipeline extracts the figures and their "drivers" (the stated
reasons a number moved), the operator fills any gaps, and an AI agent composes a
narrative report that can be edited inline, refined by chat, and exported to
PDF/DOCX.

---

## 1. Where it lives / how you get to it

- **Entry point:** the **Reports** page (`src/pages/ReportsPage.tsx`). Quarterly
  is surfaced as a **sidebar child of Reports**, not an in-page tab. The view is
  **route-driven**:
  - `/reports` → ESG Validator view
  - `/reports/quarterly` → Quarterly Reports view
- The active view is computed from the URL:
  `location.pathname.startsWith('/reports/quarterly')` → `'quarterly'` else `'esg'`.
- On the quarterly view, `ReportsPage` renders:
  - the **`QuarterlyReportForm`** (generate/upload card), and
  - a grid of existing quarterly report cards (each shows live driver-coverage %
    and a "Continue this quarterly report" action → jumps to that report's
    coverage map).
- A report is treated as quarterly via `isQuarterlyReport(r)` — currently keyed
  on the report title containing `"quarterly"`.

### Routes (`src/App.tsx`)
All inside `ProtectedRoute` + `AppLayout` (main sidebar/topbar shell):

| Route | Page component | Stepper step |
|---|---|---|
| `/reports/quarterly` | `ReportsPage` (quarterly view) | 1–2 (Period + Documents form) |
| `/reports/processing` | `ProcessingPage` | 3 (Extraction) |
| `/quarterly-report/:reportId/coverage` | `CoverageMapPage` | 4 (Coverage) |
| `/quarterly-report/:reportId/gaps` | `GapQuestionsPage` | 5 (Gaps) |
| `/quarterly-report/:reportId/preview` | `QuarterlyPreviewPage` | 6 (Preview) |

---

## 2. The 6-step flow (the stepper)

`src/components/quarterly/QuarterlyReportStepper.tsx` renders a **display-only**
(non-interactive) progress bar shown at the top of the Coverage, Gaps, and
Preview pages. Steps:

1. **Period**
2. **Documents**
3. **Extraction**
4. **Coverage**
5. **Gaps**
6. **Preview**

Each step is `done` (green check), `active` (accent-filled circle), or
`inactive` (muted), with connector lines that turn green once passed. `activeStep`
is passed 1-based by each page (Coverage=4, Gaps=5, Preview=6).

Accent color throughout the feature is `#4040C8` (indigo); green `#10B981`;
amber `#D97706` for "needs attention".

---

## 3. Steps 1–2 — Generate / Upload form

**File:** `src/components/reports/QuarterlyReportForm.tsx`

A collapsible card ("Generate Quarterly Report", open by default) that mirrors
the ESG "Validate Report" card. It handles three branches (see §3.5).

### 3.1 Report Language
- Toggle between **English** (default) and **العربية (Arabic)**.
- The app UI stays English/LTR; the language **only** drives the backend
  narrative, the gap questions, and the RTL export.
- Sent as `content_language` to the generate endpoint.

### 3.2 Reporting period (year + quarter)
- **Reporting Year** dropdown mirrors the ESG flow:
  - Lists existing quarterly reports (so you can re-open/add to one), plus a
    `+ Add new…` sentinel.
  - Picking `+ Add new…` reveals a **year picker** (current year ±10, newest
    first).
  - If there are **no** existing reports yet, it jumps straight to the year
    picker.
- **Quarter** selector: `Q1 / Q2 / Q3 / Q4`. Hidden when an existing report is
  selected.
- Selected new report shows a "New report" chip; selected existing report shows
  an "Existing" chip + an "×" to change it.

### 3.3 Report Areas (required for new reports)
- Cards are loaded **from the API** (`getQuarterlyReportAreas`) — the source of
  truth. The frontend does **not** hardcode the list.
- Each card = `{ code, title, metric_count, metrics[] }`. The frontend joins a
  local `AREA_DESCRIPTIONS` map (gray subtitle copy) by code:
  - `highlights` — "Executive summary of the quarter's results and narrative."
  - `income_review` — "Revenue, costs, operating & net income performance."
  - `balance_sheet_review` — "Assets, liabilities, equity and liquidity position."
  - Codes without an entry render no subtitle.
- Cards show a **checkbox** (select the area for generation) and are **clickable**
  to open a **metrics popup** (a modal listing every metric in the area as pills,
  humanised from `snake_case`). Escape closes it.
- "Select all / Clear all" toggle.
- Selected codes are auto-pruned if the API stops returning them (keeps the
  generate payload in sync).

### 3.4 Source Documents (upload)
- Accepted types: **`.pdf, .docx, .xlsx, .csv`**. Max **5 documents** per report.
- Drag-and-drop or click to browse; multiple files; de-duped by `name:size`.
- File-cap enforcement with a modal warning ("File limit reached"): for a **new**
  report it keeps only the first 5; for **add-to-existing** it computes remaining
  slots as `5 − existingDocCount`.
- **Per-file language check (upload-time):**
  - Each new file is sent to `checkLanguage(file, language)`.
  - Status per file: `checking` (⋯) / `ok` (✓ green) / `bad` (⚠ red "Wrong
    language").
  - Files are **re-checked** whenever the language toggle changes.
  - **Fail-open:** a network/check error resolves the file to `ok`; the real
    backstop is server-side at submit.
  - Stale results (language toggled mid-flight) are dropped via a `languageRef`
    guard.
  - A wrong-language file shows a red banner and **blocks Generate**.

### 3.5 Submit — the three branches (`triggerGenerate`)
- **Branch A — open existing report (`isOpenMode`)**: navigate straight to
  `/quarterly-report/:id/coverage`. *(Currently `isOpenMode` is hardwired
  `false`; opening an existing report is done from the report cards on
  ReportsPage instead.)*
- **Branch B — upload new documents to an existing report (`isUploadMode`)**:
  calls `reports.addDocuments(companyId, reportId, { files })`, then navigates to
  `/reports/processing` with a `ProcessingPageState` (`reportType: 'quarterly'`).
- **Branch C — brand-new report**: calls
  `reports.generateQuarterly(companyId, { files, year, quarter, areas, content_language })`,
  then navigates to `/reports/processing` with the returned pipeline handle
  (`runId`, `pollUrl`, `reportId`, `estimatedDurationSeconds`, period label).

### 3.6 Guardrails & UX niceties
- `canGenerate` requires: a company, not already submitting, and (for a new
  report) a year + at least one area + at least one file + no language block.
- A `disabledReason` tooltip explains exactly what's missing.
- **Request-id guard** (`genRequestIdRef`) ignores stale responses if the user
  double-submits.
- **Error toast** (top-right, auto-dismiss 5s, countdown bar) parses the API
  error body (`detail` string / validation array / `{error}` object).
- File-cap warning modal auto-dismisses after 3s.

---

## 4. Step 3 — Extraction (Processing)

**File:** `src/pages/ProcessingPage.tsx` +
`src/components/reports/QuarterlyGeneratingScreen.tsx`

- After submit, the app is on `/reports/processing`, driven by
  `ProcessingPageState` (`reportType === 'quarterly'`).
- The **`QuarterlyGeneratingScreen`** renders a hero with a circular progress
  ring plus a 4-stage checklist mirroring the backend worker stages:
  1. **Parsing documents** — "Reading and structuring source files"
  2. **Extracting figures** — "Identifying numbers, units and periods"
  3. **Linking drivers** — "Matching each figure to its stated reason"
  4. **Loading comparatives** — "Aligning YoY and 9-month YTD baselines"
- Progress (`computeProgress`) is derived from **real backend node states**
  (completed + 0.3×running / expected), not a fake timer, capped at 99% until
  complete.
- **Optional stats tiles** render only once the backend provides counts
  (never fabricated): `figures_extracted[/total]`, `drivers_linked[/total]`,
  `comparatives_matched[/total]`.
- Phases: `running` / `completed` / `failed` / `timeout`.
  - `failed` → "Extraction failed" card (Try Again / Back to Reports).
  - `timeout` → "Taking longer than expected" card (Keep waiting / Back).
  - "Run in background" button lets the operator leave.
- **On completion** (`ProcessingPage`): for `reportType === 'quarterly'` it
  fetches coverage and navigates to `/quarterly-report/:id/coverage` (handing the
  freshly-fetched coverage via location state so the page renders without a
  second GET). On coverage-fetch error it shows the failure card.

---

## 5. Step 4 — Coverage Map

**File:** `src/pages/quarterly/CoverageMapPage.tsx`

The "what the AI found in your documents" screen. Loads
`quarterlyReports.getCoverage(companyId, reportId)`.

### 5.1 Summary
- Three **summary cards**: **Figures extracted** (+ "Across N documents" if
  present), **Reasons linked** (+ coverage %), **Reason missing** (highlighted
  amber when > 0, sub "Needs input").
- A **Driver coverage bar**: green = reasons found, yellow = reasons missing,
  with `driver_coverage_pct` and the found/missing legend.

### 5.2 Two view modes (toggle top-right)
- **Overview** — a single filterable table:
  - Filter tabs: **All figures / Reason missing / Reason found** (each with a
    count).
  - **Search** by metric label.
  - The per-row status pill shows only in the "All" tab.
- **Gaps first** — split into two stacked sections:
  - **"Needs a reason"** (amber) with an "Answer gap questions →" button.
  - **"Reason found"** (green, "no action needed").
  - If nothing is missing: a green "All material figures already have a reason."

### 5.3 The metric table (`MetricTable`)
- Metrics are **sorted by code** and grouped: a metric header row (label +
  humanised statement) followed by one row **per value**.
- Columns: **VALUE / PAGE / REASON**.
  - **VALUE** cell (spans the value's evidence rows) shows the monospace figure
    display + a **DriverPill** ("Reason found"/"Reason missing"), with a colored
    left accent bar (green/amber) and row tint.
  - Each **found** value expands to one row **per driver**: driver text + a
    **SourceBadge** ("Extracted from document" green vs "User provided" indigo) +
    an italic verbatim **quote**, with the source **page**.
  - Each **missing** value expands to one row per source quote, or a single
    fallback: *"Reason not found in the source document(s)."*
- `CodeTag` colors metric codes by prefix (`IS`/`BS`/`CF`/`PL`).

### 5.4 Footer / navigation
- **Empty state** (`figures_extracted === 0`): "No figures were extracted" +
  Back to Reports.
- Footer bar (scrolls with page): **Back** to `/reports/quarterly`; a status line;
  and a primary CTA that adapts:
  - all covered → **"Continue to preview"** → `/quarterly-report/:id/preview`.
  - gaps remain → **"Answer N gap question(s)"** → `/quarterly-report/:id/gaps`.
- Retry button on load error.

---

## 6. Step 5 — Gap Questions

**File:** `src/pages/quarterly/GapQuestionsPage.tsx`

Targeted Q&A for figures that moved materially but had **no driver** in the
documents. Loads `quarterlyReports.getGaps(companyId, reportId)`.

### 6.1 Layout
- Two-column: a **left rail** (scrollable list of gaps) + a **right panel** (the
  current question).
- Rail items show: a numbered/checked badge (green check when answered),
  the metric label (bold when current), and the change % (`change_display` or
  computed). Skipped, non-current items dim to 55% opacity. Progress chip
  `answeredCount / total`.

### 6.2 The question card
- Statement pill (e.g. "income statement") + "Question X of N".
- **Figure block**: label, big monospace current value, a **ChangeBadge**
  (▲ green / ▼ red, unit-agnostic, uses `change_display`), and
  "vs {prior_display} in {prior_period_label}".
- The AI-authored **question** (with a ✦ badge) and a placeholder-hinted
  **textarea**.
- **Answer language enforcement**: the answer must be ≥70% in the report's
  content language (`isLanguageAcceptable` / `languageMismatchWarning` from
  `src/lib/lang`). Empty/short answers pass (grace); a wrong-language answer shows
  an amber warning and **blocks "Save & next"**.

### 6.3 Actions
- **Save & next** → `quarterlyReports.addDriver(companyId, reportId, figure_id,
  { text, source: 'user_provided' })`; marks the gap answered and auto-advances to
  the next unanswered gap.
- **⌘/Ctrl + Enter** saves.
- **Skip for now** — no POST; marks the gap skipped and advances.
- Footnote: *"We never invent a reason. Anything you skip is flagged in the
  report rather than filled in."*
- Textarea auto-focuses on each gap change; save errors shown inline; retry on
  fetch error.

### 6.4 States
- **No gaps** → success screen "No missing reasons…" + "Continue to preview →".
- Footer: **Back to coverage**; "N of M answered"; **Continue** (or "Continue
  with N answered") → preview.

---

## 7. Step 6 — Preview (compose, edit, chat, export)

**File:** `src/pages/quarterly/QuarterlyPreviewPage.tsx`
(+ `src/components/reports/ReportChatPanel.tsx`)

The AI-composed report. On entry it does a **cheap GET**
(`getPreview`); if `generated === false` it triggers a **synchronous
`generatePreview`** (POST, ~30–60s) and shows the generating animation.

### 7.1 Generating state
- Full-screen hero + progress ring with a **simulated** eased progress (there is
  no live feed for the synchronous compose) capped at 95% so it never "completes"
  before the payload lands. Four compose steps:
  1. **Reading the figures**
  2. **Matching drivers**
  3. **Composing the narrative**
  4. **Flagging the gaps**
- After 45s it adds "Still working — longer reports can take a little extra time."
- Copy switches to "Regenerating your report" when regenerating.

### 7.2 The document
- Header: serif title (`header.title`, e.g. *"aramco — Q3 2025 Quarterly
  Report"*), subtitle, and a rule.
- **Left rail (`SectionsRail`)**: numbered section nav (scrollspy-synced via
  `IntersectionObserver`), plus **driver tallies** — "Drivers from docs",
  "Drivers you added", "Flagged · no reason" — and the **word count**.
- **Sections** are either:
  - **Narrative** (`type: 'narrative'`): editable sentences, rendered as
    paragraphs or bullets (`display`).
  - **Tables** (`type: 'tables'`): read-only financial tables
    (Metric / Current / Prior / Change). Prior & Change columns are **dropped**
    when no row has data for them. Change cells: ▲ green / ▼ red / — muted.

### 7.3 Inline sentence editing
- **Click any sentence** to edit it in place (`SentenceView`).
- Auto-sizing textarea; **Blur or ⌘+Enter to save · Esc to cancel**.
- **Optimistic save** → `quarterlyReports.updatePreviewSentence({ section_id,
  sentence_id, text })`; reverts on failure. 422 → "A sentence can't be empty."
- On success it updates the sentence, marks it `edited` (shows "· edited"), and
  refreshes `word_count`.
- Each sentence can show a **source chip** (`source_label`, tooltip = the metric
  `figure_codes`).

### 7.4 Chat agent (`ReportChatPanel`)
- Always-visible panel at the bottom of the preview.
- Suggestion chips: **"Make it concise" / "More formal tone" / "Expand detail"**.
- Placeholder: *"Try: 'make this more concise' or 'add the cost-reduction
  figure'"*. Enter to send.
- Streams via `quarterlyReports.streamChatMessage(...)` — a **Server-Sent-Events
  (SSE)** POST (`data: {…}` frames) parsed for event types `token / tool_start /
  tool_end / error / done`. While a tool runs it shows "Editing report…"; while
  streaming, "Processing…".
- On **`done`** it calls `onDone` → the page **re-fetches** the preview,
  **diffs section fingerprints**, **highlights** changed sections (a 2.5s flash)
  and **scrolls** to the first change.
- Supports **abort** (AbortController). History endpoints exist
  (`getChatHistory`, `clearChatHistory`) though the panel itself is stateless per
  send.

### 7.5 Regenerate / Download / Failure
- **Regenerate** (footer) → `window.confirm` warns inline edits will be discarded,
  then re-runs `generatePreview` (overwrites server-side).
- **Download** dropdown → **PDF** or **Word (.docx)** via
  `quarterlyReports.downloadExport(companyId, reportId, format, title)` — a
  binary blob download (auth'd fetch). Errors surface in a tooltip.
- **Failed** phase → "We couldn't compose the report" (Back to gaps / Try again).
- Footer also reminds: "Click any sentence to edit inline".

---

## 8. Data model — `src/types/quarterly.ts`

### Coverage
- **`CoverageDriver`** `{ text, quote|null, page|null, source: 'extracted' |
  'user_provided' }`
- **`CoverageSource`** `{ page|null, quote|null }`
- **`CoverageValue`** `{ figure_id, display, driver_status: 'missing'|'found',
  sources[], drivers[] }`
- **`CoverageMetric`** `{ metric, label, statement, code, values[] }`
- **`CoverageSummary`** `{ figures_extracted, documents_count?, reason_linked,
  reason_missing, driver_coverage_pct }`
- **`QuarterlyCoverageResponse`** `{ report_id, company_id, period_label?,
  summary, metrics[] }`

### Gaps
- **`GapItem`** `{ figure_id, code, metric, label, statement, current_value,
  current_display, prior_value|null, prior_display|null, change_pct|null,
  change_direction: 'up'|'down'|null, change_display?, question, placeholder,
  answered, current_answer|null }`
- **`GapsResponse`** `{ report_id, company_id, content_language?, period_label,
  prior_period_label, total_gaps, answered_count, gaps[] }`

### Preview
- **`PreviewHeader`** `{ company_name, title, period_label, prior_period_label?,
  subtitle, prepared_on }`
- **`PreviewDriverSummary`** `{ from_docs, user_added, flagged_no_reason }`
- **`PreviewSentence`** `{ id, text, figure_codes[], source_label|null, edited }`
- **`PreviewTableRow`** `{ code, label, current_display, prior_display|null,
  change_pct|null, change_direction: 'up'|'down'|'flat'|null }`
- **`PreviewTable`** `{ statement, title, rows[] }`
- **`PreviewNarrativeSection`** `{ id, number, title, type:'narrative',
  display?: 'bullets'|'prose', sentences[] }`
- **`PreviewTablesSection`** `{ id, number, title, type:'tables', tables[] }`
- **`QuarterlyPreviewReport`** `{ report_id, company_id, generated:true,
  word_count, header, driver_summary, sections[] }`
- **`PreviewNotGenerated`** `{ generated:false, sections:null }` — GET
  discriminates on `generated`.
- **`PreviewSentenceUpdateResponse`** `{ sentence, word_count }`

### Chat
- **`ChatMessage`** `{ role:'user'|'assistant', content, created_at }`
- **`ChatHistoryResponse`** `{ conversation_id, report_id, messages[] }`
- **`ChatStreamEvent`** `{ type:'token'|'tool_start'|'tool_end'|'error'|'done',
  content?, name?, args?, message? }`

---

## 9. API surface (`src/lib/api.ts`)

### On the `reports` object (generation / setup)
| Method | Endpoint | Notes |
|---|---|---|
| `getQuarterlyReportAreas()` | `GET /api/v1/reports/quarterly/report-areas` | Source of truth for area cards. |
| `generateQuarterly(companyId, body)` | `POST /api/v1/reports/{companyId}/quarterly/generate` | multipart: files, year, quarter, areas[], content_language. Async → pipeline handle. |
| `addDocuments(companyId, reportId, {files})` | `POST /api/v1/reports/{companyId}/{reportId}/documents` | Add docs to an existing report. Async. |
| `checkLanguage(file, contentLanguage)` | `POST /api/v1/reports/quarterly/check-language` | Upload-time per-file language detection (fail-open). |
| `getCoverage(...)` (generic) | `GET /api/v1/reports/{companyId}/{reportId}/coverage` | Used by ProcessingPage on completion. |

### On the `quarterlyReports` object
| Method | Endpoint |
|---|---|
| `getCoverage(companyId, reportId)` | `GET /api/v1/reports/{companyId}/quarterly/{reportId}/coverage` |
| `getGaps(companyId, reportId)` | `GET .../quarterly/{reportId}/gaps` |
| `getFigures(companyId, reportId, opts)` | `GET .../quarterly/{reportId}/figures` (raw financial rows; filter by statement_type/document_id/fields) |
| `addDriver(companyId, reportId, figureId, {text, source})` | `POST .../quarterly/{reportId}/figures/{figureId}/driver` |
| `generatePreview(companyId, reportId)` | `POST .../quarterly/{reportId}/preview/generate` (synchronous; overwrites) |
| `getPreview(companyId, reportId)` | `GET .../quarterly/{reportId}/preview` (returns `generated:false` if never composed) |
| `updatePreviewSentence(companyId, reportId, body)` | `PATCH .../quarterly/{reportId}/preview/sentence` |
| `downloadExport(companyId, reportId, format, filename?)` | `GET .../quarterly/{reportId}/export?format=pdf\|docx` (binary blob) |
| `getChatHistory(companyId, reportId)` | `GET .../quarterly/{reportId}/chat/history` |
| `streamChatMessage(companyId, reportId, message, onEvent, signal)` | `POST .../quarterly/{reportId}/chat` (SSE stream) |
| `clearChatHistory(companyId, reportId)` | `DELETE .../quarterly/{reportId}/chat/history` |

---

## 10. Supporting files (quick reference)

| File | Role |
|---|---|
| `src/App.tsx` | Route definitions for coverage/gaps/preview. |
| `src/pages/ReportsPage.tsx` | Quarterly entry view, existing-report cards, live coverage %. |
| `src/components/reports/QuarterlyReportForm.tsx` | Generate/upload form (steps 1–2). |
| `src/pages/ProcessingPage.tsx` | Routes the extraction UI + completion handoff to coverage. |
| `src/components/reports/QuarterlyGeneratingScreen.tsx` | Extraction progress screen (step 3). |
| `src/pages/quarterly/CoverageMapPage.tsx` | Coverage map (step 4). |
| `src/pages/quarterly/GapQuestionsPage.tsx` | Gap Q&A (step 5). |
| `src/pages/quarterly/QuarterlyPreviewPage.tsx` | Report preview + edit + export (step 6). |
| `src/components/reports/ReportChatPanel.tsx` | AI chat refinement panel (step 6). |
| `src/components/quarterly/QuarterlyReportStepper.tsx` | 6-step progress header. |
| `src/types/quarterly.ts` | All TypeScript types for the feature. |
| `src/lib/api.ts` | `reports.*` and `quarterlyReports.*` API clients. |
| `src/lib/lang.ts` | Answer/document language acceptability checks. |

---

## 11. End-to-end summary (the happy path)

1. Operator opens **Reports → Quarterly**, picks language, year, quarter, and one
   or more **report areas**, uploads up to 5 financial documents (language-checked
   as they're added), and clicks **Generate Report**.
2. Backend kicks off an **async extraction pipeline**; the operator watches the
   **Extraction** screen (parse → extract → link drivers → load comparatives).
3. On completion the app opens the **Coverage Map**: every extracted figure with
   its located driver (quote + page) or a **"reason missing"** flag, plus overall
   driver-coverage %.
4. Operator answers the **Gap Questions** for any missing reasons (answers become
   `user_provided` drivers; answers must match the report language; gaps can be
   skipped and are then flagged, never invented).
5. Operator continues to **Preview**, where an AI agent **composes** the full
   narrative report (sections + financial tables). They can **edit any sentence
   inline**, **chat** with the agent to refine tone/detail, **regenerate**, and
   **download as PDF or DOCX**.
