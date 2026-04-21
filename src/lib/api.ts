// Typed fetch client for the Centriton Platform API.
// Paths + shapes derived from openapi.json.
//
// All authenticated calls MUST go through either:
//   - the typed `request<T>()` helper (used by the namespaced clients below), or
//   - `fetchWithAuth(path, init)` for raw Response access.
// Both attach Authorization: Bearer <token> automatically and trigger logout
// on a 401. Do not use raw `fetch()` for authenticated endpoints.

import type { AuthUser, LoginResponse } from "@/types/auth";
import type { RegisterRequest, RegisterResponse } from "@/types/register";
import type {
  CreateCompanyRequest,
  CreateCompanyResponse,
  Sector,
  SectorsResponse,
} from "@/types/company";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL ?? "http://localhost:8000"
).replace(/\/+$/, "");

const TOKEN_STORAGE_KEY = "centriton_token";
const USER_STORAGE_KEY = "centriton_user";

const DEFAULT_REQUEST_HEADERS: Record<string, string> = {};

export function getAuthToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setAuthToken(token: string | null): void {
  if (typeof localStorage === "undefined") return;
  if (token == null) localStorage.removeItem(TOKEN_STORAGE_KEY);
  else localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

// Decode the base64url-encoded payload of a JWT. Returns null on any failure.
// The signature is NOT verified — we trust the backend's auth middleware to
// reject forgeries; this is purely for reading claims the server put there.
export function parseJwtPayload<T = Record<string, unknown>>(
  token: string,
): T | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json =
      typeof atob === "function"
        ? atob(padded)
        : Buffer.from(padded, "base64").toString("binary");
    const decoded = decodeURIComponent(
      Array.from(json)
        .map((c) => `%${("00" + c.charCodeAt(0).toString(16)).slice(-2)}`)
        .join(""),
    );
    return JSON.parse(decoded) as T;
  } catch {
    return null;
  }
}

function handleUnauthorized() {
  logout();
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}

export class ApiError<TBody = unknown> extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: TBody,
    public url: string,
  ) {
    super(`API ${status} ${statusText} — ${url}`);
    this.name = "ApiError";
  }
}

type QueryParams = object;

function buildQuery(params?: QueryParams): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, String(x)));
    else sp.append(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

interface RequestOptions {
  method?: string;
  query?: QueryParams;
  body?: unknown;
  form?: FormData;
  auth?: boolean;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = `${API_BASE_URL}${path}${buildQuery(opts.query)}`;
  const headers: Record<string, string> = { ...DEFAULT_REQUEST_HEADERS, ...(opts.headers ?? {}) };

  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form;
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers["Content-Type"] ??= "application/json";
  }

  if (opts.auth !== false) {
    const token = getAuthToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body,
    signal: opts.signal,
  });

  const ct = res.headers.get("content-type") ?? "";
  const parsed: unknown = ct.includes("application/json")
    ? await res.json().catch(() => null)
    : await res.text().catch(() => null);

  if (res.status === 401 && opts.auth !== false) handleUnauthorized();
  if (!res.ok) throw new ApiError(res.status, res.statusText, parsed, url);
  return parsed as T;
}

// ---------------------------------------------------------------------------
// Shared schemas (from components.schemas)
// ---------------------------------------------------------------------------

export interface ValidationError {
  loc: Array<string | number>;
  msg: string;
  type: string;
  input?: unknown;
  ctx?: Record<string, unknown>;
}

export interface HTTPValidationError {
  detail?: ValidationError[];
}

export interface UploadDocumentsBody {
  files: File[];
  frameworks?: string[]; // default ["GRI"]
}

export interface GenerateReportBody {
  files: File[];
  year: number;
  sector_id: string;
  scope_type: string;
  report_type?: string; // default "esg"
  framework_codes?: string[];
  region?: string;
  country_id?: string;
  regulator_ids?: string[];
}

export interface AddReportDocumentsBody {
  files: File[];
}

// Loose aliases for values sourced from API lookups.
export type Jurisdiction = string;
export type AgentClass =
  | "worker"
  | "analyst"
  | "compliance"
  | "strategy"
  | "narrative"
  | (string & {});
export type CoverageStatus =
  | "all"
  | "found"
  | "partial"
  | "not_disclosed"
  | (string & {});
export type PublishChannel = "investor_portal" | (string & {});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface RegisterParams {
  email: string;
  password: string;
  full_name: string;
  role?: string; // default "department_user"
}

export interface LoginParams {
  email: string;
  password: string;
}

