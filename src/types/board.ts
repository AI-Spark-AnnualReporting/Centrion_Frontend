// Types for the Board of Directors' Report — the `/api/v1/board` service.
// Field names mirror the API exactly so payloads round-trip without mapping.
//
// The report is a `reports` row with report_type='board_pack' and period='FY-YYYY'.
// Unlike the quarterly and earnings flows, the section registry and the
// profile→section resolution live entirely server-side: the client sends a
// profile and renders whatever outline comes back.

import type { BrandColors } from "@/types/brand";

// ─── profile ──────────────────────────────────────────────────────────────────

// The API also accepts "insurer", but the builder only offers Bank /
// Non-financial, so it never sends it. See the plan's backend questions — an
// insurance company currently resolves as a corporate.
export type BoardIssuerType = "bank" | "corporate";

export interface BoardIssuerProfile {
  issuer_type: BoardIssuerType;
  /** The company's sector as named in the /lookups/sectors table, sent verbatim. */
  sector: string | null;
  sharia_compliant: boolean;
  externally_rated: boolean;
  has_capital_instruments: boolean;
}

export interface BoardCounts {
  included: number;
  mandatory: number;
  optional: number;
  conditional: number;
  dropped: number;
  na: number;
}

export interface BoardProfileResponse {
  report_id: string;
  issuer_profile: BoardIssuerProfile;
  /** Computed server-side, never stored. */
  derived: { is_financial: boolean; regulator: string };
  counts: BoardCounts;
}

// ─── report lifecycle ─────────────────────────────────────────────────────────

/** `draft` is editable; approved/locked/published 409 every mutating endpoint. */
export type BoardReportStatus = "draft" | "approved" | "locked" | "published" | (string & {});

export interface BoardReportSummary {
  report_id: string;
  period: string; // "FY-2025"
  status: BoardReportStatus;
  created_at: string;
  updated_at: string;
  issuer_profile: BoardIssuerProfile;
}

/**
 * `GET /reports/{id}`. Same row as the list entry, plus `locked` precomputed —
 * use that rather than inferring it from `status`.
 */
export interface BoardReportDetail extends BoardReportSummary {
  locked?: boolean;
}

export interface CreateBoardReportPayload {
  company_id: string;
  fiscal_year: number;
  /** Omit and the server seeds the profile from the company record. */
  issuer_profile?: BoardIssuerProfile | null;
}

export interface BoardReportListResponse {
  reports: BoardReportSummary[];
}

// ─── sources ──────────────────────────────────────────────────────────────────

/** What happens to a section if its source document never arrives. */
export type BoardOnMissing = "block" | "carry_flag" | "auto" | "omit" | (string & {});

export interface BoardSlotFeed {
  section_code: string;
  title: string;
  requirement: BoardRequirement;
  on_missing: BoardOnMissing;
}

export interface BoardSlotDocument {
  document_id: string;
  file_name: string;
  file_type: string;
  extraction_status: string;
  uploaded_at: string;
}

export interface BoardSourceSlot {
  slot: string;
  /** At least one mandatory section depends on this slot. */
  required: boolean;
  status: "received" | "pending" | (string & {});
  feeds: BoardSlotFeed[];
  documents: BoardSlotDocument[];
}

export interface BoardSourcesResponse {
  report_id: string;
  period: string;
  received: number;
  total: number;
  /** Derived from the registry per issuer — a corporate sees 10, a bank 11. */
  slots: BoardSourceSlot[];
}

// ─── outline ──────────────────────────────────────────────────────────────────

export type BoardRequirement = "M" | "O" | "C";

/**
 * `in` as written · `variant` the non-bank version · `dropped` bank-only and
 * this issuer isn't a bank · `na` conditional and the condition isn't met.
 */
export type BoardResolution = "in" | "variant" | "dropped" | "na";

export type BoardSectionStatus =
  | "pending"
  | "drafting"
  | "produced"
  | "needs_input"
  | "empty"
  | "locked"
  | (string & {});

export type BoardProvenance = "new" | "updated" | "carried_forward" | (string & {});

export interface BoardOutlineSection {
  section_code: string;
  title: string;
  category: string;
  display_order: number;
  requirement: BoardRequirement;
  resolution: BoardResolution;
  included: boolean;
  content_type: string;
  carry_fwd: boolean;
  on_missing: BoardOnMissing;
  data_source: string;
  source_document: string;
  /** The "what changes" line — only set when `resolution` isn't `in`. */
  note: string | null;
  status: BoardSectionStatus;
  provenance: BoardProvenance;
  confirmed: boolean;
}

