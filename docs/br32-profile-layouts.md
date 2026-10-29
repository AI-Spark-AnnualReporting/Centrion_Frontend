# BR32 — let the user choose the layout of the board profiles section

## Context

BR32 ("Board of Directors & profiles (CVs)") prints as one wide table: `Photo |
Name | Job title | Company | Period | Experience`, one row per director, with
the four text columns newline-separated, one line per job. Real annual reports
lay this section out as profile cards — a photo, the name, then labelled position
blocks — and the user wants to pick that per section, seeing the options first,
without taking the table away from anyone who prefers it.

Decisions taken (asked and answered):

- **Four layouts**: the table as today, plus the three card layouts mocked up at
  <https://claude.ai/code/artifact/b551fbbc-ff15-44b1-9217-914766fc9706> —
  banner card grid, reference band, wide row.
- **The user picks from thumbnails**, the way "Choose cover design & colors"
  works today — not a blind toggle.
- **Persisted, not local.** The PDF/DOCX is rendered server-side
  (`POST /board/reports/{id}/export`, `src/lib/api.ts:3529`), so a browser-only
  choice would show on screen and vanish in the export. The choice is saved on
  the section and the backend gets a brief to honour it.
- **BR32 only**, and the control lives on that section on the Review step.

## What the data actually supports

Rows carry, per director: `Photo` (a data URI), `Name`, the four stacked cells
the table prints (`Job title` / `Company` / `Period` / `Experience`), and —
since the backend's follow-up — `jobs: [{job_title, company, period,
experience}]`, one entry per job. The cards read `jobs`: the cells cannot be
split back apart, because a director's own line breaks inside Experience mean
job 2 is not line 2 of the Company cell. A section produced before `jobs`
existed has none and prints as the table whatever layout is saved — a
re-produce with `regenerate=true` is what fixes it.

All three layouts render the same content: first job → "Current position", the
rest → "Previous position", every job's experience in job order, then a block
per remaining column. The reference report's Qualifications / Memberships are fields BR32 does
not hold; the card body is driven by the payload's own `columns`, so if the
backend adds them later they appear as further blocks with no frontend change.

## Changes

### 1. `src/types/board.ts` + `src/lib/api.ts` — the saved choice

```ts
export type BoardSectionLayout = 'table' | 'cards_grid' | 'cards_band' | 'cards_row';
```

and `layout?: BoardSectionLayout | null` on `BoardSection` (`types/board.ts:290`).
Absent/null means table, so a server without the field keeps today's behaviour.

`boardReports.setSectionLayout`, beside `setSectionDirectors` (`api.ts:3406`) and
shaped like it:

```
PUT  /api/v1/board/reports/{id}/sections/{code}/layout
body  { "layout": "cards_band" }
200   { "section_code": "BR32", "layout": "cards_band" }
400 unknown layout / section has no layout choice · 404 no such report or
section · 409 the report is approved
```

`GET /sections` returns `layout` per section — the one field both screens need.

### 2. `src/pages/annual-report/BoardProfileCards.tsx` (new)

`BoardProfileCards({ section, variant })` where `variant` is the layout minus the
`cards_` prefix. One component, three wrappers — the same shape as
`CoverRenderer.variantFor` (`src/components/quarterly/CoverRenderer.tsx:18`),
which already renders one payload three ways.

- Parse `section.content`; take `parsed.rows` (or `parsed.tables[0].rows`).
  **No rows or unparseable → render `<SectionContent section={section} />`**, so
  a payload change degrades to the table and never blanks the section.
- `blockCols` = the payload's `columns` minus `Photo`, `Name` and the three job
  columns — `Experience` today, anything richer later.
- **The per-director content is identical in all three variants** — photo (or an
  initials tile when `isDataImage` says there is none,
  `src/components/quarterly/sectionState.ts:213`), name, then `Block`s. Only the
  container and the card chrome differ:
  - `grid` — `repeat(auto-fill, minmax(232px, 1fr))`, photo on top, name in a
    brand-coloured strip.
  - `band` — one per row: photo top-left, name across a dark strip with a brand
    rule under it, blocks in a two-column flow (`columns: 2`, `break-inside:
    avoid`).
  - `row` — `132px 1fr` grid, photo left, name with a brand underline, blocks in
    a two-column grid; one column under 620px.
- Jobs: `Job title` / `Company` / `Period` split on `\n` and zipped by index —
  `Math.max` of the three lengths, so ragged columns keep every job rather than
  truncating. A `Block` with no values renders nothing, so a director with a
  photo and no jobs gets a card with just their name (the table's rule — drop
  cells, never people).
- Values read the uncut key first, reusing `fullKey`.

Styling: `board-ui.tsx` tokens + `var(--brand-primary)`, so the cards pick up the
report's brand colour exactly as the table headers do. **Not** `.person-card`
(`src/index.css:942`) — a clickable directory tile with a hover lift, which would
be a lie about interactivity on printed report content.

### 3. `src/pages/annual-report/BoardLayoutPicker.tsx` (new) — the thumbnails

A `.modal-overlay` / `.modal-content` dialog (the app's existing modal, as in
`AdminUsersPage.tsx:617`), holding a grid of four thumbnails — Table, Cards ·
grid, Cards · bands, Cards · rows — each a small pure-CSS diagram of grey bars
and a photo block, built the way `MiniCover` does it
(`src/components/quarterly/CoverTemplatePicker.tsx:44-90`): no real content, no
screenshots, just enough shape to tell them apart. The current one is ringed in
`ACCENT`. Click selects; **Apply** saves and closes, **Cancel** closes; a failed
save keeps the dialog open with the message under the grid.

### 4. Render branch — the two screens, next to the existing precedent

`isBoardCoverSection` (`board-helpers.ts:143`) already routes one section code to
a different renderer from both screens. This follows it rather than threading a
`layout` prop through `EditableSectionContent` → `SectionContent`, which are
shared with the quarterly and earnings reports and would gain a board-only,
one-section concept.

New helper beside it:

```ts
/** The card variant this section prints in, or null for the table. */
export const boardCardVariant = (s: Pick<BoardSection, 'section_code' | 'layout'>) =>
  BOARD_PROFILE_SECTIONS.includes(s.section_code) && s.layout?.startsWith('cards_')
    ? (s.layout.slice(6) as 'grid' | 'band' | 'row')
    : null;
