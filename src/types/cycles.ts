// Types for the Annual Report (Cycles) feature — Part 6. Backed by the SAR
// service (a separate backend from Centriton; see `sarRequest` in lib/api.ts).
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
  name: string;
  fiscal_year: number;
  period_label: string;
  content_language: ContentLanguage;
  project_manager_id: string;
  project_manager_name?: string;
  cycle_start_date: string;
  cycle_end_date: string;
  submission_deadline: string;
  company_profile: string;
  sector_id: string;
  sector_name?: string;
  is_shariah_compliant: boolean;
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

export interface CreateCyclePayload {
  name: string;
  fiscal_year: number;
  content_language: ContentLanguage;
  project_manager_id: string;
  cycle_start_date: string;
  cycle_end_date: string;
  submission_deadline: string;
  company_profile: string;
  sector_id: string;
  is_shariah_compliant: boolean;
  has_subsidiaries: boolean;
  has_sukuk: boolean;
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

export type SectionLayer = "common" | "cma_required" | "custom";
export type SectionMode = "ai_written" | "upload" | "system" | "extract" | "manual";
export type SectionStatus = "pending" | "locked" | "in_progress" | "completed";

export interface CycleSection {
  id: string;
  cycle_id: string;
  section_code: string;
  section_name: string;
  layer: SectionLayer;
  mode: SectionMode;
  status: SectionStatus;
  assigned_dept_id?: string;
  assigned_dept_name?: string;
  word_count?: number;
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
export const COMPANY_PROFILE_OPTIONS: { value: string; label: string }[] = [
  { value: "listed_tadawul", label: "Listed (Tadawul)" },
  { value: "listed_nomu", label: "Listed (Nomu)" },
  { value: "unlisted", label: "Unlisted" },
  { value: "government", label: "Government / SOE" },
  { value: "private", label: "Private" },
];
