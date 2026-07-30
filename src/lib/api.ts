// Typed fetch client for the Centriyon Platform API.
// Paths + shapes derived from openapi.json.
//
// All authenticated calls MUST go through either:
//   - the typed `request<T>()` helper (used by the namespaced clients below), or
//   - `fetchWithAuth(path, init)` for raw Response access.
// Both attach Authorization: Bearer <token> automatically and trigger logout
// on a 401. Do not use raw `fetch()` for authenticated endpoints.

import type {
  AuthUser,
  DepartmentOption,
  LoginResponse,
  OnboardingPayload,
  OnboardingResponse,
} from "@/types/auth";
import type { RegisterRequest, RegisterResponse } from "@/types/register";
import type {
  Company,
  CompanyBrandUpdate,
  CreateCompanyRequest,
  CreateCompanyResponse,
  Sector,
  SectorsResponse,
} from "@/types/company";
import type {
  AgentRun,
  AgentNodesResponse,
  AsyncPipelineResponse,
  PipelineConflictBody,
  PipelineHandle,
} from "@/types/report";
import type {
  QuarterlyCoverageResponse,
  GapsResponse,
  QuarterlyPreviewReport,
  QuarterlyPreviewResponse,
  PreviewSentenceUpdateResponse,
  ChatHistoryResponse,
  ChatStreamEvent,
  QuarterlyContextPatch,
  QuarterlyContextSaveResponse,
  OutlineResponse,
  OutlineSavePayload,
  OutlineLockResponse,
  ProducedSection,
  ProducedSectionResponse,
  ProduceAllHandle,
  CompanyType,
  Voice,
  ReportTone,
  Comparison,
  DetectCompanyTypeResponse,
  CoverTemplatesResponse,
  ColorPalettesResponse,
  CoverSelectionPayload,
  CoverSelectionResponse,
  AssembledReportResponse,
  ApproveReportResponse,
  SaveSectionContentPayload,
  SaveSectionContentResponse,
  SectionExtractResponse,
} from "@/types/quarterly";
import type {
  CreateMeetingBody,
  MeetingListResponse,
  MeetingResponse,
  UpdateMeetingBody,
} from "@/types/meeting";
import type {
  AdminOverview,
  AdminUserRow,
  Department,
  DepartmentPayload,
  InviteUserPayload,
  InviteUserResponse,
  PermissionMatrix,
  RawAdminOverview,
  SavePermissionsPayload,
} from "@/types/admin";
import { normalizeOverview } from "@/types/admin";
import type {
  CandidatesResponse,
  CertificateVerification,
  CertifiedRun,
  CertifyResponse,
  CheckEvidence,
  CompliancePreview,
  ComplianceRun,
  CreateRunPayload,
  CreateRunResponse,
  EntityType,
  ListRunsQuery,
  Market,
  ReportType,
  ResolveGapResponse,
  RuleDetailGroup,
  RunListItem,
  RunsResponse,
  UploadRunPayload,
  UploadRunResponse,
} from "@/types/compliance";
import { normalizeVerificationCode } from "@/types/compliance";
import type {
  AssignDepartmentsPayload,
  AssignDepartmentsResponse,
  Cycle,
  CreateCyclePayload,
  CycleOverview,
  CycleSection,
  ResolveSectionsResponse,
  SARUser,
  SessionStatus,
} from "@/types/cycles";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL ?? "http://localhost:8000"
).replace(/\/+$/, "");

// The SAR service (Annual Report cycles) is a SEPARATE backend from Centriyon,
// running locally on :8010. Calls go through `sarRequest()` below, which reuses
// the Centriyon JWT for token passthrough.
const SAR_BASE_URL = (
  import.meta.env.VITE_SAR_URL ?? "http://127.0.0.1:8010"
).replace(/\/+$/, "");

// Public, unauthenticated PDF download — the backend sets
// `Content-Disposition: attachment`, so a plain <a> works and no token is
// needed. That matters: the same URL goes into the investor email, where there
// is no JS to attach a Bearer header.
export const publicReportDownloadUrl = (reportId: string) =>
  `${API_BASE_URL}/api/public/reports/${reportId}/download`;

const TOKEN_STORAGE_KEY = "centriton_token";
const USER_STORAGE_KEY = "centriton_user";

// `ngrok-skip-browser-warning` bypasses ngrok's HTML interstitial on the free
// tier. Azure ignores unknown headers, so it's safe to leave on permanently —
// the backend switches but this header stays.
const DEFAULT_REQUEST_HEADERS: Record<string, string> = {
  "ngrok-skip-browser-warning": "true",
};

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
  // Override the host the call targets (defaults to API_BASE_URL). Used by
  // sarRequest() to hit the separate SAR backend while reusing all this logic.
  baseUrl?: string;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = `${opts.baseUrl ?? API_BASE_URL}${path}${buildQuery(opts.query)}`;
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

// POST a FormData to a JSON endpoint with auth. Like `request`, but multipart:
// the browser must set the multipart boundary, so we never set Content-Type.
async function postForm<T>(path: string, form: FormData): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const headers: Record<string, string> = { ...DEFAULT_REQUEST_HEADERS };
  const token = getAuthToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { method: "POST", headers, body: form });
  const ct = res.headers.get("content-type") ?? "";
  const parsed: unknown = ct.includes("application/json")
    ? await res.json().catch(() => null)
    : await res.text().catch(() => null);

  if (res.status === 401) handleUnauthorized();
  if (!res.ok) throw new ApiError(res.status, res.statusText, parsed, url);
  return parsed as T;
}

// POST a FormData to an endpoint that returns either 202 Accepted (new run) or
// 409 Conflict (existing run) and normalise both into a PipelineHandle.
// FastAPI may wrap HTTPException bodies under `detail`, so we unwrap defensively.
async function postPipeline(
  path: string,
  form: FormData,
  query?: QueryParams,
): Promise<PipelineHandle> {
  const url = `${API_BASE_URL}${path}${buildQuery(query)}`;
  const headers: Record<string, string> = { ...DEFAULT_REQUEST_HEADERS };
  const token = getAuthToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { method: "POST", headers, body: form });
  const ct = res.headers.get("content-type") ?? "";
  const parsed: unknown = ct.includes("application/json")
    ? await res.json().catch(() => null)
    : await res.text().catch(() => null);

  if (res.status === 401) handleUnauthorized();

  if (res.status === 202) {
    const body = parsed as AsyncPipelineResponse;
    return {
      runId: body.run_id,
      pollUrl: body.poll_url,
      reportId: body.report_id ?? null,
      startedAt: body.started_at,
      estimatedDurationSeconds: body.estimated_duration_seconds ?? null,
      fileCount: body.file_count ?? null,
      isExisting: false,
    };
  }

  if (res.status === 409) {
    const raw = parsed as { detail?: PipelineConflictBody } & Partial<PipelineConflictBody>;
    const body: PipelineConflictBody | undefined = raw?.detail ?? (raw as PipelineConflictBody);
    if (body?.existing_run_id && body?.poll_url) {
      return {
        runId: body.existing_run_id,
        pollUrl: body.poll_url,
        reportId: null,
        startedAt: body.started_at,
        estimatedDurationSeconds: null,
        fileCount: null,
        isExisting: true,
        message: body.message,
      };
    }
  }

  throw new ApiError(res.status, res.statusText, parsed, url);
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

export type GriScope = "standard" | "full";

export interface GenerateReportBody {
  files: File[];
  year: number;
  sector_id?: string;
  scope_type: string;
  report_type?: string; // default "esg"
  framework_codes?: string[];
  region?: string;
  country_id?: string;
  regulator_ids?: string[];
  // "standard" → 85 GRI indicators · "full" → all 128 GRI indicators.
  gri_scope?: GriScope;
}

export interface AddReportDocumentsBody {
  files: File[];
}

export interface GenerateQuarterlyBody {
  files: File[];
  year: number;
  quarter: string; // "Q1".."Q4"
  areas?: string[]; // snake_case slugs; omit/empty when none selected
  content_language?: "english" | "arabic"; // report language; defaults to english
  // Confirm-context answers — sent in the same creation call so the report is
  // created already configured (no separate PATCH /context at creation).
  company_type?: CompanyType;
  voices?: Voice[];
  report_tone?: ReportTone;
  comparison?: Comparison; // yoy | qoq | both — which prior period to compare against
  // Dedicated Excel/CSV lane → lean, exact figure extraction (no vision).
  financial_files?: File[];
  financial_currency?: string; // e.g. "SAR"
  financial_scale?: string;    // actual | thousands | millions | billions
  // system = map the sheet to our standard metrics + template (default).
  // custom = extract the sheet's lines as-is, section-assigned (no metric mapping).
  metrics_mode?: "system" | "custom";
}

// Whether the company has extracted figures for the period(s) a report would
// compare against — drives the form's Generate-button gating + "no data" popup.
export interface ComparisonAvailability {
  available: boolean; // all required prior periods have figures ('both' needs both)
  comparison: Comparison;
  target_period: string; // e.g. "Q3-2025"
  specs: { key: string; period: string; label: string; present: boolean }[];
}

// One selectable "Report Area" card on the Generate Quarterly Report screen.
// The API is the source of truth for which areas exist — render cards from it,
// never hardcode. `code` is the value submitted in `areas[]`.
export interface QuarterlyReportArea {
  code: string;
  title: string;
  metric_count: number;
  metrics: string[];
}

export interface QuarterlyReportAreasResponse {
  areas: QuarterlyReportArea[];
}

// One single-select questionnaire item on the Generate Quarterly Report screen.
// The API is the source of truth: `id` is the answer key, `options` are the
// (up to 4) mutually-exclusive choices. Render dynamically — never hardcode.
export interface QuarterlyQuestion {
  id: string;
  text: string;
  options: string[];
}

export interface QuarterlyQuestionsResponse {
  questions: QuarterlyQuestion[];
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

export interface ChangePasswordParams {
  new_password: string;
}

export interface ChangePasswordResponse {
  changed: boolean;
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

  // Forced rotation after first-login. Same query-param style as login —
  // backend reads `old_password` + `new_password` from the URL, not the body.
  changePassword: (params: ChangePasswordParams) =>
    request<ChangePasswordResponse>("/api/v1/auth/change-password", {
      method: "POST",
      query: params,
    }),

  me: <T = unknown>() => request<T>("/api/v1/auth/me"),

  // First-login onboarding for self-registered admins. Unlike the other auth
  // calls this sends a JSON body, and returns a freshly-issued token whose JWT
  // now carries onboarding_completed = true.
  onboarding: (payload: OnboardingPayload) =>
    request<OnboardingResponse>("/api/v1/auth/onboarding", {
      method: "POST",
      body: payload,
    }),

