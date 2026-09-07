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

/**
 * How a slot is filled. `documents` is the uploaded-file row; `meetings` is
 * filled by ticking meetings already on the platform, so it never has documents.
 * Absent on older payloads — read it through `slotKind()`, which defaults to
 * `documents`.
 */
export type BoardSlotKind = "documents" | "meetings" | "profiles" | (string & {});

export interface BoardSourceSlot {
  slot: string;
  kind?: BoardSlotKind;
  /** Meetings slots only — the section the picker reads and writes (BR35/BR36). */
  section_code?: string;
  /** At least one mandatory section depends on this slot. */
  required: boolean;
  /** `received` on a meetings slot means at least one meeting is ticked. */
  status: "received" | "pending" | (string & {});
  feeds: BoardSlotFeed[];
  /** Always present — empty on a meetings slot. */
  documents: BoardSlotDocument[];
  /** Meetings slots only. */
  selected_ids?: string[];
  selected_count?: number;
  /** Meetings/profiles slots — how many the platform holds, for "2 of 4". */
  member_count?: number;
  /**
   * Profiles slot — how many people were read out of an uploaded CV file. The
   * row shows the count only; the table itself is edited in BR32's card on the
   * Review screen, so there is one editable copy in one place.
   */
  profile_count?: number;
  /**
   * What the slot is actually feeding its sections from. A selection wins over
   * an attached file, and on the profiles slot uploaded people win over ticked
   * team members — the author is offered one path or the other.
   */
  fed_by?: "meetings" | "documents" | "profiles" | "team" | null;
  /** Meetings slots — the saved period the selection was resolved from. */
  date_from?: string | null;
  date_to?: string | null;
}

// ─── meeting picker (BR35 / BR36) ─────────────────────────────────────────────

export interface BoardMeeting {
  id: string;
  title: string;
  meeting_date: string;
  meeting_time?: string | null;
  meeting_type: string;
  status?: string;
  participant_count: number;
  /** False → the meeting contributes one line to the register and nothing else. */
  has_minutes: boolean;
  attendance_recorded: boolean;
  minutes_attachment_name?: string | null;
  selected: boolean;
}

export interface BoardMeetingFilters {
  meeting_type?: string | null;
  date_from?: string | null;
  date_to?: string | null;
}

export interface BoardMeetingsResponse {
  /** What the server actually filtered on — seed the controls from this. */
  filters: BoardMeetingFilters;
  /** The type dropdown's options. Never hardcode the enum; `all` is also valid. */
  meeting_types: string[];
  selected_ids: string[];
  meetings: BoardMeeting[];
  /** How many of `meetings` would actually print — the rest have no minutes. */
  with_minutes_count?: number;
  /** The period already saved for this section, if any. Seeds the date inputs. */
  saved_period?: { date_from: string; date_to: string } | null;
}

// ─── director picker (BR32) ───────────────────────────────────────────────────

export interface BoardDirector {
  id: string;
  full_name: string;
  title?: string | null;
  position_type?: string | null;
  /** False → the person still gets a table row, just an empty CV cell. */
  has_cv: boolean;
  has_photo: boolean;
  cv_file_name?: string | null;
  selected: boolean;
}

export interface BoardDirectorsResponse {
  selected_ids: string[];
  directors: BoardDirector[];
}

// ─── profiles read out of an uploaded CV (BR32) ────────────────────────────────
//
// The other way to fill BR32, for an issuer whose directors are not platform
// users. The upload pipeline reads the people out of the file; these are what
// the author then corrects, in a table inside BR32's card on the Review screen.

export interface BoardProfileJob {
  job_title: string;
  company: string;
  /** "YYYY-MM", or null when the CV gave no dates. */
  from_month: string | null;
  /** null means the job is current. */
  to_month: string | null;
  responsibility: string;
  sort_order?: number;
}

export interface BoardProfile {
  /** Minted server-side. Absent on a row the operator has just added. */
  id?: string;
  full_name: string;
  /** The role on the BOARD, not the current job — that is an experience entry. */
  title: string;
  has_photo?: boolean;
  /** The headshot inline: the storage bucket is private, so there is no URL. */
  photo_data_uri?: string | null;
  source_document_id?: string | null;
  /** The file this person was read out of. Null for one typed in by hand. */
  source_filename?: string | null;
  experience: BoardProfileJob[];
  /**
   * Write-only. A full `data:image/…;base64,…` URI replaces the headshot, null
   * clears it, and omitting the key keeps what is there — three distinct
   * meanings, so never send it as an empty string.
   */
  photo_base64?: string | null;
}

export interface BoardProfilesResponse {
  report_id: string;
  section_code: string;
  profiles: BoardProfile[];
  count: number;
  /** The CV files filed under the slot, for a "read from …" line. */
  documents: { id: string; filename: string }[];
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
  /**
   * `platform_data` — the section was built from data already on the platform
   * (team profiles, selected meetings) rather than an uploaded document, so it
   * carries no citations.
   */
  source?: string | null;
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

/**
 * How a section prints. `table` (or absent) is the generic table renderer; the
 * `cards_*` values are the profile-card layouts BR32 offers. Saved on the
 * section so the exported PDF matches the screen.
 */
export type BoardSectionLayout = "table" | "cards_grid" | "cards_band" | "cards_row";

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
  /** Absent/null on a server without the layout choice — read it as `table`. */
  layout?: BoardSectionLayout | null;
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
