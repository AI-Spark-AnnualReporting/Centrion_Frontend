import type { CompanyRecord } from "@/types/company";

export interface AuthUser {
  user_id: string;
  email: string;
  full_name: string;
  // `ir` users come from the Admin Console invite flow — read-only.
  role: "admin" | "project_manager" | "department_user" | "ir";
  company_id?: string | null;
  company_name?: string | null;
  // Set TRUE for users created via /companies/{id}/team — backend flags
  // the row with must_change_password until they hit /auth/change-password.
  must_change_password?: boolean | null;
  // FALSE for a freshly-registered admin until they finish /auth/onboarding.
  // Invited users (project_manager / department_user) are never gated on this.
  onboarding_completed?: boolean | null;
}

export interface LoginResponse {
  access_token: string;
  token_type: "bearer";
  user: AuthUser;
  // Explicit top-level mirror of the user's onboarding state.
  onboarding_completed: boolean;
}

export interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
}

// GET /api/v1/auth/me — richer than the login payload (carries `status` and
// keeps company_name flat).
export interface UserProfile {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
  company_id: string | null;
  company_name: string | null;
  must_change_password?: boolean | null;
  onboarding_completed?: boolean | null;
}

// POST /api/v1/auth/onboarding — collects company details on the admin's
// first login. Sent as a JSON body. (The user-profile step was removed, so
// title / position_type / phone are no longer sent.)
export interface OnboardingPayload {
  // Mandatory
  description: string;
  employee_count: number;
  fiscal_year_end_month: number;
  reporting_currency: "SAR" | "AED" | "BHD" | "KWD" | "OMR" | "QAR" | "USD";
  primary_language: "en" | "ar";
  // ESG sector (UUID from the sectors lookup) + the company-profile attributes
  // the annual-report cycle inherits. All mandatory.
  sector_id: string;
  company_profile: "listed" | "private";
  is_shariah: boolean;
  has_subsidiaries: boolean;
  has_sukuk: boolean;
  // Default departments the admin chose to create (their AI agents get
  // generated server-side). Sent with the onboarding completion.
  selected_department_codes: string[];
  // Optional
  founded_year?: number | null;
  website_url?: string | null;
  headquarter_city?: string | null;
  listed_exchange?: string | null;
}

// GET /api/v1/auth/onboarding/department-options — the default departments the
// admin can opt into during onboarding.
export type DepartmentCategory = "leadership" | "core" | "commercial" | "support";

export interface DepartmentOption {
  code: string;
  name: string;
  description: string;
  category: DepartmentCategory;
}

export interface OnboardingResponse {
  access_token: string;
  company: CompanyRecord;
  user: AuthUser;
}
