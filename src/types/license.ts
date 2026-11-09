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
  company_name?: string | null;
  deployment: Deployment;
  status: LicenseStatus;
  message: string | null;
  // Cloud: the subscription's plan (null for a key).
  plan_name?: string | null;
  billing_period?: "monthly" | "yearly" | null;
  starts_at: string | null;
  expires_at: string | null;
  modules: string[];
  report_limits: Record<string, number>;
  max_seats: number | null;
  seats_used: number;
  // Each people limit: used now and the most allowed (max null = no valid license).
  people?: PeopleUsage;
  reports_used: Record<string, number>;
  lock_id: string | null;
  lock_reason: string | null;
  server_id: string | null;
  upgrade_requested_at: string | null;
  modules_catalogue: LicensableModule[];
}

export interface UpgradeRequestPayload {
  consent?: boolean;                  // required by the server: the admin ticked "I confirm..."
  renewal?: boolean;
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
  // The key's people (null until there's a valid key).
  max_pms?: number | null;
  max_ir_users?: number | null;
  department_sizes?: number[] | null;
  server_id: string | null;           // shown as "Client ID"
  seats_used: number | null;          // null for on-premises (lives on their server)
  reports_counted: Record<string, number>;
  lock: { lock_id: string; reason: string; locked_at: string } | null;
  open_upgrade_requests: number;
  reports_used?: Record<string, number> | null;
  // GET /spark/companies/{id}/license only: the open upgrade request.
  open_request?: SparkOpenRequest | null;
}

// What a client admin asked for. `asked` is null for requests sent before the
// numbers were saved — then only the text (`lines`) can be shown.
export interface SparkOpenRequest {
  sent_at: string | null;
  asked_by: string | null;
  lines: string[];
  asked: {
    renewal?: boolean;
    max_seats?: number;
    report_limits?: Record<string, number>;
    modules?: string[];
  } | null;
}

// GET /spark/licenses → upgrade_requests: one open request (cloud clients).
export interface SparkUpgradeRequest {
  company_id: string;
  company_name: string | null;
  asked_by: string | null;
  sent_at: string | null;
  lines: string[];                    // e.g. "Users: 30", "Note: …"
}

// POST /spark/companies/{id}/license
export interface GenerateLicensePayload {
  modules: string[];
  report_limits: Record<string, number>;   // every chosen module that counts reports: at least 1
  max_pms: number;
  max_ir_users: number;
  department_sizes: number[];              // users per department card, besides its HOD
  starts_at: string;
  expires_at: string;
  server_id?: string;
}

export interface GeneratedLicense {
  license_key: string;
  activated: boolean;   // false for on-premises: copy the key and send it
  claims: Record<string, unknown>;
}

export interface PeopleUsage {
  pms: { used: number; max: number | null };
  ir_users: { used: number; max: number | null };
  departments: { used: number; max: number | null };
  department_users: { used: number; max: number | null };
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
  upgrade_requested_at?: string | null;
  seats?: { used: number; max: number | null };
  people?: PeopleUsage;
  reports?: Record<string, { module_on: boolean; used: number; limit: number | null }>;
}
