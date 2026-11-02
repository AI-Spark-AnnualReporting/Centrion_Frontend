// Company licensing — shapes returned by the backend's license endpoints.
// Backend: Centriton routes/license_routes.py (client admin) and
// routes/spark_license_routes.py (spark_admin only).

export type LicenseStatus =
  | "none"         // no key yet: onboarding only
  | "active"
  | "expired"      // read-only
  | "not_started"
  | "invalid"      // key doesn't match this company/server: read-only
  | "locked";      // tampering caught: read-only until Spark's unlock code

export type Deployment = "cloud" | "on_prem";

export interface LicensableModule {
  key: string;
  label: string;
  // reports.report_type the module's report limit applies to; null = no count.
  report_type: string | null;
}

// GET /admin/license — the client admin's license card and banners.
export interface CompanyLicense {
  deployment: Deployment;
  status: LicenseStatus;
  message: string | null;
  starts_at: string | null;
  expires_at: string | null;
  modules: string[];
  report_limits: Record<string, number>;
  max_seats: number | null;
  seats_used: number;
  reports_used: Record<string, number>;
  lock_id: string | null;
  lock_reason: string | null;
  server_id: string | null;
  upgrade_requested_at: string | null;
  modules_catalogue: LicensableModule[];
}

export interface UpgradeRequestPayload {
  max_seats?: number;
  report_limits?: Record<string, number>;
  modules?: string[];
  note?: string;
}

// GET /spark/licenses — one row per company on spark_admin's Licenses screen.
export interface SparkLicenseRow {
  company_id: string;
  company_name: string | null;
  deployment: Deployment;
  status: LicenseStatus;
  starts_at: string | null;
  expires_at: string | null;
  issued_at: string | null;
  modules: string[];
  report_limits: Record<string, number>;
  max_seats: number | null;
  server_id: string | null;
  seats_used: number | null;          // null for on-premises (lives on their server)
  reports_counted: Record<string, number>;
  lock: { lock_id: string; reason: string; locked_at: string } | null;
  open_upgrade_requests: number;
  reports_used?: Record<string, number> | null;
}

// POST /spark/companies/{id}/license
export interface GenerateLicensePayload {
  modules: string[];
  report_limits: Record<string, number | null>;
  max_seats: number;
  starts_at: string;
  expires_at: string;
  server_id?: string;
}

export interface GeneratedLicense {
  license_key: string;
  activated: boolean;   // false for on-premises: copy the key and send it
  claims: Record<string, unknown>;
}

// GET /license/usage — any company user. How much room is left per limit, so
// create buttons can warn before the server refuses. Spark staff: unlimited.
export interface LicenseUsage {
  unlimited: boolean;
  status?: LicenseStatus;
  deployment?: Deployment;
  message?: string | null;
  can_request?: boolean;
  is_admin?: boolean;
  seats?: { used: number; max: number | null };
  reports?: Record<string, { module_on: boolean; used: number; limit: number | null }>;
}
