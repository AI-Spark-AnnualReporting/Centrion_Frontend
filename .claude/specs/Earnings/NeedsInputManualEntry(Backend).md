# Earnings Report — Manual Input for needs_input Sections (Backend spec)

## Context

On the Preview screen, any section whose status is `needs_input` (real examples from a
live report: Segment Performance, Capital Allocation & Returns, Condensed Financial
Statements, Risk / Forward-Looking Disclaimer, Guidance / Outlook) now renders a text
box the user can type into directly, or an "Upload a document to extract from" button
that should prefill that same text box from an uploaded file. The user reviews/edits the
text, then clicks Save.

The frontend is built and calls two endpoints. One of them (A) already exists but isn't
doing what's needed; the other (B) doesn't exist yet.

## A. Fix: `POST /api/v1/earnings/reports/{report_id}/sections/{section_code}/produce`

This endpoint already accepts an optional `user_input` string in its JSON body and
returns 200 without validation errors. **Confirmed live, twice, that it currently has no
effect**:

Request (prose-mode section, `s17_risk_disclaimer`, mode=`generate`):
```json
POST /api/v1/earnings/reports/25d2af08.../sections/s17_risk_disclaimer/produce
{"user_input": "The board has flagged FX volatility in the SAR/USD peg as a forward-looking risk to imported input costs, alongside regulatory shifts under the Kingdom's new energy transition policy."}
```
Response — unchanged, as if `user_input` was never read:
```json
{"section_code": "s17_risk_disclaimer", "status": "needs_input", "content": "Awaiting input: management input", "error": null}
```

Request (table-mode section, `s07_segment_performance`, mode=`table`):
```json
{"user_input": "The board approved a SAR 500M share buyback program in Q1 2026, with SAR 120M executed to date."}
```
Response:
```json
{"section_code": "s07_segment_performance", "status": "needs_input", "content": null, "error": "no resolved figures for this section"}
```

**What's needed**: when `user_input` is present on a needs_input section, use it to
actually produce the section's content instead of re-running the same "look for
resolved figures/feeder data" path that got it into needs_input in the first place:

- **Prose-mode sections** (`generate`, e.g. Risk Disclaimer, Guidance/Outlook, MD&A):
  write the section's narrative directly from `user_input`, in the report's existing
  tone, the same way any other AI-written section is composed — `user_input` is the
  factual material to narrate, not necessarily the literal final text.
- **Table/KPI-mode sections** (e.g. Segment Performance, Capital Allocation, Condensed
  Financial Statements, Balance Sheet): parse `user_input` for the figures/line-items
  this section's catalog expects (see the section's `line_items` from
  `GET .../outline`) and populate them structurally, the same shape `content` normally
  carries for that section (a JSON envelope with `rows: [...]`). If some catalog items
  still aren't resolvable from the given text, that's fine — represent those rows as
  gaps (`gap_reason`), same as today; don't require 100% coverage to accept the input.
- **On success**: return the section with `status: "produced"` (or whatever the
  produced/resolved status value is) and real `content`. Whatever the frontend gets
  back replaces this section's content immediately — no polling needed, this isn't an
  async run.
- **On failure** (e.g. `user_input` genuinely doesn't contain anything usable for this
  section): keep `status: "needs_input"` and return a `message`/`error` explaining why,
  so the user knows to try again with more specific input — don't silently no-op like
  today.

**Response shape actually returned today is minimal** — only `section_code`, `status`,
`content`, `error`. The frontend merges this onto its cached copy of the section rather
than replacing it wholesale (so it doesn't lose `title`/`mode`/etc.), but if it's easy to
also include `title`, `mode`, `source_type` on this response (matching the shape
`GET /sections` returns per row), that removes a merge-fragility risk on the frontend
side — nice-to-have, not blocking.

## B. New: extract text from an uploaded document (no DB write)

Needed so "Upload a document to extract from" can prefill the textarea for the user to
review before they hit Save — it must NOT save anything itself.

Proposed:
```
POST /api/v1/earnings/reports/{report_id}/sections/{section_code}/extract-input
Content-Type: multipart/form-data
  file: <the uploaded document>
```
Response:
```json
{ "extracted_text": "..." }
```
(The frontend also accepts `text` or `content` as alternate key names if that's more
consistent with other endpoints — whichever the backend team prefers, just needs to be
one of those three keys.)

Semantics:
- Extract whatever's relevant to this section from the uploaded file (same kind of
  extraction the initial document-upload pipeline already does, just scoped to one
  section's need instead of the whole report) and return it as **plain text** — even
  for table-mode sections, since the user gets a chance to review/edit it as text
  before saving; the actual structuring back into table rows happens in Save/produce
  (part A above), not here.
- No database write of any kind — calling this twice with the same file, or never
  calling Save afterward, must leave the report completely unchanged.
- Route/field names above are a proposal, not confirmed — whatever the actual
  route/shape turns out to be, let us know and we'll point the frontend at it (currently
  pointed at the exact route/shape above as a placeholder).

## Why now

This is what makes a needs_input section (evaluated live: ~5 of 19 sections on a real
in-progress report) actually resolvable by the user without re-running the whole
document pipeline — right now, once a section lands in needs_input, there is no path
to resolve it at all short of re-uploading a whole new source document and hoping the
extraction pipeline picks it up on its own.

## Related, lower-priority ask

`GET /api/v1/earnings/reports/{report_id}/sections` doesn't carry the `feeder` object
that `GET/PUT /outline` already returns (confirmed live — `GET /sections` only has the
flat `status` field, no `feeder`). Because of that, the frontend currently can't
distinguish, at the section level, a genuinely-fixable `needs_input` section from a
permanently-`external` one (Consensus vs Actual, Peer/Benchmark Comparison) — it
currently infers this from `status` alone (external sections happen to show up as
`pending` today since they're not included, not because `status` reliably encodes
"external"). Adding the same `feeder` object to `GET /sections` that already exists on
`GET/PUT /outline` would let the frontend gate the input form precisely instead of by
inference. Not blocking A/B above — just flagging it since we hit it while building this.