export const auth = {
  register: <T = unknown>(params: RegisterParams) =>
    request<T>("/api/v1/auth/register", {
      method: "POST",
      query: params,
      auth: false,
    }),

  login: <T = unknown>(params: LoginParams) =>
    request<T>("/api/v1/auth/login", {
      method: "POST",
      query: params,
      auth: false,
    }),

  me: <T = unknown>() => request<T>("/api/v1/auth/me"),
};

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------

export interface CreateCompanyParams {
  name: string;
  sector: string;
  jurisdiction?: Jurisdiction; // default "KSA"
}

export const companies = {
  create: <T = unknown>(params: CreateCompanyParams) =>
    request<T>("/api/v1/companies/", { method: "POST", query: params }),

  list: <T = unknown>() => request<T>("/api/v1/companies/"),

  get: <T = unknown>(companyId: string) =>
    request<T>(`/api/v1/companies/${encodeURIComponent(companyId)}`),

  getDigitalTwin: <T = unknown>(companyId: string, period?: string) =>
    request<T>(`/api/v1/companies/${encodeURIComponent(companyId)}/twin`, {
      query: { period },
    }),

  getTwinState: <T = unknown>(companyId: string, stateType: string) =>
    request<T>(
      `/api/v1/companies/${encodeURIComponent(companyId)}/twin/${encodeURIComponent(stateType)}`,
    ),

  getKpiHistory: <T = unknown>(companyId: string, metric?: string) =>
    request<T>(`/api/v1/companies/${encodeURIComponent(companyId)}/kpis`, {
      query: { metric },
    }),
};

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const documents = {
  upload: <T = unknown>(companyId: string, body: UploadDocumentsBody) => {
    const fd = new FormData();
    body.files.forEach((f) => fd.append("files", f));
    (body.frameworks ?? ["GRI"]).forEach((v) => fd.append("frameworks", v));
    return request<T>("/api/v1/documents/upload", {
      method: "POST",
      query: { company_id: companyId },
      form: fd,
    });
  },

  list: <T = unknown>(companyId: string) =>
    request<T>(`/api/v1/documents/${encodeURIComponent(companyId)}`),

  get: <T = unknown>(companyId: string, documentId: string) =>
    request<T>(
      `/api/v1/documents/${encodeURIComponent(companyId)}/${encodeURIComponent(documentId)}`,
    ),
};

// ---------------------------------------------------------------------------
// AI Agents
// ---------------------------------------------------------------------------

export interface RunAgentParams {
  company_id: string;
  period?: string;
}

export const agents = {
  list: <T = unknown>() => request<T>("/api/v1/agents/"),

  filterByClass: <T = unknown>(agentClass: AgentClass) =>
    request<T>(`/api/v1/agents/class/${encodeURIComponent(agentClass)}`),

  filterBySprint: <T = unknown>(sprint: number) =>
    request<T>(`/api/v1/agents/sprint/${sprint}`),

  run: <T = unknown>(
    agentName: string,
    params: RunAgentParams,
    inputData: Record<string, unknown> = {},
  ) =>
    request<T>(`/api/v1/agents/${encodeURIComponent(agentName)}/run`, {
      method: "POST",
      query: params,
      body: inputData,
    }),

  getRuns: <T = unknown>(companyId: string, agentName?: string) =>
    request<T>(`/api/v1/agents/runs/${encodeURIComponent(companyId)}`, {
      query: { agent_name: agentName },
    }),
};

// ---------------------------------------------------------------------------
// ESG
// ---------------------------------------------------------------------------

export const esg = {
  getScores: <T = unknown>(companyId: string) =>
    request<T>(`/api/v1/esg/${encodeURIComponent(companyId)}/scores`),

  getEvidence: <T = unknown>(companyId: string, pillar?: string) =>
    request<T>(`/api/v1/esg/${encodeURIComponent(companyId)}/evidence`, {
      query: { pillar },
    }),

  getGaps: <T = unknown>(companyId: string) =>
    request<T>(`/api/v1/esg/${encodeURIComponent(companyId)}/gaps`),

  getCertifications: <T = unknown>(companyId: string) =>
    request<T>(`/api/v1/esg/${encodeURIComponent(companyId)}/certifications`),
};

// ---------------------------------------------------------------------------
// Compliance
// ---------------------------------------------------------------------------

