# Spec — Stage 6b: Gap Questions — FRONTEND

**Module:** Quarterly Report — Targeted Questions (Gaps)
**Status:** Draft for build
**Scope:** Frontend only. Consumes the Gaps backend (separate spec).
**Route:** `/quarterly-report/{report_id}/gaps` — step 5 of 7 (Period → Documents → Extraction → Coverage → **Gaps** → Preview → Export).

---

## 0. What this page is

A focused, one-question-at-a-time flow to collect the missing reasons the Coverage Map flagged. The operator reads a targeted question about a figure that moved, types a short answer (or skips), and advances. Answers become user-provided drivers; skips are left unexplained (and flagged later — never invented).

Backend contract: `GET /api/v1/reports/{report_id}/gaps` returns the ordered gap list with each question; `POST /api/v1/reports/{report_id}/figures/{figure_id}/driver` saves an answer. (Shapes in the backend spec.)

---

## 1. Layout (matches the screenshot)

```
Top bar: "Quarterly Report · aramco · Gap Questions"        [user] [Log out]
Stepper: Period ✓ Documents ✓ Extraction ✓ Coverage ✓ (5)Gaps ● (6)Preview (7)Export

H1  Targeted questions
sub "We only ask where a reason was missing. Short, specific answers — no broad surveys."

Two-column body:

  LEFT — gap list rail (fixed width):
    header "GAPS"                         {answered}/{total}
    vertical list of all gaps, each:
      [n]  {short label}            {change_pct, colored}
    - current item highlighted (violet tint, ring)
    - answered items show a check; skipped/unanswered show the number
    - click any item to jump to it

  RIGHT — active question card:
    top row:  • {statement} pill            "Question {i} of {total}"  + {code} (mono, right)
    figure block (grey panel):
       {label}
       {current_display}  {change_pct ▼/▲ colored}  "vs {prior_display} in {prior_period}"
    question row: [✦ icon]  {question text}
    answer textarea: placeholder {placeholder}
    actions row:  "Skip for now"      "⌘+Enter to save & continue"   [ Save & next → ]

footnote: "ⓘ We never invent a reason. Anything you skip is flagged in the report rather than filled in."

Footer bar: [← Back to coverage]   "{answered} of {total} answered"   [ Continue with {answered} answered → ]
```

---

## 2. Interaction flow

- **On mount:** `GET /gaps`. Render the left rail (all gaps) and the right card (first unanswered gap). If resuming, jump to first unanswered; pre-fill any `current_answer` for already-answered gaps.
- **Type + Save & next:** `POST /driver` with the textarea text → on success, mark the gap answered in the rail, advance to the next unanswered gap. Optimistic update is fine; reconcile on response.
- **⌘/Ctrl+Enter:** same as Save & next (keyboard shortcut shown in UI).
- **Skip for now:** advance to next gap **without** POSTing. The gap stays unanswered (no driver written). Visually mark as skipped in the rail.
- **Left-rail click:** jump directly to that gap (save current answer first if dirty, or prompt).
- **Editing an answered gap:** navigating back to it shows the saved answer in the textarea; re-saving replaces it (backend handles replace).
- **Back to coverage:** navigate to step 4.
- **Continue with {n} answered:** proceed to Preview (step 6). Allowed even with unanswered gaps — they'll be flagged, not blocked. Button label reflects the live answered count.

---

## 3. State management

- Track per-gap: `answered` (bool), `answer` (text), `dirty` (unsaved edits).
- `answered_count` derived from the gaps; drives the rail counter and footer label.
- Current index tracks which gap is active.
- Loading state on initial fetch; per-save inline spinner on the Save button.
- Error on save: keep the text, show retry, don't advance.

---

## 4. States

