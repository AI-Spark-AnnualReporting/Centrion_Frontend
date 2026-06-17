// Types for the Annual Report (Cycles) feature — Part 6. Backed by the SAR
// service (a separate backend from Centriyon; see `sarRequest` in lib/api.ts).
// Field names mirror the SAR API exactly so payloads round-trip without mapping.

export type ContentLanguage = "en" | "ar";

export type CycleStatus =
  | "draft"
  | "active"
  | "in_review"
  | "completed"
  | "archived";

export interface Cycle {
  id: string;
  company_id: string;
  // Renamed fields carry both names — the SAR request contract uses
  // cycle_name/start_date/end_date/sector/is_shariah; older shapes used
  // name/cycle_*_date/sector_id/is_shariah_compliant. Read defensively.
  name?: string;
  cycle_name?: string;
  fiscal_year: number;
  period_label?: string;
  content_language?: ContentLanguage;
  project_manager_id: string;
  project_manager_name?: string;
  cycle_start_date?: string;
  start_date?: string;
  cycle_end_date?: string;
  end_date?: string;
  submission_deadline: string;
  company_profile?: string;
  sector_id?: string;
  sector?: string;
  sector_name?: string;
  is_shariah_compliant?: boolean;
  is_shariah?: boolean;
  has_subsidiaries: boolean;
  has_sukuk: boolean;
  status: CycleStatus;
  created_at: string;
  updated_at: string;
  // Progress summary the list endpoint surfaces per cycle (the design shows
  // "8/8 · 100%" in each row). Optional — absent on the detail `get` payload.
  progress?: number; // 0–100
  completion_rate?: number; // 0–100 alias some endpoints use
  submitted?: number;
  total_departments?: number;
}

// Exact request body for POST/PUT /api/v1/admin/cycles. Do NOT add company_id
// (derived from JWT), content_language (no such field on SAR), or sector_id
// (use `sector` code). company_profile is "listed" | "private"; sector is one
// of bank|insurance|general|reit|finance_co.
export interface CreateCyclePayload {
  cycle_name: string;
  fiscal_year: number;
  project_manager_id: string;
  start_date: string;
  end_date: string;
  submission_deadline: string;
  kickoff_brief?: string;
  company_profile?: string;
  sector?: string;
  is_shariah?: boolean;
  has_subsidiaries?: boolean;
  has_sukuk?: boolean;
}

export type SessionStatus =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "approved";

export interface CycleDepartmentProgress {
  department_id: string;
  department_name: string;
  department_code: string;
  assigned_user_id?: string | null;
  assigned_user_name?: string;
  assigned_user_email?: string;
  session_status: SessionStatus;
  progress: number;
  submitted_at: string | null;
}

export interface CycleOverview {
  cycle: Cycle;
  stats: {
    total_sections: number;
    completed_sections: number;
    total_departments: number;
    submitted: number;
    in_progress: number;
    completion_rate: number;
  };
  departments: CycleDepartmentProgress[];
}

// Shapes from POST /resolve-sections and GET /sections.
export type SectionLayer = "common" | "cma" | "sector" | "optional";
export type SectionMode =
  | "generate"
  | "attach"
  | "auto"
  | "manual"
  | "extract"
  | "analyze";
export type SectionStatus = "pending" | "drafting" | "locked";

export interface CycleSection {
  section_code: string;
  title: string;
  section_number?: number;
  layer: SectionLayer;
  content_source?: string | null;
  ai_allowed?: boolean;
  mode: SectionMode;
  status: SectionStatus;
  display_order?: number;
  verified?: boolean;
  locked_at?: string | null;
  attachment?: unknown;
  content?: unknown;
  feeders?: unknown[];
}

// POST /api/v1/admin/cycles/{id}/resolve-sections response.
export interface ResolveSectionsResponse {
  success: boolean;
  cycle_id: string;
  sections_created: number;
  sections: CycleSection[];
}

// POST /api/v1/admin/cycles/{id}/assign-departments
export interface AssignDepartmentsPayload {
  assignments: { department_id: string; user_id: string }[];
}

export interface AssignDepartmentsResponse {
  success: boolean;
  message: string;
  assignments_created: number;
  assignments: Array<{
    id: string;
    cycle_id: string;
    department_id: string;
    department_name: string;
    user_id: string;
    user_name: string;
    user_email: string;
    assigned_by: string;
    assigned_at: string;
  }>;
}

export interface SARUser {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string;
}

// Company-profile choices for the create/edit forms. There is no existing
// source for these in the repo — the values must match the SAR backend's
// expected `company_profile` strings. Verify against SAR before shipping.
// SAR accepts only "listed" or "private" for company_profile.
export const COMPANY_PROFILE_OPTIONS: { value: string; label: string }[] = [
  { value: "listed", label: "Listed (Tadawul)" },
  { value: "private", label: "Private" },
];

// SAR's 5 fixed sector codes — sent as `sector` (NOT a UUID). These are SAR's
// own set, distinct from Centriyon's sectors lookup.
export const CYCLE_SECTOR_OPTIONS: { value: string; label: string }[] = [
  { value: "bank", label: "Bank" },
  { value: "insurance", label: "Insurance" },
  { value: "general", label: "General" },
  { value: "reit", label: "REIT" },
  { value: "finance_co", label: "Finance Company" },
];
