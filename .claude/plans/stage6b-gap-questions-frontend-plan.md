# Plan: Stage 6b — Gap Questions Page

## Context

Step 5 of the 7-step quarterly report wizard. The Coverage Map (step 4, already built) flags figures that moved materially but have no recorded driver ("Reason missing"). This page collects those missing reasons one question at a time: the operator reads a backend-generated question about a figure, types a short answer (or skips), and advances. Answers are saved as user-provided drivers via the existing `POST /driver` endpoint; skips write nothing (flagged later in the report, never invented).

The Coverage Map already navigates here via its "Answer gap questions →" buttons, and the stepper already routes step 5 to `/quarterly-report/:reportId/gaps` — but the route isn't registered and the page doesn't exist yet.

---

## What changes

| # | File | Change |
|---|------|--------|
| 1 | `src/types/quarterly.ts` | Add `GapItem` + `GapsResponse` types |
| 2 | `src/lib/api.ts` | Add `quarterlyReports.getGaps()` (reuse existing `addDriver()`) |
| 3 | `src/App.tsx` | Register route `/quarterly-report/:reportId/gaps` |
| 4 | `src/pages/quarterly/GapQuestionsPage.tsx` | **New file** — the page |

No change needed to `AppLayout` (the `/quarterly-report` prefix already resolves to "Quarterly Report") or the stepper (step 5 route already wired).

---

## 1. Types (`src/types/quarterly.ts`)

Append, matching the backend JSON in the spec. `change_display` is an **optional** field — the concrete JSON only ships `change_pct` (number), but §5/§6 warn units vary (pp, mmbbl/d). Render `change_display` if the backend provides it, else fall back to `change_pct`%. The unit nuance is also already baked into the verbatim `question` text.

```ts
export interface GapItem {
  figure_id: string;
  code: string;
  metric: string;
  label: string;
  statement: string;
  current_value: number;
  current_display: string;
  prior_value: number | null;
  prior_display: string | null;
  change_pct: number | null;
  change_direction: "up" | "down" | null;
  change_display?: string | null; // optional pre-formatted change w/ unit
  question: string;
  placeholder: string;
  answered: boolean;
  current_answer: string | null;
}

export interface GapsResponse {
  report_id: string;
  company_id: string;
  period_label: string;
  prior_period_label: string;
  total_gaps: number;
  answered_count: number;
  gaps: GapItem[];
}
```

---

## 2. API (`src/lib/api.ts`)

Add to the existing `quarterlyReports` namespace (alongside `getCoverage` and `addDriver`). Import `GapsResponse` from `@/types/quarterly`.

```ts
getGaps: (companyId: string, reportId: string) =>
  request<GapsResponse>(
    `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/gaps`,
  ),
```

`addDriver(companyId, reportId, figureId, { text, source: "user_provided" })` already exists and matches the `POST /driver` contract — reuse as-is.

---

## 3. Route (`src/App.tsx`)

Add after the existing coverage route:

```tsx
import GapQuestionsPage from "./pages/quarterly/GapQuestionsPage";

<Route path="/quarterly-report/:reportId/gaps" element={<GapQuestionsPage />} />
```

---

## 4. Page (`src/pages/quarterly/GapQuestionsPage.tsx`)

Follows the same conventions as `CoverageMapPage.tsx`: `useParams` for `reportId`, `useAuth()` for `companyId`, the `useState` + `useEffect` + cancellation-flag fetch pattern, `QuarterlyReportStepper activeStep={5}`, and the app palette (`#4040C8` indigo, `DM Mono` for code/figures, `.skel`/`.card`/`.bp`/`.bs` classes). The spec's literal violet/Fraunces/JetBrains tokens are not in this app — match the established CoverageMapPage adaptation.

### Local state
```ts
interface GapState extends GapItem {
  answer: string;     // controlled textarea value (seeded from current_answer)
  skipped: boolean;   // local-only: visited + advanced without saving
}
```
- `gaps: GapState[]` — working copy seeded from the fetch (`answer = current_answer ?? ''`)
- `currentIndex: number` — initialised to first unanswered gap (or 0)
- `loading`, `error`, `retryKey` — initial fetch
- `saving: boolean`, `saveError: string | null` — per-save state for the active gap
- Derived: `answeredCount = gaps.filter(g => g.answered).length`; `total = gaps.length`

