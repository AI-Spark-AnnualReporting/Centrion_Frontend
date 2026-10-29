# Board Report — the Outline screen (frontend)

## Context

The backend has shipped a new step in the board report wizard. This plan builds the screen
for it.

Today the wizard is four steps:

```
1 Sources  →  2 Sections  →  3 Review  →  4 Report
```

We are inserting a step between **Sections** and **Review**:

```
1 Sources  →  2 Sections  →  3 Outline  →  4 Review  →  5 Report
                            ^^^^^^^^^^^ new
```

**What the screen does.** It lists the sections of the report, and under each prose section
shows the **subheadings** it will be broken into — proposed by the server, which reads the
paragraphs from the user's own uploaded documents that were matched to that section. The
reviewer renames, deletes and reorders them. What they approve is what prints in the report.

**Generate report moves here.** It comes off the Sections screen and becomes this screen's
primary action.

Backend endpoints are live: `GET`/`PUT /board/reports/{id}/subheadings`. Full contract in the
backend repo's `docs/BOARD_REPORT_API.md` §5 and `docs/BOARD_REPORT_FRONTEND.md` Screen 4.

---

## The three rules that shape the UI

These are backend-enforced, decided by the project owner. The UI must match them or every
save is a 422.

| | |
|---|---|
| **No adding** | There is **no "+ Add subheading" button.** The server proposes the set; the reviewer only shapes it. A heading sent without a recognised `id` is a 422, `"subheadings cannot be added"`. |
| **No re-proposing** | There is **no "regenerate suggestions" button.** The server proposes once per report. |
| **Approval freezes it** | Once the report is approved or published, the whole screen is read-only. Every `PUT` returns 409. |

**Every row carries an `id`. Keep it and send it back.** That id is how the server tells a
rename from an addition — text alone cannot. Dropping the id client-side turns a rename into
a rejected add.

---

## Decision: which rows to show

The backend returns **all 46** sections, each with `editable: true/false` and, when read-only,
a `reason_code` and a display-ready `reason`.

`BoardSectionsPage` already **hides** `dropped`/`na` rows via `isBoardExcluded()` — despite the
API doc's "do not filter" line, the screen filters them, and the count chip reads
`counts.included`.

**This screen mirrors that exactly**: hide rows whose `reason_code` is `not_applicable`, show
everything else. Two reasons:

1. The two screens then list the same sections in the same order. Showing *more* rows here
   than on the previous screen is its own kind of confusing.
2. A section this issuer does not have is not part of "the full picture of my report".

Everything else stays visible and read-only with its reason — which is the point of the
screen. Roughly **13–14 editable rows and ~22 read-only ones** for a typical issuer.

> If we later want all 46, it is one line: drop the `not_applicable` filter. Worth doing on
> both screens together, not just this one.

**Do not hardcode "14 editable".** It varies by issuer — BR34 is bank-only, so a corporate
sees 13. Read `counts` from the response.

---

## Files

### New

**`src/pages/annual-report/BoardOutlinePage.tsx`** — the screen. Modelled closely on
`BoardSectionsPage.tsx`: same `BoardStepShell` + `SetupCard` + `StepActions` frame, same
`useFitFrame` scroll-inside-the-card layout, same debounced-save pattern, same drag-reorder
handlers and `GRIP` icon.

**`src/test/board-outline-subheadings.test.ts`** — vitest, alongside `board-helpers.test.ts`.

### Modified

| File | Change |
|---|---|
| `src/pages/annual-report/useBoardReport.ts` | Add `Outline` to `BOARD_STEPS` between Sections and Review |
| `src/App.tsx` | Lazy-import + route `/board-report/:reportId/outline`, wrapped in `<PerReport>` like its siblings |
| `src/pages/annual-report/BoardSectionsPage.tsx` | Primary button becomes "Continue to outline →"; remove the produce/poll/`AiLoadingScreen` block (it moves) |
| `src/pages/annual-report/BoardPreviewPage.tsx` | `step={3}` → `step={4}`; its back button now points at `/outline` |
| `src/pages/annual-report/BoardReportPage.tsx` | `step={4}` → `step={5}` |
| `src/lib/api.ts` | `getSubheadings` + `saveSubheadings` on `boardReports` |
| `src/types/board.ts` | `BoardSubheading`, `BoardSubheadingSection`, `BoardSubheadingsResponse`, `BoardSubheadingsSavePayload`; add `unfilled_headings` to `BoardSectionFeeder` |
| `src/pages/annual-report/board-helpers.ts` | `subheadingsPayload()`, mirroring `outlinePayload()` |