export const compliance = {
  getChecks: <T = unknown>(companyId: string, regulator?: string) =>
    request<T>(`/api/v1/compliance/${encodeURIComponent(companyId)}/checks`, {
      query: { regulator },
    }),

  getDeadlines: <T = unknown>(companyId: string) =>
    request<T>(`/api/v1/compliance/${encodeURIComponent(companyId)}/deadlines`),

  getRules: <T = unknown>(regulator?: string) =>
    request<T>("/api/v1/compliance/rules", { query: { regulator } }),
};

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface CoverageQuery {
  status?: CoverageStatus; // default "all"
  pillar?: string;
  include_duplicates?: boolean; // default false
}

export const reports = {
  list: <T = unknown>(companyId: string) =>
    request<T>(`/api/v1/reports/${encodeURIComponent(companyId)}`),

  get: <T = unknown>(companyId: string, reportId: string) =>
    request<T>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/${encodeURIComponent(reportId)}`,
    ),

  approve: <T = unknown>(companyId: string, reportId: string) =>
    request<T>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/${encodeURIComponent(reportId)}/approve`,
      { method: "POST" },
    ),

  publish: <T = unknown>(
    companyId: string,
    reportId: string,
    channel: PublishChannel = "investor_portal",
  ) =>
    request<T>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/${encodeURIComponent(reportId)}/publish`,
      { method: "POST", query: { channel } },
    ),

  generate: <T = unknown>(companyId: string, body: GenerateReportBody) => {
    const fd = new FormData();
    body.files.forEach((f) => fd.append("files", f));
    fd.append("year", String(body.year));
    fd.append("sector_id", body.sector_id);
    fd.append("scope_type", body.scope_type);
    if (body.report_type !== undefined) fd.append("report_type", body.report_type);
    (body.framework_codes ?? []).forEach((v) => fd.append("framework_codes", v));
    if (body.region !== undefined) fd.append("region", body.region);
    if (body.country_id !== undefined) fd.append("country_id", body.country_id);
    (body.regulator_ids ?? []).forEach((v) => fd.append("regulator_ids", v));
    return request<T>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/generate`,
      { method: "POST", form: fd },
    );
  },

  addDocuments: <T = unknown>(
    companyId: string,
    reportId: string,
    body: AddReportDocumentsBody,
  ) => {
    const fd = new FormData();
    body.files.forEach((f) => fd.append("files", f));
    return request<T>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/${encodeURIComponent(reportId)}/documents`,
      { method: "POST", form: fd },
    );
  },

  getCoverage: <T = unknown>(
    companyId: string,
    reportId: string,
    query: CoverageQuery = {},
  ) =>
    request<T>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/${encodeURIComponent(reportId)}/coverage`,
      { query },
    ),
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const admin = {
  listUsers: <T = unknown>() => request<T>("/api/v1/admin/users"),

  updateUserRole: <T = unknown>(userId: string, role: string) =>
    request<T>(`/api/v1/admin/users/${encodeURIComponent(userId)}/role`, {
      method: "PATCH",
      query: { role },
    }),

  updateUserStatus: <T = unknown>(userId: string, status: string) =>
    request<T>(`/api/v1/admin/users/${encodeURIComponent(userId)}/status`, {
      method: "PATCH",
      query: { status },
    }),

  platformStats: <T = unknown>() => request<T>("/api/v1/admin/stats"),
};

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export const lookups = {
  sectors: <T = unknown>() => request<T>("/api/v1/lookups/sectors"),

  regions: <T = unknown>() => request<T>("/api/v1/lookups/regions"),

  countries: <T = unknown>(region?: string) =>
    request<T>("/api/v1/lookups/countries", { query: { region } }),

  regulators: <T = unknown>(countryId?: string) =>
    request<T>("/api/v1/lookups/regulators", {
      query: { country_id: countryId },
    }),

  frameworks: <T = unknown>(scope: string = "global") =>
    request<T>("/api/v1/lookups/frameworks", { query: { scope } }),
};

// ---------------------------------------------------------------------------
// Root / Health
// ---------------------------------------------------------------------------

export const system = {
  health: <T = unknown>() => request<T>("/health", { auth: false }),
  root: <T = unknown>() => request<T>("/", { auth: false }),
};

// ---------------------------------------------------------------------------
// Spec-named auth helpers (consumed by AuthContext + LoginPage).
// ---------------------------------------------------------------------------