  // Brand step: read the uploaded brand language guideline (PDF/DOCX) to plain
  // text. Stateless — the text rides along in the onboarding payload and is
  // saved to companies.brand_identity at submit, not here.
  extractBrandLanguage: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return postForm<{ text: string; chars: number }>(
      "/api/v1/auth/onboarding/extract-brand-language",
      form,
    );
  },

  // Default departments the admin can opt into during onboarding.
  onboardingDepartmentOptions: () =>
    request<{ departments: DepartmentOption[] }>(
      "/api/v1/auth/onboarding/department-options",
    ),
};

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------

export interface CreateCompanyParams {
  name: string;
  sector: string;
  jurisdiction?: Jurisdiction; // default "KSA"
}

// Verdict from the inline Annual/ESG upload check (POST /companies/{id}/validate-report).
export interface ReportValidation {
  valid: boolean;
  detected_type: string;
  fiscal_year: string | null;
  period: string | null;      // "FY-2025" | null
  document_id: string | null; // banked doc the submit step will process
  message: string;
}

export interface OnboardingIngestItem {
  document_id: string;
  doc_type: string;
  period: string | null;
}

export const companies = {
  create: <T = unknown>(params: CreateCompanyParams) =>
    request<T>("/api/v1/companies/", { method: "POST", query: params }),

  list: <T = unknown>() => request<T>("/api/v1/companies/"),

  get: <T = unknown>(companyId: string) =>
    request<T>(`/api/v1/companies/${encodeURIComponent(companyId)}`),

  // The caller's own company (resolved from the JWT) — backs the Profile page
  // Company Details card. PATCH accepts a partial of the editable fields.
  getMyCompany: () => request<Company>("/api/v1/companies/me"),

  // The logo lives behind its own endpoint because it's ~1.4 MB of inline
  // base64 and getMyCompany() runs on nearly every page — fetch it only where
  // the logo is actually rendered.
  getMyCompanyLogo: () =>
    request<{ logo_base64: string | null }>("/api/v1/companies/me/logo"),

  // CompanyBrandUpdate widens this beyond Company because logo_base64 is
  // write-only — accepted here, stripped from GET /companies/me. Note the
  // response IS the full row, logo included (~1.4 MB), unlike the GET.
  updateMyCompany: (body: Partial<Company> & CompanyBrandUpdate) =>
    request<Company>("/api/v1/companies/me", { method: "PATCH", body }),

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

  // Question Bank — every manual question raised across this company's reports,
  // enriched with indicator + report metadata so the page can group by report.
  listQuestions: <T = unknown>(
    companyId: string,
    filters: { report_id?: string; indicator_id?: string } = {},
  ) =>
    request<T>(`/api/v1/companies/${encodeURIComponent(companyId)}/questions`, {
      query: filters,
    }),

  // Onboarding-time: kick off BACKGROUND tone/theme/outline extraction from the
  // uploaded report documents. `docTypes` is parallel to `files` (annual / esg /
  // financial / other) and drives the source rules. Returns { status }. Non-fatal.
  extractReportStyle: (
    companyId: string,
    files: File[],
    docTypes: string[] = [],
  ): Promise<{ status: string }> => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    docTypes.forEach((t) => form.append("doc_types", t));
    return postForm(
      `/api/v1/companies/${encodeURIComponent(companyId)}/extract-report-style`,
      form,
    );
  },

  // Re-run tone/theme/highlights extraction over the documents ALREADY in the Document
  // Bank — no re-upload. What the dashboard's "What we learned from your reports" card
  // triggers when it has nothing to show. Non-blocking; poll report_extraction_status.
  // Returns { status: 'processing' | 'skipped' } — 'skipped' means no documents to read.
  refreshReportStyle: (companyId: string): Promise<{ status: string }> =>
    request(`/api/v1/companies/${encodeURIComponent(companyId)}/refresh-report-style`, {
      method: "POST",
    }),

  // Inline onboarding validation: LLM-check one Annual/ESG file, bank it, and return the
  // verdict + detected fiscal year + a document_id the submit step will process.
  validateReport: (
    companyId: string,
    file: File,
    docType: string,
  ): Promise<ReportValidation> => {
    const form = new FormData();
    form.append("file", file);
    form.append("doc_type", docType);
    return postForm(
      `/api/v1/companies/${encodeURIComponent(companyId)}/validate-report`,
      form,
    );
  },

  // Onboarding submit: kick off the heavy ingest (reports + chunks + embeddings + all
  // dashboard data) for the already-validated docs. Non-blocking — returns { status }.
  ingestOnboarding: (
    companyId: string,
    items: OnboardingIngestItem[],
  ): Promise<{ status: string }> =>
    request(`/api/v1/companies/${encodeURIComponent(companyId)}/ingest-onboarding`, {
      method: "POST",
      body: { items },
    }),
};

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const documents = {
  // Async: returns 202 with a PipelineHandle; caller should poll agentRuns.get.
  upload: (companyId: string, body: UploadDocumentsBody): Promise<PipelineHandle> => {
    const fd = new FormData();
    body.files.forEach((f) => fd.append("files", f));
    (body.frameworks ?? ["GRI"]).forEach((v) => fd.append("frameworks", v));
    return postPipeline("/api/v1/documents/upload", fd, { company_id: companyId });
  },

  // All documents for the company — a flat, newest-first list that INCLUDES
  // ad-hoc uploads not tied to any report (unlike `byReport`). Each carries a
  // time-limited signed `download_url` (null when the file is missing from
  // storage). `expiresInSeconds` controls link lifetime (60–86400, default 1h).
  // Backs the dashboard's has-docs gate + the post-onboarding self-heal poll.
  list: <T = unknown>(companyId: string, expiresInSeconds = 3600) =>
    request<T>(`/api/v1/documents/${encodeURIComponent(companyId)}`, {
      query: { expires_in: expiresInSeconds },
    }),

  get: <T = unknown>(companyId: string, documentId: string) =>
    request<T>(
      `/api/v1/documents/${encodeURIComponent(companyId)}/${encodeURIComponent(documentId)}`,
    ),

  // Document Bank — every report for the company, each with its uploaded
  // documents and a time-limited signed download URL per document.
  byReport: <T = unknown>(companyId: string, expiresInSeconds = 3600) =>
    request<T>(
      `/api/v1/documents/${encodeURIComponent(companyId)}/by-report`,
      { query: { expires_in: expiresInSeconds } },
    ),

  // Company Document Bank — documents grouped by the report they belong to,
  // newest report first; report_id=null is the trailing "Unassigned" group.
  // Each document has a time-limited signed download URL (null when missing).
  companyDocumentBank: <T = unknown>(companyId: string, expiresInSeconds = 3600) =>
    request<T>(
      `/api/v1/documents/${encodeURIComponent(companyId)}/company-document-bank`,
      { query: { expires_in: expiresInSeconds } },
    ),
};

// ---------------------------------------------------------------------------
// Team — login-capable users attached to a company. Backs the Leadership
// page (/stakeholders). Admin/PM can create + edit; any company member can
// read; delete is a soft archive (status flips to 'inactive').
// ---------------------------------------------------------------------------

export interface TeamMember {
  id: string;
  email: string;
  full_name: string;
  title?: string | null;
  position_type?: string | null;
  role?: string | null;
  bio?: string | null;
  phone?: string | null;
  department?: string | null;
  status?: string | null;
  created_at?: string | null;
}

export interface CreateTeamMemberBody {
  email: string;
  full_name: string;
  // Backend forces a password rotation on first login (must_change_password=TRUE),
  // so this is just an opaque starter — generate it on the client and surface
  // the value back to the admin so they can share it with the new user.
  temp_password: string;
  title?: string;
  position_type?: string;
  role?: string;
  bio?: string;
  phone?: string;
  department?: string;
}

export interface UpdateTeamMemberBody {
  full_name?: string;
  title?: string;
  position_type?: string;
  role?: string;
  bio?: string;
  phone?: string;
  department?: string;
  status?: string;
}

export interface ListTeamQuery {
  position_type?: string;
  role?: string;
  include_inactive?: boolean;
}

// The list endpoint is loosely typed on the server side (returns "string" in
// OpenAPI). Normalise it to a flat array regardless of whether the response is
// already a bare array or wrapped under `team` / `users` / `data` / `items`.
function unwrapTeamList(raw: unknown): TeamMember[] {
  if (Array.isArray(raw)) return raw as TeamMember[];
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const key of ["team", "users", "members", "data", "items", "results"]) {
      const v = obj[key];
      if (Array.isArray(v)) return v as TeamMember[];
    }
  }
  return [];
}

