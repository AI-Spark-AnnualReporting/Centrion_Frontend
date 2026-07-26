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
}

export interface OutlineResponse {
  report_id: string;
  company_id: string;
  total_catalogue?: number;
  // Whole-outline freeze — true once the outline is locked (read-only).
  locked?: boolean;
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
export type SectionStatus = "pending" | "drafting" | "done";

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

export interface ColorPalette {
  key: string;
  name: string;
  primary: string;
  secondary: string;
}

// palette_key is 'custom' (or '') when the primary/secondary are custom hex values.
export interface BrandColors {
  primary: string;
  secondary: string;
  palette_key: string;
}

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
