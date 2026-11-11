# Plan editor — group the Modules card (Reports / Validators)

**Date:** 2026-11-05
**Repo:** Centrion_Frontend only (branch `licensing`)
**Mockup:** `Centrion_Frontend/.claude/mockups/modules-grouped-mockup.html`
**Related plans:** `Centriton/.claude/plans/cloud-subscriptions-v2-redesign.md`

## What the user asked for

On Spark → Subscriptions → plan editor, the Modules card is one long list of 9
tiles. Split it into groups that open and close:

- **Reports** — Quarterly Report, Earnings Report, Annual Report, Board Report
- **Validators** — ESG Validator, Compliance Validation, Annual Report Validator
- **No group** — Board Meetings, Leadership. Shown below the groups, always
  visible, no heading.

Rules agreed with the user:
- Click a group heading to open or close it (▼ open, ▶ closed).
- A group **starts open only if at least one module in it is switched on**. So a
  brand-new plan opens with both groups closed; editing a plan with only Reports
  on opens Reports and closes Validators.
- Open/closed is **not remembered**. Every time the editor opens, the rule above
  decides again.
- Each heading shows its own count ("1 of 4 on"). The total at the top
  ("2 of 9 on") stays.
- A closed group shows one line with what's on in it ("Quarterly Report · 4,
  Annual Report · 1"), or "Nothing switched on", so a module that's on is never
  hidden without a trace.
- Switching modules off doesn't close a group by itself, and switching one on
  doesn't open one. Only the user's click does, after the start.

## What does NOT change

- No backend change, no DB change, no endpoint change. The list of modules still
  comes from the server (`modules_catalogue`); the group is decided in the frontend.
- Turning a module on/off, the report stepper, "Included", the data sent on
  Publish — all exactly as today.
- The plan cards (`PlanCard`), the module name tags (`ModuleTags`), the client's
  Subscription page, checkout, the license key form — untouched.
- No Postman change (no endpoint touched).

## Files and changes

### 1. `src/components/subscriptions/PlanFields.tsx`
- Add a small table that says which group each module key is in:
  `quarterly_report`, `earnings_report`, `annual_report`, `board_report` → Reports;
  `esg_validator`, `compliance_validation`, `annual_report_validator` → Validators.
  Any key not in the table (Board Meetings, Leadership, or a module added later)
  has no group and shows below the groups — so a new module from the server is
  never lost.
- Add a small function `groupsWithModulesOn(limits, catalogue)` that returns the
  groups that have something switched on. Used once, for the starting state.
- `ModulesCard`:
  - Keep one piece of state: which groups are open. It's set once when the card
    first appears, from `groupsWithModulesOn`. (The editor page shows a spinner
    until the plan has loaded, so the card always starts with the real plan.)
  - Split the tile drawing into a small `ModuleTile` component (the same markup
    as today, moved, not changed) so both the groups and the ungrouped list use it.
  - Add a `ModuleGroup` component: the heading button (arrow, name, "x of y on")
    and either its tiles (open) or the one-line summary (closed).
  - Order: Reports group, Validators group, then the ungrouped tiles. Inside a
    group the order is the server's order, as today.
  - Heading is a real `<button>` with `aria-expanded`, so keyboard and screen
    readers work.
  - A group with no modules in the catalogue (e.g. a test catalogue) isn't shown.

### 2. `src/components/subscriptions/subscriptions.css`
- New classes only (copied from the mockup): `.sub-grp` (heading),
  `.sub-grp-chev`, `.sub-grp-t`, `.sub-grp-line`, `.sub-grp-c`, `.sub-grp-sum`
  (closed summary), `.sub-grp-gap` (line above the ungrouped tiles). Existing
  classes untouched.

### 3. `src/test/subscriptions.test.tsx`
- **Existing test that will break and must change:** "creates a plan…" clicks the
  Quarterly Report switch on a new plan. With the new rule, Reports starts closed
  on a new plan, so the switch isn't on screen. The test will first click the
  "Reports" heading, then carry on as before.
- The test catalogue (Quarterly, Earnings, Leadership) stays; it already covers a
  grouped and an ungrouped module.
- New tests:
  - new plan: Reports heading shows, closed, "Nothing switched on"; Leadership
    shows (no group); no Validators heading (none in the catalogue).
  - editing a plan with Quarterly on: Reports starts open, "1 of 2 on".
  - clicking the heading closes it; the summary reads "Quarterly Report · 4".
  - switching the last module off leaves the group open.

## Ripple effects (what could break)

- **Other tests that click a module switch in the editor** — only the one above
  (checked: `getByRole("switch"` appears once, line 165). Other test files with
  "Quarterly Report" test other screens, not this card.
- **spark_admin may think a module is missing** when a group is closed. That's why
  the heading count and the closed summary line are there.
- **Height:** the card is in a page that never scrolls; the list already scrolls
  inside the card. Closed groups make it shorter, never taller — no layout risk.
- **Example:** spark_admin opens "Gold" (Quarterly · 4 on). They see Reports open
  with Quarterly switched on, Validators closed saying "Nothing switched on",
  then Board Meetings and Leadership. They open Validators, switch ESG on, Publish.
  The data sent is exactly what today's card would send.

## Steps

1. `PlanFields.tsx` — group table, `groupsWithModulesOn`, `ModuleTile`,
   `ModuleGroup`, grouped `ModulesCard`.
2. `subscriptions.css` — new heading/summary classes.
3. `subscriptions.test.tsx` — fix the one test, add the new ones; run
   `npx vitest run src/test/subscriptions.test.tsx`, then the whole suite.
4. Look at it in the browser on the plan editor (new plan and an existing plan).
5. Notes: update `Centriyon Notes/Features/Cloud Subscriptions.md` (How it works:
   grouped Modules card) and `Centriyon Notes/Current Status.md`.
