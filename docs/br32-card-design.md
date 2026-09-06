# BR32 — "Board of Directors & profiles (CVs)" · export design spec

Everything the exporter needs to render this one section. Nothing here applies
to any other section: the report's cover, headings, tables and brand handling
stay exactly as they are.

The frontend renders the section from the CSS in §5 with no styling of its own
(`src/pages/annual-report/board-profile-cards.css`, and `BoardProfileCards.tsx`
which only sets class names). Use that file rather than transcribing values —
if it changes, the change is a diff you can pull.

---

## 1. When to use it

Render cards **only** when the section's stored `layout` is one of
`cards_grid` / `cards_band` / `cards_row` **and** every row carries `jobs`.

| Condition | Render |
|---|---|
| `layout` is `table`, null, or missing | the table, as today |
| `layout` is a `cards_*` value, rows have `jobs` | the matching card layout below |
| `layout` is a `cards_*` value, rows have **no** `jobs` (produced before `jobs` shipped) | the table |
| `layout` is an unknown value | the table |

The export must never fail over a layout. The frontend follows the same table,
so screen and download agree in every one of these cases.

## 2. What each card is built from

Per row (one director):

| Field | Use |
|---|---|
| `Photo` | a `data:image/*` URI → the headshot. Anything else → the initials tile |
| `Name` | the name in the banner / strip. Empty → `—` |
| `jobs[]` | `{job_title, company, period, experience}`, in order |
| any other column in `columns` | its own labelled block, label = the column name verbatim |

`Job title` / `Company` / `Period` / `Experience` as *cells* are for the table
only — never read them for a card. They are stacked text, and a director's own
line breaks inside Experience mean line 2 is not job 2.

## 3. Content rules

In this order, inside every card:

1. **`Current position:`** — job 1, formatted `"{job_title} — {company} ({period})"`.
   Missing parts are dropped with their separator: title only → `"CFO"`;
   title + period → `"CFO (Jan 2020 – Dec 2024)"`.
2. **`Previous position:`** — jobs 2..n, same format, as an ordered list.
3. **`Experience:`** — every job's `experience`, split on newlines, in job order,
   as one ordered list. A job with no experience contributes nothing.
4. **One block per remaining column**, label = column name, value split on
   newlines the same way.

A block with no values is not rendered — no empty heading. A single value is a
plain line (`.bpc-value`); two or more are an `<ol class="bpc-list">`.

A director with nothing under any heading still gets their card, with
`<div class="bpc-empty">No positions recorded for this board member.</div>`
in the body. Never drop a person.

Labels are literal, with the colon: `Current position:`, `Previous position:`,
`Experience:`.

## 4. Markup

Set `--brand-primary` and `--brand-secondary` on an ancestor (the same values
the cover uses). Everything else is in the CSS.

### `cards_band` — the reference layout

```html
<div class="bpc-stack">
  <article class="bpc-band">
    <div class="bpc-band-head">
      <div class="bpc-banner">Mr. Abdulatif Ali AlSeif</div>
      <img class="bpc-photo bpc-band-photo" src="data:image/…" alt="">
    </div>
    <div class="bpc-cols">
      <div class="bpc-block">
        <div class="bpc-label">Current position:</div>
        <div class="bpc-value">Chief Executive Officer — Sabeen Investment Company</div>
      </div>
      <div class="bpc-block">
        <div class="bpc-label">Previous position:</div>
        <ol class="bpc-list"><li>…</li><li>…</li></ol>
      </div>
    </div>
  </article>
  <!-- one <article> per director -->
</div>
```

The photo comes **after** the banner in source order and is positioned over it —
it overhangs the top of the banner and its bottom sits on the rule. That
overhang is the layout; without it this is just a coloured bar.

### `cards_grid`

```html
<div class="bpc-grid">
  <article class="bpc-card">
    <img class="bpc-photo bpc-grid-photo" src="data:image/…" alt="">
    <div class="bpc-name-strip">Ahsan</div>
    <div class="bpc-card-body"><!-- blocks --></div>
  </article>
</div>
```

### `cards_row`

```html
<div class="bpc-stack bpc-stack--rows">
  <article class="bpc-card">
    <div class="bpc-row">
      <img class="bpc-photo bpc-row-photo" src="data:image/…" alt="">
      <div class="bpc-row-main">
        <div class="bpc-row-name">Ahsan</div>
        <div class="bpc-row-cols"><!-- blocks --></div>
      </div>
    </div>
  </article>
</div>
```

### No photo

Replace the `<img>` with the initials tile, keeping the same size class:

```html
<div class="bpc-initials bpc-band-photo">FA</div>
```

Initials are the first letters of the first two words of `Name`, uppercased;
`—` when there is no name.

## 5. The stylesheet

Verbatim from `src/pages/annual-report/board-profile-cards.css`:

```css
/* BR32 board profile cards — the one stylesheet for the screen AND the export.
 *
 * The React component (BoardProfileCards.tsx) carries no styling of its own:
 * every value lives here, so the exporter can use this file verbatim and the
 * download can't drift from the screen. Copy the file, don't retype it.
 *
 * Two inputs come from the report's brand, set as CSS custom properties on any
 * ancestor (the app sets them on the report frame):
 *   --brand-primary    banner, labels, name strip, rules   (fallback #4040C8)
 *   --brand-secondary  the rule under the band's banner    (falls back to primary)
 *
 * Class names: .bpc-* — "board profile cards".
 */

/* ── containers ─────────────────────────────────────────────────────────── */

.bpc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(232px, 1fr));
  gap: 18px;
}
.bpc-stack {
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.bpc-stack--rows {
  gap: 14px;
}

/* ── the card box (grid and row variants; the band has no box) ───────────── */

.bpc-card {
  border: 1px solid #eceef8;
  border-radius: 12px;
  background: #fff;
  overflow: hidden;
  break-inside: avoid;
}

/* ── photo, and the initials tile that stands in when there is none ──────── */

.bpc-photo {
  object-fit: cover;
  display: block;
}
.bpc-initials {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f2f3fa;
  color: #9ba3c4;
  font-size: 28px;
  font-weight: 800;
}

/* ── variant: grid — photo on top, name in a brand strip ─────────────────── */

.bpc-grid-photo {
  width: 100%;
  height: 158px;
}
.bpc-name-strip {
  background: var(--brand-primary, #4040c8);
  color: #fff;
  padding: 8px 12px;
  font-size: 13.5px;
  font-weight: 700;
}
.bpc-card-body {
  padding: 12px 12px 2px;
}

/* ── variant: band — photo standing over a brand banner ──────────────────── */

.bpc-band {
  break-inside: avoid;
}
/* The padding is the photo's overhang above the banner. */
.bpc-band-head {
  position: relative;
  padding-top: 46px;
}
.bpc-banner {
  height: 84px;
  display: flex;
  align-items: center;
  padding: 0 16px 0 180px; /* 180px clears the photo */
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
  /* Brand colour fading out to the right, with a dark scrim over the left so
     the name stays legible on a pale brand. Both layers, in this order. */
  background:
    linear-gradient(90deg, rgba(0, 0, 0, 0.42) 0%, rgba(0, 0, 0, 0.12) 46%, transparent 100%),
    linear-gradient(
      90deg,
      var(--brand-primary, #4040c8) 0%,
      var(--brand-primary, #4040c8) 52%,
      transparent 100%
    );
  border-bottom: 3px solid var(--brand-secondary, var(--brand-primary, #4040c8));
}
.bpc-band-photo {
  position: absolute;
  left: 10px;
  bottom: 3px; /* sits on the rule, not under it */
  width: 150px;
  height: 127px;
}

/* ── variant: row — photo left, everything else right ────────────────────── */

.bpc-row {
  display: flex;
  gap: 18px;
  padding: 16px;
  align-items: flex-start;
}
.bpc-row-photo {
  width: 132px;
  height: 132px;
  border-radius: 8px;
  flex: 0 0 auto;
}
.bpc-row-main {
  flex: 1;
  min-width: 0;
}
.bpc-row-name {
  font-size: 16px;
  font-weight: 700;
  color: #1a1d2e;
  border-bottom: 2px solid var(--brand-primary, #4040c8);
  padding-bottom: 7px;
  margin-bottom: 12px;
}

/* ── the two text columns (band and row) ─────────────────────────────────── */

.bpc-cols {
  columns: 2;
  column-gap: 40px;
  padding: 16px 2px 0;
}
.bpc-row-cols {
  columns: 2;
  column-gap: 28px;
}

/* ── labelled blocks ─────────────────────────────────────────────────────── */

.bpc-block {
  break-inside: avoid;
  margin-bottom: 12px;
}
.bpc-label {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--brand-primary, #4040c8);
  margin-bottom: 3px;
}
.bpc-value {
  font-size: 12.5px;
  color: #1a1d2e;
  line-height: 1.5;
}
/* Numbers sit in their own gutter, text hangs — as the printed report sets it. */
.bpc-list {
  margin: 2px 0 0;
  padding-left: 24px;
  font-size: 12.5px;
  color: #1a1d2e;
  line-height: 1.45;
}
.bpc-list li {
  margin-bottom: 3px;
}
.bpc-empty {
  font-size: 12px;
  color: #9ba3c4;
  font-style: italic;
}

/* ── narrow page / narrow column ─────────────────────────────────────────── */

@media (max-width: 620px) {
  .bpc-cols,
  .bpc-row-cols {
    columns: 1;
  }
  .bpc-row {
    flex-direction: column;
  }
}
```

## 6. Print notes

- `font-family` is inherited — the section takes the report's body face
  (`'Plus Jakarta Sans', sans-serif` on screen). Don't set one on the cards.
- `break-inside: avoid` is already on `.bpc-card`, `.bpc-band` and `.bpc-block`,
  so a card or a labelled list is never split across a page.
- `.bpc-cols` / `.bpc-row-cols` use CSS multi-column (`columns: 2`), which
  Chromium honours in print. Content flows down the left column first, then the
  right — same as the reference report.
- The `@media (max-width: 620px)` block only matters for narrow screens; at page
  width the two columns always apply.
- Photos are `object-fit: cover` at fixed sizes, so a portrait or landscape
  headshot both fill their frame without distortion.

## 7. Brand

`--brand-primary` colours the banner gradient, the labels, the grid name strip
and the row underline. `--brand-secondary` colours only the 3px rule under the
band's banner, and falls back to primary when a company has one colour. No
other colour in this section comes from the brand — the card border, the body
text and the initials tile are fixed neutrals, on purpose, so the text stays
readable whatever the brand is.

The dark scrim on the left of the banner is deliberate and must stay: it is what
keeps the white name legible when the brand colour is pale.