export const team = {
  list: async (companyId: string, opts?: ListTeamQuery): Promise<TeamMember[]> => {
    const raw = await request<unknown>(
      `/api/v1/companies/${encodeURIComponent(companyId)}/team`,
      { query: opts ?? {} },
    );
    return unwrapTeamList(raw);
  },

  create: <T = TeamMember | string>(companyId: string, body: CreateTeamMemberBody) =>
    request<T>(`/api/v1/companies/${encodeURIComponent(companyId)}/team`, {
      method: "POST",
      body,
    }),

  get: <T = TeamMember>(companyId: string, userId: string) =>
    request<T>(
      `/api/v1/companies/${encodeURIComponent(companyId)}/team/${encodeURIComponent(userId)}`,
    ),

  update: <T = TeamMember>(
    companyId: string,
    userId: string,
    body: UpdateTeamMemberBody,
  ) =>
    request<T>(
      `/api/v1/companies/${encodeURIComponent(companyId)}/team/${encodeURIComponent(userId)}`,
      { method: "PATCH", body },
    ),

  // 204 No Content — `request<void>` would still try to parse, so use the raw
  // helper. Caller should optimistically remove the row from local state and
  // refetch on error if it matters.
  remove: async (companyId: string, userId: string): Promise<void> => {
    const path = `/api/v1/companies/${encodeURIComponent(companyId)}/team/${encodeURIComponent(userId)}`;
    const res = await fetchWithAuth(path, { method: "DELETE" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ApiError(res.status, res.statusText, text, path);
    }
  },
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

  getEvidence: <T = EsgEvidenceResponse>(
    companyId: string,
    opts?: {
      pillar?: string;
      document_id?: string;
      fields?: string | string[];
      signal?: AbortSignal;
    },
  ) => {
    const { pillar, document_id, fields, signal } = opts ?? {};
    const query: Record<string, unknown> = {};
    if (document_id != null) query.document_id = document_id;
    if (fields != null) query.fields = Array.isArray(fields) ? fields.join(",") : fields;
    // The endpoint accepts an empty `pillar` to mean "all" — preserve that
    // when it's an empty string, only drop on null/undefined.
    if (pillar !== undefined && pillar !== null) query.pillar = pillar;
    return request<T>(`/api/v1/esg/${encodeURIComponent(companyId)}/evidence`, {
      query,
      signal,
    });
  },

  getGaps: <T = unknown>(companyId: string) =>
    request<T>(`/api/v1/esg/${encodeURIComponent(companyId)}/gaps`),

  getCertifications: <T = unknown>(companyId: string) =>
    request<T>(`/api/v1/esg/${encodeURIComponent(companyId)}/certifications`),
};

export interface EsgEvidenceItem {
  period?: string | null;
  pillar?: string | null;
  status?: string | null;
  raw_unit?: string | null;
  data_type?: string | null;
  framework?: string | null;
  raw_value?: string | number | null;
  company_id?: string;
  confidence?: number | null;
  document_id?: string;
  source_code?: string | null;
  source_page?: number | null;
  esg_category?: string | null;
  boolean_value?: boolean | null;
  verbatim_quote?: string | null;
  context_snippet?: string | null;
  framework_codes?: string[] | null;
  indicator_label?: string | null;
  narrative_summary?: string | null;
  framework_indicator_id?: string;
}

// `GET /esg/{company_id}/evidence` returns each row inside a `raw_evidence`
// wrapper. The wrapper itself contains another nested `raw_evidence` object
// holding the verbatim quote / context snippet — we hoist the top-level
// fields into EsgEvidenceItem and ignore the nested duplicate.
export interface EsgEvidenceResponse {
  evidence: Array<{ raw_evidence: EsgEvidenceItem }>;
  total?: number;
}

// `GET /reports/{company_id}/quarterly/{report_id}/figures` mirrors the evidence
// envelope. Rows reuse the EsgEvidenceItem shape; they may arrive bare or inside
// a `raw_evidence` wrapper, so callers unwrap defensively.
export interface QuarterlyFigureRow extends Partial<EsgEvidenceItem> {
  raw_evidence?: EsgEvidenceItem | null;
}

export interface QuarterlyFiguresResponse {
  figures: QuarterlyFigureRow[];
  total?: number;
}

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
// Compliance Validation (3-step wizard)
// ---------------------------------------------------------------------------
//
// The company is derived from the report/cycle server-side and checked against
// the JWT, so no company id is sent — a cross-company subject id returns 403.
//
// Note the subject pair: annual reports aren't rows in `reports`, they live
// under a reporting cycle, so runs are keyed by (subject_type, subject_id).

const COMPLIANCE_BASE = "/api/v1/compliance";

// Guarantee the three list fields exist so a sparse response renders an empty
// section instead of crashing the review screen. They are legitimately empty
// for the whole 30–60s a run is in flight, so this is the normal case, not a
// defensive edge. `publication_gate` is deliberately NOT defaulted — null is
// meaningful ("not decided yet") and the screens branch on it.
function normalizeRun(run: ComplianceRun): ComplianceRun {
  return {
    ...run,
    publication_gate: run?.publication_gate ?? null,
    frameworks: Array.isArray(run?.frameworks) ? run.frameworks : [],
    gaps: Array.isArray(run?.gaps) ? run.gaps : [],
    rule_detail: Array.isArray(run?.rule_detail)
      ? run.rule_detail.map(normalizeRuleGroup)
      : [],
  };
}

// A rule-detail row carries its evidence FLAT — `quote`, `proof`,
// `section_code`, `page`, `source_file` sitting next to `rule_id` — while a gap
// nests the same information under `evidence`. Fold the flat form into
// `evidence` here so every renderer downstream reads one shape.
//
// An already-nested `evidence` wins: the backend has served both forms, and a
// row that arrives in the richer shape (with `found`/`missing`/`confidence`,
// which the flat form has no room for) must not be flattened back down to what
// the flat fields can express.
function normalizeRuleGroup(group: RuleDetailGroup): RuleDetailGroup {
  return {
    ...group,
    rules: (Array.isArray(group?.rules) ? group.rules : []).map((rule) => {
      if (rule?.evidence) return rule;
      const evidence: CheckEvidence = {};
      if (rule?.quote) evidence.quote = rule.quote;
      if (rule?.proof) evidence.proof = rule.proof;
      if (rule?.section_code) evidence.section_code = rule.section_code;
      if (rule?.page != null) evidence.page = rule.page;
      if (rule?.source_file) evidence.source_file = rule.source_file;
      if (rule?.evidence_source) evidence.evidence_source = rule.evidence_source;
      // A `no_data` row legitimately carries nothing but `evidence_source`.
      // Leave `evidence` null there rather than attaching an empty object, so
      // the "no evidence recorded" branches stay reachable.
      return Object.keys(evidence).length > 0 ? { ...rule, evidence } : rule;
    }),
  };
}

export const complianceValidation = {
  // Reports/cycles eligible for validation. The endpoint hides the fan-out
  // across two tables: annual comes back as subject_type "cycle", everything
  // else as "report". Only approved subjects are returned, so an empty list is
  // an expected state, not an error.
  listCandidates: (companyId: string, reportType: ReportType) =>
    request<CandidatesResponse>(`${COMPLIANCE_BASE}/candidates`, {
      query: { company_id: companyId, report_type: reportType },
    }).then((r) => (Array.isArray(r?.candidates) ? r.candidates : [])),

  // Every run for the company, newest first — running, finished and failed.
  // The authority on what state a run is in: a status the browser remembered
  // goes stale as soon as the tab closes, which on a 60–90s run is most of them.
  listRuns: (companyId: string, query: ListRunsQuery = {}): Promise<RunListItem[]> =>
    request<RunsResponse>(`${COMPLIANCE_BASE}/runs`, {
      query: { company_id: companyId, ...query },
    }).then((r) => (Array.isArray(r?.runs) ? r.runs : [])),

  // Every run that has been certified, newest first. Each entry carries its
  // subject's title and period, so the gallery renders straight from this with
  // no second lookup. `reportType` is an optional filter.
  //
  // The envelope isn't pinned down, so accept a bare array or any of the usual
  // wrappers — a gallery is not worth crashing a page over.
  listCertified: (companyId: string, reportType?: ReportType) =>
    request<CertifiedRun[] | Record<string, unknown>>(`${COMPLIANCE_BASE}/certified`, {
      query: { company_id: companyId, ...(reportType ? { report_type: reportType } : {}) },
    }).then((r) => {
      if (Array.isArray(r)) return r as CertifiedRun[];
      const wrapped = r as Record<string, unknown> | null;
      for (const key of ["certified", "runs", "items", "results"]) {
        const value = wrapped?.[key];
        if (Array.isArray(value)) return value as CertifiedRun[];
      }
      return [] as CertifiedRun[];
    }),

  // Runs the same rule selection the real run uses, so the preview can never
  // disagree with what executes.
  preview: (query: {
    report_type: ReportType;
    entity_type: EntityType;
    market?: Market;
    period_end?: string;
  }) =>
    request<CompliancePreview>(`${COMPLIANCE_BASE}/preview`, { query }).then(
      (p) => ({
        ...p,
        frameworks: Array.isArray(p?.frameworks) ? p.frameworks : [],
      }),
    ),

  // Asynchronous — 202 in under a second, before anything has been checked.
  // The run itself takes 30–60s because it reads the whole report through an
  // LLM. There are no scores in this response: keep the run_id and poll
  // getRun() until status is "done" or "error".
  createRun: (body: CreateRunPayload) =>
    request<CreateRunResponse>(`${COMPLIANCE_BASE}/runs`, {
      method: "POST",
      body,
    }),

  // The same run, for a report we didn't generate. Multipart rather than JSON,
  // and asynchronous in the same way: 202 first, then poll getRun().
  //
  // Two things differ from createRun and both bite if missed. The file field is
  // `file`, singular — every other upload in this app posts `files`. And the
  // period can't be looked up: an uploaded file has no record behind it, so the
  // caller collects "FY-2025" / "Q3-2025" from the user and sends it verbatim.
  //
  // Slower than a picker run — the file has to be read before it can be judged
  // — but only the wait changes, not the shape of the result.
  createUploadRun: (body: UploadRunPayload) => {
    const fd = new FormData();
    fd.append("file", body.file);
    fd.append("company_id", body.company_id);
    fd.append("report_type", body.report_type);
    fd.append("period", body.period);
    fd.append("entity_type", body.entity_type);
    if (body.market) fd.append("market", body.market);
    // Repeated field, like every other list this API takes. Omitted entirely
    // means "no filter" — which is why the caller blocks submit when the user
    // has switched every framework off, rather than sending an empty list.
    (body.enabled_frameworks ?? []).forEach((r) => fd.append("enabled_frameworks", r));
    if (body.content_language) fd.append("content_language", body.content_language);
    return postForm<UploadRunResponse>(`${COMPLIANCE_BASE}/runs/upload`, fd);
  },

  // The poll target, and the read for both result screens. Returns the same
  // shape at every stage — while running, the scores are null and the lists are
  // empty. Scores are recomputed from stored results on each read, so this is
  // always current after a resolve.
  getRun: (runId: string) =>
    request<ComplianceRun>(
      `${COMPLIANCE_BASE}/runs/${encodeURIComponent(runId)}`,
    ).then(normalizeRun),

  // `reason` is required and cannot be blank — the API 400s otherwise.
  resolveGap: (resultId: string, reason: string) =>
    request<ResolveGapResponse>(
      `${COMPLIANCE_BASE}/results/${encodeURIComponent(resultId)}/resolve`,
      { method: "POST", body: { reason } },
    ),

  // Throws ApiError with a 409 and a CertifyBlockedBody `detail` when the run
  // is still running (`detail.status === "running"`) or HARD checks are still
  // failing; the gate is re-checked server-side at this point.
  certify: (runId: string) =>
    request<CertifyResponse>(
      `${COMPLIANCE_BASE}/runs/${encodeURIComponent(runId)}/certify`,
      { method: "POST" },
    ),

  // The certificate as a PDF. Authed and binary, so `request()` is no use here
  // (it parses the body as JSON or text) and a plain <a href> is no use either
  // — the browser wouldn't attach the Bearer token.
  //
  // Serves any FINISHED run, certified or not: 409 while it's still running or
  // if it errored, 403 for another company's run, 404 for an unknown id. Those
  // bodies are JSON `{ detail }`, so parse them on failure and hand the caller
  // an ApiError it can read the server's own wording off.
  certificatePdf: async (
    runId: string,
  ): Promise<{ blob: Blob; filename: string | null }> => {
    const url = `${COMPLIANCE_BASE}/runs/${encodeURIComponent(runId)}/certificate.pdf`;
    const full = `${API_BASE_URL}${url}`;
    const headers: Record<string, string> = { ...DEFAULT_REQUEST_HEADERS };
    const token = getAuthToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(full, { headers });
    if (res.status === 401) handleUnauthorized();
    if (!res.ok) {
      const parsed: unknown = await res.json().catch(() => null);
      throw new ApiError(res.status, res.statusText, parsed, full);
    }

    return { blob: await res.blob(), filename: attachmentFilename(res) };
  },
};

// Read the server's own filename out of `Content-Disposition`. Returns null
// rather than a guess when it can't — and it often can't: the header is not a
// CORS-safelisted response header, so unless the API sends
// `Access-Control-Expose-Headers: Content-Disposition` this reads as absent in
// the browser even though it's on the wire. Callers own the fallback name,
// since only they know what the file is of.
function attachmentFilename(res: Response): string | null {
  const header = res.headers.get("Content-Disposition");
  if (!header) return null;
  // RFC 5987 `filename*=UTF-8''…` wins when present — it's the one that can
  // carry non-ASCII, which matters for Arabic report titles.
  const encoded = header.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      /* malformed percent-encoding — fall through to the plain form */
    }
  }
  return header.match(/filename="([^"]+)"/i)?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// Public certificate verification
