# Part 5 — FRONTEND — Preview Screen (Produced Sections + Refine)

## Overview
After the outline is locked, the Preview screen shows the report section by section:
a left rail of sections, the produced content for the selected one, and a refine
chat to adjust generated sections. Content comes from the Part 5 producer endpoints.
Matches the existing preview mockup (numbered section list on the left, content +
"Try: make concise / more formal / expand" chips on the right).

## Depends On
- Backend Part 5 endpoints:
  - `POST .../sections/{code}/produce`
  - `POST .../produce` (batch, async 202+poll)
  - `GET  .../sections/{code}`
  - `POST .../sections/{code}/refine`
- Locked outline (Part 4) — the section list comes from the locked
  `quarterly_report_sections`.
- Existing preview/SectionChat patterns if present (annual builder) — reuse.

## Files to Create
- `src/pages/quarterly/PreviewPage.tsx`
- extend types with produced-section shape.

## Files to Change
- `src/lib/api.ts` — add `quarterlyReports.produceSection / produceAll /
  getSection / refineSection`.
- `src/App.tsx` — route `/quarterly-report/:reportId/preview`.
- Wire: Outline "Generate & Preview" (lock) → this screen.

## Types
```ts
type SectionStatus = 'pending' | 'drafting' | 'done';
interface ProducedSection {
  section_code: string; title: string; display_order: number;
  source_type: string; mode: string; status: SectionStatus;
  content: string | null;      // rendered html / structured block / null if not produced
  feeder_status: string;       // ready/template/external/needs_input (carried from outline)
}
```

## Screen layout — GAPS-STYLE, interactive per section
Model this on the existing Gaps screen: sections listed on the LEFT, click a section
to work on it in the main panel. Each section can either show its produced content OR
give the user a place to provide missing input (upload a doc / type it), then produce.

**Left rail:** "SECTIONS · {n}" — numbered list of locked sections in display_order.
Each row shows a status indicator:
- green dot → produced (done)
- amber dot → needs input (feeder=needs_input/external, not yet supplied)
- grey dot → pending / not yet produced
Selected section highlighted.

**Main panel (selected section)** — behaves differently by the section's state:

1. **Ready to produce (feeder=ready/template, figures present):**
   - Show the produced **content**:
     - table/kpi → structured table/block.
     - generate/AI-written (Hybrid analysis) → the analytical prose.
     - template → filled boilerplate.
   - If not produced yet → a **Produce** button (or auto-produced on open).

2. **Needs input (feeder=needs_input or External, not supplied):**
   - Show the requirement clearly: "This section needs: {other_inputs_needed}"
     (e.g. "Management strategic steer + drivers" for CEO statement).
   - Provide an **input area right here**:
     - a **text box** to type the input (e.g. paste the CEO steer / guidance numbers), AND
     - an **upload control** to attach a supporting document for this section.
   - A **Produce** button that becomes active once input is provided → calls produce
     with the supplied input, then renders the content.
   - This is the key Gaps-style behavior: the user fills the gap for that section
     inline, then it produces.

3. **Refine (generate/AI-written sections that are produced):**
   - Chips: "Make it concise" · "More formal tone" · "Expand detail" + free-text +
     Send → `refineSection`.

## Behavior
- On mount: load locked sections (list) + each section's content/status.
- Sections with feeder=ready/template: produce (batch on open via `produceAll` 202+poll,
  or per-section on select). Status fills pending→drafting→done.
- Sections with feeder=needs_input/external: DO NOT auto-produce. Show the input/upload
  area; produce only after the user supplies input.
- Providing input: text → send with the produce call; upload → attach the doc to the
  report (existing upload endpoint) tagged for this section, then produce so the
  section can source from it.
- Refine: instruction → spinner → replace content. Generate modes only.
- Footer: **Back** (to outline) · **Export** (→ Part 7) — Export enabled when all
  included sections are done or explicitly acknowledged (needs_input sections either
  filled or skipped).

## Note on supplying a document per section
When the user uploads a doc for a needs_input section, attach it via the existing
document upload (purpose='supporting'), then re-run produce for that section so the
producer can pull the newly-available prose/figures from it. This reuses the extraction
+ feeder machinery rather than a separate path.

## Integration test (with backend)
1. Lock a bank outline → land on Preview.
2. Sections fill in: income_table shows a figures table (correct net_income);
   net_income_analysis shows prose with the real number; cover shows filled template;
   ceo_statement shows "awaiting input" placeholder.
3. Select net_income_analysis → refine "make it concise" → content shortens, figures
   unchanged.
4. Status dots go pending→done as production completes.
5. Refine chip on a table section is hidden/disabled.

## Definition of Done
- Left rail lists locked sections; selecting shows produced content by type.
- Batch produce fills the report; per-section status reflects progress.
- Refine works on generate sections; disabled on table/template.
- needs_input/external sections show placeholders, not fabricated content.
- Export entry point present (wired in Part 7).