export interface BoardOutlineResponse {
  report_id: string;
  period: string;
  counts: BoardCounts;
  /** All 46 registry sections, including the ones that don't apply. */
  sections: BoardOutlineSection[];
}

/** Array order IS display order. */
export interface BoardOutlineSavePayload {
  sections: { section_code: string; included: boolean }[];
}

// ─── produced sections ────────────────────────────────────────────────────────

/** Which document a section's content was read from. */
export interface BoardCitation {
  /** The source slot the document was filed under. */
  slot?: string | null;
  /** The file it came from. */
  source_ref?: string | null;
}

/**
 * Citations arrive keyed by slot — `{ "Governance register": { source_ref } }`.
 * Typed to allow a plain list too, because the shape isn't pinned down and a
 * wrong guess here white-screens the whole report. Read it through
 * `boardCitations()`, never directly.
 */
export type BoardCitations = Record<string, unknown> | BoardCitation[] | null;

export interface BoardSectionFeeder {
  /** Set when the content was reused from a prior year, e.g. "FY-2024". */
  carried_forward_from?: string | null;
  /** Says exactly what is missing (needs_input) or why it is empty. */
  message?: string | null;
  /** The documents this section was read from — keyed by slot. */
  citations?: BoardCitations;
  /**
   * e.g. "Read 3 row(s) from a table on page 164". Not shown — it describes the
   * extractor's work rather than the report, and reads as noise next to the
   * content. The source chips carry the part a reviewer needs.
   */
  extraction_note?: string | null;
  /** A human edited this section by hand. */
  edited?: boolean;
  /** A reviewer had the model rewrite it. */
  refined?: boolean;
}

export interface BoardSection {
  section_code: string;
  title: string;
  display_order: number;
  included: boolean;
  resolution: BoardResolution;
  status: BoardSectionStatus;
  provenance: BoardProvenance;
  confirmed: boolean;
  content_type: string;
  /** Prose sections hold text; the rest hold JSON as a string. */
  content: string | null;
  feeder?: BoardSectionFeeder | null;
}

export interface BoardSectionsResponse {
  report_id: string;
  period: string;
  sections: BoardSection[];
}

export interface BoardProduceSectionResponse {
  section_code: string;
  status: BoardSectionStatus;
  /** True when nothing it depends on changed — no LLM call was made. */
  cached: boolean;
  content: string | null;
}

/** 202 handle from the batch produce and the document upload. */
export interface BoardRunHandle {
  run_id: string;
  poll_url: string;
  status?: string;
  started_at?: string;
  file_count?: number;
  estimated_duration_seconds?: number;
  /** Upload only — the slots this run filed, one per file. */
  slots?: string[];
}

/**
 * The batch-produce run's `output_summary`. Untyped on `AgentRun`, so it is read
 * through one guarded cast (`boardProduceSummary` in board-helpers) rather than
 * inline at each use.
 */
export interface BoardProduceSummary {
  produced: number;
  skipped: number;
  failed: number;
  total: number;
}

// ─── completion & assembly ────────────────────────────────────────────────────

export interface BoardCompletion {
  report_id?: string;
  total: number;
  ready: number;
  /** Section codes, in each case. */
  awaiting_data: string[];
  pending_confirmation: string[];
  not_produced: string[];
  can_approve: boolean;
}

export interface BoardCover {
  template_key: string;
  layout?: Record<string, unknown>;
  brand?: BrandColors | null;
  values?: Record<string, unknown>;
}

export interface BoardAssembledSection {
  section_code: string;
  title: string;
  display_order: number;
  /**
   * The section's number in the finished document. Headings inside `content`
   * are numbered from it — `3.1`, `3.2` — by `numberBoardHeadings`, so the
   * preview matches the export. Not present in the content string itself.
   */
  number?: number;
  /** `table` → content is JSON; `prose` → content is text. */
  mode: "table" | "prose" | (string & {});
  source_type: string;
  content: string | null;
}

export interface BoardAssembleResponse {
  report_id: string;
  period: string;
  cover: BoardCover;
  brand: BrandColors | null;
  /** Only included AND produced AND non-empty sections appear. */
  sections: BoardAssembledSection[];
  completion: BoardCompletion;
}

export type BoardExportFormat = "pdf" | "docx";

// ─── refine ───────────────────────────────────────────────────────────────────

/** Free-text rewrite instruction. The server caps it; the UI enforces it too. */
export const BOARD_REFINE_MAX = 2000;

export interface BoardRefinePayload {
  instruction: string;
}
