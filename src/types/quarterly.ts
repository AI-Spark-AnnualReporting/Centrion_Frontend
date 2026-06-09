export interface CoverageDriver {
  text: string;
  quote: string | null;
  page: number | null;
  source: "extracted" | "user_provided";
}

export interface CoverageFigure {
  figure_id: string;
  code: string;
  metric: string;
  label: string;
  statement: string;
  current_value: number;
  current_display: string;
  prior_value: number | null;
  prior_display: string | null;
  change_pct: number | null;
  change_direction: "up" | "down" | null;
  driver_status: "missing" | "found";
  drivers: CoverageDriver[];
}

export interface CoverageSummary {
  figures_extracted: number;
  documents_count: number;
  reason_linked: number;
  reason_missing: number;
  driver_coverage_pct: number;
  comparatives_matched: number;
  comparatives_total: number;
  comparatives_missing_prior: number;
}

export interface QuarterlyCoverageResponse {
  report_id: string;
  company_id: string;
  period_label: string;
  prior_period_label: string;
  summary: CoverageSummary;
  needs_reason: CoverageFigure[];
  reason_found: CoverageFigure[];
}

export interface GapItem {
  figure_id: string;
  code: string;
  metric: string;
  label: string;
  statement: string;
  current_value: number;
  current_display: string;
  prior_value: number | null;
  prior_display: string | null;
  change_pct: number | null;
  change_direction: "up" | "down" | null;
  change_display?: string | null;
  question: string;
  placeholder: string;
  answered: boolean;
  current_answer: string | null;
}

export interface GapsResponse {
  report_id: string;
  company_id: string;
  period_label: string;
  prior_period_label: string;
  total_gaps: number;
  answered_count: number;
  gaps: GapItem[];
}

// ─── Preview (step 6) ─────────────────────────────────────────────────────────
// The AI-composed quarterly report. The backend generates it synchronously and
// persists it; the page reads it back and supports per-sentence inline edits.
// See "Frontend Brief — Quarterly Report Preview Step".

export type ChangeDirection = "up" | "down" | "flat" | null;

export interface PreviewHeader {
  company_name: string;
  title: string; // page H1, e.g. "aramco — Q3 2025 Quarterly Report"
  period_label: string;
  prior_period_label: string | null;
  subtitle: string; // grey line under the H1
  prepared_on: string;
}

// Left-sidebar driver tallies.
export interface PreviewDriverSummary {
  from_docs: number;
  user_added: number;
  flagged_no_reason: number;
}

// One editable sentence in a narrative section. `id`/`section_id` are opaque,
// stable keys — pass them straight back to the PATCH endpoint, never build them.
export interface PreviewSentence {
  id: string;
  text: string;
  figure_codes: string[]; // metric codes this sentence draws from
  source_label: string | null; // the chip under the sentence
  edited: boolean;
}

export interface PreviewTableRow {
  code: string;
  label: string;
  current_display: string; // pre-formatted by the backend — print verbatim
  prior_display: string | null;
  change_pct: number | null;
  change_direction: ChangeDirection;
}

export interface PreviewTable {
  statement: string;
  title: string;
  rows: PreviewTableRow[];
}

interface PreviewSectionBase {
  id: string; // stable; PATCH section_id
  number: number; // sidebar badge (zero-pad to 2 digits for display)
  title: string;
}

// Editable prose section.
export interface PreviewNarrativeSection extends PreviewSectionBase {
  type: "narrative";
  sentences: PreviewSentence[];
}

// Read-only tables section (always-present financial_tables).
export interface PreviewTablesSection extends PreviewSectionBase {
  type: "tables";
  tables: PreviewTable[];
}

export type PreviewSection = PreviewNarrativeSection | PreviewTablesSection;

// A generated report (returned by POST generate, and by GET once generated).
export interface QuarterlyPreviewReport {
  report_id: string;
  company_id: string;
  generated: true;
  word_count: number;
  header: PreviewHeader;
  driver_summary: PreviewDriverSummary;
  sections: PreviewSection[];
}

// GET before the report has ever been generated.
export interface PreviewNotGenerated {
  generated: false;
  sections: null;
}

// GET returns either shape; discriminate on `generated`.
export type QuarterlyPreviewResponse = QuarterlyPreviewReport | PreviewNotGenerated;

// PATCH /preview/sentence response.
export interface PreviewSentenceUpdateResponse {
  sentence: PreviewSentence;
  word_count: number;
}