---

## Step numbering — the part that breaks quietly

`BOARD_STEPS` gains a fifth entry, so every page's `step={N}` shifts. Miss one and the stepper
highlights the wrong circle, which nothing will fail on.

| Page | `step` before | after |
|---|---|---|
| `BoardSourcesPage` | 1 | 1 |
| `BoardSectionsPage` | 2 | 2 |
| **`BoardOutlinePage`** | — | **3** |
| `BoardPreviewPage` | 3 | **4** |
| `BoardReportPage` | 4 | **5** |

`board-shell.tsx` needs no change — it maps over `BOARD_STEPS`. Its docstring says "3-step
progress bar" and was already wrong at four; fix the wording while there.

`initialStep()` in `board-helpers.ts` returns 1/3/4 and is **currently referenced only by its
own test** — no page calls it. Its numbers are now off by one for anything past Sections.
Either update it (`4` → `5`, and the "sources received" case to `3`) or delete it as dead
code. Flagging rather than deciding — it is not on the critical path either way.

---

## API client

```ts
// src/lib/api.ts, on boardReports

// All 46 sections with their eligibility, plus the subheadings the prose ones
// will use. FIRST CALL IS SLOW — 15-30s: the server runs the paragraph->section
// routing (which produce would otherwise run; it is cached, so the wait moves
// earlier rather than happening twice) plus one proposal call. Later calls are
// a read. There is no `regenerate` parameter by design.
getSubheadings: (reportId: string, signal?: AbortSignal) =>
  request<BoardSubheadingsResponse>(boardPath(reportId, "/subheadings"), { signal }),

// Rename, delete, reorder. Array order IS the new order; omitting a saved id
// deletes that heading. Send back the `id` you were given — a heading whose id
// the server did not propose is a 422, "subheadings cannot be added". 409 once
// the report is approved, or if nothing has been proposed yet.
saveSubheadings: (reportId: string, body: BoardSubheadingsSavePayload) =>
  request<BoardSubheadingsResponse>(boardPath(reportId, "/subheadings"), { method: "PUT", body }),
```

## Types

```ts
// src/types/board.ts

export type BoardSubheadingReason =
  | "not_applicable" | "excluded" | "generated" | "no_producer"
  | "statement_table" | "governance_table" | "metric_table";

export interface BoardSubheading {
  /** Server-assigned. Send it back on save — it is what distinguishes a rename
   *  from an addition, and additions are rejected. */
  id: number;
  heading: string;
}

export interface BoardSubheadingSection {
  section_code: string;
  title: string;
  category: string;
  display_order: number;
  /** Only these rows take subheadings — the narrative ones. */
  editable: boolean;
  reason_code: BoardSubheadingReason | null;
  /** Written for display; print as-is. Null when `editable`. */
  reason: string | null;
  subheadings: BoardSubheading[];
  /** 0 on an editable row means nothing was matched to it yet. */
  source_paragraph_count: number;
}

export interface BoardSubheadingsResponse {
  report_id: string;
  period: string;
  /** False once the report is approved — render the whole screen read-only. */
  editable: boolean;
  /** Documents changed since the proposal. Informational: there is no re-propose. */
  stale: boolean;
  counts: { editable: number; read_only: number };
  sections: BoardSubheadingSection[];
}

export interface BoardSubheadingsSavePayload {
  sections: { section_code: string; subheadings: BoardSubheading[] }[];
}
```

Also add to `BoardSectionFeeder`:

```ts
  /** Approved subheadings the section's own text did not cover — the reviewer
   *  chose them, so they are told they found nothing rather than silently dropped. */
  unfilled_headings?: string[] | null;
```

---

## The screen

### The first load is genuinely slow — 15 to 30 seconds