// ---------------------------------------------------------------------------
//
// Unauthenticated on purpose: the whole point is that someone holding a printed
// certificate — an auditor, a regulator, an investor — can check it without an
// account. Not under COMPLIANCE_BASE; it lives on its own public path.

export const publicVerification = {
  // 200 with the run's public facts, or 404. The 404 is the SAME for a
  // malformed code, an unknown code and an unfinished run, so that the endpoint
  // can't be used to probe which runs exist — callers must render one
  // not-found state and must not try to tell them apart.
  //
  // `auth: false` matters twice: it sends no token (correct for a public
  // endpoint, and the visitor may have none), and it keeps a 401 from bouncing
  // an anonymous visitor to /login.
  verify: (code: string) =>
    request<CertificateVerification>(
      `/api/v1/public/verify/${encodeURIComponent(normalizeVerificationCode(code))}`,
      { auth: false },
    ),
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

  // Async: returns 202 (new run) or 409 (existing run) normalised to a
  // PipelineHandle. Caller navigates to the processing screen and polls.
  generate: (companyId: string, body: GenerateReportBody): Promise<PipelineHandle> => {
    const fd = new FormData();
    body.files.forEach((f) => fd.append("files", f));
    fd.append("year", String(body.year));
    if (body.sector_id) fd.append("sector_id", body.sector_id);
    fd.append("scope_type", body.scope_type);
    if (body.report_type !== undefined) fd.append("report_type", body.report_type);
    if (body.framework_codes && body.framework_codes.length > 0) {
      body.framework_codes.forEach((v) => fd.append("framework_codes", v));
    }
    if (body.region !== undefined) fd.append("region", body.region);
    if (body.country_id !== undefined) fd.append("country_id", body.country_id);
    if (body.regulator_ids && body.regulator_ids.length > 0) {
      body.regulator_ids.forEach((v) => fd.append("regulator_ids", v));
    }
    if (body.gri_scope) fd.append("gri_scope", body.gri_scope);
    return postPipeline(
      `/api/v1/reports/${encodeURIComponent(companyId)}/generate`,
      fd,
    );
  },

  // Async: see generate().
  addDocuments: (
    companyId: string,
    reportId: string,
    body: AddReportDocumentsBody,
  ): Promise<PipelineHandle> => {
    const fd = new FormData();
    body.files.forEach((f) => fd.append("files", f));
    return postPipeline(
      `/api/v1/reports/${encodeURIComponent(companyId)}/${encodeURIComponent(reportId)}/documents`,
      fd,
    );
  },

  // Source of truth for the Report Area cards. Company-agnostic; render the
  // returned `areas` dynamically (do NOT hardcode the card list).
  getQuarterlyReportAreas: () =>
    request<QuarterlyReportAreasResponse>(
      `/api/v1/reports/quarterly/report-areas`,
    ),

  // Source of truth for the on-form questionnaire (single-select). Company-
  // scoped so the backend can tailor questions to the company's context.
  getQuarterlyQuestions: (companyId: string) =>
    request<QuarterlyQuestionsResponse>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/questions`,
    ),

  // Async: see generate(). Stamps report_type='quarterly' server-side so the
  // worker routes to the financial parser instead of the ESG harvester.
  generateQuarterly: (
    companyId: string,
    body: GenerateQuarterlyBody,
  ): Promise<PipelineHandle> => {
    const fd = new FormData();
    body.files.forEach((f) => fd.append("files", f));
    fd.append("year", String(body.year));
    fd.append("quarter", body.quarter);
    if (body.areas && body.areas.length > 0) {
      body.areas.forEach((v) => fd.append("areas", v));
    }
    if (body.content_language) fd.append("content_language", body.content_language);
    // Confirm-context answers — configure the report at creation time.
    if (body.company_type) fd.append("company_type", body.company_type);
    if (body.voices && body.voices.length > 0) {
      body.voices.forEach((v) => fd.append("voices", v));
    }
    if (body.report_tone) fd.append("report_tone", body.report_tone);
    if (body.comparison) fd.append("comparison", body.comparison);
    // Dedicated Excel/CSV lane → lean, exact figure extraction.
    if (body.financial_files && body.financial_files.length > 0) {
      body.financial_files.forEach((f) => fd.append("financial_files", f));
    }
    if (body.financial_currency) fd.append("financial_currency", body.financial_currency);
    if (body.financial_scale) fd.append("financial_scale", body.financial_scale);
    if (body.metrics_mode) fd.append("metrics_mode", body.metrics_mode);
    return postPipeline(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/generate`,
      fd,
    );
  },

  // Detect one uploaded file's language for the upload-time UI check. Returns
  // matches=true when the file is in (or can't be distinguished from) the
  // expected language — fail-open, so it never wrongly flags a document.
  checkLanguage: (
    file: File,
    contentLanguage: "english" | "arabic",
  ): Promise<{
    success: boolean;
    matches: boolean;
    detected_language: string;
    expected_language: string;
  }> => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("content_language", contentLanguage);
    return postForm("/api/v1/reports/quarterly/check-language", fd);
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

  // Logs a manual question against a missing-metric indicator on a report.
  // Backend returns the new question id as a JSON string.
  createQuestion: (
    companyId: string,
    reportId: string,
    body: { framework_indicator_id: string; question_text: string },
  ) =>
    request<string>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/${encodeURIComponent(reportId)}/questions`,
      { method: "POST", body },
    ),
};

// ---------------------------------------------------------------------------
// Quarterly reports — coverage map and figure driver endpoints.
// ---------------------------------------------------------------------------

// The producer endpoints return the section either at the top level or wrapped
// as { section }. Normalise to the bare ProducedSection. The response omits
// feeder_status/title/display_order — callers merge onto the outline seed, whose
// spread preserves those fields.
function unwrapProducedSection(r: ProducedSectionResponse): ProducedSection {
  return (r as { section?: ProducedSection }).section ?? (r as ProducedSection);
}

export const quarterlyReports = {
  getCoverage: (companyId: string, reportId: string) =>
    request<QuarterlyCoverageResponse>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/coverage`,
    ),

  getGaps: (companyId: string, reportId: string) =>
    request<GapsResponse>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/gaps`,
    ),

  // ── Outline (step 6) ──
  // The report's section catalogue. saveOutline persists include+order (PUT);
  // lockOutline freezes it (POST). Backend returns 409 on edits after lock.
  getOutline: (companyId: string, reportId: string, signal?: AbortSignal) =>
    request<OutlineResponse>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/outline`,
      { signal },
    ),

  saveOutline: (
    companyId: string,
    reportId: string,
    body: OutlineSavePayload,
  ) =>
    request<OutlineResponse>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/outline`,
      { method: "PUT", body },
    ),

  lockOutline: (companyId: string, reportId: string) =>
    request<OutlineLockResponse>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/outline/lock`,
      { method: "POST" },
    ),

  // ── Produced sections (step 7 — Part 5 Preview) ──
  // The section-by-section producer. getSection reads one section's status +
  // content; produceSection composes it (optionally with supplied user_input for
  // needs_input sections); refineSection rewrites AI prose from an instruction;
  // produceAll kicks the batch async job (202 → poll via usePipelinePoll).
  getSection: (
    companyId: string,
    reportId: string,
    code: string,
    signal?: AbortSignal,
  ): Promise<ProducedSection> =>
    request<ProducedSectionResponse>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/sections/${encodeURIComponent(code)}`,
      { signal },
    ).then(unwrapProducedSection),

  produceSection: (
    companyId: string,
    reportId: string,
    code: string,
    body?: { user_input?: string },
  ): Promise<ProducedSection> =>
    request<ProducedSectionResponse>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/sections/${encodeURIComponent(code)}/produce`,
      { method: "POST", body: body ?? {} },
    ).then(unwrapProducedSection),

  refineSection: (
    companyId: string,
    reportId: string,
    code: string,
    instruction: string,
  ): Promise<ProducedSection> =>
    request<ProducedSectionResponse>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/sections/${encodeURIComponent(code)}/refine`,
      { method: "POST", body: { instruction } },
    ).then(unwrapProducedSection),

  // Async batch produce. Returns a 202 { run_id, poll_url }; request<T> returns
  // the parsed 202 body (202 is ok), so no FormData/postPipeline needed. Drive
  // the returned handle with usePipelinePoll and refresh getSection per tick.
  produceAll: (companyId: string, reportId: string) =>
    request<ProduceAllHandle>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/produce`,
      { method: "POST", body: {} },
    ),

  // ── Confirm Context ──
  // Company-scoped detection (form time — no reportId). Derives the company type
  // from the company's sector so the setup form can pre-select the pill + show a
  // DETECTED badge. A UI hint only; the chosen value is sent in the generate call.
  detectCompanyType: (companyId: string) =>
    request<DetectCompanyTypeResponse>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/detect-company-type`,
    ),

  // Form-time comparison-data check (no reportId yet). Given the chosen period +
  // comparison basis, reports whether the prior period(s) have figures to compare
  // against — the form disables Generate while this is in flight and pops the
  // "no data" dialog when a required period is missing.
  checkComparisonAvailability: (
    companyId: string,
    params: { year: number; quarter: string; comparison: Comparison; metrics_mode?: 'system' | 'custom' },
  ) =>
    request<ComparisonAvailability>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/comparison-availability` +
        `?year=${params.year}&quarter=${encodeURIComponent(params.quarter)}&comparison=${params.comparison}` +
        (params.metrics_mode ? `&metrics_mode=${params.metrics_mode}` : ''),
    ),

  // Report-scoped PATCH, keyed by an existing report_id — for a LATER edit
  // screen. NOT used during creation: at creation the confirm-context answers
  // ride in the single generate call (see GenerateQuarterlyBody).
  saveContext: (
    companyId: string,
    reportId: string,
    body: QuarterlyContextPatch,
  ) =>
    request<QuarterlyContextSaveResponse>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/context`,
      { method: "PATCH", body },
    ),

  // ── Cover template picker (Part 6) ──
  // Cover-page designs + the current selection (so the preview can render the
  // saved cover/colors on load). reportId is an optional query scope.
  getCoverTemplates: (companyId: string, reportId?: string) =>
    request<CoverTemplatesResponse>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/cover-templates`,
      { query: reportId ? { report_id: reportId } : undefined },
    ),

  // Preset brand palettes (primary + secondary swatch pairs).
  getColorPalettes: (companyId: string) =>
    request<ColorPalettesResponse>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/color-palettes`,
    ),

  // Same palettes, company-unscoped — global reference data, auth only. Used by
  // the onboarding Brand step, which runs before there's a report to scope to.
  getColorPalettesGlobal: () =>
    request<ColorPalettesResponse>("/api/v1/reports/quarterly/color-palettes"),

  // Persist the chosen cover design + brand colors; re-renders the cover +
  // report accents. Colors apply to accents/headings only (body stays dark).
  selectCoverTemplate: (
    companyId: string,
    reportId: string,
    body: CoverSelectionPayload,
  ) =>
    request<CoverSelectionResponse>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/cover-template`,
      { method: "PATCH", body },
    ),

  // Raw financial_figures rows for a quarterly report. Same envelope/row shape
  // as the ESG evidence endpoint, so the KPI Normalizer can render both with
  // one table. statement_type is the pillar analog (income_statement /
  // balance_sheet); document_id / fields mirror evidence. Omit any to get all.
  getFigures: <T = QuarterlyFiguresResponse>(
    companyId: string,
    reportId: string,
    opts?: {
      statement_type?: string;
      document_id?: string;
      fields?: string | string[];
      signal?: AbortSignal;
    },
  ) => {
    const { statement_type, document_id, fields, signal } = opts ?? {};
    const query: Record<string, unknown> = {};
    if (statement_type != null) query.statement_type = statement_type;
    if (document_id != null) query.document_id = document_id;
    if (fields != null) query.fields = Array.isArray(fields) ? fields.join(",") : fields;
    return request<T>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/figures`,
      { query, signal },
    );
  },

  addDriver: (
    companyId: string,
    reportId: string,
    figureId: string,
    body: { text: string; source: "user_provided" },
  ) =>
    request<{ figure: import("@/types/quarterly").CoverageValue }>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/figures/${encodeURIComponent(figureId)}/driver`,
      { method: "POST", body },
    ),

  // ── Preview (step 6) ──
  // Compose the report with the AI agent. Runs synchronously (~30–60s) and
  // persists the result server-side, returning the full payload. Re-calling
  // regenerates and OVERWRITES (discards inline edits) — use for "Regenerate".
  generatePreview: (companyId: string, reportId: string) =>
    request<QuarterlyPreviewReport>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/preview/generate`,
      { method: "POST" },
    ),

  // Cheap read of the saved report. Returns { generated: false, sections: null }
  // if never generated — call generatePreview() in that case.
  getPreview: (companyId: string, reportId: string, signal?: AbortSignal) =>
    request<QuarterlyPreviewResponse>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/preview`,
      { signal },
    ),

  // ── Assembled report (Part 7) ──
  // The full report as one document: cover + produced sections in display_order
  // (needs_input/empty excluded server-side).
  getAssembled: (companyId: string, reportId: string, signal?: AbortSignal) =>
    request<AssembledReportResponse>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/assemble`,
      { signal },
    ),

  // Approve & lock the assembled report — after this the report is read-only
  // (no edits, regeneration, outline changes, or cover changes) and Export
  // becomes available. No OpenAPI entry exists yet for this path; it mirrors
  // every other quarterly action's `.../quarterly/{reportId}/...` convention
  // rather than the generic (non-quarterly-scoped) reports.approve — confirm
  // with backend and adjust if it turns out to be the latter.
  approveReport: (companyId: string, reportId: string) =>
    request<ApproveReportResponse>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/approve`,
      { method: "POST" },
    ),

  // Inline-edit a section's content (prose text, or JSON-stringified table content).
  saveSectionContent: (
    companyId: string,
    reportId: string,
    code: string,
    body: SaveSectionContentPayload,
  ) =>
    request<SaveSectionContentResponse>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/sections/${encodeURIComponent(code)}/content`,
      { method: "PATCH", body },
    ),

  // needs_input document: upload a file for a Template/AI-written section. The
  // backend extracts PLAIN TEXT (pdfplumber/python-docx/decode — NOT financial
  // extraction) and runs it through produce as the user_input (verbatim for
  // Template, an LLM steer for AI-written). Returns the produced section. 422 for
  // Extraction/Hybrid sections (they don't take a text steer).
  uploadSectionDocument: (companyId: string, reportId: string, code: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<ProducedSectionResponse>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/sections/${encodeURIComponent(code)}/upload`,
      { method: "POST", form: fd },
    ).then(unwrapProducedSection);
  },

  // needs_input / no-data document: EXTRACT-ONLY. The backend parses the file to
  // plain text (pdfplumber/python-docx/decode) and returns it WITHOUT producing or
  // saving the section, so the extracted text can be shown in the input field for
  // the user to review/edit before saving it as the section content (via produce).
  extractSectionDocument: (
    companyId: string,
    reportId: string,
    code: string,
    file: File,
  ): Promise<SectionExtractResponse> => {
    const fd = new FormData();
    fd.append("file", file);
    return request<SectionExtractResponse>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/sections/${encodeURIComponent(code)}/extract`,
      { method: "POST", form: fd },
    );
  },

  // ── Export (step 7) ──
  // Download the rendered report as a pdf or docx file. Auth-required and returns
  // a binary attachment, so we use fetchWithAuth (raw Response) + a blob download
  // rather than the JSON-parsing request<T>(). Requires the preview to exist.
  downloadExport: async (
    companyId: string,
    reportId: string,
    format: "pdf" | "docx",
    filename?: string,
  ): Promise<void> => {
    const res = await fetchWithAuth(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(
        reportId,
      )}/export?format=${format}`,
    );
    if (!res.ok) {
      let msg = `Export failed (${res.status})`;
      try {
        const j = await res.json();
        const d = j?.detail;
        if (typeof d === "string") msg = d;
        else if (d?.error) msg = d.error;
      } catch {
        /* non-JSON error body — keep the status message */
      }
      throw new Error(msg);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(filename || "quarterly-report").replace(/[^\w.-]+/g, "_")}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  // ── Chat agent ──
  getChatHistory: (companyId: string, reportId: string) =>
    request<ChatHistoryResponse>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/chat/history`,
    ),

  streamChatMessage: async (
    companyId: string,
    reportId: string,
    message: string,
    onEvent: (event: ChatStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> => {
    const res = await fetchWithAuth(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
        signal,
      },
    );
    if (!res.ok) {
      let msg = `Chat request failed (${res.status})`;
      try {
        const j = await res.json();
        if (typeof j?.detail === "string") msg = j.detail;
      } catch { /* non-JSON body */ }
      throw new Error(msg);
    }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    const emit = (line: string) => {
      if (!line.startsWith("data: ")) return;
      const json = line.slice(6).trim();
      if (!json) return;
      try { onEvent(JSON.parse(json) as ChatStreamEvent); }
      catch { /* skip malformed line */ }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) emit(line);
    }
    // Flush a final frame that arrived without a trailing newline — otherwise a
    // closing `data: {"type":"done"}` can be stranded in the buffer and the
    // preview never re-fetches.
    if (buf) emit(buf);
  },

  clearChatHistory: async (companyId: string, reportId: string): Promise<void> => {
    const res = await fetchWithAuth(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/chat/history`,
      { method: "DELETE" },
    );
    if (!res.ok && res.status !== 204) {
      throw new Error(`Clear chat failed (${res.status})`);
    }
  },

  // Save one inline sentence edit. 422 if text empty; 404 if the ids don't
  // exist. Returns the updated sentence and the report's new word_count.
  updatePreviewSentence: (
    companyId: string,
    reportId: string,
    body: { section_id: string; sentence_id: string; text: string },
  ) =>
    request<PreviewSentenceUpdateResponse>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/preview/sentence`,
      { method: "PATCH", body },
    ),
};

// ---------------------------------------------------------------------------
// Agent runs — polling endpoint for async pipelines kicked off by generate /
// addDocuments / documents.upload.
// ---------------------------------------------------------------------------

export const agentRuns = {
  get: (runId: string, signal?: AbortSignal) =>
    request<AgentRun>(`/api/v1/agent_runs/${encodeURIComponent(runId)}`, {
      signal,
    }),

  // Poll a pre-built URL (e.g. PipelineHandle.pollUrl). The URL may be
  // absolute or server-root-relative; we strip API_BASE_URL if present.
  getByPollUrl: (pollUrl: string, signal?: AbortSignal) => {
    const path = pollUrl.startsWith(API_BASE_URL)
      ? pollUrl.slice(API_BASE_URL.length)
      : pollUrl;
    return request<AgentRun>(path, { signal });
  },

  // Per-agent node rows driving the live timeline on the Processing page.
  getNodes: (runId: string, signal?: AbortSignal) =>
    request<AgentNodesResponse>(
      `/api/v1/agent_runs/${encodeURIComponent(runId)}/nodes`,
      { signal },
    ),
};

// ---------------------------------------------------------------------------
// Chat — IR Copilot (server-stateful, multi-turn).
//
// The backend owns conversation history. Three endpoints:
//   • GET  /api/v1/chat/session       → hydrate the chat on page load.
//   • POST /api/v1/chat/               → send the next user message; replies
//                                        as SSE. Server persists the user
//                                        message before the stream opens and
//                                        the assistant message after `done`.
//   • POST /api/v1/chat/session/clear  → soft-archive the active session
//                                        (204). Caller refetches /session.
// Don't pass company_id from the frontend — the server reads it from the JWT.
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Single tool usage record attached to an assistant turn in the persisted
// history. `args` is a free-form param object — it may contain UUIDs, so the
// UI shouldn't render it verbatim.
export interface ChatToolCall {
  name: string;
  args?: Record<string, unknown> | null;
}

export interface ChatHistoryMessage extends ChatMessage {
  created_at?: string;
  // Only present on assistant turns; omitted (or null) on user turns.
  tool_calls?: ChatToolCall[] | null;
}

export interface ChatSessionResponse {
  conversation_id: string;
  status: string;
  created_at: string;
  messages: ChatHistoryMessage[];
}

export interface ChatSendBody {
  message: string;
}

export type ChatStreamEvent =
  | { type: "tool_start"; name: string; args?: Record<string, unknown> }
  | { type: "tool_end"; name: string }
  | { type: "token"; content: string }
  | { type: "error"; message: string }
  | { type: "done" }
  | { type: string; [key: string]: unknown };

// Internal: shared SSE consumer. Splits the response stream on `\n\n` and
// yields one parsed event per `data: …` block.
async function* consumeSse(
  res: Response,
  url: string,
): AsyncGenerator<ChatStreamEvent, void, void> {
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, res.statusText, text, url);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const dataLines = block
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).replace(/^\s/, ""));
        if (dataLines.length === 0) continue;
        const payload = dataLines.join("\n");
        try {
          yield JSON.parse(payload) as ChatStreamEvent;
        } catch {
          // Non-JSON heartbeat — surface as a raw token so the caller can
          // ignore or render.
          yield { type: "token", content: payload };
        }
      }
    }
  } finally {
    reader.releaseLock?.();
  }
}

export const chat = {
  // Hydrate the active conversation (auto-creates one if none exists).
  getSession: (signal?: AbortSignal) =>
    request<ChatSessionResponse>("/api/v1/chat/session", { signal }),

  // Send a user message; yields SSE events until {type:"done"}.
  send: async function* (
    body: ChatSendBody,
    signal?: AbortSignal,
  ): AsyncGenerator<ChatStreamEvent, void, void> {
    const res = await fetchWithAuth("/api/v1/chat/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "text/event-stream",
      },
      body: JSON.stringify(body),
      signal,
    });
    yield* consumeSse(res, "/api/v1/chat/");
  },

  // Soft-archive the current session. Caller should refetch getSession()
  // afterwards to pick up the fresh empty conversation the backend creates.
  clearSession: async (): Promise<void> => {
    const res = await fetchWithAuth("/api/v1/chat/session/clear", {
      method: "POST",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ApiError(
        res.status,
        res.statusText,
        text,
        "/api/v1/chat/session/clear",
      );
    }
  },
};

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------

export const meetings = {
  list: () => request<MeetingListResponse>("/api/v1/meetings"),

  get: (meetingId: string) =>
    request<MeetingResponse>(
      `/api/v1/meetings/${encodeURIComponent(meetingId)}`,
    ),

  create: (body: CreateMeetingBody) =>
    request<MeetingResponse>("/api/v1/meetings", { method: "POST", body }),

  update: (meetingId: string, body: UpdateMeetingBody) =>
    request<MeetingResponse>(
      `/api/v1/meetings/${encodeURIComponent(meetingId)}`,
      { method: "PATCH", body },
    ),
};

// ---------------------------------------------------------------------------
// Communication Hub
// ---------------------------------------------------------------------------

// A report-type pill in the "Start a communication" modal. `count` is the
// number of threadless reports of this type and stays constant regardless of
// the active filter (it always reflects the unfiltered set).
export interface ThreadlessReportType {
  code: string;
  label: string;
  count: number;
}

// A report that doesn't have a communication thread yet.
export interface ThreadlessReport {
  id: string;
  report_type: string;
  period: string;
  status: string;
  created_at: string;
}

export interface ThreadlessReportsResponse {
  types: ThreadlessReportType[];
  reports: ThreadlessReport[];
}

// A company member eligible to be @mentioned. `id` is the UUID the write
// endpoint expects; `user_id` (usr_… string) is display-only — never send it.
export interface CommunicationMember {
  id: string;
  user_id: string;
  full_name: string;
  role: string;
  department: string | null;
}

export interface CommunicationMembersResponse {
  members: CommunicationMember[];
}

export interface StartThreadBody {
  report_id: string;
  message: string;
  // Members' `id` UUIDs (NOT their usr_ `user_id`). Empty array if none.
  mentioned_user_ids: string[];
}

export interface CommunicationThread {
  id: string;
  company_id: string;
  report_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CommunicationMessage {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  mentioned_user_ids: string[];
  created_at: string;
}

export interface StartThreadResponse {
  thread: CommunicationThread;
  message: CommunicationMessage;
}

// ── Communication Hub list (Communication tab) ────────────────────────────

export interface ThreadReport {
  id: string;
  report_type: string;
  // Display strings — use directly; report_type/status are the raw codes.
  type_label: string;
  period: string;
  title: string;
  status: string;
  status_label: string;
}

export interface ThreadOwner {
  user_id: string;
  full_name: string;
  is_you: boolean;
}

export interface ThreadLastMessage {
  sender_full_name: string;
  is_you: boolean;
  preview: string;
  created_at: string;
}

// One row in the Communication tab. Rows arrive pre-sorted (updated_at desc) —
// don't re-sort. `owner` and `last_message` can both be null.
export interface ThreadSummary {
  thread_id: string;
  report: ThreadReport;
  owner: ThreadOwner | null;
  updated_at: string;
  last_message: ThreadLastMessage | null;
  internal_count: number;
  unread_count: number;
}

export interface ThreadListResponse {
  threads: ThreadSummary[];
}

export interface MarkThreadReadResponse {
  ok: boolean;
}

// ── Thread view (message list + reply) ────────────────────────────────────

export interface MessageSender {
  user_id: string;
  full_name: string;
  // Raw role code (e.g. "ir") — label it on the frontend.
  role: string;
  is_you: boolean;
}

export interface ThreadMessage {
  id: string;
  sender: MessageSender;
  body: string;
  mentioned_user_ids: string[];
  created_at: string;
}

export interface ThreadDetail {
  thread_id: string;
  report: ThreadReport;
  owner: ThreadOwner | null;
  created_at: string;
  updated_at: string;
}

// Messages arrive oldest→newest, already sorted — render in order.
export interface ThreadDetailResponse {
  thread: ThreadDetail;
  messages: ThreadMessage[];
}

export interface SendMessageBody {
  message: string;
  // Members' `id` UUIDs (NOT usr_ `user_id`). Empty array if none.
  mentioned_user_ids: string[];
}

export interface SendMessageResponse {
  message: ThreadMessage;
}

// ── History tab: email sends + publications ────────────────────────────────
export type EmailAudience = 'external' | 'internal';
export type EmailSendStatus = 'tracked' | 'scheduled' | 'draft';

export interface EmailSendsStats {
  emails_sent_ytd: number;
  external_count: number;
  internal_count: number;
  avg_open_rate: number;
  industry_open_rate: number;
  open_rate_vs_industry: number; // signed delta vs industry
  report_download_rate: number;
  avg_time_on_report_seconds: number;
  time_on_report_qoq_seconds: number | null;
}

// metrics is a different shape per audience_type.
export type EmailSendMetrics =
  | { opened_pct: number; downloaded_pct: number } // external
  | { read_count: number; approved_count: number; total: number }; // internal

export interface EmailSend {
  id: string;
  subject: string;
  audience_type: EmailAudience;
  audience_label: string;
  status: EmailSendStatus;
  sent_at: string | null;
  scheduled_at: string | null;
  recipient_count: number;
  report: { id: string; title: string } | null;
  metrics: EmailSendMetrics;
}

export interface EmailSendsResponse {
  stats: EmailSendsStats;
  sends: EmailSend[];
}

export interface SendRecipientHeader {
  id: string;
  subject: string;
  audience_type: EmailAudience;
  sent_at: string | null;
  recipient_count: number;
}

export interface SendRecipient {
  name: string;
  org: string | null;
  contact: string | null;
  opened_at: string | null;
  downloaded: boolean;
  time_on_report_seconds: number | null;
  approved_at: string | null;
}

export interface SendRecipientsResponse {
  send: SendRecipientHeader;
  recipients: SendRecipient[];
}

export interface Publication {
  id: string;
  report: { id: string; title: string; report_type: string; period: string } | null;
  channel: string;
  jurisdiction: string | null;
  visibility: string;
  watermarked: boolean;
  published_at?: string | null;
  published_by: { full_name: string } | null;
}

export interface PublicationsResponse {
  stats: { total: number } & Record<string, number>;
  publications: Publication[];
}

// ── Compose modal: draft / send ────────────────────────────────────────────
export interface ComposeRecipient {
  name: string; // the only required field per recipient
  org?: string | null;
  contact?: string | null;
  email?: string | null;
}

export interface EmailSendSavePayload {
  subject: string;
  audience_type: EmailAudience;
  audience_label?: string;
  body?: string;
  report_id?: string | null;
  status: EmailSendStatus;
  scheduled_at?: string | null; // required only when status === 'scheduled'
  recipients?: ComposeRecipient[];
}

// GET /{id} — the editor prefill shape (distinct from /{id}/recipients).
export interface EmailSendDetail {
  id: string;
  subject: string;
  body: string | null;
  audience_type: EmailAudience;
  audience_label: string;
  status: EmailSendStatus;
  scheduled_at: string | null;
  report: {
    id: string;
    title: string;
    pdf_path: string | null;
    page_count: number | null;
    file_size_mb: number | null;
  } | null;
  recipients: ComposeRecipient[];
}

export interface CreateEmailSendResponse {
  send: EmailSendDetail;
  recipient_count: number;
}

export interface UpdateEmailSendResponse {
  send: EmailSendDetail;
}

export interface DraftListItem {
  id: string;
  subject: string;
  recipient_count: number;
  report: { id: string; title: string; period?: string } | null;
  updated_at: string;
}

export interface DraftListResponse {
  drafts: DraftListItem[];
}

// company_id is never sent — the backend derives it from the JWT.
export const communications = {
  // Communication tab list. limit (1–200, default 50) / offset (default 0) are
  // only needed for pagination.
  listThreads: (params?: { limit?: number; offset?: number }) =>
    request<ThreadListResponse>("/api/v1/communications/threads", {
      query: params,
    }),

  // Move the caller's read watermark to now for this thread → clears "N new".
  // Fire when the user opens a thread. 404 → thread gone / not in company.
  markThreadRead: (threadId: string) =>
    request<MarkThreadReadResponse>(
      `/api/v1/communications/threads/${encodeURIComponent(threadId)}/read`,
      { method: "POST" },
    ),

  // Thread header + full message list (oldest→newest). 404 → thread gone.
  getThread: (threadId: string) =>
    request<ThreadDetailResponse>(
      `/api/v1/communications/threads/${encodeURIComponent(threadId)}/messages`,
    ),

  // Post a reply. Bumps the thread's updated_at (reorders the list).
  sendMessage: (threadId: string, body: SendMessageBody) =>
    request<SendMessageResponse>(
      `/api/v1/communications/threads/${encodeURIComponent(threadId)}/messages`,
      { method: "POST", body },
    ),

  // All threadless reports + the type pills. `type` narrows only the reports
  // list; the pills always reflect the full unfiltered set.
  threadlessReports: (type?: string) =>
    request<ThreadlessReportsResponse>(
      "/api/v1/communications/threadless-reports",
      { query: type ? { type } : undefined },
    ),

  // Members eligible for the @mention picker. Loaded once and filtered client-side.
  members: () =>
    request<CommunicationMembersResponse>("/api/v1/communications/members"),

  // Start a thread on a report with a first message + optional mentions.
  startThread: (body: StartThreadBody) =>
    request<StartThreadResponse>("/api/v1/communications/threads", {
      method: "POST",
      body,
    }),

  // ── History tab ──────────────────────────────────────────────────────────
  // Email sends + header stats. `audience` filters the list only; stats always
  // cover everything so the header stays stable while toggling.
  emailSends: (audience?: EmailAudience | 'all') =>
    request<EmailSendsResponse>("/api/v1/communications/history/email-sends", {
      query: audience && audience !== 'all' ? { audience } : undefined,
    }),

  // Per-recipient drill-down for one send.
  sendRecipients: (sendId: string) =>
    request<SendRecipientsResponse>(
      `/api/v1/communications/history/email-sends/${encodeURIComponent(sendId)}/recipients`,
    ),

  // CSV export — must carry the Bearer token, so fetch as a blob (no plain <a>).
  sendRecipientsCsv: async (sendId: string): Promise<Blob> => {
    const url = `${API_BASE_URL}/api/v1/communications/history/email-sends/${encodeURIComponent(sendId)}/recipients.csv`;
    const headers: Record<string, string> = {};
    const token = getAuthToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(url, { headers });
    if (res.status === 401) handleUnauthorized();
    if (!res.ok) throw new ApiError(res.status, res.statusText, null, url);
    return res.blob();
  },

  // Publications list + stats. Empty until reports are published.
  publications: () =>
    request<PublicationsResponse>("/api/v1/communications/history/publications"),

  // ── Compose: draft / send ────────────────────────────────────────────────
  // Create a send row (first Save draft OR first Send).
  createEmailSend: (body: EmailSendSavePayload) =>
    request<CreateEmailSendResponse>("/api/v1/communications/history/email-sends", {
      method: "POST",
      body,
    }),

  // Update an existing draft (subsequent Save / Send). All fields optional;
  // `recipients` replaces the whole list. 409 if already tracked/scheduled.
  updateEmailSend: (id: string, body: Partial<EmailSendSavePayload>) =>
    request<UpdateEmailSendResponse>(
      `/api/v1/communications/history/email-sends/${encodeURIComponent(id)}`,
      { method: "PATCH", body },
    ),

  // Reopen a draft — prefill the editor. `report.pdf_path` may be null.
  getEmailSend: (id: string) =>
    request<EmailSendDetail>(
      `/api/v1/communications/history/email-sends/${encodeURIComponent(id)}`,
    ),

  // Saved drafts (only surface for drafts — they're not in the History list).
  drafts: () => request<DraftListResponse>("/api/v1/communications/history/drafts"),
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
// Admin Console (Part 5) — the dedicated /admin-console section. Lives
// alongside `admin` above; role/status changes reuse `admin.updateUserRole`
// and `admin.updateUserStatus` (already query-based and live).
// ---------------------------------------------------------------------------

export const adminConsole = {
  // Backend returns a nested shape (stats{}, reports_chart[], …); normalise it
  // to the flat AdminOverview the page renders.
  overview: (): Promise<AdminOverview> =>
    request<RawAdminOverview>("/api/v1/admin/overview").then(normalizeOverview),

  listUsers: (params?: { role?: string; status?: string; search?: string }) =>
    request<AdminUserRow[]>("/api/v1/admin/users", { query: params }),

  inviteUser: (body: InviteUserPayload) =>
    request<InviteUserResponse>("/api/v1/admin/users/invite", {
      method: "POST",
      body,
    }),

  // Reassign a user's department (department_user role only). Pass null to clear.
  updateUserDepartment: (userId: string, departmentId: string | null) =>
    request<unknown>(
      `/api/v1/admin/users/${encodeURIComponent(userId)}/department`,
      { method: "PATCH", body: { department_id: departmentId } },
    ),

  getPermissions: () => request<PermissionMatrix>("/api/v1/admin/permissions"),

  savePermissions: (body: SavePermissionsPayload) =>
    request<unknown>("/api/v1/admin/permissions", { method: "PUT", body }),

  // Backend may return a raw array or a `{ departments: [...] }` wrapper —
  // both are handled by the caller.
  listDepartments: () =>
    request<Department[] | { departments: Department[] }>(
      "/api/v1/admin/departments",
    ),

  createDepartment: (body: DepartmentPayload) =>
    request<Department>("/api/v1/admin/departments", { method: "POST", body }),

  updateDepartment: (
    id: string,
    body: Partial<DepartmentPayload> & { is_active?: boolean },
  ) =>
    request<Department>(
      `/api/v1/admin/departments/${encodeURIComponent(id)}`,
      { method: "PATCH", body },
    ),

  deleteDepartment: (id: string) =>
    request<unknown>(`/api/v1/admin/departments/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
};

