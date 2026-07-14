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
