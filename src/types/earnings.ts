import type { SectionAnalysis } from '@/types/quarterly';

// ─── Earnings report — Part 1 (Setup) types ──────────────────────────────────
// Contracts captured from the live FastAPI OpenAPI schema:
//   GET  /api/v1/earnings/sources?company_id&period   → untyped 200 (read defensively)
//   POST /api/v1/earnings/reports (application/json)   → 201, body below
// The report tone reuses the quarterly tone vocabulary (same 7 options).
import type { ReportTone } from '@/types/quarterly';

export type { ReportTone };

// The report-type toggle. Sent verbatim as the create `variant`.
export type EarningsVariant = 'annual' | 'quarterly';

// UI quarter tokens; the API wants the integer 1..4 (see CreateEarningsReportPayload).
export const EARNINGS_QUARTERS = [1, 2, 3, 4] as const;
export type EarningsQuarter = (typeof EARNINGS_QUARTERS)[number];

// One row in the "Use existing reports" list — sourced from REPORTS, not
// documents. The identical shape is also what the figures response's `sources`
// header returns (GET .../figures), so this one type covers both; see
// `EarningsFigureSource` alias below and normalizeEarningsSourceItem in
// lib/api.ts (one normalizer for both endpoints — do not declare a second
// type/normalizer for this concept, that's what let the two skew apart).
// `coverage` drives the Full/Partial badge. Field names read defensively at
// the api layer for naming robustness only — never to fabricate a source.
export type SourceCoverage = 'full' | 'partial' | (string & {});

// Which pool a source belongs to (Part 6B — Tagged Uploads). 'official' = a DB
// report (filed data); 'narrative_adjusted' = a user upload (narrative/adjusted
// content only — never implies an official-figure source, D-19).
export type SourceTrack = 'official' | 'narrative_adjusted' | (string & {});
// The tag a user picks when uploading a document. 'aggregator' is a
// backend/system-only tag — never offered as a user-selectable upload option.
export type SourceUploadType =
  | 'annual'
  | 'interim'
  | 'release'
  | 'presentation'
  | 'transcript'
  | 'aggregator'
  | (string & {});
// Upload-only processing state. Never treat 'extracting'/'failed' as a usable
// figure source (D-12) — only 'ready' sources have real figures behind them.
export type SourceExtractionStatus = 'extracting' | 'ready' | 'failed' | (string & {});

export interface SelectableSource {
  report_id: string | null; // populated for the 'official' track (DB reports)
  document_id: string | null; // populated for the 'narrative_adjusted' track (uploads)
  label: string; // display label, e.g. "Shell — Quarterly Report Q4-2023". Never a filename.
  report_type: string | null; // e.g. 'quarterly' | 'annual'
  period: string | null; // e.g. "Q4-2023"
  updated_at: string | null;
  coverage: SourceCoverage; // 'full' | 'partial' — official sources only
  track: SourceTrack;
  type: SourceUploadType | null; // current value, shown in the editable dropdown; null for official sources
  detected_type: SourceUploadType | null; // AI's original guess — never mutated by a PATCH; drives the confirm-hint
  type_confidence: number | null; // 0–1 assumed; confirm scale live (Step 0); null for official sources
  extraction_status: SourceExtractionStatus | null; // upload-only; null for official sources
  // The report/draft this upload belongs to — required to scope a type-correction
  // PATCH; independent of report_id (force-null for narrative rows by design, see
  // normalizeEarningsSourceItem). null when the backend doesn't supply it → the
  // row's type renders read-only rather than guessing a report scope.
  owning_report_id: string | null;
}

// The selected source shown on the Extract screen's header — the identical
// shape as SelectableSource (one concept, one type).
export type EarningsFigureSource = SelectableSource;

export interface SelectableSourcesResponse {
  sources: SelectableSource[];
}

// POST /api/v1/earnings/reports request body (from OpenAPI —
// Body_create_earnings_report_...). JSON, not multipart.
export interface CreateEarningsReportPayload {
  company_id: string;
  variant: EarningsVariant;
  fiscal_year: number;
  quarter?: number | null; // 1..4 for quarterly; null/omitted for annual
  tone: ReportTone; // backend default is formal_corporate; UI pre-selects investor_focused
  source_report_ids: string[]; // official-track selections; combined with source_document_ids, ≥1
  source_document_ids: string[]; // narrative-track (upload) selections
}

// Create response is untyped (201) — read `report_id` defensively at the api layer.
export interface CreateEarningsReportResponse {
  report_id: string;
}