```

At `BoardPreviewPage.tsx:1013` and `BoardReportPage.tsx:812`, the same ternary:

```tsx
{!editing && variant
  ? <BoardProfileCards section={toBoardProduced(s)} variant={variant} />
  : <EditableSectionContent … />}
```

`!editing` keeps **editing on the existing `TableEditor`**
(`EditableSectionContent.tsx:53-63`) whatever the layout — the rows are still the
truth, and a card editor would be a second editor for the same data.

### 5. `BoardPreviewPage.tsx` — opening the picker

A small **Choose layout** button in `SectionPanel`'s header row immediately
before the pencil (`:897`), shown only when
`BOARD_PROFILE_SECTIONS.includes(s.section_code) && produced && !editing &&
!readOnly`. It opens the dialog from §3.

Save handler on the page, beside `handleConfirm`, reusing the page's own
`patch()` (`:161`) and `sectionError` (`:98`):

```tsx
patch(code, { layout });                       // optimistic — the dialog closes on success
try { await boardReports.setSectionLayout(reportId, code, layout); }
catch (err) { patch(code, { layout: prev });   // snap back: the screen must not
  setSectionError(errorMessage(err, 'Could not change the layout. Please try again.')); }
```

The failure surface already exists (`:1092` renders `sectionError` under the
section). Hidden on a locked/approved report by the existing `readOnly`; the
*rendering* still honours the saved layout there, since the branch reads
`s.layout` only. The Report step gets no control.

### 6. `src/test/board-profile-cards.test.tsx` — the one runnable check

The positional zip is the only logic that can silently scramble a CV; the rest is
markup.

1. A director with three aligned job lines: "Current position" is job 1, and
   "Previous position" is an `<ol>` of exactly the other two, in order.
2. `experience_full` prints, the 300-char `Experience` does not.
3. A director with a photo and no job lines renders the name and the `<img>` and
   no orphan "Current position" label; one with no photo renders initials.
4. `boardCardVariant` maps `cards_band` → `'band'`, and returns `null` for a
   section with no `layout` and for a non-BR32 section — a backend that hasn't
   shipped the field keeps printing the table.

### 7. Known collisions

- `fullKey` (`SectionContent.tsx:723`) must be **exported** rather than copied,
  so the cut/uncut rule can't drift between the table and the cards.
- `numberBoardHeadings` on the Report step only rewrites `#` lines — a no-op on
  this JSON content, so the cards path is safe.
- `flipMatrix` (`SectionContent.tsx:632`) already refuses to transpose BR32.
- If the endpoint isn't deployed, Apply 404s, reverts and shows the message. No
  feature flag.

## Backend brief (to be sent, as with the meetings and BR32 rounds)

1. `GET /board/reports/{id}/sections` adds `layout` per section — `"table"`
   default, one of `cards_grid` / `cards_band` / `cards_row` once chosen.
2. `PUT …/sections/{code}/layout` with the contract in §1; reject an unknown
   layout (400) rather than storing it.
3. `report_export.py` renders BR32 in the saved layout — photo, name, then one
   block per job (title, company, period, experience). The three card layouts
   differ only in arrangement: grid = 2–3 per row, band = one per row with the
   blocks in two columns, row = photo left and blocks right.
4. Not via `PATCH .../content`: storing the choice inside the section content
   marks the section edited, and a re-produce would overwrite it.
5. If the CMA headings are wanted (Qualifications, Current/Previous
   Memberships), send them as extra columns — the cards render any column they
   are given as a further labelled block.

## Verification

1. `npx tsc --noEmit`; `npx eslint src/pages/annual-report src/components/quarterly src/test`
   — pre-existing warnings only (two `exhaustive-deps`, three `react-refresh`).
2. `npx vitest run src/test/board-profile-cards.test.tsx src/test/section-content-columns.test.tsx`
   — the new cases, and the table renderer still behaving.
3. In the app, Review step, BR32: **Choose layout** shows four thumbnails; each
   card layout renders as in the mockup; a reload keeps the choice; the Report
   step shows the same; the pencil still opens the table editor; an approved
   report shows the saved layout with no button.
4. Once the backend ships §3: Export and confirm the PDF matches the screen.
