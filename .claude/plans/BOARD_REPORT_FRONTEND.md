
## Screen 2 — Source documents

`GET /board/reports/{id}/sources` → `{ slots: [...], received, total }`.

### Layout

One row per slot:

```
Governance register              [Required]        [ Attach file ]
Feeds → BR04, BR19, BR30, BR31, BR33, BR34, BR35, BR36, BR37, BR39
```

`required: true` earns the badge. Sort order is already correct (required first) — render
`slots` as received.

### Upload — collect first, then process once

This is the important part. **Do not upload on file-pick.** Let the user attach files across
as many slots as they like, holding them in local state, then enable one button:

```js
// local state: { [slotName]: File }
const staged = { "Audited financial statements": fsFile, "Governance register": govFile };

async function processDocuments() {
  const body = new FormData();
  for (const [slot, file] of Object.entries(staged)) {
    body.append("files", file);
    body.append("slots", slot);      // positionally matched to files
  }
  const { run_id, poll_url } = await api.post(`/board/reports/${id}/sources/upload`, body);
  watchRun(poll_url);                // see "Polling" below
}
```

One call, one run, all files extracted concurrently. If you upload per slot instead, the
second call gets a **409** — only one job may run per report.

While the run is active: disable the process button, show loader and design of loader is eaxactly like we do in other reports and content of loader is according to process, keep the slot rows
visible. When it finishes, refetch `GET /sources` — filed slots flip to `received` with their
document listed.

**Replace / remove** → `DELETE /board/reports/{id}/sources/{document_id}`. This only clears
the slot tag; the file stays in the company's document bank. "Replace" is delete-then-attach.

---

## Screen 3 — Resolved sections

`GET /board/reports/{id}/outline` → all **46** sections plus `counts`.

### Render every one of them

Do not filter. A section that doesn't apply is information the user needs.

| `resolution` | Render |
|---|---|
| `in` | normal |
| `variant` | normal + the `note` beneath it |
| `dropped` | greyed, struck through, + `note` |
| `na` | greyed + `note` |

Offer a **"Hide non-applicable"** toggle (your mockup already had it), defaulting to showing
them.

Per row: `section_code`, `title`, an `M`/`O`/`C` chip from `requirement`, the `data_source`
as a small tag, and `note` in italics when present.

### Reordering and toggling

`PUT /board/reports/{id}/outline` with `{ sections: [{ section_code, included }, ...] }` —
**array order is display order**.

- Mandatory rows: lock the checkbox on. The server forces them included anyway.
- `dropped` / `na` rows: no checkbox. Sending `included: true` for one is a 422 and nothing
  saves.
- Everything else: free.

---

## Screen 4 — The report

### Producing

Two entry points:

```js
// everything, in order, in the background
const { poll_url } = await api.post(`/board/reports/${id}/produce`);

// one section, synchronous, cached
await api.post(`/board/reports/${id}/sections/BR32/produce?regenerate=true`);
```

Use the batch call for the main "Generate report" button; use the single-section call for a
per-section **Regenerate**. A single-section call returning `cached: true` means nothing it
depends on changed — that's a success, not a no-op to retry.

A **422** on a single section means it has no producer yet (BR13, BR15, BR21). Don't offer a
regenerate button on those.

### Reading the content

`GET /board/reports/{id}/sections` returns every section with its `content`. **`content` is a
string that usually holds JSON.** Parse, then branch on the keys:

```js
function parseContent(raw) {
  try { return JSON.parse(raw); } catch { return raw; }   // prose stays a string
}

const c = parseContent(section.content);
if (typeof c === "string")      renderProse(c);
else if (c.columns)             renderGrid(c);            // governance table
else if (c.rows)                renderStatement(c);       // financial table
else if (c.template_key)        renderCover(c.values);    // BR01 only
```

**Governance grid** — `columns` is a list of names; each row is an object keyed by those
names. Build the table from `columns`; never hardcode them. The attendance table grows one
column per meeting the board held, so a 6-meeting company and a 9-meeting company produce
different shapes.