// ─── Part 2 — Extract & Review Figures ────────────────────────────────────────
// Contracts from OpenAPI (both responses UNTYPED → read defensively; confirm live):
//   GET   /api/v1/earnings/reports/{reportId}/figures                 (no company_id)
//   PATCH /api/v1/earnings/reports/{reportId}/figures/{figureId}      { value, unit? }

// Backend-provided flag for a figure — authoritative for review/badge state.
// 'needs_input': no usable extracted value, requires manual entry (red "Needs input").
// 'flagged': extracted but low-confidence, needs review (amber/red by confidence).
// 'ok': accepted as-is (green/amber/red by confidence, or "Manual" if confidence is null).
// When absent/unrecognized, the UI falls back to confidence thresholds.
export type FigureFlag = 'ok' | 'flagged' | 'needs_input' | (string & {});

// One reviewed figure. Field names are read defensively at the api layer since the
// response is untyped — confirm against a live payload.
export interface EarningsFigure {
  id: string;
  metric_key: string;
  label: string;
  value: number | null;
  unit: string | null;
  period: string | null;
  source_document_id: string | null;
  source_report_id: string | null; // the report this figure was extracted from
  source_label: string | null; // human label for the source column
  source_ref: string | null; // e.g. "p. 12" / section reference
  confidence: number | null; // 0–100; null once the value is a manual edit
  is_derived: boolean; // derived (computed) rows show "Derived · <formula>"
  derivation: string | null; // the formula, when derived
  flag: FigureFlag | null; // backend flag when present
  edited: boolean; // client marker: value was manually PATCHed
  // Comparative fields (Part 6A backend). Field names UNCONFIRMED — confirm
  // against a live GET .../figures during Step 0. comparative_status='none'
  // means no comparison exists for this figure; never compute a delta then (D-12).
  prior_value: number | null;
  prior_period: string | null;
  change_pct: number | null; // fractional, e.g. 0.114 = +11.4%
  comparative_status: string | null; // e.g. 'none' | 'yoy' — treat any non-none, non-null value as "has a delta"
}

export interface EarningsFiguresResponse {
  figures: EarningsFigure[];
  sources: EarningsFigureSource[]; // [] only when the report genuinely has none
}

// PATCH body — edit a single figure's value (+ optional unit).
export interface EditEarningsFigurePayload {
  value: number;
  unit?: string | null;
}

// One line of the source quarterly report, offered in the step-2 picker. Only
// primary-statement tables are offered — a figure bound from a note schedule is
// exactly the mistake the auto-matcher refuses to make on its own.
export interface EarningsSourceLine {
  id: string;
  label: string | null;
  // The line's own column in a multi-column table. A changes-in-equity statement
  // repeats one label down every column, so seven rows read "Balance at September
  // 30, 2023" with seven different values — this is what tells them apart.
  column: string | null;
  group: string | null;
  display_label: string; // label + column; also what the figure is keyed on
  value: number | null;
  unit: string | null;
  table: string | null; // the source table's own name, e.g. "Balance Sheet"
  source_ref: string | null;
  source_report_id: string | null;
  selected: boolean; // already in the section the picker was opened for
  memory_key: string; // stable across quarters; qr_figures ids are not
}

// One figure as it appears under a section on the Figures screen. The value is
// read through the link to the quarterly report, never copied.
export interface EarningsSectionFigure {
  id: string; // the qr_figures row this points at
  display_label: string; // label + column; the column is what tells repeated labels apart
  value: number | null;
  unit: string | null;
  table: string | null; // the source table's own name, e.g. "Balance Sheet"
  /**
   * The sub-heading this line sits under, e.g. "MEMORANDUM — FREE CASH FLOW".
   * Not decoration: a label is not an identity, and this is usually the only
   * thing separating two rows that read identically.
   */
  group: string | null;
  /**
   * What the market expected for this line. null = no expectation, which
   * omits the beat/miss entirely — never a zero, never a made-up verdict.
   */
  expected_value?: number | null;
  memory_key: string; // stable across quarters; source ids are not
}

// One table section on the Figures screen: what the user asked for, and what they
// got. `prompt` is null until they write one.
export interface EarningsFigureSection {
  section_code: string;
  title: string;
  prompt: string | null;
  figures: EarningsSectionFigure[];
  total: number;
  /** The user has finished curating this section's figures. UI only. */
  finalised?: boolean;
}

export interface EarningsFigureSectionsResponse {
  report_id: string;
  sections: EarningsFigureSection[];
  // How many figures were brought over from the company's last earnings report on
  // this first visit. 0 for a first-ever report, which opens empty by design.
  carried_over: number;
}

// The response to searching or setting one section's figures.
export interface EarningsSectionFiguresResponse {
  report_id: string;
  section_code: string;
  prompt?: string | null;
  found?: number; // search only: how many are NEW this time, not the section's total
  /** Search only: why nothing came back, when the model was never asked. */
  note?: string;
  figures: EarningsSectionFigure[];
  total: number;
  removed?: number; // set only
}

