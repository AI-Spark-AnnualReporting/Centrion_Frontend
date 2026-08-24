# Earnings Report — Flag "no data found" sections instead of writing a sentence (Backend spec)

## Context

Several narrative sections (`generate` mode) sometimes have nothing to write from —
confirmed live on real reports:

- **Guidance / Outlook**: `"No forward-looking guidance was disclosed in the uploaded
  documents for this period."`
- **Reporting Calendar / IR Contact**: `"No investor-relations calendar or contact
  information was found in the uploaded documents for this period."`

Today the producer writes a fixed boilerplate sentence into `content` and returns
`status: "produced"` — as if this were real prose. The frontend can't reliably tell
these sections apart from a section that has real (if brief) content, short of
pattern-matching the sentence's wording, which is fragile: it breaks the moment the
wording changes, and risks a false match on real content that legitimately starts with
"No" (e.g. "No dividends were declared this quarter, in line with the prior year." is
real information and must never be swept up as if it were empty).

**We want these sections to render as blank — as if nothing had been written yet —
both in the interactive report (Preview/Report screens) and in the exported PDF/DOCX.**
The frontend has already applied a stopgap for the first half (see
`isNoDataPlaceholder` in `src/pages/earnings/preview-helpers.ts` — it pattern-matches
the two sentences above and blanks the section on screen), but:

1. It's guessing your exact wording, which is brittle.
2. **It cannot touch the exported file at all** — `POST /reports/{id}/export` renders
   the PDF/DOCX entirely server-side from the same `content` field, so the boilerplate
   sentence still prints there regardless of what the frontend does.

## What's needed

When a `generate`-mode section's producer determines there's nothing to write (no
relevant data in the uploaded documents for that section), **don't write a "no data"
sentence into `content` at all.** Instead, one of:

- **Preferred**: return `content: null` (or `""`) and a new explicit signal that this
  is "found nothing," distinct from `needs_input` (this isn't asking the user for
  anything — it's an honest finding, not a gap the user is expected to fill) and
  distinct from `pending` (it already ran). Something like:
  ```json
  {
    "section_code": "s08_guidance_outlook",
    "status": "produced",
    "content": null,
    "no_data_reason": "No forward-looking guidance was disclosed in the uploaded documents for this period."
  }
  ```
  `no_data_reason` (or whatever field name fits your existing conventions — `empty_reason`,
  `gap_reason` reused from the table-mode rows, etc.) is still available for the frontend to
  show as a small explanatory note if it chooses to, but is never treated as the section's
  actual written content — meaning it never appears in the exported document's body
  text, only (optionally) as UI chrome.

- **Acceptable alternative**: reuse the existing `feeder_status` field (already
  `'ready' | 'template' | 'external' | 'needs_input' | null`) with a new value, e.g.
  `feeder_status: "no_data"`, alongside `content: null`. The frontend already reads
  `feeder_status` defensively today, so this is a smaller change on our side too.

Whichever shape you land on, the key behavior is:

1. **`content` itself never carries the "no data" sentence as if it were real prose.**
2. **The exported PDF/DOCX skips or blanks this section's body** the same way it
   already must handle a section with no content for any other reason — please confirm
   what that existing behavior is (omit the section from the export entirely? print an
   empty body under the heading? something else?) so the frontend can match it exactly
   for the interactive screens too.

## Why now

Two live examples today (Guidance/Outlook, Reporting Calendar/IR Contact) print a
verbose AI-sounding sentence in place of what should just read as "we don't have this."
It reads like the report is bluffing content it doesn't have, in both the on-screen
preview and — since export is server-rendered — every exported copy of the report, with
no way for the frontend to intervene on the export half at all.

## Non-blocking, nice-to-have

If it's easy: apply the same treatment to `table`/`kpi`-mode sections that currently
represent "no data" as an all-gap table (every row showing a gap badge) instead of a
sentence — same principle, different current symptom. Not blocking this spec; flagging
it in case it's a small follow-on once the `generate`-mode fix lands.