// ---------------------------------------------------------------------------
// SAR — Annual Report (Cycles). Separate backend (VITE_SAR_URL, :8010 local).
// `sarRequest` is just `request` pinned to the SAR host; the Centriyon JWT is
// still attached for token passthrough.
// ---------------------------------------------------------------------------

function sarRequest<T>(
  path: string,
  opts: Omit<RequestOptions, "baseUrl"> = {},
): Promise<T> {
  return request<T>(path, { ...opts, baseUrl: SAR_BASE_URL });
}

// Unwrap a `{ key: T }` envelope or return the value as-is. SAR wraps most
// responses (e.g. `{ cycle }`, `{ cycles }`); be tolerant of bare bodies too.
function unwrap<T>(raw: unknown, key: string): T {
  if (raw && typeof raw === "object" && key in (raw as Record<string, unknown>)) {
    return (raw as Record<string, T>)[key];
  }
  return raw as T;
}

// Raw department row as the SAR backend actually returns it. The `*_percentage`
// / `status` / `user_*` keys are the backend's names; the optional frontend-name
// fields let `overview()` normalise either shape (see below).
interface RawCycleDepartment {
  department_id: string;
  department_name: string;
  department_code: string;
  user_id?: string | null;
  user_name?: string;
  user_email?: string;
  status?: SessionStatus;
  progress_percentage?: number;
  submitted_at?: string | null;
  // Frontend-shaped names, in case the backend is ever updated to emit them:
  assigned_user_id?: string | null;
  assigned_user_name?: string;
  assigned_user_email?: string;
  session_status?: SessionStatus;
  progress?: number;
}