export interface EarningsSourceLinesResponse {
  report_id: string;
  section_code: string | null;
  lines: EarningsSourceLine[];
  selected_count: number;
}

// ─── Part 3 — Arrange Outline ─────────────────────────────────────────────────
// Contracts from OpenAPI are UNTYPED (200 → {}), and the PUT body is undocumented,
// so field names below follow the spec and are read defensively at the api layer.
//   GET  /api/v1/earnings/reports/{reportId}/outline                (no company_id)
//   PUT  /api/v1/earnings/reports/{reportId}/outline   { sections: [...] }
// TODO(Step 0): confirm every field name against a live GET during integration.

// Which real source currently backs a section (D-29 outline feeder). 'template'
// = deterministic, no source needed (Cover, TOC, Sources). 'ready' = a real
// source backs it — source_report_id+source_label name an official report
// (financial/table sections), source_document_id+source_label name an
// uploaded document (CEO/CFO quote, IR calendar). 'needs_input' = nothing
// backs it yet, `message` explains what's missing. 'external' = permanently
// outside what the system tracks (Consensus vs Actual, Peer Comparison) — not
// fixable by uploading or selecting anything.
export interface EarningsSectionFeeder {
  status: 'ready' | 'template' | 'needs_input' | 'external' | (string & {});
  source_report_id: string | null;
  source_document_id: string | null;
  source_label: string | null;
  message: string; // always present — safe to render regardless of status
}

// Whether an optional section can actually be added — the backend tells us when a
// section has no backing data. `available=false` → greyed, toggle disabled, never
// silently addable (D-12). Required sections are always included regardless.
export interface EarningsOutlineSection {
  section_code: string;
  /** What THIS report calls it — the rename when there is one. */
  title: string;
  /**
   * The section catalogue's own name. What Reset puts back, and what the figure
   * picker is prompted with — renaming a section deliberately cannot reach it.
   * Null on a payload that predates renaming.
   */
  title_original: string | null;
  /** The brief for this section, typed on the Outline. Financial only. */
  prompt: string | null;
  description: string | null;
  section_number: number | null; // display number on the card, when provided
  display_order: number; // authoritative sort key; array order on save
  included: boolean; // currently in the report
  requirement: 'required' | 'recommended' | 'optional' | (string & {});
  available: boolean; // optional-only meaning: has backing data → addable
  source_type: string | null; // hint chip; render only when the backend provides it
  mode: string | null; // hint chip; render only when the backend provides it
  page_hint: string | null; // e.g. "~2 pages"; never fabricated
  // Production state, same vocabulary as EarningsProducedSection.status. Lets
  // the Outline screen tell "never produced" (pending) apart from "already
  // resolved" (produced/needs_input) WITHOUT a separate GET /sections call —
  // used to skip a redundant POST /produce when nothing has changed.
  status: EarningsSectionStatus | null;
  // How many of the user's own report lines are filed under this section. Comes
  // on the outline itself so the section badge is right on first paint — reading
  // it off the figure picker's response instead meant every section showed blank
  // until the user opened the picker. null on a payload that predates the field.
  figure_count: number | null;
  // Which real source backs this section right now, when the backend supplies
  // it — null on older payloads that predate this field (read defensively,
  // never fabricated).
  feeder: EarningsSectionFeeder | null;
}

export interface EarningsOutlineResponse {
  sections: EarningsOutlineSection[];
}

// PUT body — the full arrangement. `display_order` is the array position of the
// included set; excluded sections carry included=false.
export interface SaveEarningsOutlinePayload {
  sections: { section_code: string; included: boolean; display_order: number }[];
}

// ─── Part 4/5 — Preview & Publish ─────────────────────────────────────────────
// All endpoints report-scoped (path takes report_id only); OpenAPI responses are
// UNTYPED ({}), so field names follow the spec and are read defensively.
// TODO(Step 0): confirm content/feeder/status/blocker shapes on a live GET /sections.
//   GET   /api/v1/earnings/reports/{id}/sections
//   POST  /api/v1/earnings/reports/{id}/produce                     (async → {run_id, poll_url})
//   POST  /api/v1/earnings/reports/{id}/sections/{code}/produce
//   PATCH /api/v1/earnings/reports/{id}/sections/{code}/content     { content }
//   POST  /api/v1/earnings/reports/{id}/export                      { format }  → bytes
//   POST  /api/v1/earnings/reports/{id}/approve                     (409 → blocker list)

