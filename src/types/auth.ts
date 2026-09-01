import type { BrandColors } from "@/types/brand";
import type { CompanyRecord } from "@/types/company";

// Per-user feature-permission system. Computed once at login (role defaults +
// any admin-granted extras) and baked into both the login response and the JWT
// — there is no live refresh, so these only change on the user's next login.
export type FeatureAction = "read" | "create" | "access";
export type FeaturePermissions = Partial<Record<FeatureAction, boolean>>;
export type PermissionsMap = Record<string, FeaturePermissions>;

// Which app(s) a user can land in: this app ("Centriton"/"Centriyon") vs. the
// separate external workspace app (backend calls it "spark_studio").
export type AppKey = "centriton_dashboard" | "spark_studio";

// Claims the backend embeds in the JWT payload, mirroring the login response's
// permission fields — read via parseJwtPayload() when the response itself
// omits them (same pattern already used for company_id/onboarding_completed).
export interface JwtPermissionClaims {
  permissions?: PermissionsMap | null;
  visible_features?: string[] | null;
  apps?: AppKey[] | null;
  default_app?: AppKey | null;
}

export interface AuthUser {
  user_id: string;
  email: string;
  full_name: string;
  // `ir` users come from the Admin Console invite flow — read-only.
  // `hod` (HR Lead) works in the SAR app like PM/department_user.
  // `spark_admin` is Spark itself — belongs to no company (company_id is null)
  // and only ever sees /spark.
  role:
    | "admin"
    | "project_manager"
    | "hod"
    | "department_user"
    | "ir"
    | "spark_admin";
  // Presentation-only label for `role` ("spark_admin" → "Spark Admin"),
  // resolved by the backend so the mapping lives in one place. Never gate on
  // this — `role` is the raw value every permission check uses. Optional
  // because a session stored before the backend sent it won't have one.
  display_role?: string | null;
  company_id?: string | null;
  company_name?: string | null;
  // Set TRUE for users created via /companies/{id}/team — backend flags
  // the row with must_change_password until they hit /auth/change-password.
  must_change_password?: boolean | null;
  // FALSE for a freshly-registered admin until they finish /auth/onboarding.
  // Invited users (project_manager / department_user) are never gated on this.
  onboarding_completed?: boolean | null;
  // Feature/app permission system — see JwtPermissionClaims above.
  permissions?: PermissionsMap | null;
  visible_features?: string[] | null;
  apps?: AppKey[] | null;
  default_app?: AppKey | null;
}

export interface LoginResponse {
  access_token: string;
  token_type: "bearer";
  user: AuthUser;
  // Explicit top-level mirror of the user's onboarding state.
  onboarding_completed: boolean;
  // Explicit top-level mirrors of the permission system — same fields also
  // land on `user` via login()'s enrichment step (src/lib/api.ts).
  permissions?: PermissionsMap | null;
  visible_features?: string[] | null;
  apps?: AppKey[] | null;
  default_app?: AppKey | null;
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
  display_role?: string | null;
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
  // SAR reporting sector (bank/insurance/general/reit/finance_co) — inherited by the cycle.
  reporting_sector: string;
  // Default departments the admin chose to create (their AI agents get
  // generated server-side). Sent with the onboarding completion.
  selected_department_codes: string[];
  // Optional
  founded_year?: number | null;
  website_url?: string | null;
  headquarter_city?: string | null;
  listed_exchange?: string | null;
  // Brand step. brand_identity is required by the wizard (min 20 chars) but
  // optional server-side; brand_colors becomes the company's default report
  // brand; logo_base64 is a PNG/JPEG data URI stored inline on the company row.
  brand_identity?: string | null;
  brand_colors?: BrandColors | null;
  logo_base64?: string | null;
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
