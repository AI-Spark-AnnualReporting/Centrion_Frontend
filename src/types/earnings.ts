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
export interface SelectableSource {
  report_id: string; // feeds source_report_ids on create
  label: string; // display label, e.g. "Shell — Quarterly Report Q4-2023". Never a filename.
  report_type: string | null; // e.g. 'quarterly' | 'annual'
  period: string | null; // e.g. "Q4-2023"
  updated_at: string | null;
  coverage: SourceCoverage; // 'full' | 'partial'
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
  source_report_ids: string[]; // required, ≥1
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

// ─── Part 3 — Arrange Outline ─────────────────────────────────────────────────
// Contracts from OpenAPI are UNTYPED (200 → {}), and the PUT body is undocumented,
// so field names below follow the spec and are read defensively at the api layer.
//   GET  /api/v1/earnings/reports/{reportId}/outline                (no company_id)
//   PUT  /api/v1/earnings/reports/{reportId}/outline   { sections: [...] }
// TODO(Step 0): confirm every field name against a live GET during integration.

// Whether an optional section can actually be added — the backend tells us when a
// section has no backing data. `available=false` → greyed, toggle disabled, never
// silently addable (D-12). Required sections are always included regardless.
export interface EarningsOutlineSection {
  section_code: string;
  title: string;
  description: string | null;
  section_number: number | null; // display number on the card, when provided
  display_order: number; // authoritative sort key; array order on save
  included: boolean; // currently in the report
  requirement: 'required' | 'optional' | (string & {});
  available: boolean; // optional-only meaning: has backing data → addable
  source_type: string | null; // hint chip; render only when the backend provides it
  mode: string | null; // hint chip; render only when the backend provides it
  page_hint: string | null; // e.g. "~2 pages"; never fabricated
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
}

export interface EarningsSectionsResponse {
  sections: EarningsProducedSection[];
  cover_template_key: string | null; // for the cover renderer, when the backend provides it
  locked: boolean; // approved/locked → read-only
}

// POST /produce async handle (mirrors the quarterly ProduceAllHandle).
export interface EarningsProduceHandle {
  run_id: string;
  poll_url: string;
}

// PATCH .../content body.
export interface SaveEarningsSectionContentPayload {
  content: string;
}

export type EarningsExportFormat = 'pdf' | 'docx';

// One reason approve is blocked (from a 409). `section_code` may be null for a
// document-level blocker.
export interface EarningsApproveBlocker {
  section_code: string | null;
  message: string;
}
