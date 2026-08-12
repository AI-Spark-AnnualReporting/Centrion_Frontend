import type { BrandColors } from "@/types/brand";

// ─────────────────────────── Confirm Context ───────────────────────────
// The confirm-context Q/A answers, collected on the quarterly setup form and
// persisted (before processing) via PATCH .../context. company_type is
// pre-selected from a detected value (derived from the company's sector) and can
// be overridden; reporting_basis + voices are chosen manually.
export type CompanyType = "bank" | "non_bank";
export type Voice = "ceo" | "chairman" | "cfo";
// The "What should this quarter be compared against?" question — single choice.
// yoy = same quarter last year; qoq = the immediately prior quarter; both = both.
export type Comparison = "yoy" | "qoq" | "both";
// Prose style of the narrative — the "Report tone" question. Default:
// formal_corporate.
export type ReportTone =
  | "formal_corporate"
  | "investor_focused"
  | "data_driven"
  | "executive_summary"
  | "compliance_focused"
  | "strategic_visionary"
  | "simple_direct";

// GET .../{companyId}/quarterly/detect-company-type — company-scoped detection
// (no reportId; runs at form time). The backend derives the company type from
// the company's sector so the setup form can pre-select the pill + show a
// DETECTED badge. NOT part of the creation flow — purely a UI hint.
// Where a quarterly report's figures come from, and who decides what each one is
// called. Absent on reports created before the custom lane — those read as 'system'.
//   system → mapped onto the standard metric catalogue, printed into our sections
//   custom → the user's own lines, into a section they picked per upload
//   user   → the user's own lines, into sections taken from their files' own tables
export type MetricsMode = 'system' | 'custom' | 'user';

export interface DetectCompanyTypeResponse {
  detected_company_type: CompanyType | null;
}

// PATCH body — kept for a later edit-context screen. At creation the same fields
// ride in the single generate call instead (see GenerateQuarterlyBody). ceo is
// always included even though its pill is locked on.
export interface QuarterlyContextPatch {
  company_type: CompanyType;
  voices: Voice[];
  report_tone: ReportTone;
}

// PATCH response.
export interface QuarterlyContextSaveResponse {
  report_id: string;
  generation_config: Record<string, unknown>;
}

// ─────────────────────────────── Coverage ──────────────────────────────
export interface CoverageDriver {
  text: string;
  quote: string | null;
  page: number | null;
  source: "extracted" | "user_provided";
}

// One provenance entry for a value — where the figure was read from. Both
// fields can be null for figures read from a plain table (no captured snippet).
export interface CoverageSource {
  page: number | null;
  quote: string | null;
}

// A single extracted figure (one period) under a metric. Each value carries its
// own driver status: when "found", render `drivers`; when "missing", render the
// "Reason not found" panel with `sources`.
export interface CoverageValue {
  figure_id: string;
  display: string;
  driver_status: "missing" | "found";
  sources: CoverageSource[];
  drivers: CoverageDriver[];
}

// Figures grouped by metric. One row per metric, with `values` nested beneath.
export interface CoverageMetric {
  metric: string;
  label: string;
  statement: string;
  code: string;
  values: CoverageValue[];
}

export interface CoverageSummary {
  figures_extracted: number;
  // Optional — not always present in the coverage payload.
  documents_count?: number;
  reason_linked: number;
  reason_missing: number;
  driver_coverage_pct: number;
}

export interface QuarterlyCoverageResponse {
  report_id: string;
  company_id: string;
  period_label?: string;
  summary: CoverageSummary;
  metrics: CoverageMetric[];
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
  content_language?: 'english' | 'arabic';
  period_label: string;
  prior_period_label: string;
  total_gaps: number;
  answered_count: number;
  gaps: GapItem[];
}

