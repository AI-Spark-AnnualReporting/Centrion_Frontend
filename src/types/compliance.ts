// Compliance Validation — a 3-step wizard (Set up → Review → Gate) that runs a
// report against its applicable regulators and gates publication behind
// certification. Shapes match the backend's Compliance Validation API doc.
//
// Base path: /api/v1/compliance

export type ReportType = "annual" | "quarterly" | "esg" | "board_pack";

export type EntityType = "corporate" | "bank" | "insurer";

export type Market = "Main" | "Nomu";

// A run's subject can live in three different places, so every run identifies
// it with a (type, id) pair rather than a bare id.
//   ESG / Quarterly we generated → "report"   + reports.id
//   Annual we generated          → "cycle"    + reporting_cycles.id
//   A file the user uploaded     → "document" + documents.id
// An upload is deliberately NOT a report: writing one would put files nobody
// generated into the Reports module. Callers pass the pair straight through and
// never need to know which table it points at — with one exception, `period`,
// which only a document requires. See CreateRunPayload.
export type SubjectType = "report" | "cycle" | "document";

// Gate strength. HARD blocks publication, SOFT is advisory, WATCH informational.
export type Gate = "HARD" | "SOFT" | "WATCH";

// The API returns these lower-case.
export type Severity = "high" | "medium" | "low";

// All four occur. The renderer must branch on each explicitly — there is no
// safe default, because the two grey states mean different things:
//   pass    — the report evidences the rule.
//   fail    — it doesn't, or only partially (see `Gap.finding`, which then
//             starts "Partially evidenced." and still carries evidence.quote).
//   na      — the rule doesn't govern this company.
//   no_data — no verdict. Either answered by a filing outside this report
//             (`unreachable: true`, grey, unscored) or the validator failed to
//             return one (`unreachable: false`, amber, scored against us).
//             Never red either way; branch on the flag, not the status.
export type CheckStatus = "pass" | "fail" | "na" | "no_data";

export type PublicationGate = "open" | "blocked";

// Lifecycle of a run. The checker reads the whole report through an LLM, so a
// run is asynchronous: POST /runs answers `running` in under a second and the
// work lands 30–60s later.
//   done  — terminal, results are populated.
//   error — terminal, the report couldn't be read. It will NEVER become done.
// Anything else (incl. an unrecognised value) is treated as still in flight.
export type RunStatus = "running" | "done" | "error";

export function isTerminalStatus(status: string | undefined): boolean {
  return status === "done" || status === "error";
}

export function isRunFailed(status: string | undefined): boolean {
  return status === "error";
}

export function isRunDone(status: string | undefined): boolean {
  return status === "done";
}

// ---------------------------------------------------------------------------
// GET /preview
// ---------------------------------------------------------------------------

// A framework chip. The API returns only the regulator code and its check
// count — there's no label, gate or applicability flag, so every returned
// framework is selectable and defaults to ON.
export interface PreviewFramework {
  regulator: string;
  checks: number;
}

export interface CompliancePreview {
  frameworks: PreviewFramework[];
  framework_count: number;
  check_count: number;
}

// ---------------------------------------------------------------------------
// POST /runs
// ---------------------------------------------------------------------------

export interface CreateRunPayload {
  subject_type: SubjectType;
  subject_id: string;
  report_type: ReportType;
  entity_type: EntityType;
  market?: Market;
  // Empty/omitted means "no framework filter" — every applicable rule runs.
  enabled_frameworks?: string[];
  // REQUIRED when subject_type is "document", ignored otherwise. A generated
  // report knows its own period; an uploaded file records none, so re-running
  // one has to be told again — and it isn't cosmetic, it decides which
  // regulations were in force. Missing or malformed is a 422.
  period?: string;
  content_language?: ContentLanguage;
}

// Everything about a run except which subject it is about. The upload path
// can't name its subject up front — the document doesn't exist until the file
// has been read — so the two travel separately until the run reports back.
export type RunSettings = Omit<CreateRunPayload, "subject_type" | "subject_id">;

// POST /runs is 202 Accepted. It returns before a single check has been made —
// there are no scores in this body and there is no point looking for them. Keep
// the run_id, send the user to the progress screen and poll GET /runs/{run_id}.
export interface CreateRunResponse {
  run_id: string;
  status: RunStatus;
  checks_queued: number;
}

// ---------------------------------------------------------------------------
// POST /runs/upload
// ---------------------------------------------------------------------------

