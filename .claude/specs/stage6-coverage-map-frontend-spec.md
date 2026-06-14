# Spec — Stage 6: Coverage Map — FRONTEND

**Module:** Quarterly Report — Coverage Map page
**Status:** Draft for build
**Scope:** Frontend only. Consumes the Coverage Map backend (separate spec).
**Route:** `/quarterly-report/{report_id}/coverage` — step 4 of 7 (Period → Documents → Extraction → **Coverage** → Gaps → Preview → Export).

---

## 0. What this page is

The human review step between ingestion and generation. The operator sees what was extracted, which figures changed materially without a reason (driver), and which already have one — then proceeds to fill gaps before generating the report. **Read-mostly:** the only mutation (answering a gap) happens on the next screen; this page links to it.

Backend contract: `GET /api/v1/reports/{report_id}/coverage` returns the entire payload (summary + both lists) in one call. (Full shape in the backend spec §2.1.)

---

## 1. Layout (matches the two screenshots)

```
[ left nav: Centriton investor portal chrome — existing component ]

Top bar: "Quarterly Report · aramco · Coverage Map"        [user] [Log out]

Stepper:  Period ✓  Documents ✓  Extraction ✓  (4)Coverage ●  (5)Gaps  (6)Preview  (7)Export

H1  Coverage map                                   [ Overview | Gaps-first ] toggle
sub "What the AI found in your documents for {period_label}. Resolve missing reasons before generating."

Summary cards (4, horizontal):
  1. Figures extracted        {figures_extracted}      "across {documents_count} documents"
  2. Reason linked            {reason_linked}          "{driver_coverage_pct}% coverage"
  3. Reason missing  (amber)  {reason_missing}         "need your input"
  4. Comparatives matched     {matched}/{total}        "{missing_prior} missing prior-year"

Driver coverage bar:  {driver_coverage_pct}%
  green segment = reason_found count, amber = reason_missing count
  legend: ● Reason found ({n})   ● Reason missing ({n})

Section header (amber dot):  "Needs a reason · {count}"     [ Answer gap questions → ]
  caption "These figures changed materially but no driver was found in your documents. The AI will ask you about each."
  TABLE: CODE | METRIC (label + statement subtitle) | {period_label} | {prior_period_label} | CHANGE | DRIVER
  rows from needs_reason[]; DRIVER cell = amber pill "• Reason missing"

Section header (cyan dot):  "Reason found · {count}"
  caption "Drivers the AI located directly in the source documents."
  TABLE: same columns; DRIVER cell = green pill "• Reason found"
  rows from reason_found[]

Footer bar:  [← Back]   "⚑ {needs_count} figures need a reason before generating"   [ Answer {needs_count} gap questions → ]
```

---

## 2. Data flow

- **On mount:** call `GET /coverage`. Show skeleton/loading while fetching.
- Render cards, bar, and both tables from the single payload. No other calls.
- **Toggle Overview | Gaps-first:** pure client-side. Overview = both sections in order (Needs a reason first). Gaps-first = collapse/hide "Reason found", emphasize "Needs a reason". No refetch.
- **"Answer gap questions" (header + footer):** navigate to `/quarterly-report/{report_id}/gaps` (step 5).
- **Stepper:** completed steps (Period/Documents/Extraction) are navigable back; future steps (Gaps/Preview/Export) disabled until reached.
- **Row click (optional, defer if tight):** open a right drawer showing that figure's detail — verbatim_quote, source_page, normalization_log, drivers. Nice-to-have.

---

## 3. States

- **Loading:** skeleton cards + table placeholders.
- **Empty (no figures):** "No figures were extracted from these documents." with a Back action — likely an upstream extraction problem.
- **Comparatives absent:** if `prior_value`/`change_pct` are null on rows, render "—" in the prior and CHANGE columns; the "Comparatives matched" card reflects it. **Never fabricate a comparison.**
- **Error:** inline error with retry.
- **All covered (needs_reason empty):** "Needs a reason" section shows a done state ("All material figures have a reason ✓"); footer CTA becomes "Continue to preview →" / enables the next step.

---

## 4. Table column rendering

| column | source | rendering |
|---|---|---|
| CODE | `code` | mono font (JetBrains Mono), violet text |
| METRIC | `label` + `statement` | label bold; statement as small grey subtitle |
| {period} | `current_display` | mono; right-aligned |
| {prior} | `prior_display` or "—" | mono, grey; right-aligned |
| CHANGE | `change_pct` + `change_direction` | ▲ green if up, ▼ red if down, "—" if null |
| DRIVER | `driver_status` | pill: amber "• Reason missing" / green "• Reason found" |

---

## 5. Brand / visual