This is the one screen with a real wait. A bare `<Spinner>` for 25 seconds reads as a hang.

**Reuse `AiLoadingScreen`** — `BoardSectionsPage` already renders it full-screen for produce,
so this is the established pattern for a long board operation:

```tsx
title="Working out how your sections should be structured"
subtitle="Reading the documents you uploaded to suggest subheadings for each section."
milestones={[
  'Matching your documents to sections',
  'Reading the passages filed under each one',
  'Suggesting subheadings',
]}
tips={[
  'You can rename or remove any suggestion — what you approve is what prints in the report.',
  'Sections that hold a table or a fixed statement layout are listed but have no subheadings.',
]}
indeterminate
```

Show it only when there is no cached response yet. Subsequent visits return instantly and
should render straight to the list.

Since there is no run to poll, this is a plain `await` on the fetch with the loader over it —
simpler than the produce flow, which polls `usePipelinePoll`.

### Layout

Same shell as Sections, so the two screens read as siblings:

```
BoardStepShell  step={3}
  title  "How each section will be structured"
  sub    "Suggested from your own documents. Rename or remove any of them — what you
          approve is what prints."

  SetupCard  title="Section outline"
             sub="Rename, remove or reorder the subheadings — changes save as you go"

    [stale notice, if stale]
    [locked notice, if !editable]

    scroll frame (useFitFrame)
      header:  Sections  <count chip: counts.editable + counts.read_only>
               [Saving… / Saved]

      per section row:
        ── editable ──────────────────────────────────
        1  Governance framework                     Governance
             ⠿ [Board composition          ] ✕
             ⠿ [Committee mandates         ] ✕

        ── editable, nothing matched ─────────────────
        2  Risk management                          Risk
             Nothing from your documents was matched to this section yet.

        ── read-only ─────────────────────────────────
        3  Board of Directors & profiles (CVs)      Governance   [TABLE]
             A table with fixed columns, extracted from your documents.

  StepActions
    back "← Sections"
    hint "13 of 42 sections can be structured"
    [Generate report]
```

Sections come pre-sorted by `display_order`; render in the order given.

### Rows

**Editable rows** — the section title, then its subheadings as an editable list:

- rename: a borderless `<input>` that looks like text until focused, saving on change
- delete: an `✕` per row
- reorder: drag **within the section only**, reusing the `GRIP` icon and the exact
  `onDragStart` / `onDragOver` / `onDrop` handlers from `BoardSectionsPage`. Track the drag as
  `{ sectionCode, index }` so a heading cannot be dragged into a different section — the API
  has no way to express that, and it would silently drop the heading.
- **no add button** — do not build one

An editable row with `source_paragraph_count === 0` and no subheadings shows a muted line
("Nothing from your documents was matched to this section yet") rather than an empty box. The
reviewer's fix is on the Sources screen, so make it a link back there.

**Read-only rows** — greyed, with `reason` in italics beneath the title, matching how the
Sections screen already renders a `note`. A small uppercase badge from `reason_code` reusing
the existing `.badge b-gy` class:

| `reason_code` | Badge |
|---|---|
| `governance_table` · `statement_table` · `metric_table` | `TABLE` |
| `generated` | `TEMPLATE` |
| `no_producer` | `NOT AUTOMATED` |
| `excluded` | `EXCLUDED` |

Print `reason` verbatim — it is written for display.

### Saving

Copy `BoardSectionsPage`'s `scheduleSave` wholesale. It already solves the problems this
screen has, and they were learned the hard way there:

- 700ms debounce with a `saveSeqRef` latest-wins guard
- **flush on unmount, do not cancel** — the comment on that effect records a real bug where
  clicking the stepper inside the debounce threw the pending PUT away and the reorder was
  never sent
- on failure, refetch: a 422 means nothing was saved, so the server is the truth
- `saveState` chip in the card header — `Saving…` / `Saved`

Send **only the sections that changed**. The endpoint replaces just the sections named in the
body, so a one-section save leaves the rest untouched.

### Stale

`stale: true` means documents changed after the subheadings were proposed. There is **no
re-propose**, so this is a `Notice tone="amber"` with no button:

> These suggestions were made before your most recent upload. You can still rename or remove
> them.

### Read-only

When `editable` is false (report approved/published), render `<LockedNotice />` and disable
every input, ✕ and drag handle. The stepper already handles this via the `locked` prop.

### Generate report

Moves here from Sections, along with its whole apparatus: `produceAll`, `startedRun`,
`usePipelinePoll`, `readExistingRunId`, the `AiLoadingScreen` produce block, `RegenerateDialog`,
and the navigate-to-preview-with-`sheetWarning` effect. Lift it across as-is rather than
rewriting it — it encodes several fixed bugs (the `startedRun` null guard, the 409-carries-an-
existing-run-id recovery, the warning travelling with the navigation).

Before it fires, **flush any pending subheading save**. Generating against subheadings the
server has not received is exactly the bug the flush-on-unmount comment describes, and here it
would produce a whole report with the wrong headings.

On `BoardSectionsPage`, the primary button becomes:

```tsx
{anyProduced ? 'Review sections →' : 'Continue to outline →'}
```

both navigating to `/board-report/${reportId}/outline`. The `anyProduced` read-only notice and
the `Regenerate all` button move to the Outline page with produce.

---

## Optional but recommended: surface unfilled headings

The backend reports approved headings that found no matching text as
`feeder.unfilled_headings` on the produced section. Nothing in the frontend reads it today —
`generated_headings` has never been surfaced either.

On `BoardPreviewPage`, where a section's feeder is already read, show an amber line on any
section with a non-empty `unfilled_headings`:

> **Nothing was found for:** Cyber incidents · Liquidity risk
> These subheadings had no matching text in your documents, so they were left out.

Small, and it closes the loop the backend deliberately opened — otherwise a reviewer's
approved heading vanishes from the report with no explanation. Skip it only if scope is tight.

---

## Tests

`src/test/board-outline-subheadings.test.ts`, matching `board-helpers.test.ts` in style.

Pure-helper tests (no rendering) carry most of the value:

1. `subheadingsPayload()` keeps ids and array order, and emits only the changed sections
2. reorder within a section produces the expected order; a cross-section drag is refused
3. delete removes exactly one heading and leaves the others' ids intact
4. rename changes `heading` and **preserves `id`** — the regression that would turn every
   rename into a rejected add
5. the `not_applicable` filter hides those rows and nothing else
6. `reason_code` → badge mapping covers all seven codes with no `undefined`

If a component test is wanted, follow `earnings-figure-checklist.test.tsx`: render the page
with a mocked `boardReports`, assert **no add control exists** (`queryByRole('button', { name: /add/i })`
is null), and that a save posts ids back.

---

## Build order

1. Types + API client + `subheadingsPayload` — no UI, compiles on its own
2. `BOARD_STEPS` + route + the `step={N}` shifts on Preview and Report. Click through the
   stepper and confirm the right circle lights up on all five screens
3. `BoardOutlinePage` read-only first — fetch, loader, the row list, both row kinds. The
   backend is live, so this is real data immediately
4. Editing — rename, delete, reorder, debounced save
5. Move Generate report across; retire it from Sections
6. Stale + locked states
7. Tests
8. Optional: `unfilled_headings` on Preview

Step 3 is the demo: open the screen on a report that already has documents and watch real
subheadings come back from the company's own text.

---

## What could bite

| | |
|---|---|
| **Dropping `id` on rename** | Every save 422s with "subheadings cannot be added". Most likely bug in this plan — test 4 exists for it |
| **25-second first load** | Use `AiLoadingScreen`, not a spinner. If it proves too slow in practice the backend can move it to a polled background job, like produce — say so rather than papering over it client-side |
| **Building an add button** | Rejected server-side. The rule is deliberate; do not add a client-side workaround |
| **Step numbers** | Nothing fails loudly. Click all five |
| **Losing a pending save** | Flush on unmount and before Generate. The existing comment in `BoardSectionsPage` documents the bug this caused once already |
| **Cross-section drag** | The API cannot express it. Scope the drag to one section |
| **Hardcoding 14** | It is 13 for a corporate issuer. Read `counts` |