// The other way in: validate a report we didn't generate. Same run, same poll,
// same results — the only difference is that the subject arrives as a file
// rather than as a row we already hold.
//
// This is not a JSON body. The endpoint is multipart/form-data and the api
// layer walks these fields into a FormData; the shape exists so the call site
// still gets named, checked fields.
export interface UploadRunPayload {
  // One File, never an array. The endpoint takes exactly one and the field is
  // named `file` — every other upload in this app sends `files`.
  file: File;
  company_id: string;
  report_type: ReportType;
  // "FY-2025" for annual/esg/board_pack, "Q3-2025" for quarterly, exactly.
  // Nothing to derive this from: an uploaded PDF carries no period record, so
  // the user supplies it.
  period: string;
  entity_type: EntityType;
  market?: Market;
  // Same semantics as CreateRunPayload: empty/omitted means "no filter".
  enabled_frameworks?: string[];
  content_language?: ContentLanguage;
}

export type ContentLanguage = "english" | "arabic";

// 202 Accepted, exactly like POST /runs — the run id and nothing more.
//
// There is deliberately no subject id here. The upload becomes a document only
// once its text has been extracted, which hasn't happened yet at 202. Poll the
// run: GET /runs/{run_id} carries the subject once there is one.
export type UploadRunResponse = CreateRunResponse;

// Accepted upload formats, shared by the file input's `accept` and the local
// pre-flight check. The server enforces these too — checking here just saves
// the user a 50 MB round trip to be told no.
export const UPLOAD_EXTENSIONS = [".pdf", ".docx", ".xlsx", ".csv", ".txt"] as const;
export const UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

// ---------------------------------------------------------------------------
// GET /runs/{run_id}
// ---------------------------------------------------------------------------

// `score` is null when nothing in the framework was scoreable. Render text, not
// 0%.
//
// The denominator is `total`, and `total` is NOT the number of rules that
// apply — it's pass + fail + no_data, excluding `na` and `unreachable`. A rule
// no version of this report could ever satisfy is outside the score entirely,
// which is why a flawless CMA quarterly is 3/3 and not 3/5. Never print a score
// as "/100" without also reading `unreachable`.
export interface FrameworkScore {
  regulator: string;
  score: number | null;
  passed: number;
  // pass + fail + no_data. Excludes na and unreachable.
  total: number;
  // total − passed. Rules answered elsewhere are not counted as missing.
  missing: number;
  // Only the rules the validator failed to return a verdict for. Scored
  // against, but transient — a re-run may clear it. NOT the same thing as
  // "answered outside this report"; see `unreachable`.
  no_data: number;
  not_applicable: number;
  // Answered by a filing record or external register, so no report could ever
  // satisfy them. Excluded from `total` — nobody's gap.
  unreachable: number;
}

// What the checker read, and what it concluded from it. Every key is OPTIONAL
// and absent — not null — when it doesn't apply: a `no_data` result carries only
// `evidence_source`. Always reach through with `evidence?.quote`; never
// destructure assuming a key is there.
export interface CheckEvidence {
  // The sentence from the report the verdict rests on. The single most useful
  // thing here — show it verbatim as a pull-quote.
  quote?: string;
  // Which section of the report the quote came from, e.g. "governance_report".
  section_code?: string;
  // The checker's reasoning over the quote.
  proof?: string;
  // The checker's own word for the outcome, e.g. "satisfied". `status` is the
  // authority on pass/fail — this is descriptive colour only.
  verdict?: string;
  // 0–1. Display only, as a tooltip. NEVER gate on it: `status` already encodes
  // the threshold, so re-applying one here would double-count it.
  confidence?: number;
  // Plain-English phrases now ("dividend policy"), not indicator codes. Render
  // them straight to screen — there is nothing left to map through a lookup.
  found?: string[];
  missing?: string[];
  evidence_source?: string;
  // 1-based page of the source document the quote was read from. Present on
  // rule-detail rows that were answered by the report itself; null on the ones
  // answered by a filing or register elsewhere, which have no page to point at.
  page?: number | null;
  // Which uploaded file the quote came from, when a run had more than one.
  source_file?: string | null;
}

// Only `status === "fail"` rows appear here. This is the action list.
// A partially-evidenced rule is a fail: `finding` opens with "Partially
// evidenced.", `evidence.quote` is still populated (the author wrote something,
// it just isn't enough), and it blocks a HARD gate like any other failure.
export interface Gap {
  result_id: string;
  rule_id: string;
  regulator: string;
  severity: Severity;
  gate: Gate;
  finding: string;
  evidence: CheckEvidence | null;
  resolved: boolean;
}

