# Part 6 — FRONTEND — Cover Template Picker Popup

## Overview
On the Cover section (in the Preview), a button opens a popup showing (1) the
available cover-page designs and (2) a brand-color picker (preset palettes + a custom
hex/wheel picker). The user picks a design and a color; both are saved and the cover
+ report accents re-render. Colors apply to ACCENTS/HEADINGS only — body text stays
dark and readable.

## Depends On
- Backend Part 6:
  - `GET .../quarterly/cover-templates`
  - `GET .../quarterly/color-palettes`
  - `PATCH .../quarterly/{reportId}/cover-template`
- Part 5 Preview (cover section + section rendering use the chosen colors).

## Files to Change / Create
- `src/lib/api.ts` — add `getCoverTemplates / getColorPalettes / selectCoverTemplate`.
- `CoverTemplatePicker.tsx` — the popup (designs + color picker).
- Cover renderer + accent-color application in section rendering.

## UI

### The button (on the Cover section)
In the Preview, on the `cover` section panel: a button "Choose cover design & colors"
→ opens the popup.

### The popup (modal) — two parts
**Part A — Cover designs:** grid of design cards (thumbnail/mini-preview + name +
description), selected state on the current one. Click → selects that design.

**Part B — Brand color:**
- **Preset palettes:** from `getColorPalettes()` — a row of swatch pairs
  (primary+secondary) with names. Click one to apply.
- **Custom:** a "Custom" option revealing a color picker (native `<input type=color>`
  or a hex input + wheel) for primary, and optionally secondary. Live-updates a small
  preview.
- Show a **live preview** (a mini heading + table header + a line of body text) so the
  user sees the accent color applied to headings while body stays dark.
- Readability guard: if the picked primary is very light, show a subtle
  "This color may be hard to read as an accent" note (backend/renderer darkens it for
  text-on-white anyway).

On confirm/apply → `selectCoverTemplate({ cover_template_key, brand:{primary,
secondary, palette_key} })` → close → cover + report accents re-render.

### Applying colors in the Preview
- Headings, section titles, table header rows, cover, dividers, KPI highlight numbers,
  accent borders → use `brand.primary` (and secondary where relevant).
- Body / paragraph text → fixed dark color (e.g. #1A1A1A), NEVER the brand color.
- Drive via CSS variables (e.g. `--brand-primary`, `--brand-secondary`) set from the
  saved brand colors, so all sections pick them up consistently.

## Behavior
- Default design + default palette shown if none chosen.
- Picking a design or color persists (PATCH) and updates the preview immediately.
- Cover shows the REAL company name + period (no placeholder).

## Integration test
1. Cover section → "Choose cover design & colors" → popup opens with designs + palettes.
2. Pick "Bold" design + "Violet & Cyan" preset → cover + headings turn violet, body
   stays dark. Persists on reload.
3. Pick a custom hex → accents update to it; body text unchanged/readable.
4. Pick a very light color → readability note shows; text-on-white stays legible.

## Definition of Done
- Popup offers cover designs + preset palettes + custom color picker.
- Chosen design + colors persist and re-render the cover and report accents.
- Colors apply to accents/headings only; body text stays dark/readable.
- Cover uses real company values.