**Financial statement** — flat `rows` with `role` and `indent`:

| `role` | Render |
|---|---|
| `header` | bold band, label only, no values |
| `line` | normal row, indent × 12px |
| `subtotal` / `total` | bold, top border |

`current_display` of `"—"` means the line applies but no figure was extracted. Show the dash;
it's deliberate.

### Section status

| `status` | UI |
|---|---|
| `produced` | show content, allow edit |
| `needs_input` | amber — show `feeder.message`, which says exactly what's missing |
| `empty` | grey — omitted, show `feeder.message` ("no fines this year") |
| `pending` | not produced yet |

### Provenance — the part that matters

```js
if (s.provenance === "carried_forward" && !s.confirmed) {
  // amber banner: "From FY-2024 — confirm still accurate"
  // button → POST /board/reports/{id}/sections/{code}/confirm
}
```

This is the safeguard against last year's board list going out as this year's. It must be
visually loud, and the report cannot be approved until every one is confirmed.

Where a section came from is in `feeder`: `citations` (document + page) for extracted
content, `carried_forward_from` for a carried section, `extraction_note` for a governance
table (*"Read 3 row(s) from a table on page 164"*). Show it — a reviewer needs to trace a
line back to its source.

### Editing

`PATCH /board/reports/{id}/sections/{code}/content { content }` — send a string, or
`JSON.stringify(obj)` for a table. The edit wins over anything the server would regenerate.

---

## Finishing

`GET /board/reports/{id}/completion` drives the status strip:

> **33 of 37 ready** · 2 awaiting this year's data · 1 carried forward pending confirmation

Enable **Approve** only when `can_approve` is true. If it's false and the user clicks anyway,
the 409 body *is* the completion payload — list `awaiting_data` and `pending_confirmation` as
clickable links that jump to those sections.

- `GET /assemble` — preview payload, identical to what the exporter renders
- `POST /export?format=pdf|docx` — file bytes, `Content-Disposition` attachment
- `POST /approve` — locks the report; after this every mutating call returns 409, so switch
  the whole UI to read-only

---

## Polling

Two endpoints return 202 with a `poll_url`: upload and produce-all.

```js
function watchRun(pollUrl, onProgress) {
  const timer = setInterval(async () => {
    const run = await api.get(pollUrl);
    onProgress(run.output_summary);            // {produced, skipped, failed, total}
    if (run.status !== "running") {
      clearInterval(timer);
      refetchEverything();
    }
  }, 3000);
  return () => clearInterval(timer);           // clear on unmount
}
```

`output_summary` updates after each file/section, so show a real count, not a spinner.
Produce-all over ~30 sections takes a couple of minutes.

---

## Error handling

| Code | Meaning | What to do |
|---|---|---|
| 404 | report/section/document not found — also what a foreign company's report returns | send back to the reports list |
| 409 on create | unfinished report exists | offer `existing_report_id` |
| 409 on upload | a job is already running | show the running job, don't retry |
| 409 on approve | gate not met | body is the completion payload — list what's missing |
| 409 on any edit | report is approved/locked | switch to read-only |
| 422 | bad profile, unknown slot, slots/files mismatch, section has no producer | show `detail` |

---

## Don't build yet

- **BR13, BR15, BR21** have no producer — they return 422 on produce and appear under
  `skipped_no_producer` in the batch result. Render them as "not available yet".
- **Bank-specific sections** (Basel, NPLs, SAMA balances) resolve into a bank's outline but
  produce nothing.
- **Cover template / brand pickers** aren't exposed on the board routes; the cover uses the
  company's brand colours automatically.

---

## Build order

1. Reports list + create → screen 1 (profile + counts). Proves the resolver end to end.
2. Screen 3 (outline). Flip issuer type on screen 1 and watch sections change — that's the demo.
3. Screen 2 (staged upload + one batch + progress).
4. Screen 4 (produce, the three content renderers, inline edit).
5. Completion strip, confirm buttons, approve, export.
