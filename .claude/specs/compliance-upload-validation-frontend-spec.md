# Compliance Validation — Validate an uploaded report

> **Status: built**, then revised. An unreadable file is reported on the progress
> screen, not the form.
>
> **Superseded in four places** — an upload is now a *document*, not a report, so it
> no longer leaks into the Reports module:
> 1. `POST /runs/upload` no longer returns `report_id`. The 202 carries `run_id`
>    only; the subject appears on the run once extraction succeeds.
> 2. `subject_type` has a third value, `"document"`.
> 3. `period` is **required** in `POST /runs` when `subject_type` is `"document"` —
>    an uploaded file records none of its own. Missing → 422.
> 4. An `unreadable_file` failure deletes the document, so `subject_id` is null on
>    that row. Nothing to re-run; only *try a different file* applies.
>
> The sections below still describe the flow correctly; where they mention
> `report_id` or `subject_type: "report"` for an upload, read the list above.

Adds a second way into the existing validation flow: instead of picking an approved
report from the Source list, the user uploads a finished file. **Everything after the
upload is unchanged** — same progress screen, same poll, same review screen, same
resolve popup, same certify button.

Base URL: `{API_HOST}/api/v1/compliance` · Auth: `Authorization: Bearer <jwt>`, same as
the rest of the app (handled by `request` / `postForm` in `src/lib/api.ts`).

Files you will touch:

| File | Change |
|---|---|
| `src/types/compliance.ts` | `UploadRunPayload`, `UploadRunResponse`, `source` on `Candidate`, widen the error-detail union |
| `src/lib/api.ts` | `complianceValidation.createUploadRun` |
| `src/pages/compliance/ComplianceSetupPage.tsx` | "Upload a report" option, period picker, file input, upload submit path |
| `src/pages/compliance/ComplianceRunningPage.tsx` | longer expectation copy for uploads; retry uses the returned `report_id` |

---

## 1 · The new endpoint

`POST /api/v1/compliance/runs/upload` — **multipart/form-data**, not JSON.

| Field | Required | Notes |
|---|---|---|
| `file` | yes | Exactly one file. **The field name is `file`, singular** — not `files`. `.pdf`, `.docx`, `.xlsx`, `.csv`, `.txt`, under 50 MB |
| `company_id` | yes | `user.company_id` from `useAuth()` |
| `report_type` | yes | `annual` \| `quarterly` \| `esg` \| `board_pack` — the selected tab |
| `period` | yes | `FY-2025` or `Q3-2025`, exactly this format. **Collected from the user — see §3** |
| `entity_type` | yes | `corporate` \| `bank` \| `insurer` |
| `market` | no | Defaults to `Main` server-side |
| `enabled_frameworks` | no | Repeated field, one `append` per regulator, same semantics as `POST /runs`. **Omitted / empty = no filter (every rule runs)** — the opposite of "none selected", so keep the existing guard that blocks submit when the user has switched every chip off |
| `content_language` | no | `english` \| `arabic`, nothing else. Omit unless the app already knows it |

Do **not** set `Content-Type` yourself — the browser must set the multipart boundary.
`postForm` in `src/lib/api.ts:246` already does exactly this (auth header, no
Content-Type, `ApiError` on failure); reuse it, don't hand-roll a `fetch`.

```ts
// src/lib/api.ts — inside `export const complianceValidation = { … }`

// Validate a report we didn't generate. Multipart, and asynchronous in the same
// way createRun is: 202 before anything has been checked, then poll getRun().
// The 202 also carries a `report_id` — the uploaded file is now a real subject,
// so a re-run needs no second upload.
createUploadRun: (body: UploadRunPayload) => {
  const fd = new FormData();
  fd.append("file", body.file);                     // singular — one file only
  fd.append("company_id", body.company_id);
  fd.append("report_type", body.report_type);
  fd.append("period", body.period);                 // "FY-2025" | "Q3-2025"
  fd.append("entity_type", body.entity_type);
  if (body.market) fd.append("market", body.market);
  (body.enabled_frameworks ?? []).forEach((r) => fd.append("enabled_frameworks", r));
  if (body.content_language) fd.append("content_language", body.content_language);
  return postForm<UploadRunResponse>(`${COMPLIANCE_BASE}/runs/upload`, fd);
},
```

### Success — 202