// Per-rule row in the expandable table. Note there is no description, logic or
// parameter.
//
// The evidence arrives FLAT on the row — `quote`, `proof`, `section_code`,
// `page`, `source_file` as siblings of `rule_id` — where a gap nests the same
// information under `evidence`. Rather than make every renderer branch on which
// shape it got, `normalizeRun()` folds the flat fields into `evidence` on the
// way in, so downstream there is one shape. Read `evidence`; the flat fields
// below are the wire form and are declared only so the adapter is type-checked.
export interface RuleTrace {
  rule_id: string;
  status: CheckStatus;
  gate: Gate;
  // The only way to tell the two kinds of `no_data` apart: true means the
  // answer lives in a filing or register outside this report (grey, nobody's
  // fault, unscored), false means our validator returned no verdict (amber,
  // ours, re-validate). Never branch on `status` alone for a no_data row.
  unreachable?: boolean;
  evidence_source?: string;
  evidence?: CheckEvidence | null;
  // ── flat wire fields (see above) ──
  quote?: string | null;
  proof?: string | null;
  section_code?: string | null;
  page?: number | null;
  source_file?: string | null;
}

// Full per-regulator breakdown, including no_data and unreachable rows.
export interface RuleDetailGroup {
  regulator: string;
  rules: RuleTrace[];
}

// The same shape comes back at every stage of the run. While `status` is
// "running" the result fields are empty placeholders: `overall_readiness` and
// `publication_gate` are null and the three lists are []. That null gate is why
// every gate banner must test for null explicitly — falling through to an
// `=== "blocked" ? … : …` would render a green "Ready to publish" over a run
// that hasn't been checked yet.
export interface ComplianceRun {
  run_id: string;
  subject_type: SubjectType;
  // Null when the subject is gone: a file that couldn't be read is deleted,
  // leaving a run with a title and a period but nothing left to re-run. Only
  // `unreadable_file` does this — llm_unavailable and internal keep theirs.
  subject_id: string | null;
  report_type: ReportType;
  status: RunStatus;
  certified: boolean;
  // Plain average of the non-null framework scores. Null while running, and
  // still null afterwards if nothing was scoreable at all.
  overall_readiness: number | null;
  publication_gate: PublicationGate | null;
  frameworks: FrameworkScore[];
  gaps: Gap[];
  rule_detail: RuleDetailGroup[];
  // Progress hints. `checks_queued` mirrors the POST response. `checks_completed`
  // is optional — if the backend starts reporting it the progress screen shows a
  // true percentage; without it the screen stays honestly indeterminate rather
  // than animating a number nobody measured.
  checks_queued?: number;
  checks_completed?: number;
  // Present on `status === "error"` runs when the backend explains itself.
  error?: string;
  error_message?: string;
  // Why it failed, when the backend knows. Null/absent on runs from before the
  // column existed, so never branch on it without a generic fallback.
  error_code?: RunErrorCode | null;
}

// Only `unreadable_file` is about the user's file — it's the one case where
// telling them to try a different document is right. Everything else is our
// side failing, and re-running the same subject is the fix. Treat an unknown
// or missing code as "our side".
export type RunErrorCode = "unreadable_file" | "llm_unavailable" | "internal" | (string & {});

export function blamesTheFile(code: RunErrorCode | null | undefined): boolean {
  return code === "unreadable_file";
}

// ---------------------------------------------------------------------------
// GET /runs
// ---------------------------------------------------------------------------