// ─── Extraction review (step 2) ─────────────────────────────────────────────
// Extraction reports what a document SAYS; a separate mapping pass decides which
// of our metrics each line IS, with a 0-100 confidence. Exact matches and anything
// at 95+ are already stored. The uncertain middle band (50-94) is listed in
// `pending` — nothing there reaches the report until the user answers.
export interface ExtractionReviewFigure {
  id: string;
  metric_key: string | null;
  // What WE call it.
  metric_label: string | null;
  // What the DOCUMENT called it. The pair is the whole question being asked.
  source_label: string | null;
  statement: string | null;
  period: string | null;
  value: number | null;
  value_display: string | null;
  unit: string | null;
  // 0-100 mapping confidence. Always 100 for a confirmed row (it is already in
  // the report). NOT the same as extraction confidence — this is "is this the
  // right metric", not "did we read the number correctly".
  confidence: number | null;
  source: string | null;
  // Where the line sat: which file, which sheet, and its position in the file.
  // The review screen groups on the first two and orders on the third — and
  // (document_id, source_page) is the row's identity, so "Total" on two sheets
  // stays two rows instead of collapsing into one.
  source_page: number | null;
  document_id?: string | null;
  source_table?: string | null;
}

// One (file, sheet) that carries lines the user has to file. `guessed_section` is
// derived from the metrics that DID match on that sheet, and is null when the
// sheet matched nothing — an empty picker that blocks Continue beats a confident
// wrong guess filed silently.
export interface ExtractionReviewSource {
  document_id: string | null;
  source_table: string | null;
  filename: string;
  guessed_section: string | null;
}

export interface ExtractionReviewResponse {
  report_id: string;
  company_id: string;
  run_id: string | null;
  awaiting_review: boolean;
  confirmed: ExtractionReviewFigure[];
  pending: ExtractionReviewFigure[];
  summary: {
    confirmed_count: number;
    pending_count: number;
    // Lines we read but could not place. Shown so "we read 120 and used 40" is
    // visible rather than silent.
    discarded_count: number;
  };
  // Where a figure can be placed when the user says "no, that's our own line".
  // Sent with the figures so the screen needs no second request.
  metric_sections?: MetricSectionGroup[];
  // One entry per (file, sheet) with pending lines: the filename to head the
  // group, and the section guess to pre-fill its rows.
  sources?: ExtractionReviewSource[];
  // Present (and 'custom') on a Custom-metrics report, where this screen is a
  // different thing entirely: nothing to confirm, because the user already chose
  // each figure's section by choosing which file to upload to it. `sections` holds
  // the lines to tidy; `confirmed`/`pending` are always empty.
  metrics_mode?: MetricsMode;
  editable?: boolean;
  sections?: CustomExtractionSection[];
  // User mode only: one record per table found, extracted or not, plus the quarter
  // we were looking for. `summary` carries the extra counts alongside its own.
  tables?: UserExtractionTable[];
  period?: string | null;
}

// ─── Custom-mode extraction (rename / delete, no yes-no) ────────────────────
export interface CustomExtractionRow {
  id: string;
  label: string | null;
  value: number | null;
  value_display: string | null;
  unit: string | null;
  // The tab of the workbook this line came from, when there was more than one.
  sheet: string | null;
  // Where the line sat in its own table: the heading above it, the column it was read
  // from, and which table when the sheet held several. Null for every flat, ungrouped
  // line and for everything the other lanes write.
  group?: string | null;
  column?: string | null;
  table?: string | null;
}

export interface CustomExtractionSection {
  section_code: string;
  title: string;
  is_custom: boolean;
  rows: CustomExtractionRow[];
}