export async function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const res = await auth.login<LoginResponse>({ email, password });
  setAuthToken(res.access_token);

  // Every user belongs to a company. If the login payload's user object didn't
  // surface company_id, read it from the JWT claims so the rest of the app can
  // rely on `useAuth().user.company_id`.
  const user: AuthUser = { ...res.user };
  if (user.company_id == null) {
    const claims = parseJwtPayload<{ company_id?: string | null }>(
      res.access_token,
    );
    if (claims && "company_id" in claims) user.company_id = claims.company_id;
  }

  if (typeof localStorage !== "undefined") {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  }
  return { ...res, user };
}

export function logout(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
}

export function getToken(): string | null {
  return getAuthToken();
}

export function getStoredUser(): AuthUser | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(USER_STORAGE_KEY);
  if (!raw) return null;
  try {
    const user = JSON.parse(raw) as AuthUser;
    if (user.company_id != null) return user;

    // Backfill from the JWT for sessions saved before company_id was captured.
    const token = getAuthToken();
    if (!token) return user;
    const claims = parseJwtPayload<{ company_id?: string | null }>(token);
    if (claims && "company_id" in claims) {
      const merged = { ...user, company_id: claims.company_id };
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(merged));
      return merged;
    }
    return user;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return getToken() !== null && getStoredUser() !== null;
}

export async function fetchWithAuth(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = getToken();
  const headers = new Headers(options.headers);
  for (const [k, v] of Object.entries(DEFAULT_REQUEST_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (res.status === 401) handleUnauthorized();
  return res;
}

// Spec-named register() — raw fetch with res.text() + JSON.parse fallback per
// .claude/specs/2step_register.md. Role is always "admin"; callers cannot override.
// Typed auth.register() namespace remains for other future callers.
export async function register(
  params: RegisterRequest,
): Promise<RegisterResponse> {
  const query = new URLSearchParams({
    email: params.email,
    password: params.password,
    full_name: params.full_name,
    role: "admin",
  });
  if (params.company_id) query.append("company_id", params.company_id);

  let res: Response;
  try {
    res = await fetch(
      `${API_BASE_URL}/api/v1/auth/register?${query.toString()}`,
      {
        method: "POST",
        headers: { accept: "application/json", ...DEFAULT_REQUEST_HEADERS },
      },
    );
  } catch {
    throw new Error("Unable to connect. Check your connection.");
  }

  if (res.ok) {
    const text = await res.text();
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === "object") return parsed as RegisterResponse;
      return { message: String(parsed) };
    } catch {
      return { message: text };
    }
  }

  if (res.status === 422) {
    const err = (await res.json().catch(() => null)) as
      | { detail?: Array<{ msg?: string }> }
      | null;
    throw new Error(err?.detail?.[0]?.msg ?? "Validation error");
  }

  throw new Error("Registration failed. Please try again.");
}

// Spec-named getSectors() — raw fetch per .claude/specs/2step_register.md.
// Typed lookups.sectors() namespace remains for future callers.
export async function getSectors(): Promise<Sector[]> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/v1/lookups/sectors`, {
      headers: { accept: "application/json", ...DEFAULT_REQUEST_HEADERS },
    });
  } catch {
    throw new Error("Unable to connect. Check your connection.");
  }
  if (!res.ok) throw new Error("Failed to load sectors");
  const data = (await res.json()) as SectorsResponse;
  return data.sectors;
}

// Spec-named createCompany() — raw fetch per .claude/specs/2step_register.md.
// Typed companies.create() namespace remains for future callers.
export async function createCompany(
  params: CreateCompanyRequest,
): Promise<CreateCompanyResponse> {
  const query = new URLSearchParams({
    name: params.name,
    sector_id: params.sector_id,
  });
  if (params.jurisdiction) query.append("jurisdiction", params.jurisdiction);

  let res: Response;
  try {
    res = await fetch(
      `${API_BASE_URL}/api/v1/companies/?${query.toString()}`,
      {
        method: "POST",
        headers: { accept: "application/json", ...DEFAULT_REQUEST_HEADERS },
      },
    );
  } catch {
    throw new Error("Unable to connect. Check your connection.");
  }

  if (res.ok) return (await res.json()) as CreateCompanyResponse;

  if (res.status === 422) {
    const err = (await res.json().catch(() => null)) as
      | { detail?: Array<{ msg?: string }> }
      | null;
    throw new Error(err?.detail?.[0]?.msg ?? "Validation error");
  }

  const text = await res.text().catch(() => "");
  throw new Error(text || "Failed to create company. Please try again.");
}

// Aggregated barrel for ergonomic imports: `import { api } from "@/lib/api"`.
export const api = {
  auth,
  companies,
  documents,
  agents,
  esg,
  compliance,
  reports,
  admin,
  lookups,
  system,
};

export default api;