- **Loading:** skeleton rail + card.
- **No gaps (total 0):** "No missing reasons — every material figure already has one ✓." with a "Continue to preview →" CTA. (Shouldn't usually land here from Coverage, but handle it.)
- **All answered:** rail fully checked; footer CTA emphasized "Continue →".
- **Save error:** inline, retain input, retry.
- **Skipped gaps at continue:** allowed; the count reflects only answered. No blocking modal — the report flags them.

---

## 5. Visual / brand

Spark brand, matching the portal chrome:
- Violet `#3C0866`/`#3E0973` — stepper active, current-gap highlight, primary "Save & next" / "Continue" buttons, the ✦ question icon chip, the code.
- Cyan `#5BC9E2` — secondary accents.
- Change %: red for down (▼), green for up (▲); "pp" suffix for ratio/percentage-point metrics (Gearing +8 pp, ROACE −1.7 pp) — render the unit the backend provides, don't assume %.
- Fonts: Fraunces (H1), DM Sans (body, questions), JetBrains Mono (code + figure values).
- Figure block: subtle grey panel; the big value prominent, change beside it.
- "Skip for now" as a quiet text link, not a button — skipping should feel lower-weight than answering.

---

## 6. Honest cautions

- **Skips must never be silently filled.** The UI promises (footnote) that skipped figures are flagged, not invented. Ensure skip writes nothing and the copy stays truthful.
- **Units vary** — some gaps are `%`, some `pp` (percentage points: gearing, ROACE), some absolute (`mmbbl/d`, `mmboed`). Render `current_display`/`change` as the backend formats them; don't hardcode "%".
- **The question text comes from the backend** (template or cached LLM) — render as given; the frontend never generates questions.
- **Count must match Coverage** — the `{total}` here equals the "Reason missing" count on Coverage. If they differ, the backend gap-definition diverged; surface, don't paper over.
- v1 is **one human answer per gap** — no AI-suggested answers, no bulk fill.

---

## 7. Build order

```
1. Page shell + stepper (step 5 active) + two-column layout
2. GET /gaps; render left rail (all gaps) + right card (first unanswered)
3. Answer textarea + Save & next → POST /driver; advance logic
4. Skip (advance, no POST); rail check/skip states
5. ⌘+Enter shortcut; left-rail jump navigation
6. Footer: answered counter + Continue → Preview; Back to coverage
7. Loading / empty / all-answered / error states



```

● GET /{company_id}/quarterly/{report_id}/gaps

  {
    "report_id": "uuid",
    "company_id": "uuid",
    "period_label": "Q3 2025",    "prior_period_label": "Q3 2024",
    "total_gaps": 9,    "answered_count": 2,
    "gaps": [
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
        "change_pct": -3.7,
        "change_direction": "down",
        "question": "Income before income taxes decreased 3.7% to
  SAR 46.3B. No driver has been recorded for this change — please
  provide a reason.",
        "placeholder": "e.g. Describe what drove this change",
        "answered": false,
        "current_answer": null
      },
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
        "change_pct": -2.9,
        "change_direction": "down",
        "question": "Total revenue decreased 2.9% to SAR 111.2B. No
  driver has been recorded for this change — please provide a
  reason.",
        "placeholder": "e.g. Describe what drove this change",
        "answered": true,
        "current_answer": "Lower crude prices and OPEC+ production
  cuts"
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
      "change_pct": -3.7,
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

## 8. Verification

- `{total}` matches Coverage's "Reason missing" for the report.
- Answering POSTs one driver, checks the gap in the rail, advances; the figure leaves the gap set on a later Coverage/gaps refetch.
- Re-opening an answered gap shows the saved text; re-saving replaces (no duplicate).
- Skipping writes nothing and advances; gap remains unanswered.
- "Continue" allowed with unanswered gaps; label shows the live answered count.
- Units render as provided (%, pp, mmbbl/d) — not all forced to %.
- ⌘+Enter saves; keyboard and click paths agree.

## 9. Out of scope

- Coverage Map (step 4) — separate.
- Preview / Export (steps 6–7).
- AI-suggested or bulk answers.
- Editing the figures/values themselves (only their reason).