// ─── User-mode extraction (read-only: one record per TABLE found) ───────────
// The rows are the same CustomExtractionSection shape; this is the part the custom
// payload cannot carry, because a table that produced NOTHING leaves no figure row
// to infer it from — and in this lane that is a missing section.
export interface UserExtractionTable {
  file: string;
  table: string;
  status: 'extracted' | 'skipped';
  // A sentence, not a code — it is read by a person.
  reason: string | null;
  rows: number;
  section_code: string | null;
  section_title: string | null;
  currency: string | null;
  scale: string | null;
  header_row: number | null;
  label_col: number | null;
  value_col: number | null;
  value_col_header: string | null;
  // How we knew this was the report's quarter: a column named it, a heading above
  // the table named it, or nothing did and we assumed.
  period_source: 'column' | 'declared' | 'assumed' | null;
  // Other tables merged into the same section as this one.
  grouped_with: string[];
  // 'matrix' = the source printed it as a grid (line items down, categories across),
  // so `rows` counts CELLS rather than lines.
  shape?: 'flat' | 'matrix';
  column_count?: number;
  // The headings found inside the table ("Cost", "Accumulated depreciation").
  groups?: string[];
}

export interface UserExtractionSummary {
  file_count: number;
  table_count: number;
  extracted_count: number;
  skipped_count: number;
  section_count: number;
  assumed_count: number;
  confirmed_count: number;
}

// One edit per row: a new label, or gone. Renaming is not cosmetic — the
// cross-quarter comparison matches custom rows by (section, label).
export interface CustomFigureEdit {
  id: string;
  label?: string;
  deleted?: boolean;
}

export interface MetricSectionGroup {
  group: string;
  sections: { section_code: string; title: string }[];
}

export type MetricUnitType = 'currency' | 'percent' | 'count';

// keep    — file this line: add it to the company's catalogue under `label` and put
//           the figure in this report's `section_code`.
// exclude — leave it out, and stop asking about this wording in future quarters.
//
// `accept`, `create` and `ignore` were the previous vocabulary, from when the
// server proposed a metric and the user agreed or not. The server still honours
// them so a browser holding the old bundle can answer a report parked before this
// shipped; nothing here emits them.
export type ExtractionReviewAction = 'keep' | 'exclude';

export interface ExtractionReviewDecision {
  id: string;
  action: ExtractionReviewAction;
  // Required for `keep` only. `label` is what the user chose to call the line —
  // the document's own wording is kept server-side as a synonym, so renaming it
  // does not opt the line out of matching next quarter.
  label?: string;
  section_code?: string;
  unit_type?: MetricUnitType;
}

// A wording the company told us to stop asking about. One entry per distinct
// label however many quarters it was excluded in — it is one thing to undo.
export interface ExclusionEntry {
  source_label: string;
  excluded_at: string | null;
}

export interface ExclusionsResponse {
  company_id: string;
  exclusions: ExclusionEntry[];
}

export interface ExtractionReviewResult {
  report_id: string;
  accepted: number;
  created: number;
  ignored: number;
  rejected: number;
  next: string;
}

// ─── Financial Data (Custom mode only, the step before Extraction) ──────────
// Custom mode takes one statement per section, so the section a figure belongs to
// is decided by which upload field it went into — not by a model reading the label.

export interface FinancialSectionUpload {
  document_id: string | null;
  filename: string;
  row_count: number;
  currency: string;
  // Parser token: 'actual' | 'thousand' | 'million' | 'billion' (singular).
  scale: string;
  // How the scale was decided — 'user_section' (the user said so), 'units_llm' /
  // 'units_text' (the file said so), 'prior', 'llm_fallback', or 'default' (a
  // guess). Surfaced so a guess is visible rather than silent.
  scale_source: string;
  uploaded_at: string;
}

export interface FinancialSection {
  section_code: string;
  title: string;
  section_group: string;
  // A section this company created, rather than one of ours.
  is_custom: boolean;
  included: boolean;
  file: FinancialSectionUpload | null;
}

export interface FinancialsResponse {
  report_id: string;
  company_id: string;
  period: string | null;
  currency: string;
  // UI vocabulary ('millions'), not the parser token — this is what every figure
  // in the report is printed in.
  scale: string;
  sections: FinancialSection[];
  can_continue: boolean;
  // Titles of sections still ticked with no file. Named, not counted, so the user
  // doesn't have to hunt for them.
  blocking: string[];
}

