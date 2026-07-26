# Part 4 — FRONTEND — Outline Screen (Plan & Reorder)

## Overview
The outline screen shows the report's sections: mandatory ones locked at the top,
optional ones the user can tick to include, each with a badge showing where its
content comes from (a document / template / needs input). User reorders, then locks
the outline to proceed. Matches the existing outline mockup (Required — always at the
top · N locked; Quick Select: Required only / Recommended / Everything).

## Depends On
- Backend Part 4 endpoints:
  - `GET  .../quarterly/{reportId}/outline`
  - `PUT  .../quarterly/{reportId}/outline`
  - `POST .../quarterly/{reportId}/outline/lock`
- Q/A answers already saved (Part 2) — the outline reflects company_type + voices.
- Existing quarterly page shell + pill/card styling.

## Files to Create
- `src/pages/quarterly/OutlinePage.tsx`
- extend `src/types/quarterly.ts` with the outline section shape + feeder.

## Files to Change
- `src/lib/api.ts` — add `quarterlyReports.getOutline / saveOutline / lockOutline`.
- `src/App.tsx` — route `/quarterly-report/:reportId/outline`.
- Wire navigation: after processing/coverage (per your flow), reach this screen;
  "Generate & Preview" (lock) → the produce/preview stage.

## Types
```ts
type FeederStatus = 'ready' | 'template' | 'external' | 'needs_input';
interface OutlineFeeder { status: FeederStatus; document_id: string|null;
  document_name?: string; message: string; }
interface OutlineSection {
  section_code: string; title: string; part_label: string;
  requirement: 'required'|'optional'; included: boolean; locked: boolean;
  source_type: string; mode: string; display_order?: number;
  feeder: OutlineFeeder;
}
```

## Screen layout (matches the mockup)
Header: "Report outline" + helper "Required sections are locked at the top. Tick
optional ones to include them, then drag to set their order."
Right meta: "Template · {total catalogue}" and "{N} in report".

**Quick Select** row: `Required only` · `Recommended` · `Everything`
- Required only → only mandatory (locked) sections included.
- Recommended → mandatory + sector + voice pre-included (the default from backend).
- Everything → all optionals ticked too.

**Two groups:**
1. **REQUIRED — always at the top · {n} locked**
   Each row: lock icon, checked+disabled checkbox, number, title, part_label,
   `REQUIRED` badge, `LOCKED` badge. Cannot untick or drag above/below into optional.
2. **OPTIONAL — drag to reorder**
   Each row: drag handle, checkbox (toggle include), number, title, part_label,
   feeder badge (see below).

### Feeder badge (per section)
Small pill showing where content comes from, from `feeder.status`:
- `ready` → green "From {document_name}"
- `template` → gray "System template"
- `external` → amber "External data"
- `needs_input` → orange "Needs input: {short message}"
This is the key signal — tells the user which sections are covered by their upload
and which they must supply.

## Behavior
- On mount: `getOutline()` → render sections grouped, pre-ticked per `included`.
- Toggle optional include → update local state; reflect count "{N} in report".
- Drag to reorder optionals (and their order among themselves). Locked required stay
  pinned at top in section_number order.
- Quick-select buttons set the included set accordingly.
- Autosave or explicit Save: call `saveOutline({sections:[{section_code, included,
  display_order}]})` (debounced autosave is fine; else save on continue).
- Footer: **Back** · "{N} sections · in your order" · **Generate & Preview →**
  - Generate & Preview → `lockOutline()` → on success navigate to the produce/preview
    stage.
- Do not allow unticking locked sections (checkbox disabled).

## Integration test (with backend)
1. Report with company_type='bank', voices=['ceo','cfo'].
2. Outline shows: 19 required locked at top; asset_quality/capital_adequacy/
   liquidity_metrics + cfo_statement pre-included; chairman_statement available-unticked;
   capital_gearing absent.
3. income_table shows green "From {financials.pdf}"; fy_guidance shows orange
   "Needs input: guidance numbers".
4. Tick an optional (e.g. segment_revenue) → "{N} in report" increments; Save persists.
5. Try to untick a required → blocked.
6. Reorder two optionals → order persists after reload.
7. Generate & Preview → lock succeeds → navigates onward.

## Definition of Done
- Required sections locked at top; optionals tickable and reorderable.
- Each section shows a correct feeder badge (ready/template/external/needs_input).
- Quick-select (Required/Recommended/Everything) works.
- Save persists included+order; lock advances to the next stage.
- Reflects the Q/A answers (bank vs non-bank, voices) correctly.