interface RawCycleOverview extends Omit<CycleOverview, "departments"> {
  departments?: RawCycleDepartment[];
}

// Raw cycle as the list endpoint returns it — same as `Cycle` plus the backend's
// `pm_name` (the page reads `project_manager_name`).
interface RawCycle extends Cycle {
  pm_name?: string;
}

export const sarCycles = {
  list: async (): Promise<Cycle[]> => {
    const raw = await sarRequest<unknown>("/api/v1/admin/cycles");
    const list = unwrap<RawCycle[]>(raw, "cycles");
    if (!Array.isArray(list)) return [];
    // The SAR backend names the manager `pm_name`, but the list page reads
    // `project_manager_name`. Map it so the Project Manager column renders the
    // name instead of —. (The list endpoint returns no per-cycle progress, so
    // progress stays 0% until the backend surfaces it.)
    return list.map((c) => ({
      ...c,
      project_manager_name: c.project_manager_name ?? c.pm_name,
    }));
  },

  get: async (id: string): Promise<Cycle> => {
    const raw = await sarRequest<unknown>(
      `/api/v1/admin/cycles/${encodeURIComponent(id)}`,
    );
    return unwrap<Cycle>(raw, "cycle");
  },

  create: async (body: CreateCyclePayload): Promise<Cycle> => {
    const raw = await sarRequest<unknown>("/api/v1/admin/cycles", {
      method: "POST",
      body,
    });
    return unwrap<Cycle>(raw, "cycle");
  },

  update: async (
    id: string,
    body: Partial<CreateCyclePayload>,
  ): Promise<Cycle> => {
    const raw = await sarRequest<unknown>(
      `/api/v1/admin/cycles/${encodeURIComponent(id)}`,
      { method: "PUT", body },
    );
    return unwrap<Cycle>(raw, "cycle");
  },

  // The SAR backend returns department rows keyed as `progress_percentage`,
  // `status`, `user_name`/`user_email`/`user_id`, but the page + CycleOverview
  // type use `progress`, `session_status`, `assigned_user_*`. Map them here so
  // the Department Sessions table shows real progress/status/assignee instead of
  // 0% / Not Started / —. Fallbacks keep it working if the backend ever switches
  // to the frontend names.
  overview: async (id: string): Promise<CycleOverview> => {
    const raw = await sarRequest<RawCycleOverview>(
      `/api/v1/admin/cycles/${encodeURIComponent(id)}/overview`,
    );
    return {
      ...raw,
      departments: (raw.departments ?? []).map((d) => ({
        department_id: d.department_id,
        department_name: d.department_name,
        department_code: d.department_code,
        assigned_user_id: d.assigned_user_id ?? d.user_id ?? null,
        assigned_user_name: d.assigned_user_name ?? d.user_name,
        assigned_user_email: d.assigned_user_email ?? d.user_email,
        session_status: (d.session_status ?? d.status) as SessionStatus,
        progress: d.progress ?? d.progress_percentage ?? 0,
        submitted_at: d.submitted_at ?? null,
      })),
    };
  },

  sections: async (id: string): Promise<CycleSection[]> => {
    const raw = await sarRequest<unknown>(
      `/api/v1/admin/cycles/${encodeURIComponent(id)}/sections`,
    );
    const list = unwrap<CycleSection[]>(raw, "sections");
    return Array.isArray(list) ? list : [];
  },

  // Compute + persist the cycle's section list from its company profile. Empty
  // POST; idempotent. 400 if company_profile/sector aren't set on the cycle.
  resolveSections: (id: string): Promise<ResolveSectionsResponse> =>
    sarRequest<ResolveSectionsResponse>(
      `/api/v1/admin/cycles/${encodeURIComponent(id)}/resolve-sections`,
      { method: "POST" },
    ),

  // Bulk-assign departments + responsible users to a draft cycle.
  assignDepartments: (
    id: string,
    body: AssignDepartmentsPayload,
  ): Promise<AssignDepartmentsResponse> =>
    sarRequest<AssignDepartmentsResponse>(
      `/api/v1/admin/cycles/${encodeURIComponent(id)}/assign-departments`,
      { method: "POST", body },
    ),

  // Flip a draft cycle to active (generates questionnaires). Empty POST.
  activate: (id: string): Promise<unknown> =>
    sarRequest<unknown>(
      `/api/v1/admin/cycles/${encodeURIComponent(id)}/activate`,
      { method: "POST" },
    ),
};

