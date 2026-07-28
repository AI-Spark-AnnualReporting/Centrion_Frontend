# Compliance Validation — Frontend Spec

A 3-step wizard to validate a report, review results, and gate publication.
Stack: React / Next.js. Talks only to the 6 backend endpoints in the backend spec.

Wizard steps (persistent stepper at top):
**1. Set up** (Source · Regulators · Validate) → **2. Review** (Results & gaps) →
**3. Gate** (Publish & certify).

Header on every screen: `Compliance Validation · {Company Name}`.

---

## Screen 1 — Set up

Three stacked cards.

### Card 1 · Source
- **Report type tabs** (single-select): `Annual Report | Quarterly | ESG / Sustainability | Board Pack`. Selection sets `report_type`.
- **Sub-tabs**: `From AR Studio` (default) | `Add from outside`.
  - *From AR Studio*: list of candidate reports from `GET /api/reports?source=ar_studio`. Each row: title, `{company} · {market} · candidate {version}`, right-aligned `{pages} · {languages} · updated {ago}`. Single-select (radio). Selecting sets `report_id`.
  - *Add from outside*: file upload (upload handled by existing pipeline; out of scope here — just the entry point).

### Card 2 · Regulators
- Caption: "Entity type and report type preset the frameworks. Toggle any chip to fine-tune."
- **Entity type** toggle (single-select): `Corporate | Bank | Insurer`. Sets `entity_type`.
- **Regulators & frameworks** chips: from `GET /api/compliance/preview?report_type=&entity_type=&market=`.
  - Each chip = `{regulator} · {short label}`, toggleable on/off.
  - Chips not applicable to the entity type render **disabled/greyed** (e.g. SAMA, IA when entity = Corporate).
  - Enabled + ON chips = `enabled_frameworks[]`.
- Footer line: `{N} frameworks · {M} checks will run` (from preview response). Re-fetch preview whenever report_type / entity_type / a chip changes.

### Card 3 · Validate
- Copy: "Run every enabled check against the report's evidence."
- Primary button **▶ Run validation** → `POST /api/compliance/runs {report_id, entity_type, report_type, enabled_frameworks}`.
  - While running: show progress bar + `Done · {passed}/{total} checks passed.` (poll or use the synchronous response).
  - On done: reveal a compact result list (rule_id, one-line desc, ✓/✗, gate chip) and a **See results & gaps →** button → Screen 2.

Disable **Run validation** until a report and ≥1 framework are selected.

---

## Screen 2 — Review (Results & gaps)

Fetched from `GET /api/compliance/runs/{id}`.

### Top band
- **Submission Readiness** big number `{overall_readiness}/100`.
- If `publication_gate = blocked`: red banner "Publication blocked — resolve hard-gate gaps below."
- Small readiness breakdown rows (optional): a few framework groupings with a `PASS / BLOCK / HARD` chip.

### Framework scores (grid of cards)
One card per framework: `{regulator}` · big `{score}` · gate chip (`HARD`/`SOFT`) · `{passed}/{total} checks · {label}`. Colour the number red when score is low (e.g. < 50). Data from `frameworks[]`.

### Gaps & recommendations (table)
Rows from `gaps[]`. Columns: **Framework** (`regulator` + `rule_id`), **Finding**, **Severity** chip (`HIGH/MEDIUM/LOW`), **Gate** chip (`HARD/SOFT`), **Recommendation & Evidence** (`finding` + `evidence.evidence_source`), **Action**.
- Action button: `HARD` gaps → **Mark resolved**; `SOFT` gaps → **Assign** *(disabled/hidden this phase — see out of scope)*.
- **Mark resolved** → confirm popup (see below) → on confirm `POST /results/{id}/resolve {reason}` → update the row, top gate banner, and readiness number from the response.

### Rule-level detail (accordion, grouped by framework)
"Every check traced to its logic, parameter and evidence source." From `rule_detail[]`.
- One collapsible section per framework: header `{regulator} · {label}` + gate chip + `{passed}/{total} pass`.
- Each rule row: ✓/✗ · `rule_id` · description · then monospace lines:
  `validate {logic}` / `parse {param}` / `evidence {evidence_source}`.

Footer: **← Back to set up** | **Publication decision →** (Screen 3).

---

## Screen 3 — Gate (Publish & certify)

Reads the same run.

- **If gate = blocked**: red ⊘ "Publication blocked", copy "{K} hard-gate checks are still failing. Resolve them on the results screen, then return here to certify." List each blocking HARD gap as a card (`rule_id` + `finding`). Button **Go resolve gaps** → Screen 2.
- **If gate = open**: green state, **Certify** button → `POST /runs/{id}/certify` → show certified status + timestamp. (Certify disabled while blocked.)

Footer: **← Back to results**.

---

## Confirm popup (Mark resolved)
Small modal:
- Title: "Mark this hard-gate check resolved?"
- Shows `rule_id` + `finding`.
- Optional text field: reason (passed to the API).
- Buttons: **Cancel** / **Yes, mark resolved**.
- On "Yes": call resolve endpoint, close modal, refresh gate banner + readiness + the row's state. No page reload.

---

## Shared UI conventions
- **Gate chips**: `HARD` (red/strong), `SOFT` (amber), `WATCH` (grey).
- **Status icons**: pass ✓ (green), fail ✗ (red), na (muted).
- **Severity chips**: HIGH (red), MEDIUM (amber), LOW (grey).
- Score colour: ≥80 green, 50–79 amber, <50 red.
- Reuse the house design system (violet `#3C0866`, cyan `#5BC9E2`; Fraunces / DM Sans / JetBrains Mono — mono for the `validate/parse/evidence` lines).

## State & data flow
- Setup holds local state `{report_type, report_id, entity_type, enabled_frameworks}`; re-calls `preview` on change.
- `POST /runs` returns `run_id`; store it and route to Review.
- Review + Gate both read `GET /runs/{id}`; resolve/certify calls return the updated fields to patch in place (no full refetch required, but refetch is acceptable).

## Out of scope (this phase)
`Assign` action, AI/Copilot "draft the fix", external-upload handling, run history,
multi-reviewer, PDF certificate download.