// ─── "Is this how we should read your file?" ────────────────────────────────
// A confident read is stored straight away. When it isn't obvious which table or
// which columns to use, NOTHING is written and this comes back instead — the user
// answers, and the same file is re-sent with their answer attached.

export interface SheetColumn {
  index: number;
  name: string;
}

export interface SheetTable {
  // "<sheet index>:<table index>" — opaque, sent back as-is.
  key: string;
  sheet: string;
  columns: SheetColumn[];
  header_row: number;
  label_col: number;
  value_col: number;
  row_count: number;
  preview: { label: string; value: number }[];
  // Rows the header could plausibly be, for the picker — a merged banner often
  // sits above the real header.
  header_options: number[];
}

export interface FinancialsConfirmation {
  needs_confirmation: true;
  section_code: string;
  section_title: string;
  filename: string;
  // Plain sentences explaining why we stopped, shown at the top of the dialog.
  reasons: string[];
  tables: SheetTable[];
  currency: string;
  scale: string;
}

// What the user chose in the dialog, sent back with the same file.
export interface SheetStructureChoice {
  table_key: string;
  header_row: number;
  label_col: number;
  value_col: number;
}

export function needsConfirmation(
  res: FinancialsResponse | FinancialsConfirmation,
): res is FinancialsConfirmation {
  return (res as FinancialsConfirmation).needs_confirmation === true;
}

export interface FinancialsCompleteResult {
  report_id: string;
  sections: FinancialSection[];
  next: string;
}

// ─── Outline (step 6) ───────────────────────────────────────────────────────
// The report's section catalogue: mandatory sections locked at the top, optional
// ones the user ticks + drag-reorders. Each section carries a "feeder" telling
// the user where its content comes from. The outline reflects the confirm-context
// Q/A (company_type + voices). See PUT/lock endpoints in `quarterlyReports`.
export type FeederStatus = 'ready' | 'template' | 'external' | 'needs_input';

// Where a section's content comes from — the key per-section signal.
export interface OutlineFeeder {
  status: FeederStatus;
  document_id: string | null;
  document_name?: string;
  message: string;
}

export interface OutlineSection {
  section_code: string;
  title: string;
  part_label: string;
  requirement: 'required' | 'optional';
  included: boolean;
  // System's data-driven suggestion: true when we have source data for the section
  // (feeder ready) or it's a chosen voice. Drives the "Recommended" quick-select.
  recommended: boolean;
  // Per-section lock: a required section can't be unticked. Distinct from the
  // whole-outline freeze on OutlineResponse.locked.
  locked: boolean;
  source_type: string;
  mode: string;
  display_order?: number;
  feeder: OutlineFeeder;
  // True when this section's produced data duplicates an earlier section's — the
  // Preview hides these (keep the first, hide the rest). Computed server-side.
  hidden_duplicate?: boolean;
  // Custom mode only: a financial section the user unticked on the Financial Data
  // step. Shown here but not re-tickable — that decision has one home, and the
  // section has no figures to render anyway. The backend rejects re-including it.
  financials_excluded?: boolean;
}

export interface OutlineResponse {
  report_id: string;
  company_id: string;
  total_catalogue?: number;
  // Which lane built this report. Drives the step indicator (Custom has an extra
  // Financial Data step) and the greyed-out financial sections.
  metrics_mode?: MetricsMode;
  // Whole-outline freeze — true once the outline is locked (read-only).
  locked?: boolean;
  // True while the ingest worker is still writing figures. Until it flips false a
  // section's feeder is a snapshot of a moving target: "needs_input" may just mean
  // "not extracted yet". The page polls on this and freezes edits while it's true.
  ingest_running?: boolean;
  ingest_run_id?: string | null;
  sections: OutlineSection[];
}

// PUT body — only the mutable fields per section.
export interface OutlineSavePayload {
  sections: Array<{
    section_code: string;
    included: boolean;
    display_order: number;
  }>;
}