Spark brand, matching the existing investor-portal chrome in the screenshots:
- Violet `#3C0866`/`#3E0973` — stepper active, CODE text, primary buttons.
- Cyan `#5BC9E2` — "Reason found" accent, secondary highlights.
- Amber — "Reason missing" pills, the highlighted "Reason missing" card, the warning footer flag.
- Green `▲` / red `▼` for change direction.
- Fonts: Fraunces (H1/section headers), DM Sans (body/labels), JetBrains Mono (codes + figures).
- Cards: soft rounded, subtle border; the "Reason missing" card visually distinct (amber tint) to draw the eye.

---

## 6. Honest cautions (carry from design discussion)

- **Comparative columns depend on the comparison step having run.** Until it does, prior/change render "—". Don't show a fake comparison.
- **Material gating is backend-driven** — the page only lists figures the backend marked material in `needs_reason`. Don't client-side re-derive "needs a reason" from change %, or you'll diverge from the backend's threshold.
- **Codes come from the backend** — render as given; don't generate or reorder them.
- The "YoY + YTD" framing from earlier upload screens does **not** apply here — v1 is YoY only; this page shows one prior-period column, not YTD.

---

## 7. Build order

```
1. Page shell: left nav + top bar + stepper (step 4 active)
2. Fetch GET /coverage; loading + error + empty states
3. 4 summary cards + driver coverage bar from payload
4. "Needs a reason" table from needs_reason[]
5. "Reason found" table from reason_found[]
6. Footer bar + "Answer gap questions" navigation to /gaps
7. Overview | Gaps-first toggle (client-side)
8. (optional) row-click detail drawer
```


● GET /{company_id}/quarterly/{report_id}/coverage
  
  {
    "report_id": "uuid",
    "company_id": "uuid",
    "period_label": "Q3 2025",    "prior_period_label": "Q3 2024",
    "summary": {      "figures_extracted": 18,
      "documents_count": 4,
      "reason_linked": 9,
      "reason_missing": 9,
      "driver_coverage_pct": 50,
      "comparatives_matched": 17,
      "comparatives_total": 18,
      "comparatives_missing_prior": 1
    },
    "needs_reason": [
      {
        "figure_id": "uuid",
        "code": "IS-112",
        "metric": "income_before_tax",
        "label": "Income before income taxes",
        "statement": "income_statement",
        "current_value": 46300,
        "current_display": "SAR 46.3B",
        "prior_value": 48100,
        "prior_display": "SAR 48.1B",
        "change_pct": -3.74,
        "change_direction": "down",
        "driver_status": "missing",
        "drivers": []
      }
    ],
    "reason_found": [
      {
        "figure_id": "uuid",
        "code": "IS-101",
        "metric": "revenue",
        "label": "Total revenue",
        "statement": "income_statement",
        "current_value": 111200,
        "current_display": "SAR 111.2B",
        "prior_value": 114500,
        "prior_display": "SAR 114.5B",
        "change_pct": -2.88,
        "change_direction": "down",
        "driver_status": "found",
        "drivers": [
          {
            "text": "Lower crude prices and OPEC+ cuts",
            "quote": "Revenue declined driven by lower crude
  prices.",
            "page": 5,
            "source": "extracted"
          }
        ]
      }
    ]
  }

  ---
  POST
  /{company_id}/quarterly/{report_id}/figures/{figure_id}/driver

  Request body:
  {
    "text": "Lower crude prices and OPEC+ production cuts",
    "source": "user_provided"
  }

  Response:
  {
    "figure": {
      "figure_id": "uuid",
      "code": "IS-112",
      "metric": "income_before_tax",
      "label": "Income before income taxes",
      "statement": "income_statement",
      "current_value": 46300,
      "current_display": "SAR 46.3B",
      "prior_value": 48100,
      "prior_display": "SAR 48.1B",
      "change_pct": -3.74,
      "change_direction": "down",
      "driver_status": "found",
      "drivers": [
        {
          "text": "Lower crude prices and OPEC+ production cuts",
          "quote": null,
          "page": null,
          "source": "user_provided"
        }
      ]
    }
  }

  Key difference after POST: driver_status flips from "missing" →
  "found", and drivers contains the appended entry. Next GET will
  move this figure from needs_reason to reason_found.
## 8. Verification

- Cards match payload (`figures_extracted`, `reason_linked`, `reason_missing`, `comparatives_matched`).
- Bar % equals `driver_coverage_pct`; green/amber segments match the two counts.
- needs_reason rows show amber pills; reason_found rows show green pills.
- Prior/CHANGE render "—" when null; never a fabricated value.
- Toggle reorders client-side with no network call.
- "Answer gap questions" routes to the Gaps screen with the report_id.
- Renders correctly at the portal's standard widths; tables scroll/wrap gracefully on narrow.

## 9. Out of scope

- The Gaps screen (step 5) — separate.
- Preview/Export (steps 6–7).
- Editing/deleting figures.
- Writing drivers from this page (that's the Gaps screen via the shared POST endpoint).