export const sarUsers = {
  listProjectManagers: async (): Promise<SARUser[]> => {
    const raw = await sarRequest<unknown>(
      "/api/v1/admin/users",
      { query: { role: "project_manager" } },
    );
    const list = unwrap<SARUser[]>(raw, "users");
    return Array.isArray(list) ? list : [];
  },
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

  // Combined catalogue used by both the Reports form picker and the
  // dashboard Framework Compliance card — universal standards (GRI, IFRS-S1,
  // IFRS-S2) plus every regulator with at least one active indicator.
  scopes: <T = unknown>() => request<T>("/api/v1/lookups/scopes"),

  frameworkIndicators: async (opts?: {
    framework?: string | string[];
    fields?: string | string[];
    is_active?: boolean;
    signal?: AbortSignal;
  }): Promise<FrameworkIndicator[]> => {
    const { framework, fields, is_active, signal } = opts ?? {};
    const query: Record<string, unknown> = {};
    if (framework != null) {
      query.framework = Array.isArray(framework) ? framework.join(",") : framework;
    }
    if (fields != null) {
      query.fields = Array.isArray(fields) ? fields.join(",") : fields;
    }
    if (is_active != null) query.is_active = is_active;
    const raw = await request<unknown>("/api/v1/lookups/framework-indicators", {
      query,
      signal,
    });
    return extractIndicatorList(raw);
  },

  // Financial metrics catalogue — mirrors framework-indicators. Auth-only (not
  // company-scoped), ordered by sort_order. Used by the KPI Normalizer's
  // Quarterly tab.
  financialMetrics: async (opts?: {
    statement?: string | string[];
    statement_type?: string | string[];
    fields?: string | string[];
    is_active?: boolean;
    signal?: AbortSignal;
  }): Promise<FinancialMetric[]> => {
    const { statement, statement_type, fields, is_active, signal } = opts ?? {};
    const query: Record<string, unknown> = {};
    if (statement != null) {
      query.statement = Array.isArray(statement) ? statement.join(",") : statement;
    }
    if (statement_type != null) {
      query.statement_type = Array.isArray(statement_type)
        ? statement_type.join(",")
        : statement_type;
    }
    if (fields != null) {
      query.fields = Array.isArray(fields) ? fields.join(",") : fields;
    }
    if (is_active != null) query.is_active = is_active;
    const raw = await request<unknown>("/api/v1/lookups/financial-metrics", {
      query,
      signal,
    });
    return extractFinancialMetricList(raw);
  },
};

