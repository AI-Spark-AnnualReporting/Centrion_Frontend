// Compliance Validation — a 3-step wizard (Set up → Review → Gate) that runs a
// report against its applicable regulators and gates publication behind
// certification. Shapes match the backend's Compliance Validation API doc.
//
// Base path: /api/v1/compliance

export type ReportType = "annual" | "quarterly" | "esg" | "board_pack";

export type EntityType = "corporate" | "bank" | "insurer";

export type Market = "Main" | "Nomu";

// Annual reports aren't rows in `reports` — they live under a reporting cycle,
// so every run identifies its subject with a (type, id) pair.
//   ESG / Quarterly → "report" + reports.id
//   Annual          → "cycle"  + reporting_cycles.id
export type SubjectType = "report" | "cycle";

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
//   no_data — answered by a filing or register outside this report. A small
//             minority. Grey, never red, and excluded from scoring.
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
}

// POST /runs is 202 Accepted. It returns before a single check has been made —
// there are no scores in this body and there is no point looking for them. Keep
// the run_id, send the user to the progress screen and poll GET /runs/{run_id}.
export interface CreateRunResponse {
  run_id: string;
  status: RunStatus;
  checks_queued: number;
}

// ---------------------------------------------------------------------------
// GET /runs/{run_id}
// ---------------------------------------------------------------------------

// `score` is null when nothing in the framework was scoreable. Render text, not
// 0%. `total` counts only the scoreable rules (pass + fail); `no_data` counts
// the rules answered outside this report.
export interface FrameworkScore {
  regulator: string;
  score: number | null;
  passed: number;
  total: number;
  no_data: number;
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
// parameter. `evidence` is optional throughout — treat its absence as normal.
export interface RuleTrace {
  rule_id: string;
  status: CheckStatus;
  gate: Gate;
  evidence_source?: string;
  evidence?: CheckEvidence | null;
}

// Full per-regulator breakdown, including no_data rows.
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
  subject_id: string;
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
}

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
  title: string;
  period: string;
  entity_type: EntityType;
  market?: Market;
  // The score at the moment of sign-off — a fixed historical fact, not the
  // current state of the report.
  overall_readiness: number | null;
  publication_gate: PublicationGate | null;
  certified_by: string;
  certified_at: string;
}