### Layout (top → bottom)
- **Stepper**: `<QuarterlyReportStepper activeStep={5} reportId={reportId} />`
- **Header**: H1 "Targeted questions" + subtitle "We only ask where a reason was missing. Short, specific answers — no broad surveys."
- **Two-column body** (CSS grid, fixed-width left rail ~260px, flexible right card):

  **LEFT rail** (`.card`):
  - Header row: "GAPS" + `{answeredCount}/{total}`
  - Vertical list — each row: `[n]` badge + short `label` (truncated) + colored change (`change_display` or `${change_pct}%`, green ▲ / red ▼)
  - Current item: indigo tint + ring. Answered: green check replaces the number. Skipped: number, dimmed. Click → `setCurrentIndex(i)` (preserves any typed draft in local state; no auto-POST, no prompt — keeps writes explicit per §6).

  **RIGHT card** (`.card`), driven by `gaps[currentIndex]`:
  - Top row: `• {statement}` pill (left) · "Question {currentIndex+1} of {total}" + `{code}` mono (right)
  - Figure block (grey panel): `{label}`, then big `{current_display}` (DM Mono) + colored change + "vs {prior_display} in {prior_period_label}" (omit the "vs" clause when `prior_display` is null)
  - Question row: ✦ icon chip + verbatim `{question}`
  - Answer `<textarea>` bound to `gaps[currentIndex].answer`, `placeholder={gap.placeholder}`, `onKeyDown` → ⌘/Ctrl+Enter triggers Save
  - Actions row: "Skip for now" (quiet text link, left) · "⌘+Enter to save & continue" hint · `[Save & next →]` (`.bp`, shows spinner while `saving`, disabled when answer is empty/whitespace)
  - On `saveError`: inline red message + Retry; retain text; do not advance
- **Footnote**: "ⓘ We never invent a reason. Anything you skip is flagged in the report rather than filled in."
- **Footer bar** (sticky, same pattern as CoverageMapPage): `[← Back to coverage]` (→ `/quarterly-report/:reportId/coverage`) · "{answeredCount} of {total} answered" · `[Continue with {answeredCount} answered →]` (→ `/quarterly-report/:reportId/preview`). When all answered, emphasize as "Continue →".

### Behaviour
- **Save & next**: `addDriver(companyId, reportId, gap.figure_id, { text: gap.answer.trim(), source: 'user_provided' })`. On success: set `answered=true`, `skipped=false`, keep `answer`; advance via `goToNextUnanswered(currentIndex)`. On error: set `saveError`, stay put, keep text.
- **Skip for now**: no POST; mark `skipped=true` (leave `answered=false`); advance via `goToNext(currentIndex)`.
- `goToNextUnanswered(i)` → next index `> i` with `!answered`; if none, fall back to next index, else stay.
- `goToNext(i)` → `min(i+1, total-1)`.
- **Re-opening an answered gap**: textarea shows saved `answer`; re-saving POSTs again (backend replaces).

### States
- **Loading**: skeleton rail rows + skeleton card (reuse `.skel` blocks like CoverageMapPage's `LoadingState`).
- **Error (initial fetch)**: inline banner + Retry (`setRetryKey(k=>k+1)`).
- **No gaps (`total_gaps === 0`)**: centered "No missing reasons — every material figure already has one ✓." + "Continue to preview →" CTA. No rail/card.
- **All answered**: rail fully checked; footer CTA emphasized.

---

## Verification

1. From Coverage Map, click "Answer gap questions →" → lands on `/quarterly-report/:id/gaps`; stepper shows steps 1–4 done (green), step 5 active.
2. Rail `{total}` equals the Coverage "Reason missing" count for the same report.
3. Type an answer + Save & next (and ⌘/Ctrl+Enter) → one `POST /driver` fires, gap gets a green check in the rail, view advances to the next unanswered gap, answered counter increments.
4. Re-open an answered gap (rail click) → saved text shown; re-saving replaces without duplicating.
5. Skip for now → no network call (verify in devtools), gap stays unanswered, view advances.
6. Change badges render the backend unit (%, pp, mmbbl/d) — not all forced to %; down = red ▼, up = green ▲.
7. "Continue" is always enabled; label reflects the live answered count; routes toward Preview.
8. Save error path: kill the network, Save → inline error, text retained, no advance; Retry works once network restored.
9. Empty case: a report with 0 gaps shows the done state + Continue CTA.
10. `npx tsc --noEmit` is clean.