// Per-section production status. 'produced' means real content; 'needs_input'/'empty'
// are surfaced, never claimed done.
export type EarningsSectionStatus =
  | 'pending'
  | 'drafting'
  | 'produced'
  | 'needs_input'
  | 'empty'
  | (string & {});

// One produced section. Shape mirrors the quarterly `ProducedSection` so the shared
// renderers (SectionContent/CoverRenderer/sectionState) work on it. `content` is a
// JSON string for table/kpi/cover modes and prose for generate/template.
export interface EarningsProducedSection {
  section_code: string;
  title: string;
  display_order: number;
  source_type: string | null;
  mode: string; // 'table' | 'kpi' | 'generate' | 'template' | 'cover'
  status: EarningsSectionStatus;
  content: string | null;
  included: boolean; // whether the outline included this section
  feeder_status: string | null; // 'ready' | 'template' | 'external' | 'needs_input' | null
  feeder_message: string | null; // what a needs_input section requires
  source_label: string | null; // citation label, when the payload carries feeder/citations
  source_ref: string | null; // e.g. "p. 12"
  confidence: number | null; // 0–100, when present
  flag: string | null; // grounding/confidence flag, when present
  grounding_flag: string | null; // grounding-violation message from a PATCH, when present
  grounding_acknowledged: boolean; // client marker: the user acknowledged the flag
  edited: boolean; // client marker: content was manually PATCHed
  // The Analyse button's last result, replayed by GET /sections so it survives a
  // reload. The backend has always sent it; nothing here declared it, so
  // normalizeEarningsSection dropped it and both the Report screen and a
  // reloaded Preview showed no analysis at all. Same shape quarterly stores.
  analysis?: SectionAnalysis | null;
}

export interface EarningsSectionsResponse {
  sections: EarningsProducedSection[];
  cover_template_key: string | null; // for the cover renderer, when the backend provides it
  locked: boolean; // approved/locked → read-only
}

// POST /produce async handle (mirrors the quarterly ProduceAllHandle).
// A produce request's outcome. `run_id`/`poll_url` are null when the server
// found nothing to do and started no run at all — a report that is already built
// and unchanged. There is nothing to poll and no loader to show; the caller just
// carries on. See _nothing_to_produce on the backend.
// What POST .../sections/{code}/produce actually returns: the four fields that
// endpoint owns, and nothing else. Deliberately NOT an EarningsProducedSection —
// running a section used to be normalised into a whole one, which invented a
// title (falling back to the section CODE), a display_order of 0 and a mode of
// 'generate' for the fields the response never carried. Merged over the real
// section, those invented values won, and a Run renamed the section to its own
// code and sent it to the top of the rail.
export interface EarningsSectionPatch {
  section_code: string;
  status: EarningsSectionStatus;
  content: string | null;
  error?: string | null;
  /** Numbers in the saved prose that match no resolved figure. Empty after a
   *  save that grounds cleanly — which is what clears the approve blocker. */
  grounding_violations?: string[];
}

export interface EarningsProduceHandle {
  run_id: string | null;
  poll_url: string | null;
}

// PATCH .../content body.
export interface SaveEarningsSectionContentPayload {
  content: string;
  /** Accept the section's ungrounded numbers as they stand, clearing the flag
   *  that blocks Approve & lock. The backend has read this since the gate was
   *  written (routes/earnings.py, save_section_content) — the field simply did
   *  not exist here, so nothing ever sent it and the flag could never be
   *  cleared by acknowledging. Optional: every existing caller is unaffected. */
  acknowledge?: boolean;
}

export type EarningsExportFormat = 'pdf' | 'docx';

// One reason approve is blocked (from a 409). `section_code` may be null for a
// document-level blocker.
export interface EarningsApproveBlocker {
  section_code: string | null;
  message: string;
}

// ─── Earnings dashboard — report list ─────────────────────────────────────────
//   GET /api/v1/earnings/reports?company_id&status&limit  → { reports: [...] }
// One flat object per dashboard card (newest first). Read defensively at the api
// layer; the response body is untyped in OpenAPI.
export interface EarningsReportSummary {
  report_id: string;
  title: string; // e.g. "Earnings Report"
  variant: string; // 'quarterly' | 'annual'
  tone: string | null;
  period: string; // stored form, e.g. "Q4-2023"
  period_display: string; // display form, e.g. "Q4 2023"
  status: string; // 'draft' | 'pending_approval' | 'approved' | 'locked' | ...
  action: string; // 'Continue' (draft/pending) | 'View' (finished)
  version: string | null;
  generated_at: string | null;
  updated_at: string | null;
  approved_at: string | null;
  locked_at: string | null;
}

export interface EarningsReportsListResponse {
  reports: EarningsReportSummary[];
}
