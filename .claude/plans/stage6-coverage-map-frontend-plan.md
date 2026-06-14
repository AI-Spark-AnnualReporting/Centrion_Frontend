# Implementation Plan: Stage 6 — Coverage Map Page

## Context

The quarterly report flow currently ends at a generic detail page (`/reports/:reportId`). The spec introduces a proper 7-step wizard UI where step 4 is the **Coverage Map** — an operator review screen showing what the AI extracted, which figures need a reason (gap), and which already have one. This is the human review gate before gap-filling and report generation.

The page is read-mostly: it fetches one payload on mount, renders summary cards + two tables, and links forward to the Gaps screen. The only mutation on this page is navigation.

---

## What changes and why

| # | File | Change |
|---|------|--------|
| 1 | `src/App.tsx` | Add route `/quarterly-report/:reportId/coverage` |
| 2 | `src/lib/api.ts` | Add `quarterlyReports.getCoverage()` for the new endpoint |
| 3 | `src/pages/ProcessingPage.tsx` | On quarterly completion → navigate to `/quarterly-report/:reportId/coverage` (not `/reports/:reportId`) |
| 4 | `src/components/layout/AppLayout.tsx` | Add page name entry for the new route |
| 5 | `src/types/quarterly.ts` | **New file** — TypeScript types for the Coverage Map API response |
| 6 | `src/components/quarterly/QuarterlyReportStepper.tsx` | **New file** — 7-step stepper component |
| 7 | `src/pages/quarterly/CoverageMapPage.tsx` | **New file** — the Coverage Map page |

---

## 1. Types (`src/types/quarterly.ts`)

```ts
export interface CoverageDriver {
  text: string;
  quote: string | null;
  page: number | null;
  source: "extracted" | "user_provided";
}

export interface CoverageFigure {
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
  driver_status: "missing" | "found";
  drivers: CoverageDriver[];
}

export interface CoverageSummary {
  figures_extracted: number;
  documents_count: number;
  reason_linked: number;
  reason_missing: number;
  driver_coverage_pct: number;
  comparatives_matched: number;
  comparatives_total: number;
  comparatives_missing_prior: number;
}

export interface QuarterlyCoverageResponse {
  report_id: string;
  company_id: string;
  period_label: string;
  prior_period_label: string;
  summary: CoverageSummary;
  needs_reason: CoverageFigure[];
  reason_found: CoverageFigure[];
}
```

---

## 2. API function (`src/lib/api.ts`)

Add a new exported namespace after the existing `reportsApi` block:

```ts
export const quarterlyReports = {
  getCoverage: (companyId: string, reportId: string) =>
    request<QuarterlyCoverageResponse>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/coverage`,
    ),
};
```

Import `QuarterlyCoverageResponse` from `@/types/quarterly`.

---

## 3. Route (`src/App.tsx`)

Add inside the `<AppLayout>` route block (after the existing `/reports/:reportId` route):

```tsx
import CoverageMapPage from "./pages/quarterly/CoverageMapPage";