// The endpoint may return the array under a wrapper key (`framework_indicators`,
// `data`, `items`, `results`) or as a bare array. Normalise to FrameworkIndicator[]
// so callers don't have to second-guess the shape.
function extractIndicatorList(raw: unknown): FrameworkIndicator[] {
  if (Array.isArray(raw)) return raw as FrameworkIndicator[];
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const key of [
      "framework_indicators",
      "frameworkIndicators",
      "indicators",
      "data",
      "items",
      "results",
    ]) {
      const v = obj[key];
      if (Array.isArray(v)) return v as FrameworkIndicator[];
      // One nested level — e.g. { data: { framework_indicators: [...] } }
      if (v && typeof v === "object") {
        const inner = v as Record<string, unknown>;
        for (const k2 of ["framework_indicators", "indicators", "items", "results"]) {
          if (Array.isArray(inner[k2])) return inner[k2] as FrameworkIndicator[];
        }
      }
    }
  }
  return [];
}

// The financial-metrics endpoint may wrap the array under `financial_metrics`
// (or `data` / `items` / `results`) or return a bare array. Normalise to
// FinancialMetric[] so callers don't have to second-guess the shape.
function extractFinancialMetricList(raw: unknown): FinancialMetric[] {
  if (Array.isArray(raw)) return raw as FinancialMetric[];
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const key of [
      "financial_metrics",
      "financialMetrics",
      "metrics",
      "data",
      "items",
      "results",
    ]) {
      const v = obj[key];
      if (Array.isArray(v)) return v as FinancialMetric[];
      if (v && typeof v === "object") {
        const inner = v as Record<string, unknown>;
        for (const k2 of ["financial_metrics", "metrics", "items", "results"]) {
          if (Array.isArray(inner[k2])) return inner[k2] as FinancialMetric[];
        }
      }
    }
  }
  return [];
}

export interface FinancialMetric {
  id?: string;
  metric_key?: string | null;
  code?: string | null;
  label?: string | null;
  statement?: string | null;
  statement_type?: string | null;
  unit_type?: string | null;
  sort_order?: number | null;
  is_active?: boolean;
}

export interface FinancialMetricsResponse {
  financial_metrics: FinancialMetric[];
  total: number;
}

export interface FrameworkIndicator {
  id?: string;
  framework: string;
  source_code: string;
  indicator_label: string;
  terse_label?: string | null;
  parent_standard?: string | null;
  esg_pillar?: "E" | "S" | "G" | "ESG" | null;
  esg_category?:
    | "Environmental"
    | "Social"
    | "Governance"
    | "Economic"
    | "Universal"
    | "Filing"
    | null;
  data_type?: string | null;
  expected_unit?: string | null;
  is_active?: boolean;
}

export interface FrameworkIndicatorsResponse {
  framework_indicators: FrameworkIndicator[];
}

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
  // rely on `useAuth().user.company_id`. The same claims also carry the
  // onboarding flag, which we mirror onto the user (preferring the explicit
  // top-level field) so ProtectedRoute can gate on it.
  const user: AuthUser = { ...res.user };
  const claims = parseJwtPayload<{
    company_id?: string | null;
    onboarding_completed?: boolean | null;
  }>(res.access_token);
  if (user.company_id == null && claims && "company_id" in claims) {
    user.company_id = claims.company_id;
  }
  user.onboarding_completed =
    res.onboarding_completed ?? claims?.onboarding_completed ?? null;

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

// Persist a user object to localStorage. Used by AuthContext when it
// enriches the user with extra fields (e.g. company_name fetched after login).
export function setStoredUser(user: AuthUser): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

export function getStoredUser(): AuthUser | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(USER_STORAGE_KEY);
  if (!raw) return null;
  try {
    const user = JSON.parse(raw) as AuthUser;
    // Nothing to backfill if both already present.
    if (user.company_id != null && user.onboarding_completed != null) {
      return user;
    }

    // Backfill from the JWT for sessions saved before these fields were
    // captured, so the onboarding gate still resolves on a page reload.
    const token = getAuthToken();
    if (!token) return user;
    const claims = parseJwtPayload<{
      company_id?: string | null;
      onboarding_completed?: boolean | null;
    }>(token);
    if (!claims) return user;
    const merged: AuthUser = { ...user };
    if (merged.company_id == null && "company_id" in claims) {
      merged.company_id = claims.company_id;
    }
    if (merged.onboarding_completed == null && "onboarding_completed" in claims) {
      merged.onboarding_completed = claims.onboarding_completed;
    }
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(merged));
    return merged;
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

// Onboarding "Company Intel": the backend LLM-extracts the Review-Details fields
// from a profile doc and/or a website URL. `sector_id` is the AI's constrained
// pick from the sectors lookup (null if unsure). Nulls for anything not found.
export interface ExtractedCompanyProfile {
  description: string | null;
  sector_id: string | null;
  sector_name: string | null;
  employee_count: number | null;
  founded_year: number | null;
  headquarter_city: string | null;
  fiscal_year_end_month: number | null;
  reporting_currency: string | null;
  primary_language: string | null;
  listed_exchange: string | null;
  website_url: string | null;
}

// Single combined extraction — pass a document, a URL, or both; when both are
// given the backend merges their text and makes ONE LLM call.
export async function extractCompanyProfile(
  file: File | null,
  url?: string,
): Promise<ExtractedCompanyProfile> {
  const form = new FormData();
  if (file) form.append("file", file);
  if (url && url.trim()) form.append("url", url.trim());
  const { fields } = await postForm<{ fields: ExtractedCompanyProfile }>(
    "/api/v1/auth/onboarding/extract-profile",
    form,
  );
  return fields;
}

// Signup-time: kick off BACKGROUND profile extraction from a doc and/or URL.
// Unauthenticated (the company is created before login). No-ops if neither given.
export async function extractProfileAtSignup(
  companyId: string,
  file: File | null,
  url?: string,
): Promise<void> {
  if (!file && !(url && url.trim())) return;
  const form = new FormData();
  if (file) form.append("file", file);
  if (url && url.trim()) form.append("url", url.trim());
  await postForm(`/api/v1/companies/${encodeURIComponent(companyId)}/extract-profile`, form);
}

// Spec-named createCompany() — raw fetch per .claude/specs/2step_register.md.
// Typed companies.create() namespace remains for future callers.
export async function createCompany(
  params: CreateCompanyRequest,
): Promise<CreateCompanyResponse> {
  const query = new URLSearchParams({ name: params.name });
  if (params.sector_id) query.append("sector_id", params.sector_id);
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
  team,
  agents,
  esg,
  compliance,
  complianceValidation,
  publicVerification,
  reports,
  chat,
  meetings,
  admin,
  adminConsole,
  sarCycles,
  sarUsers,
  lookups,
  system,
};

export default api;