// POST /outline/lock response.
export interface OutlineLockResponse {
  report_id: string;
  locked: boolean;
}

// ─── Produced sections (step 7 — Part 5 Preview) ────────────────────────────
// The section-by-section produced content shown on the Preview screen. Derived
// from the locked OutlineSection (section_code/title/order/source_type/mode/
// feeder) plus a production lifecycle (status + rendered content).
//
// `content` is keyed by `mode`:
//   - mode 'table' | 'kpi'  → a JSON string; parse and render a real table/block.
//   - mode 'generate'       → analytical prose text.
//   - mode 'template'       → filled boilerplate text.
//   - null                  → not produced yet.
// quarterly_report_sections.status, as the DB's own CHECK constraint defines it.
// This used to read "pending" | "drafting" | "done", and "done" is a value the
// backend has never sent — which is why sectionState() had to cast to string to
// compare against "needs_input". A type that lies about the values it holds hides
// exactly the comparison you most want checked.
export type SectionStatus =
  | "pending"      // in the outline, not produced yet
  | "drafting"     // being produced right now
  | "locked"
  | "produced"
  | "needs_input"  // produced, and it needs something from the user
  | "empty";       // produced, and there was nothing to put in it

export interface ProducedSection {
  section_code: string;
  title: string;
  display_order: number;
  source_type: string;
  mode: string;
  status: SectionStatus;
  content: string | null;
  feeder_status: FeederStatus;
  // Carried through so needs_input sections can show what they require.
  message?: string;
  // False when re-producing yields nothing fresh (Template/External, or content
  // the user supplied verbatim) — the Preview hides Regenerate. Undefined = show.
  regeneratable?: boolean;
  // The Analyse button's last result, replayed by GET .../sections/{code} so it
  // survives a reload. Null/absent for a section never analysed.
  analysis?: SectionAnalysis | null;
}

// POST .../sections/{code}/analyse — the commentary printed under a section's
// table(s). Part of the report: stored on quarterly_report_sections.analysis and
// rendered by both exporters.
export interface SectionAnalysis {
  section_code?: string;
  text: string;
  generated_at: string;
  model: string | null;
  // Covers the table, the model, the prompt text, the tone and the language — so a
  // stored analysis whose fingerprint no longer matches was written about
  // different numbers, or in a different voice.
  fingerprint: string | null;
  warnings?: string[];
  line_count?: number;
  cached?: boolean;
  // True once a human has rewritten the prose, so it is never attributed to the
  // model afterwards and a later Analyse click cannot overwrite it from cache.
  edited?: boolean;
  edited_at?: string | null;
}

// GET/POST .../sections/{code}, .../sections/{code}/produce, .../sections/{code}/refine.
// The backend returns the section object either at the top level or wrapped as
// { section }. The api layer normalises both via unwrapProducedSection. Note the
// producer response omits feeder_status/title/display_order — those are carried
// from the locked outline seed and preserved on merge.
export type ProducedSectionResponse = ProducedSection | { section: ProducedSection };

// POST .../produce — async 202 handle, driven by usePipelinePoll.
export interface ProduceAllHandle {
  run_id: string;
  poll_url: string;
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
  // "bullets" → render sentences as list items; "prose" (default) → paragraphs.
  display?: "bullets" | "prose";
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

// ─── Chat agent (Preview step 6) ─────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ChatHistoryResponse {
  conversation_id: string;
  report_id: string;
  messages: ChatMessage[];
}

export type ChatEventType = 'token' | 'tool_start' | 'tool_end' | 'error' | 'done';

export interface ChatStreamEvent {
  type: ChatEventType;
  content?: string;
  name?: string;
  args?: Record<string, unknown>;
  message?: string;
}

// ─── Cover template picker (Part 6) ──────────────────────────────────────────
// The cover section's design + brand color. Colors apply to accents/headings
// only; body text stays dark. Persisted via PATCH .../cover-template.
export interface CoverTemplate {
  id?: string;
  key: string;
  name: string;
  description?: string;
  preview_image_url?: string | null; // when absent, CoverRenderer draws a mini-preview
  layout?: Record<string, unknown>;
  is_default?: boolean;
}