```json
{ "run_id": "9f3c…", "report_id": "b21c…", "status": "running", "checks_queued": 21 }
```

No scores, same as `POST /runs`. Keep `run_id`, navigate to the progress screen.

---

## 2 · Types

In `src/types/compliance.ts`:

```ts
// POST /runs/upload. Multipart, so this isn't a JSON body — the api layer walks
// these into a FormData. `file` is one File, never an array: the endpoint takes
// exactly one.
export interface UploadRunPayload {
  file: File;
  company_id: string;
  report_type: ReportType;
  // "FY-2025" for annual/esg/board_pack, "Q3-2025" for quarterly. There is no
  // record to read this off — an uploaded PDF carries no period, so the user
  // supplies it. Format is exact.
  period: string;
  entity_type: EntityType;
  market?: Market;
  enabled_frameworks?: string[];
  content_language?: "english" | "arabic";
}

// Like CreateRunResponse, plus the id of the report row the upload created.
// That row is a normal candidate from here on, so a retry can go through the
// ordinary POST /runs with subject_type "report".
export interface UploadRunResponse extends CreateRunResponse {
  report_id: string;
}
```

And on `Candidate`, the one change to an existing endpoint — `GET /candidates` now
returns `source` on every row:

```ts
// How this subject got here.
//   "generated" — we produced it and the company approved it (previous behaviour)
//   "upload"    — the user uploaded it; `title` is their filename and `status`
//                 is "locked"
export type CandidateSource = "generated" | "upload";

export interface Candidate {
  …
  source: CandidateSource;
}
```

Uploaded reports **stay** in `/candidates`, so re-running a validation needs no second
upload. Uploaded annual reports come back with `subject_type: "report"` (not `"cycle"`);
the existing code passes `subject_type` and `subject_id` straight through, so that
already works — do not special-case it.

---

## 3 · Setup screen (`ComplianceSetupPage.tsx`)

Card 1 currently renders the report-type `PillGroup` then a radio list of `Candidate`
rows. Add upload as a **second mode of the same card**, not a new card.

### Mode switch
A two-option control above the list: `Approved reports` (default) | `Upload a report`.
Prefer restyling the existing `PillGroup` for this rather than introducing a new
control type — it is the same single-select affordance already used twice on this
screen. Switching modes clears `selected` / the upload draft and any `runError`.

### Upload mode fields
- **File** — `<input type="file" accept=".pdf,.docx,.xlsx,.csv,.txt">`, single.
  Validate **in the browser** before submitting:
  - size ≤ 50 MB — reject locally so a large file isn't uploaded just to be refused
  - extension in the accept list
  Show the chosen filename + size, with a way to clear it.
- **Period** — the new bit, and the part most likely to be got wrong:
  - `annual` / `esg` / `board_pack` → a **year** dropdown → `FY-${year}`
  - `quarterly` → **quarter + year** pair → `Q${n}-${year}`
  Years: current year back to `FIRST_RULED_YEAR` (2024, already defined at
  `ComplianceSetupPage.tsx:66`). Anything earlier matches zero rules, which is the
  exact failure the existing `isPreRules` grey-out prevents on the picker path — keep
  that consistency rather than letting the user pick 2023 and take a 400.
  Send the composed string verbatim; never send a bare year or `2025-Q3`.
- **entity_type / market / frameworks** — unchanged. Card 2 already collects these and
  both paths use the same state. Do not duplicate them into the upload panel.

### Submit
`canRun` becomes: (picker mode → a candidate selected) **or** (upload mode → a file
chosen and a period chosen), plus the existing `enabled.length > 0 && !starting`.

On submit in upload mode call `createUploadRun`, then navigate exactly as the existing
path does — but hand the progress screen a **normal** `CreateRunPayload` built from the
response so retry works without re-uploading:

```ts
complianceValidation.createUploadRun({ file, company_id: companyId, report_type: reportType,
                                       period, entity_type: entityType, market,
                                       enabled_frameworks: enabled })
  .then((res) =>
    navigate(`/compliance/runs/${res.run_id}/running`, {
      state: {
        // Not the upload payload — a File in history state is a trap on refresh.
        // The 202 gave us a report_id, so the retry is an ordinary re-run.
        payload: {
          subject_type: "report", subject_id: res.report_id,
          report_type: reportType, entity_type: entityType,
          market, enabled_frameworks: enabled,
        },
        checksQueued: res.checks_queued,
        subjectTitle: file.name,
        fromUpload: true,
      } satisfies ComplianceRunningState,
    }),
  )
```

