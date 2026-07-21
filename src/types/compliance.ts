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

// `no_data` is the one to design for — today it's the majority. It means no
// evidence source is wired for that rule yet, NOT that the company failed.
// Both `na` and `no_data` are excluded from scoring and never block publication.
export type CheckStatus = "pass" | "fail" | "na" | "no_data";

export type PublicationGate = "open" | "blocked";

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

// POST /runs returns a summary only, not the full results. Fetch the run to
// render the review screen.
export interface CreateRunResponse {
  run_id: string;
  checks_run: number;
  overall_readiness: number | null;
  publication_gate: PublicationGate;
}

// ---------------------------------------------------------------------------
// GET /runs/{run_id}
// ---------------------------------------------------------------------------

// `score` is null when every rule in the framework was no_data — there was
// nothing to score. Render "Awaiting data", not 0%. `total` counts only the
// scoreable rules (pass + fail); `no_data` is the awaiting-data count.
export interface FrameworkScore {
  regulator: string;
  score: number | null;
  passed: number;
  total: number;
  no_data: number;
}

export interface GapEvidence {
  expected?: string;
  found?: string[];
  // The most useful field for the UI — it names exactly what was absent.
  missing?: string[];
  evidence_source?: string;
}

// Only `status === "fail"` rows appear here. This is the action list.
export interface Gap {
  result_id: string;
  rule_id: string;
  regulator: string;
  severity: Severity;
  gate: Gate;
  finding: string;
  evidence: GapEvidence | null;
  resolved: boolean;
}

// Per-rule row in the expandable table. Note there is no description, logic or
// parameter — only the evidence source is exposed.
export interface RuleTrace {
  rule_id: string;
  status: CheckStatus;
  gate: Gate;
  evidence_source?: string;
}

// Full per-regulator breakdown, including no_data rows.
export interface RuleDetailGroup {
  regulator: string;
  rules: RuleTrace[];
}

export interface ComplianceRun {
  run_id: string;
  subject_type: SubjectType;
  subject_id: string;
  report_type: ReportType;
  status: string;
  certified: boolean;
  // Plain average of the non-null framework scores, or null if nothing was
  // scoreable at all.
  overall_readiness: number | null;
  publication_gate: PublicationGate;
  frameworks: FrameworkScore[];
  gaps: Gap[];
  rule_detail: RuleDetailGroup[];
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

// 409 body from certify. Two distinct cases, told apart by whether
// `blocking_rule_ids` is populated:
//   A — HARD checks are failing: there are gap rows to point the user at.
//   B — nothing was verified at all (every rule returned no_data), so there is
//       nothing to fix and no rows to highlight; `reason` explains it.
// The gate is re-checked server-side, so A can fire even when cached state
// said `open`.
export interface CertifyBlockedBody {
  message: string;
  reason?: string;
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