// ColorPalette + BrandColors moved to types/brand.ts — the onboarding Brand step
// collects the same shape and shouldn't have to import from quarterly. Re-exported
// so existing `from '@/types/quarterly'` imports keep working.
export type { ColorPalette, BrandColors } from "@/types/brand";

// PATCH body.
export interface CoverSelectionPayload {
  cover_template_key: string;
  brand: BrandColors;
}

// GET .../cover-templates — the catalogue. `selected` is optional (if the
// backend echoes the saved selection); otherwise the `is_default` template seeds
// the initial design.
export interface CoverTemplatesResponse {
  cover_templates: CoverTemplate[];
  total?: number;
  selected?: CoverSelectionPayload | null;
}

// GET .../color-palettes
export interface ColorPalettesResponse {
  color_palettes: ColorPalette[];
  total?: number;
}

// PATCH .../cover-template response (echoes the saved selection).
export interface CoverSelectionResponse {
  cover_template_key: string;
  brand: BrandColors;
}

// ─── Assembled Report (Part 7) ───────────────────────────────────────────────
// GET .../assemble — the full report: cover + produced sections in display_order
// (needs_input/empty sections are excluded server-side). PATCH .../sections/{code}
// /content saves inline edits (prose or JSON-stringified table content).
export interface AssembledSection {
  section_code: string;
  title: string;
  display_order: number;
  source_type?: string;
  mode: string; // table | kpi | generate | template
  content: string | null; // same keying as ProducedSection.content
  // The Analyse button's commentary, printed under this section's table(s). Part of
  // the report — the exporters render it from the same field.
  analysis?: SectionAnalysis | null;
}

export interface AssembledReportResponse {
  report_id: string;
  company_id: string;
  // Real company + period for the cover. Reuse PreviewHeader shape.
  header?: PreviewHeader | null;
  // The chosen cover design + brand (drives CoverRenderer + the brand CSS vars).
  cover?: CoverSelectionPayload | null;
  brand?: BrandColors | null; // some backends put brand at top level
  sections: AssembledSection[];
  // Approval/lock status — exact backend field name unconfirmed (no OpenAPI
  // entry yet), so every likely shape is read defensively (see
  // readApprovalStatus in AssembledReportPage.tsx). Once approved, the report
  // is read-only and Export becomes available.
  status?: string;
  approved?: boolean;
  is_approved?: boolean;
  is_locked?: boolean;
  locked?: boolean;
  approved_at?: string | null;
  approvedAt?: string | null;
  locked_at?: string | null;
  // Which lane built this report — for the step indicator, which has an extra
  // Financial Data step in Custom mode.
  metrics_mode?: MetricsMode;
}

// POST .../quarterly/{reportId}/approve response — approve & lock the
// assembled report. Shape unconfirmed; mirrors the same defensive fields as
// AssembledReportResponse above.
export interface ApproveReportResponse {
  status?: string;
  approved?: boolean;
  is_approved?: boolean;
  is_locked?: boolean;
  locked?: boolean;
  approved_at?: string | null;
  approvedAt?: string | null;
  locked_at?: string | null;
}

// PATCH .../sections/{code}/content — inline edits.
export interface SaveSectionContentPayload {
  content: string;
}
export interface SaveSectionContentResponse {
  section: ProducedSection;
}

// POST .../sections/{code}/extract — extract-ONLY: the backend parses the uploaded
// document to plain text and returns it WITHOUT producing/saving the section, so
// the user can review/edit the text before saving it as the section content.
// The backend returns the text under `text`; `extracted_text` is kept as a
// defensive fallback for older/alternate shapes.
export interface SectionExtractResponse {
  section_code?: string;
  text?: string;
  extracted_text?: string;
}