**Never show the progress screen until you have the 202.** Every error below comes back
immediately, before any file work happens — routing first and failing after would strand
the user on a loader for a run that does not exist.

---

## 4 · Errors

All immediate. `detail` is **not always a string** — handle three shapes. Extend the
existing `readRunRejection` (`ComplianceSetupPage.tsx:83`) rather than writing a second
reader; it already covers shapes 1 and 2.

1. **a plain string** — show it
2. **an object `{ message, reason, period_end }`** — the no-rules case. Render `reason`
   verbatim, it is written for the user. Usual cause: a reporting period older than any
   rule's `effective_from` (2024-01-01), so a 2023 report matches nothing
3. **an array of `{ loc, msg }`** — FastAPI's own missing-field error, including a
   missing file. Join the `msg` values; `loc` is for the console, not the banner

```ts
function readComplianceDetail(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const detail = (err.body as { detail?: unknown } | undefined)?.detail;
  if (!detail) return null;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => (d as { msg?: string })?.msg).filter(Boolean).join(" · ") || null;
  }
  const o = detail as RunRejectedBody;
  return o.reason ?? o.message ?? null;
}
```

| Code | Meaning | Treatment |
|---|---|---|
| 400 | bad `report_type`; or no compliance rules matched | amber banner, stay on the form |
| 403 | `company_id` isn't the caller's company | shouldn't reach the user — generic error |
| 422 | `period` doesn't parse, no file attached, unsupported file type, file language | point at the offending field |
| 500 | couldn't create the run | generic "try again" |

Reuse the existing amber `runError` banner (`ComplianceSetupPage.tsx:649`) for all of
them — no new error surface.

---

## 5 · Polling

Unchanged: `GET /compliance/runs/{run_id}` every ~3s until `status` is no longer
`running`. `useComplianceRunPoll` (`compliance-ui.tsx:443`) already does this at 2500 ms
with a 5-minute ceiling, which clears the required ~4-minute floor — **do not lower it**.

- `done` → the review screen
- `error` → the file couldn't be read. Most common cause is a scanned PDF with no text
  layer. The existing terminal-error branch already offers retry + back; add that cause
  to its copy when `fromUpload`, and point the user at trying a different file

While running the response has `overall_readiness: null` and empty `gaps` / `rule_detail`
— never render it as a result. The existing null-checks cover this.

**Expect 60–90 seconds**, longer than a picker run because the file has to be read before
it can be judged. The running screen's caption is hard-coded `usually 30–60s`
(`ComplianceRunningPage.tsx:216`) — switch it to `usually 60–90s` when `fromUpload` is
set, and adjust the "taking longer than expected" copy the same way.

---

## 6 · Candidates list

Add a small **`Uploaded`** badge to `SubjectRow` when `source === "upload"`, beside the
existing `period · status` line. Nothing else changes — `title` is the user's filename
and `status` is `"locked"`, both already rendered.

---

## The three things most likely to be got wrong

1. The file field is **`file`**, not `files` — every other upload in this codebase uses
   `files`, so the copy-paste will be wrong by default.
2. **`period` must be collected from the user** in the exact `FY-2025` / `Q3-2025` form.
   There is no record to derive it from.
3. **`detail` has three possible shapes** in the error responses; a `String(detail)` will
   print `[object Object]` at the user.

---

## Confirm with the backend before building

Your pasted spec arrived truncated in several places. These are my reconstructions, not
quotes — check each:

- the `company_id`, `entity_type`, `enabled_frameworks` and `content_language` notes in
  the field table were cut off mid-sentence; I assumed they mirror `POST /runs`
- the error table's 400 rows were truncated (`report_type …`, `No complian…`) and the 500
  row (`Couldn't cr…`); wording above is inferred
- `content_language` — is it validated against the file's detected language (i.e. can it
  cause the 422 "file language" error), or purely a hint?
- does the 202 fire before or after the file is parsed? "Expect 60–90 seconds" implies
  parsing happens in the background, but a corrupt-file 422 at upload time would mean
  otherwise
- confirm uploaded **annual** reports really come back as `subject_type: "report"` — the
  sentence naming it was cut mid-word
