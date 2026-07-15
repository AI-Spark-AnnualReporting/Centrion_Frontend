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

// One row in the "Use existing reports" list. The /sources response is untyped in
// OpenAPI, so these fields are read defensively at the api layer — confirm the exact
// names against a live response. `coverage` drives the Full/Partial badge.
export type SourceCoverage = 'full' | 'partial' | (string & {});
export interface SelectableSource {
  id: string; // a document id — feeds source_document_ids on create
  title: string; // display label (filename / report title)
  period: string | null; // e.g. "FY 2025" / "Q3 2025"
  coverage: SourceCoverage; // 'full' | 'partial'
}

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
  source_document_ids: string[]; // required, ≥1
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
  source_label: string | null; // human label for the source column
  source_ref: string | null; // e.g. "p. 12" / section reference
  confidence: number | null; // 0–100; null once the value is a manual edit
  is_derived: boolean; // derived (computed) rows show "Derived · <formula>"
  derivation: string | null; // the formula, when derived
  flag: FigureFlag | null; // backend flag when present
  edited: boolean; // client marker: value was manually PATCHed
}

// The selected source shown in the header — always taken verbatim from the
// backend's own `sources`/`source_documents` field, never derived from figure
// rows (derived figure rows carry a null source_document_id).
export interface EarningsFigureSource {
  id: string;
  title: string;
  coverage: SourceCoverage | null;
  preview_url: string | null;
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
