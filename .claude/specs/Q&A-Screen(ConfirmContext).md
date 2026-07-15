# Part 2 — FRONTEND — Q/A Screen (Confirm Context)

## Overview
A "Confirm context" screen shown after the setup form + document upload, before the
Outline screen. Two question cards: **company type** (single-select) and **executive
voices** (multi-select). Saves via the context PATCH endpoint, then navigates to the
Outline. Matches the existing card-with-pills style.

## Depends On
- Backend Part 2 endpoints:
  - `PATCH /api/v1/reports/{companyId}/quarterly/{reportId}/context`
  - `GET  /api/v1/reports/{companyId}/quarterly/{reportId}/context`
- Existing API client pattern in `src/lib/api.ts` (`quarterlyReports.*`).
- Existing quarterly stepper / navigation.

## Files to Create
- `src/pages/quarterly/ConfirmContextPage.tsx` — the screen.
- (types) extend `src/types/quarterly.ts` with the context shape.

## Files to Change
- `src/lib/api.ts` — add `quarterlyReports.getContext()` and `saveContext()`.
- `src/App.tsx` — route for the confirm-context step (between setup and outline).

## API client additions (`src/lib/api.ts`)
```ts
getContext(companyId, reportId):
  GET .../quarterly/{reportId}/context
  → { company_type: string|null, voices: string[] }

saveContext(companyId, reportId, { company_type, voices }):
  PATCH .../quarterly/{reportId}/context
  → { report_id, generation_config }
```

## Types (`src/types/quarterly.ts`)
```ts
type CompanyType = 'bank' | 'investment' | 'energy' | 'telecom';
type Voice = 'ceo' | 'chairman' | 'cfo';
interface QuarterlyContext { company_type: CompanyType | null; voices: Voice[]; }
```

## Screen layout
Header: step label "CONFIRM CONTEXT". Two numbered cards, existing pill style.
Accent `#4040C8`.

### Card 1 — "What kind of company is this report for?"
Helper: "Sets which sections are required — banks vs non-banks differ."
Single-select pills (one active):
| Label | value |
|---|---|
| Bank / Financial | bank |
| Investment / Capital Markets | investment |
| Energy / Industrial | energy |
| Telecom / Tech | telecom |
Optional "DETECTED" badge if a detected value pre-filled it.

### Card 2 — "Which executive voices will the report carry?"
Helper: "CEO statement is always included; add the others if your report uses them."
Pills (multi-select):
| Label | value | behavior |
|---|---|---|
| CEO statement · always | ceo | shown active + locked (can't untoggle), muted style |
| Chairman statement | chairman | toggle |
| CFO statement | cfo | toggle |

## Behavior
- On mount: call `getContext`; pre-select `company_type` and `voices`
  (default `voices=['ceo']`, company_type unselected).
- Local state holds selections; no autosave.
- Footer: **Back** (to setup) and **Save & continue →**.
  - `Save & continue` disabled until `company_type` is chosen.
  - On click: `saveContext({ company_type, voices })` → on success navigate to the
    Outline screen. Show inline error toast on failure (reuse existing toast).
- `ceo` is always included in the payload even though its pill is locked on.

## Integration test (with backend)
1. Reach the screen for a new quarterly report.
2. Pick "Bank", toggle "CFO" on. Save & continue.
3. Backend `generation_config` shows `company_type:'bank'`, `voices:['ceo','cfo']`.
4. Navigate back into the screen → selections are pre-filled from GET.
5. On the Outline screen (which reads the `quarterly_sections` table), the 3 bank
   sections (asset_quality, capital_adequacy, liquidity_metrics) + cfo_statement are
   pre-included; chairman_statement and capital_gearing (non-bank) are NOT.
6. Switch company type to "Energy": bank sections drop, capital_gearing appears.

## Definition of Done
- Two-card screen renders in the existing style.
- Company type required to continue; CEO locked-on; Chairman/CFO toggle.
- Saves to backend and pre-fills on revisit.
- Navigates to Outline on success.