<Route path="/quarterly-report/:reportId/coverage" element={<CoverageMapPage />} />
```

---

## 4. Page name (`src/components/layout/AppLayout.tsx`)

Add to `PAGE_NAMES`:

```ts
'/quarterly-report': 'Quarterly Report',
```

The `Topbar` derives its label from `PAGE_NAMES` by prefix matching — this covers all `/quarterly-report/*` paths.

---

## 5. ProcessingPage change (`src/pages/ProcessingPage.tsx`)

In the completion `useEffect` (around line 65), add a branch for quarterly:

```ts
// Quarterly → go straight to Coverage Map (it fetches its own data).
if (state.reportType === 'quarterly') {
  clearActivePipeline();
  navigate(`/quarterly-report/${resolvedReportId}/coverage`, { replace: true });
  return;
}
// ESG path unchanged — fetch coverage then navigate to /reports/:reportId
reportsApi.getCoverage<CoverageResponse>(...)...
```

This removes the redundant pre-fetch for quarterly (the Coverage Map page fetches on mount).

---

## 6. Stepper component (`src/components/quarterly/QuarterlyReportStepper.tsx`)

Seven steps: Period, Documents, Extraction, Coverage, Gaps, Preview, Export.

Props:
```ts
interface QuarterlyReportStepperProps {
  activeStep: number; // 1-based (4 for Coverage Map)
  reportId: string;
}
```

Rendering rules:
- Steps < activeStep: green checkmark, clickable (navigate to their route or `/reports` for steps 1-3)
- activeStep: filled circle (indigo), label bold
- Steps > activeStep: grey circle, not clickable (pointer-events: none, opacity 0.4)

Steps 1–3 navigate back to `/reports` (the form page, which is where Period/Documents/Extraction live in the current architecture). Steps 5–7 are future routes; render disabled until implemented.

Visual pattern: inline flex row, circles connected by thin lines, matching the registration `StepIndicator` pattern at `src/components/registration/StepIndicator.tsx`.

---

## 7. Coverage Map Page (`src/pages/quarterly/CoverageMapPage.tsx`)

### Data fetch
```ts
const { reportId } = useParams<{ reportId: string }>();
const { user } = useAuth();
const companyId = user?.company_id ?? null;
```

Fetch on mount — same `useState` + `useEffect` + cancellation flag pattern used throughout the app:

```ts
const [data, setData] = useState<QuarterlyCoverageResponse | null>(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  if (!companyId || !reportId) return;
  let cancelled = false;
  setLoading(true);
  quarterlyReports.getCoverage(companyId, reportId)
    .then(res => { if (!cancelled) setData(res); })
    .catch(err => { if (!cancelled) setError(err.message ?? 'Failed'); })
    .finally(() => { if (!cancelled) setLoading(false); });
  return () => { cancelled = true; };
}, [companyId, reportId]);
```

### States
| State | UI |
|---|---|
| Loading | `.skel` shimmer cards + table row placeholders |
| Error | Inline error banner with retry button (re-triggers the effect) |
| Empty (`figures_extracted === 0`) | Centred message + Back button |
| All covered (`needs_reason.length === 0`) | "Needs a reason" section shows ✓ done state; footer CTA changes to "Continue to preview →" |
| Normal | Full page |

### Layout sections (top to bottom)

**Stepper**: `<QuarterlyReportStepper activeStep={4} reportId={reportId} />`

**Header row**
- H1: "Coverage map" (Plus Jakarta Sans, 24px bold)
- Subtitle: `"What the AI found in your documents for {period_label}. Resolve missing reasons before generating."`
- Toggle: `[Overview | Gaps-first]` — two-segment button, client-side state only (`useState<'overview' | 'gaps-first'>`)

**Summary cards** (4-column horizontal grid, `.card` class):
1. Figures extracted — `summary.figures_extracted` / "across N documents"
2. Reason linked — `summary.reason_linked` / "{pct}% coverage"
3. Reason missing — `summary.reason_missing` / "need your input" — amber tint card
4. Comparatives matched — `{matched}/{total}` / "{missing_prior} missing prior-year"

**Driver coverage bar**
- Single horizontal `<div>` split into green (`reason_linked`) and amber (`reason_missing`) segments, using inline `width` percentages derived from `driver_coverage_pct`
- Legend line below: green dot "Reason found (N)" · amber dot "Reason missing (N)"

**"Needs a reason" section** (amber dot heading)
- Amber section header: "Needs a reason · {count}" + button "Answer gap questions →" (routes to `/quarterly-report/:reportId/gaps`)
- Caption text
- Table: CODE | METRIC | {period_label} | {prior_period_label} | CHANGE | DRIVER
- Rows from `data.needs_reason[]`
- DRIVER cell: amber pill "• Reason missing"
- Emphasized in `gaps-first` mode; the "Reason found" section is collapsed/hidden

**"Reason found" section** (green dot heading)
- Hidden when toggle is `gaps-first`
- Rows from `data.reason_found[]`
- DRIVER cell: green pill "• Reason found"

**Footer bar** (sticky bottom or below content)
- Left: `← Back` button (navigate to `/reports`)
- Centre: "⚑ {needs_count} figures need a reason before generating" (amber text)
- Right: "Answer {needs_count} gap questions →" button

### Table column rendering

| Column | Source | Style |
|---|---|---|
| CODE | `code` | DM Mono, indigo (#4040C8), right |
| METRIC | `label` + `statement` | label bold, statement small grey subtitle below |
| {period} | `current_display` | DM Mono, right-aligned |
| {prior} | `prior_display` or "—" | DM Mono, grey, right-aligned |
| CHANGE | `change_pct` + `change_direction` | "▲ +3.2%" green or "▼ -3.7%" red or "—" if null |
| DRIVER | `driver_status` | pill span: amber bg for missing, green bg for found |

Use Shadcn `<Table>` / `<TableHeader>` / `<TableBody>` / `<TableRow>` / `<TableCell>` from `src/components/ui/table.tsx`.

---

## Build order (matches spec §7)

1. Types file + API function
2. Route in App.tsx + page name in AppLayout.tsx
3. ProcessingPage navigation change (quarterly → `/quarterly-report/:reportId/coverage`)
4. Stepper component
5. `CoverageMapPage` shell: fetch + loading/error/empty states
6. Summary cards + driver coverage bar
7. "Needs a reason" table
8. "Reason found" table
9. Footer bar + navigation
10. Overview / Gaps-first toggle

---

## Verification

1. Start the dev server
2. Submit a quarterly report form — confirm `ProcessingPage` now redirects to `/quarterly-report/:reportId/coverage` instead of `/reports/:reportId`
3. Coverage Map page loads: summary cards match mock payload values; bar segments are proportional
4. `needs_reason` rows show amber pills; `reason_found` rows show green pills
5. Null `prior_value`/`change_pct` renders "—" — never a fabricated number
6. Toggle to "Gaps-first" hides the "Reason found" section; toggle back restores it (no network call)
7. "Answer gap questions →" (header + footer) navigates to `/quarterly-report/:reportId/gaps`
8. "← Back" navigates to `/reports`
9. Stepper shows steps 1–3 as completed (green), step 4 active (indigo), steps 5–7 greyed out
10. Loading skeletons appear before data resolves; error banner appears on API failure with retry