// A run in the company's history, newest first. This is the authority on what
// state a run is in — a status remembered in the browser goes stale the moment
// the tab closes, which is exactly when a 90-second run finishes.
//
// Carries its own `title` and `period`, so nothing here needs a second lookup:
// a generated run is titled with the report's name, an uploaded one with the
// filename the user chose.
export interface RunListItem {
  run_id: string;
  subject_type: SubjectType;
  // Null on an `unreadable_file` failure — the document was deleted. The row
  // still carries title and period, so it lists fine; it just can't be re-run.
  subject_id: string | null;
  report_type: ReportType;
  title: string;
  period: string;
  source: CandidateSource;
  status: RunStatus;
  error_code: RunErrorCode | null;
  overall_readiness: number | null;
  publication_gate: PublicationGate | null;
  certified: boolean;
  certified_by: string | null;
  certified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RunsResponse {
  runs: RunListItem[];
}

export interface ListRunsQuery {
  report_type?: ReportType;
  status?: RunStatus;
  // Defaults to 20 server-side, clamped to 50.
  limit?: number;
}

// ---------------------------------------------------------------------------
// POST /results/{id}/resolve · POST /runs/{id}/certify
// ---------------------------------------------------------------------------

export interface ResolveGapResponse {
  result_id: string;
  resolved: boolean;
  overall_readiness: number | null;
  publication_gate: PublicationGate;
}

export interface CertifyResponse {
  run_id: string;
  certified: boolean;
  certified_by: string;
}

// 409 body from certify. Three distinct cases:
//   A — `status === "running"`: the run hasn't finished. Not a failure and not
//       the user's doing — keep polling, then let them certify.
//   B — HARD checks are failing: `blocking_rule_ids` names gap rows to point
//       the user at. The gate is re-checked server-side, so this can fire even
//       when the state we loaded said `open`.
//   C — nothing was verified at all, so there is nothing to fix and no rows to
//       highlight; `reason` explains it.
export interface CertifyBlockedBody {
  message: string;
  reason?: string;
  status?: string;
  blocking_rule_ids: string[];
}

// 400 body from POST /runs when zero rules matched the combination. Note this
// is an object, not FastAPI's usual `detail: "text"` string.
export interface RunRejectedBody {
  message: string;
  // Written for a human — render verbatim rather than mapping to our own copy.
  reason?: string;
  period_end?: string;
}

// ---------------------------------------------------------------------------
// GET /candidates
// ---------------------------------------------------------------------------

// A report or cycle the user can validate. This endpoint hides the fan-out:
// annual comes back as subject_type "cycle" (from reporting_cycles), everything
// else as "report" — the caller just passes the pair through to POST /runs.
// Only approved subjects are returned.
export interface Candidate {
  subject_type: SubjectType;
  subject_id: string;
  title: string;
  period: string;
  status: string;
  report_type: ReportType;
  // Absent on older backends — treat a missing value as "generated".
  source?: CandidateSource;
}

// How a candidate got here.
//   generated — we produced it and the company approved it.
//   upload    — the user uploaded a finished file. `title` is their filename
//               and `status` is "locked".
// Uploaded reports stay in this list, so re-validating one needs no second
// upload. An uploaded annual report comes back as subject_type "report", not
// "cycle" — nothing to special-case, the pair passes through either way.
export type CandidateSource = "generated" | "upload";

export interface CandidatesResponse {
  candidates: Candidate[];
}

// ---------------------------------------------------------------------------
// GET /certified
// ---------------------------------------------------------------------------

// One entry per certified run, newest first. Self-contained by design — it
// carries the subject's own title and period, so the gallery needs no second
// lookup against /candidates to label a card.
export interface CertifiedRun {
  run_id: string;
  subject_type: SubjectType;
  subject_id: string;
  report_type: ReportType;
  // Uploaded runs are titled with the filename the user certified.
  title: string;
  period: string;
  source?: CandidateSource;
  entity_type: EntityType;
  market?: Market;
  // The score at the moment of sign-off — a fixed historical fact, not the
  // current state of the report.
  overall_readiness: number | null;
  publication_gate: PublicationGate | null;
  certified_by: string;
  certified_at: string;
}

// ---------------------------------------------------------------------------
// GET /runs/{run_id}/certificate.pdf
// ---------------------------------------------------------------------------

// An authed binary endpoint, so it can't be a plain <a href> — the browser
// wouldn't attach the Bearer token. Fetched as a blob; see
// `complianceValidation.certificatePdf`.
//
// It serves ANY finished run, certified or not, gate open or blocked, and the
// document titles itself accordingly — so a user can take the detail away with
// them while they're still working through gaps, and the PDF can't overstate
// what it is. The certificate SCREEN branches on the same two states, from the
// same run fields, so the two can never disagree.
export function isClearedForPublication(run: {
  certified?: boolean;
  publication_gate?: PublicationGate | null;
}): boolean {
  return run.certified === true && run.publication_gate === "open";
}

// ---------------------------------------------------------------------------
// GET /api/v1/public/verify/{code}
// ---------------------------------------------------------------------------

// Unauthenticated by design: anyone holding a printed certificate can check it
// without an account. Call it with `auth: false` so no token is attached and a
// 404 never trips the 401 logout path.
export interface CertificateVerification {
  verification_code: string;
  company_name: string;
  report_type: ReportType;
  period: string;
  overall_readiness: number | null;
  publication_gate: PublicationGate | null;
  certified: boolean;
  certified_at: string;
}

// The code printed in the PDF, derived deterministically from the run's UUID:
//   CNT-VAL-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-X
// Crockford base32 (no I, L, O or U), so it survives being read aloud or typed
// off paper. It is NOT generated in the browser — nothing here knows the
// derivation, and a locally-invented code resolves to nothing.
//
// There is deliberately no validator: the endpoint answers an identical 404 for
// a malformed code, an unknown code and an unfinished run, so that a caller
// can't probe which runs exist. Checking the shape locally would invent a
// distinction the API refuses to make. Normalise and send it.
export function normalizeVerificationCode(raw: string): string {
  return raw.trim().toUpperCase();
}
