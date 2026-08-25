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
  JwtPermissionClaims,
  LoginResponse,
  OnboardingPayload,
  OnboardingResponse,
} from "@/types/auth";
import type { DetectedBrandColors } from "@/types/brand";
import type { MetricsMode } from "@/types/quarterly";
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
  SectionAnalysis,
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
  CreateEarningsReportPayload,
  CreateEarningsReportResponse,
  SelectableSource,
  SelectableSourcesResponse,
  SourceCoverage,
  SourceTrack,
  SourceUploadType,
  SourceExtractionStatus,
  EarningsFigure,
  EarningsFigureSource,
  EarningsFiguresResponse,
  EditEarningsFigurePayload,
  EarningsOutlineSection,
  EarningsOutlineResponse,
  EarningsSourceLinesResponse,
  EarningsFigureSectionsResponse,
  EarningsSectionFiguresResponse,
  EarningsSectionFeeder,
  SaveEarningsOutlinePayload,
  EarningsProducedSection,
  EarningsSectionPatch,
  EarningsSectionsResponse,
  EarningsSectionStatus,
  EarningsProduceHandle,
  SaveEarningsSectionContentPayload,
  EarningsExportFormat,
  EarningsReportSummary,
  EarningsReportsListResponse,
} from "@/types/earnings";
import type {
  BoardAssembleResponse,
  BoardCompletion,
  BoardExportFormat,
  BoardIssuerProfile,
  BoardOutlineResponse,
  BoardOutlineSavePayload,
  BoardProduceSectionResponse,
  BoardProfileResponse,
  BoardReportDetail,
  BoardReportListResponse,
  BoardReportSummary,
  BoardRunHandle,
  BoardSection,
  BoardSectionsResponse,
  BoardSourcesResponse,
  CreateBoardReportPayload,
} from "@/types/board";
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
  RegenerateTempPasswordResponse,
  SavePermissionsPayload,
  TempPasswordResponse,
  UserPermissionsResponse,
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

// FastAPI puts the human-readable reason in `detail` — a plain string for
// raised HTTPExceptions ("Email already registered") and an array of
// {loc, msg} objects for 422 validation failures. Anything else is not worth
// guessing at.
function detailOf(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail.trim() || null;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => (d && typeof d === "object" ? (d as { msg?: unknown }).msg : null))
      .filter((m): m is string => typeof m === "string" && m.length > 0);
    if (msgs.length) return msgs.join(". ");
  }
  return null;
}

// 429/5xx responses come from infra or an upstream provider (rate limits,
// exhausted API credits, crashes) rather than deliberate FastAPI
// HTTPExceptions, so `detail` there is often a raw exception string never
// meant for an end user — e.g. a leaked
// `RateLimitError: ... insufficient_quota ...` blob. Those always get this
// generic line instead, regardless of what's in `detail`.
const SERVICE_UNAVAILABLE_MESSAGE =
  "The system is temporarily unavailable. Please try again in a few minutes.";

export class ApiError<TBody = unknown> extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: TBody,
    public url: string,
  ) {
    // Prefer the backend's own words for deliberate business-logic rejections
    // (403/404/409/422 etc. — "Email already registered" tells the user
    // exactly what to fix). Callers all over the app surface `err.message`
    // straight into the UI, and "API 409 Conflict — http://…" tells the user
    // nothing while "Email already registered" tells them exactly what to
    // fix. Status and url stay on the instance for debugging either way.
    const isInfraFailure = status === 429 || status >= 500;
    super(
      isInfraFailure
        ? SERVICE_UNAVAILABLE_MESSAGE
        : (detailOf(body) ?? `API ${status} ${statusText} — ${url}`),
    );
    this.name = "ApiError";
  }
}

// A handful of endpoints (register, resend-verification) use 429 deliberately
// — a per-email cooldown, not infra rate limiting — and carry a structured
// `detail: {message, retry_after_seconds}` instead of the plain-string shape
// `detailOf()` expects. ApiError's own `.message` collapses every 429 into
// the generic SERVICE_UNAVAILABLE_MESSAGE above (right call for genuine infra
// limits), so callers that need the real reason and countdown read it here
// off `.body` instead.
export interface RateLimitDetail {
  message: string;
  retryAfterSeconds: number;
}

export function rateLimitDetailOf(err: unknown): RateLimitDetail | null {
  if (!(err instanceof ApiError) || err.status !== 429) return null;
  const body = err.body as { detail?: unknown } | null;
  const detail =
    body && typeof body === "object" ? (body as { detail?: unknown }).detail : null;
  if (
    detail &&
    typeof detail === "object" &&
    typeof (detail as { retry_after_seconds?: unknown }).retry_after_seconds === "number"
  ) {
    const d = detail as { message?: unknown; retry_after_seconds: number };
    return {
      message: typeof d.message === "string" ? d.message : "Please wait before trying again.",
      retryAfterSeconds: d.retry_after_seconds,
    };
  }
  return null;
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
  metrics_mode?: MetricsMode;
}

// Whether the company has extracted figures for the period(s) a report would
// compare against — drives the form's Generate-button gating + "no data" popup.
export interface ComparisonAvailability {
  available: boolean; // all required prior periods have figures ('both' needs both)
  comparison: Comparison;
  // The mode the answer was computed for — read this rather than the live radio,
  // which may have moved on since the request went out.
  metrics_mode?: MetricsMode;
  target_period: string; // e.g. "Q3-2025"
  specs: {
    key: string;
    period: string;
    label: string;
    present: boolean;
    // The prior period HAS figures, just in the lane this report won't read
    // (system data for a custom report, or vice versa). System and custom only
    // ever compare against themselves, so this is "unavailable, but for a
    // reason worth explaining" rather than "no data at all".
    other_mode_present?: boolean;
  }[];
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

// The full system metric catalogue, grouped by statement — backs the "System
// metrics" hover list. Group titles and their order come from the API; render
// them as returned rather than rebuilding the grouping client-side. `code` is
// null for the sector/operational KPI group (metrics with no statement).
export interface QuarterlySystemMetric {
  key: string;
  label: string;
}

export interface QuarterlySystemMetricGroup {
  code: string | null;
  title: string;
  count: number;
  metrics: QuarterlySystemMetric[];
}

export interface QuarterlySystemMetricsResponse {
  total: number;
  groups: QuarterlySystemMetricGroup[];
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
  company_id?: string | null;
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
  // JSON body, not query params — registration no longer logs the user in;
  // it only creates the (unverified) account and queues a verification email.
  register: <T = unknown>(params: RegisterParams) =>
    request<T>("/api/v1/auth/register", {
      method: "POST",
      body: params,
      auth: false,
    }),

  // JSON body, same as register — the request moved off query params, but
  // the response shape (access_token, user, ...) is unchanged.
  login: <T = unknown>(params: LoginParams) =>
    request<T>("/api/v1/auth/login", {
      method: "POST",
      body: params,
      auth: false,
    }),

  // Body carries `code` as a string on purpose — it may have leading zeros,
  // which a number would silently drop.
  verifyEmail: (email: string, code: string) =>
    request<{ verified: boolean }>("/api/v1/auth/verify-email", {
      method: "POST",
      body: { email, code },
      auth: false,
    }),

  // Unknown / already-verified email always resolves { sent: true } with no
  // message — same anti-enumeration shape as forgotPassword, deliberately
  // indistinguishable from a real send. A known, unverified email outside the
  // cooldown attempts a real send and returns its actual outcome (sent may be
  // false — a created-but-undelivered case, not a client error). Within the
  // cooldown this throws ApiError(429) instead — read it with rateLimitDetailOf().
  resendVerification: (email: string) =>
    request<{ sent: boolean; message?: string }>("/api/v1/auth/resend-verification", {
      method: "POST",
      body: { email },
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

  // Self-service reset, for users who can't log in at all (so no JWT — unlike
  // changePassword above). Query params, same as login/register: that's what
  // the backend reads.
  //
  // Always resolves 200 for any email — unknown address, suspended account and
  // a real send are byte-identical, so the form can't be used to enumerate
  // accounts. `reset_link` comes back only while the backend runs DEBUG=true.
  forgotPassword: (email: string) =>
    request<{ sent: boolean; reset_link?: string }>(
      "/api/v1/auth/forgot-password",
      { method: "POST", query: { email }, auth: false },
    ),

  // Consumes the single-use token from the emailed link (valid 30 min). 400 is
  // the catch-all for expired / malformed / already-used — deliberately one
  // message, so don't try to distinguish them. Also clears must_change_password
  // and activates a pending invitee.
  resetPassword: (token: string, newPassword: string) =>
    request<{ reset: boolean }>("/api/v1/auth/reset-password", {
      method: "POST",
      query: { token, new_password: newPassword },
      auth: false,
    }),

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

  // Read the brand colors out of an uploaded logo, so the user doesn't have to
  // find their own hex codes. Takes the same data URI stored in
  // companies.logo_base64. Stateless — the caller applies the result to the
  // picker and only persists it on save.
  //
  // primary is null when the logo carries no color at all (white/black only),
  // which means "change nothing" rather than "no answer".
  detectLogoColors: (logoBase64: string) =>
    request<DetectedBrandColors>("/api/v1/auth/onboarding/detect-logo-colors", {
      method: "POST",
      body: { logo_base64: logoBase64 },
    }),

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
  // `force` re-runs an ingest that already finished — the standalone Upload Reports
  // page needs it, since the backend otherwise no-ops once report_extraction_status
  // is 'done'. An in-flight run still wins regardless.
  ingestOnboarding: (
    companyId: string,
    items: OnboardingIngestItem[],
    force = false,
  ): Promise<{ status: string }> =>
    request(`/api/v1/companies/${encodeURIComponent(companyId)}/ingest-onboarding`, {
      method: "POST",
      body: force ? { items, force: true } : { items },
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
  // Omit it: the backend generates a 12-char password, emails it to the new
  // member, and returns it so the admin can hand it over if the mail failed.
  // Still accepted (8-char minimum) if a caller wants to choose one.
  temp_password?: string;
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

// POST response. `member` is the long-standing key; the rest arrived with
// invite emails. `temp_password` is the only time the value is ever returned —
// show it to the admin only when `email_sent` is false, since otherwise the
// new member already has it in their inbox.
export interface CreateTeamMemberResponse {
  member: TeamMember;
  temp_password?: string;
  email_sent?: boolean;
  email_message?: string;
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

  create: <T = CreateTeamMemberResponse>(companyId: string, body: CreateTeamMemberBody) =>
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

  // Every active system metric, grouped by statement. Broader than
  // getQuarterlyReportAreas, which only covers metrics tagged with a report area.
  getQuarterlySystemMetrics: () =>
    request<QuarterlySystemMetricsResponse>(
      `/api/v1/reports/quarterly/system-metrics`,
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

  // Can we read any figures out of this financial upload? Called the moment a file
  // is picked. A .docx is read as TABLES ONLY, so a Word file of prose is an empty
  // file to us — has_tables=false, and `message` is the sentence to show.
  checkTables: (
    file: File,
  ): Promise<{
    success: boolean;
    has_tables: boolean;
    table_count: number;
    table_names: string[];
    reason: "no_tables" | "no_figures" | null;
    message: string | null;
  }> => {
    const fd = new FormData();
    fd.append("file", file);
    return postForm("/api/v1/reports/quarterly/check-tables", fd);
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
  getOutline: (companyId: string, reportId: string, signal?: AbortSignal): Promise<OutlineResponse> =>
    request<Record<string, unknown>>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/outline`,
      { signal },
    ).then((raw) => ({
      ...(raw as unknown as OutlineResponse),
      // Confirmed live: the real field is `outline_locked` — `locked` was never
      // actually present on this response, so every "is this outline already
      // locked, don't re-produce" check (Outline page, Processing bootstrap)
      // could only ever fire if every OPTIONAL section also happened to be
      // individually locked (they never are — only required sections lock).
      // Read both names defensively; this is the one place that needs it.
      locked: Boolean(raw.locked ?? raw.outline_locked),
    })),

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

  // Rename one section for this report — the name then appears everywhere,
  // including the exported PDF's heading and table of contents. An empty title
  // clears the rename and puts the blueprint name back. Works after the outline is
  // locked (a rename can't regenerate anything), and returns the rebuilt outline
  // like saveOutline does.
  renameSection: (
    companyId: string,
    reportId: string,
    sectionCode: string,
    title: string,
  ) =>
    request<OutlineResponse>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}` +
        `/outline/sections/${encodeURIComponent(sectionCode)}/title`,
      { method: "PATCH", body: { title } },
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

  // Read this section's figures and write a short analysis. Never touches the
  // section's content — the result is shown on screen only. `signal` matters:
  // request() has no timeout of its own and this is a live LLM call.
  analyseSection: (
    companyId: string,
    reportId: string,
    code: string,
    opts: { force?: boolean; signal?: AbortSignal } = {},
  ): Promise<SectionAnalysis> =>
    request<SectionAnalysis>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/sections/${encodeURIComponent(code)}/analyse`,
      { method: "POST", body: { force: !!opts.force }, signal: opts.signal },
    ),

  // Replace the analysis prose by hand. An empty string removes it from the report.
  saveSectionAnalysis: (
    companyId: string,
    reportId: string,
    code: string,
    text: string,
  ): Promise<SectionAnalysis> =>
    request<SectionAnalysis>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/sections/${encodeURIComponent(code)}/analysis`,
      { method: "PATCH", body: { text } },
    ),

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
    params: { year: number; quarter: string; comparison: Comparison; metrics_mode?: MetricsMode },
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

  // The designs, company-unscoped. The URL says quarterly, but this is the
  // shared catalogue — earnings and board reports pick from it too.
  getCoverTemplatesGlobal: (signal?: AbortSignal) =>
    request<CoverTemplatesResponse>("/api/v1/reports/quarterly/cover-templates", { signal }),

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

  // ── Extraction review (step 2) ──
  // The figures the mapper matched exactly (already stored) plus the ones it
  // wasn't confident enough about, which the user confirms one by one. Nothing in
  // `pending` is in the report yet.
  getExtractionReview: (
    companyId: string,
    reportId: string,
    signal?: AbortSignal,
  ): Promise<import("@/types/quarterly").ExtractionReviewResponse> =>
    request(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/extraction-review`,
      { signal },
    ),

  // Apply the yes/no answers. Anything not accepted — rejected OR left unanswered
  // — is dropped, so a figure only ever lands in the report with a human's yes.
  submitExtractionReview: (
    companyId: string,
    reportId: string,
    decisions: import("@/types/quarterly").ExtractionReviewDecision[],
  ): Promise<import("@/types/quarterly").ExtractionReviewResult> =>
    request(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/extraction-review`,
      { method: "POST", body: { decisions } },
    ),

  // Company-scoped, not report-scoped: an exclusion applies to every future
  // upload, so it has to be findable from whichever report the user is on.
  listExclusions: (
    companyId: string,
    signal?: AbortSignal,
  ): Promise<import("@/types/quarterly").ExclusionsResponse> =>
    request(`/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/exclusions`, {
      signal,
    }),

  undoExclusions: (
    companyId: string,
    labels: string[],
  ): Promise<{ company_id: string; restored: number }> =>
    request(`/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/exclusions`, {
      method: "DELETE",
      body: { labels },
    }),

  // Custom mode only: rename or delete lines read from the per-section uploads.
  // There is no yes/no here — the section was settled at upload time, so what's
  // left is tidying a databook's spacer rows and awkward labels.
  editCustomFigures: (
    companyId: string,
    reportId: string,
    edits: import("@/types/quarterly").CustomFigureEdit[],
  ): Promise<import("@/types/quarterly").ExtractionReviewResponse> =>
    request(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/custom-figures`,
      { method: "POST", body: { edits } },
    ),

  // ── Financial Data (Custom mode, the step before Extraction) ──
  // One statement per section, so nothing has to guess where a figure belongs.
  getFinancials: (
    companyId: string,
    reportId: string,
    signal?: AbortSignal,
  ): Promise<import("@/types/quarterly").FinancialsResponse> =>
    request(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/financials`,
      { signal },
    ),

  // Report-wide currency + scale. Every figure is printed in this scale.
  saveFinancialsSettings: (
    companyId: string,
    reportId: string,
    body: { currency?: string; scale?: string },
  ): Promise<import("@/types/quarterly").FinancialsResponse> =>
    request(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/financials/settings`,
      { method: "PATCH", body },
    ),

  // Read one statement into one section. Re-uploading replaces it. currency/scale
  // are the user correcting our reading for THIS section — omit them and the
  // file's own units decide.
  //
  // Two possible responses: the screen payload (stored), or a confirmation request
  // (nothing stored) when it isn't obvious which table/columns to read. Send the
  // SAME file back with `structure` filled in to commit the user's answer — the
  // file is re-posted rather than parked server-side, so there is no temp copy to
  // expire, clean up, or get out of step with what they're looking at.
  uploadFinancialsSection: (
    companyId: string,
    reportId: string,
    code: string,
    file: File,
    units?: { currency?: string; scale?: string },
    structure?: import("@/types/quarterly").SheetStructureChoice,
  ): Promise<
    | import("@/types/quarterly").FinancialsResponse
    | import("@/types/quarterly").FinancialsConfirmation
  > => {
    const fd = new FormData();
    fd.append("file", file);
    if (units?.currency) fd.append("currency", units.currency);
    if (units?.scale) fd.append("scale", units.scale);
    if (structure) {
      fd.append("table_key", structure.table_key);
      fd.append("header_row", String(structure.header_row));
      fd.append("label_col", String(structure.label_col));
      fd.append("value_col", String(structure.value_col));
    }
    return request(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/financials/sections/${encodeURIComponent(code)}/upload`,
      { method: "POST", form: fd },
    );
  },

  deleteFinancialsSectionUpload: (
    companyId: string,
    reportId: string,
    code: string,
  ): Promise<import("@/types/quarterly").FinancialsResponse> =>
    request(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/financials/sections/${encodeURIComponent(code)}/upload`,
      { method: "DELETE" },
    ),

  // Include/exclude a section, or correct the units we read for it. A units change
  // reinterprets the stored numbers — it never re-reads the file.
  patchFinancialsSection: (
    companyId: string,
    reportId: string,
    code: string,
    body: { included?: boolean; currency?: string; scale?: string },
  ): Promise<import("@/types/quarterly").FinancialsResponse> =>
    request(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/financials/sections/${encodeURIComponent(code)}`,
      { method: "PATCH", body },
    ),

  // A section of the company's own — saved against the COMPANY, so it comes back
  // next quarter and prior-period comparison lines up against it.
  addFinancialsSection: (
    companyId: string,
    reportId: string,
    title: string,
  ): Promise<import("@/types/quarterly").FinancialsResponse> =>
    request(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/financials/sections`,
      { method: "POST", body: { title } },
    ),

  // 422 with the section titles still missing a file — the gate that stops an
  // empty table reaching the report.
  completeFinancials: (
    companyId: string,
    reportId: string,
  ): Promise<import("@/types/quarterly").FinancialsCompleteResult> =>
    request(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/financials/complete`,
      { method: "POST" },
    ),

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

  // attach-mode sections (e.g. auditor_report): the file is embedded verbatim
  // as-is, never turned into editable text — one-step save like upload above,
  // no preview-then-commit. PDF only; the backend 422s on anything else.
  attachSectionDocument: (companyId: string, reportId: string, code: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<ProducedSectionResponse>(
      `/api/v1/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/sections/${encodeURIComponent(code)}/attach`,
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
// Earnings report — Part 1 (Setup). Two live endpoints (Centriyon API):
//   GET  /api/v1/earnings/sources?company_id&period   (untyped 200)
//   POST /api/v1/earnings/reports   (application/json; 201)
// Both responses are untyped in the OpenAPI schema, so we normalise defensively
// and CONFIRM the exact field names against a live response during integration.
// ---------------------------------------------------------------------------
function earnStr(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function earnRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}
// One shape, one normalizer — GET /earnings/sources and the figures response's
// `sources` header both return this same report-backed object (report_id,
// label, report_type, period, updated_at, coverage). Field names are read
// defensively for naming robustness only; this never falls back to
// reconstructing a source from figure rows.
export function normalizeEarningsSourceItem(raw: unknown): SelectableSource | null {
  const o = earnRecord(raw);

  // The document-id pool is only populated from an EXPLICIT document field —
  // never from the generic id fallbacks below, or a single generic id on the
  // raw payload would populate both report_id and document_id at once and
  // collapse the track distinction (Part 6B).
  const explicitDocumentId = earnStr(o.document_id) ?? earnStr(o.doc_id);
  const reportId = explicitDocumentId
    ? null
    : earnStr(o.report_id) ?? earnStr(o.id) ?? earnStr(o.source_id);
  const documentId = explicitDocumentId;
  if (!reportId && !documentId) return null;

  // "narrative_adjusted" (pre-D-29) and "narrative" (D-29, Unified Sources
  // backend rework) both normalize to the same internal track value — the
  // .includes("narrative") check already covers both spellings.
  const trackRaw = (earnStr(o.track) ?? "").toLowerCase();
  const track: SourceTrack = trackRaw.includes("narrative")
    ? "narrative_adjusted"
    : trackRaw.includes("official")
      ? "official"
      : documentId
        ? "narrative_adjusted"
        : "official";

  // report_type no longer falls back to a generic `o.type` — that field now
  // has a distinct meaning (the upload doc type) since Part 6B. The wire field
  // is `filing_type` (D-29) — `type`/`document_type`/`upload_type` kept as
  // fallbacks for naming robustness only.
  const reportType = earnStr(o.report_type);
  const type: SourceUploadType | null =
    track === "narrative_adjusted"
      ? earnStr(o.filing_type) ?? earnStr(o.type) ?? earnStr(o.document_type) ?? earnStr(o.upload_type)
      : null;
  // Not read from o.status for narrative sources — that field is already
  // claimed as a coverage fallback below for official sources.
  const extractionStatus: SourceExtractionStatus | null =
    track === "narrative_adjusted"
      ? earnStr(o.extraction_status) ?? earnStr(o.processing_status)
      : null;
  const detectedType: SourceUploadType | null =
    track === "narrative_adjusted" ? earnStr(o.detected_type) ?? type : null;
  const typeConfidence: number | null =
    track === "narrative_adjusted" ? earnNum(o.type_confidence) ?? earnNum(o.confidence) : null;
  // Read independently of the reportId/documentId branch above — never reuse
  // `reportId` (force-nulled for narrative rows to keep the track split from
  // collapsing). Distinct concept: which report/draft this upload is attached
  // to, needed to scope a type-correction PATCH.
  const owningReportId: string | null =
    track === "narrative_adjusted"
      ? earnStr(o.report_id) ?? earnStr(o.owning_report_id) ?? earnStr(o.draft_report_id)
      : null;

  const period = earnStr(o.period) ?? earnStr(o.period_label);
  // Never a filename. If the backend omits a label, show report type + period
  // instead of falling back to a raw id.
  const composedLabel = [reportType, period].filter(Boolean).join(" ") || null;
  const label =
    earnStr(o.label) ??
    earnStr(o.title) ??
    earnStr(o.name) ??
    composedLabel ??
    "Untitled report";
  // The o.status fallback only applies once extractionStatus hasn't already
  // claimed it — otherwise an upload's extraction state could leak into
  // coverage (e.g. coverage: "extracting").
  const covRaw = (
    earnStr(o.coverage) ??
    earnStr(o.coverage_status) ??
    (extractionStatus ? null : earnStr(o.status)) ??
    ""
  ).toLowerCase();
  const coverage: SourceCoverage = covRaw.includes("full")
    ? "full"
    : covRaw.includes("partial")
      ? "partial"
      : covRaw || "partial";
  const updatedAt = earnStr(o.updated_at) ?? earnStr(o.updatedAt);
  return {
    report_id: reportId,
    document_id: documentId,
    label,
    report_type: reportType,
    period,
    updated_at: updatedAt,
    coverage,
    track,
    type,
    detected_type: detectedType,
    type_confidence: typeConfidence,
    extraction_status: extractionStatus,
    owning_report_id: owningReportId,
  };
}
export function normalizeEarningsSources(raw: unknown): SelectableSourcesResponse {
  const rec = earnRecord(raw);
  // D-29 (Unified Sources backend): GET /earnings/sources now returns two
  // labelled groups (`official` + `uploaded`) instead of one flat `sources`
  // array + `total`. Each item's own `track` still says which pool it's from
  // (read above), so the two groups are simply concatenated here — the old
  // flat shapes are kept as fallbacks for naming robustness, not because both
  // are expected to appear at once.
  const arr: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray(rec.official) || Array.isArray(rec.uploaded)
      ? [
          ...(Array.isArray(rec.official) ? (rec.official as unknown[]) : []),
          ...(Array.isArray(rec.uploaded) ? (rec.uploaded as unknown[]) : []),
        ]
      : Array.isArray(rec.sources)
        ? (rec.sources as unknown[])
        : Array.isArray(rec.items)
          ? (rec.items as unknown[])
          : [];
  const sources = arr
    .map(normalizeEarningsSourceItem)
    .filter((s): s is SelectableSource => s !== null);
  return { sources };
}
function readCreatedEarningsReportId(raw: unknown): CreateEarningsReportResponse {
  const o = earnRecord(raw);
  const nested = earnRecord(o.report);
  const id = earnStr(o.report_id) ?? earnStr(o.id) ?? earnStr(nested.report_id) ?? earnStr(nested.id);
  if (!id) throw new Error("Create earnings report: response did not include a report_id.");
  return { report_id: id };
}
function earnBool(v: unknown): boolean {
  return v === true || v === "true" || v === 1;
}
function earnNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}
function normalizeEarningsFigure(raw: unknown): EarningsFigure | null {
  const o = earnRecord(raw);
  const id = earnStr(o.id) ?? earnStr(o.figure_id) ?? earnStr(o.metric_key);
  if (!id) return null;
  const src = earnRecord(o.source);
  return {
    id,
    metric_key: earnStr(o.metric_key) ?? earnStr(o.key) ?? id,
    label: earnStr(o.label) ?? earnStr(o.metric_label) ?? earnStr(o.name) ?? id,
    value: earnNum(o.value),
    unit: earnStr(o.unit) ?? earnStr(o.units),
    period: earnStr(o.period) ?? earnStr(o.period_label),
    source_document_id:
      earnStr(o.source_document_id) ?? earnStr(o.document_id) ?? earnStr(src.document_id),
    source_report_id:
      earnStr(o.source_report_id) ?? earnStr(o.report_id) ?? earnStr(src.report_id),
    source_label:
      earnStr(o.source_label) ?? earnStr(o.source_name) ?? earnStr(src.label) ?? earnStr(src.title),
    source_ref: earnStr(o.source_ref) ?? earnStr(o.reference) ?? earnStr(src.ref) ?? earnStr(src.page),
    confidence: earnNum(o.confidence),
    is_derived: earnBool(o.is_derived) || earnBool(o.derived),
    derivation: earnStr(o.derivation) ?? earnStr(o.formula),
    flag: earnStr(o.flag) ?? earnStr(o.status),
    edited: earnBool(o.edited) || earnBool(o.is_edited) || earnBool(o.manual),
    prior_value: earnNum(o.prior_value),
    prior_period: earnStr(o.prior_period),
    change_pct: earnNum(o.change_pct),
    comparative_status: earnStr(o.comparative_status),
  };
}
function normalizeEarningsFigures(raw: unknown): EarningsFiguresResponse {
  const rec = earnRecord(raw);
  const arr: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray(rec.figures)
      ? (rec.figures as unknown[])
      : Array.isArray(rec.items)
        ? (rec.items as unknown[])
        : [];
  const figures = arr
    .map(normalizeEarningsFigure)
    .filter((f): f is EarningsFigure => f !== null);
  const srcArr: unknown[] = Array.isArray(rec.sources)
    ? (rec.sources as unknown[])
    : Array.isArray(rec.source_documents)
      ? (rec.source_documents as unknown[])
      : [];
  const sources = srcArr
    .map(normalizeEarningsSourceItem)
    .filter((s): s is EarningsFigureSource => s !== null);
  return { figures, sources };
}

// ── Part 3 — outline ──
// Response is untyped (200 → {}); field names follow the spec and are read
// Which real source backs a section right now (D-29 outline feeder). Absent
// entirely on payloads that predate this field → null, never fabricated.
function normalizeEarningsSectionFeeder(raw: unknown): EarningsSectionFeeder | null {
  if (raw == null) return null;
  const o = earnRecord(raw);
  const status = earnStr(o.status);
  if (!status) return null;
  return {
    status: status as EarningsSectionFeeder["status"],
    source_report_id: earnStr(o.source_report_id),
    source_document_id: earnStr(o.source_document_id),
    source_label: earnStr(o.source_label),
    message: earnStr(o.message) ?? "",
  };
}

// defensively. TODO(Step 0): confirm against a live GET during integration.
function normalizeEarningsOutlineSection(raw: unknown): EarningsOutlineSection | null {
  const o = earnRecord(raw);
  const code = earnStr(o.section_code) ?? earnStr(o.code) ?? earnStr(o.id) ?? earnStr(o.key);
  if (!code) return null;
  // Sector-excluded sections never reach the type — dropped exactly like a
  // malformed row. Field name unconfirmed (Step 0); hedges both possibilities
  // (backend omits them entirely, or returns them flagged).
  const sectorExcluded =
    earnBool(o.sector_excluded) || earnBool(o.excluded_by_sector) || earnBool(o.not_applicable_sector);
  if (sectorExcluded) return null;
  const requirementRaw = (earnStr(o.requirement) ?? earnStr(o.requirement_level) ?? "").toLowerCase();
  const requirement: EarningsOutlineSection["requirement"] = requirementRaw.includes("required")
    ? "required"
    : requirementRaw.includes("recommend")
      ? "recommended"
      : requirementRaw.includes("optional")
        ? "optional"
        : requirementRaw || "optional";
  const displayOrder =
    earnNum(o.display_order) ?? earnNum(o.order) ?? earnNum(o.section_number) ?? 0;
  // A required section is always available/included; an optional's availability
  // defaults to true unless the backend explicitly says false.
  const available =
    requirement === "required"
      ? true
      : "available" in o
        ? earnBool(o.available)
        : !(earnBool(o.unavailable) || earnBool(o.no_data));
  return {
    section_code: code,
    title: earnStr(o.title) ?? earnStr(o.label) ?? earnStr(o.name) ?? code,
    // The catalogue's own name for it, so the panel can offer Reset and say what
    // it would go back to. Null on a payload that predates renaming.
    title_original: earnStr(o.title_original),
    prompt: earnStr(o.prompt),
    description: earnStr(o.description) ?? earnStr(o.summary) ?? earnStr(o.subtitle),
    section_number: earnNum(o.section_number) ?? earnNum(o.number),
    display_order: displayOrder,
    included:
      requirement === "required"
        ? true
        : earnBool(o.included) || earnBool(o.selected) || earnBool(o.is_included),
    requirement,
    available,
    source_type: earnStr(o.source_type) ?? earnStr(o.mode_hint) ?? earnStr(o.data_source),
    mode: earnStr(o.mode) ?? earnStr(o.generation_mode),
    page_hint: earnStr(o.page_hint) ?? earnStr(o.pages) ?? earnStr(o.length_hint),
    status: earnStr(o.status) as EarningsSectionStatus | null,
    // How many of the user's own lines are filed under this section. On the
    // outline response so the badge is right on first paint.
    figure_count: earnNum(o.figure_count) ?? null,
    feeder: normalizeEarningsSectionFeeder(o.feeder),
  };
}
function normalizeEarningsOutline(raw: unknown): EarningsOutlineResponse {
  const rec = earnRecord(raw);
  const arr: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray(rec.sections)
      ? (rec.sections as unknown[])
      : Array.isArray(rec.items)
        ? (rec.items as unknown[])
        : [];
  const sections = arr
    .map(normalizeEarningsOutlineSection)
    .filter((s): s is EarningsOutlineSection => s !== null);
  return { sections };
}

// ── Part 4/5 — produced sections ──
// Response untyped ({}); field names follow the spec and are read defensively.
// TODO(Step 0): confirm against a live GET /sections during integration.
function normalizeEarningsSection(raw: unknown): EarningsProducedSection | null {
  const o = earnRecord(raw);
  const code = earnStr(o.section_code) ?? earnStr(o.code) ?? earnStr(o.id);
  if (!code) return null;
  // content can arrive as a string (prose) or an object/array (table/kpi/cover);
  // stringify objects so the shared renderers can JSON.parse them.
  const rawContent = o.content ?? o.body ?? o.text;
  const content =
    rawContent == null
      ? null
      : typeof rawContent === "string"
        ? rawContent
        : JSON.stringify(rawContent);
  const feeder = earnRecord(o.feeder);
  return {
    section_code: code,
    title: earnStr(o.title) ?? earnStr(o.label) ?? earnStr(o.name) ?? code,
    display_order: earnNum(o.display_order) ?? earnNum(o.order) ?? 0,
    source_type: earnStr(o.source_type) ?? earnStr(o.type),
    mode: earnStr(o.mode) ?? earnStr(o.render_mode) ?? "generate",
    status: (earnStr(o.status) ?? "pending") as EarningsProducedSection["status"],
    content,
    // Default to included=true unless the payload explicitly excludes it — the
    // sections endpoint typically returns only the included set.
    included: "included" in o ? earnBool(o.included) : true,
    feeder_status: earnStr(o.feeder_status) ?? earnStr(feeder.status),
    // "message" is the confirmed field name (same feeder shape as GET /outline,
    // D-29) — kept as first choice; o.message/feeder.message are pre-D-29 guesses.
    feeder_message: earnStr(feeder.message) ?? earnStr(o.message),
    source_label:
      earnStr(feeder.source_label) ?? earnStr(o.source_label) ?? earnStr(feeder.document_name) ?? earnStr(feeder.label),
    source_ref: earnStr(o.source_ref) ?? earnStr(feeder.ref) ?? earnStr(feeder.page),
    confidence: earnNum(o.confidence),
    flag: earnStr(o.flag) ?? earnStr(o.grounding_status),
    // One readable line, whatever shape it arrived in. Several ungrounded
    // numbers in one section is the normal case, and naming all of them is the
    // difference between a targeted edit and guesswork.
    grounding_flag: readGroundingViolations(o).join(", ") || null,
    // edit_acknowledged is the field the backend actually stores (inside
    // feeder); the two client-side spellings are kept as fallbacks.
    grounding_acknowledged:
      earnBool(earnRecord(o.feeder).edit_acknowledged) ||
      earnBool(o.grounding_acknowledged) ||
      earnBool(o.acknowledged),
    edited: earnBool(o.edited) || earnBool(o.is_edited),
    // Built field-by-field, so anything not listed here is silently dropped --
    // which is exactly what happened to the analysis. GET /sections has always
    // sent it, the exporters have always rendered it, and this mapper threw it
    // away, so the Report screen showed none and Preview lost it on reload.
    // Quarterly hit the identical bug in AssembledReportPage.
    analysis: (o.analysis && typeof o.analysis === "object" && !Array.isArray(o.analysis)
      ? (o.analysis as EarningsProducedSection["analysis"])
      : null),
  };
}
// The produce response is a PATCH, not a section. It carries status/content/error
// for one section and nothing else, so it is read as exactly that — running it
// through normalizeEarningsSection built a whole section around those four
// fields, defaulting the title to the section code, display_order to 0 and mode
// to 'generate'. Spread over the real section by the caller, those defaults won.
// Every shape the backend expresses "these numbers are not in the figures" in.
// GET /sections nests it as feeder.grounding_violations; the PATCH and refine
// responses put grounding_violations at the top level. Both are LISTS, and the
// mapper below used to read three singular STRING keys the backend has never
// sent — so section.grounding_flag was always null, the amber banner never
// rendered, and the only thing the user ever saw was the 409 on approve.
function readGroundingViolations(o: Record<string, unknown>): string[] {
  const feeder = earnRecord(o.feeder);
  for (const v of [o.grounding_violations, feeder.grounding_violations]) {
    if (Array.isArray(v)) {
      // Numbers are accepted as well as strings: the backend sends regex matches
      // (strings today), but a token is a token, and silently dropping a numeric
      // one would under-report which figures are at fault.
      const items = v
        .map((x) => (typeof x === "number" && Number.isFinite(x) ? String(x) : earnStr(x)))
        .filter((x): x is string => !!x);
      if (items.length) return items;
    }
  }
  // The singular string keys are kept as a fallback: nothing observed sends
  // them, but reading them costs nothing and removing them could only break
  // something unseen.
  const single =
    earnStr(o.grounding_flag) ?? earnStr(o.grounding_violation) ?? earnStr(o.grounding_message);
  return single ? [single] : [];
}

function readEarningsSectionPatch(raw: unknown): EarningsSectionPatch | null {
  const o = earnRecord(raw);
  const code = earnStr(o.section_code) ?? earnStr(o.code) ?? earnStr(o.id);
  if (!code) return null;
  const rawContent = o.content ?? o.body ?? o.text;
  return {
    section_code: code,
    status: (earnStr(o.status) ?? "pending") as EarningsSectionPatch["status"],
    content:
      rawContent == null
        ? null
        : typeof rawContent === "string"
          ? rawContent
          : JSON.stringify(rawContent),
    error: earnStr(o.error),
    grounding_violations: readGroundingViolations(o),
  };
}

// Exported for the same reason normalizeEarningsSources is: this mapper is where
// the wire shape becomes the screen's shape, and the page tests all mock above it
// — which is exactly how a grounding flag that never rendered shipped green.
export function normalizeEarningsSections(raw: unknown): EarningsSectionsResponse {
  const rec = earnRecord(raw);
  const arr: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray(rec.sections)
      ? (rec.sections as unknown[])
      : Array.isArray(rec.items)
        ? (rec.items as unknown[])
        : [];
  const sections = arr
    .map(normalizeEarningsSection)
    .filter((s): s is EarningsProducedSection => s !== null);
  const cover = earnRecord(rec.cover);
  return {
    sections,
    cover_template_key:
      earnStr(rec.cover_template_key) ?? earnStr(cover.template_key) ?? earnStr(cover.cover_template_key),
    locked: earnBool(rec.locked) || earnBool(rec.approved) || earnStr(rec.status) === "approved",
  };
}
function readEarningsProduceHandle(raw: unknown): EarningsProduceHandle {
  const o = earnRecord(raw);
  const runId = earnStr(o.run_id) ?? earnStr(o.runId) ?? earnStr(o.id);
  const pollUrl = earnStr(o.poll_url) ?? earnStr(o.pollUrl) ?? earnStr(o.url);
  // Nothing to do: the report is already built and unchanged, so no run was
  // started. A handle with nothing to poll is the honest answer here, not a
  // failure — the caller navigates straight on and never raises a loader.
  if (earnStr(o.status) === "completed" && !runId) {
    return { run_id: null, poll_url: null };
  }
  if (!runId || !pollUrl) {
    throw new Error("Produce earnings report: response did not include run_id/poll_url.");
  }
  return { run_id: runId, poll_url: pollUrl };
}

// ── Earnings dashboard — report list ──
// Response untyped ({ reports: [...] }); field names come from the backend
// dashboard contract and are read defensively.
function normalizeEarningsReportSummary(raw: unknown): EarningsReportSummary | null {
  const o = earnRecord(raw);
  const id = earnStr(o.report_id) ?? earnStr(o.id);
  if (!id) return null;
  const period = earnStr(o.period) ?? earnStr(o.period_key) ?? "";
  const status = (earnStr(o.status) ?? "draft").toLowerCase();
  // Fallbacks keep the card sensible if the backend omits a field.
  const periodDisplay = earnStr(o.period_display) ?? (period ? period.replace(/-/g, " ") : "—");
  const finished = ["approved", "locked", "published", "complete", "completed"].includes(status);
  return {
    report_id: id,
    title: earnStr(o.title) ?? "Earnings Report",
    variant: earnStr(o.variant) ?? earnStr(o.report_variant) ?? "quarterly",
    tone: earnStr(o.tone),
    period,
    period_display: periodDisplay,
    status,
    action: earnStr(o.action) ?? (finished ? "View" : "Continue"),
    version: earnStr(o.version),
    generated_at: earnStr(o.generated_at) ?? earnStr(o.created_at),
    updated_at: earnStr(o.updated_at),
    approved_at: earnStr(o.approved_at),
    locked_at: earnStr(o.locked_at),
  };
}
function normalizeEarningsReportsList(raw: unknown): EarningsReportsListResponse {
  const rec = earnRecord(raw);
  const arr: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray(rec.reports)
      ? (rec.reports as unknown[])
      : Array.isArray(rec.items)
        ? (rec.items as unknown[])
        : [];
  const reports = arr
    .map(normalizeEarningsReportSummary)
    .filter((r): r is EarningsReportSummary => r !== null);
  return { reports };
}

export const earnings = {
  // The selectable "existing report" sources for a company + period. Period is a
  // string the backend keys on (format TBD — confirm live; we pass e.g. "FY-2025").
  getSelectableSources: (
    companyId: string,
    period: string,
    signal?: AbortSignal,
  ): Promise<SelectableSourcesResponse> =>
    request<unknown>(`/api/v1/earnings/sources`, {
      query: { company_id: companyId, period },
      signal,
    }).then(normalizeEarningsSources),

  // Upload narrative-track source documents to an EXISTING draft. The route is
  // report-scoped (D-22) — there is no company-scoped upload route — so the draft
  // must be created first (POST /earnings/reports). Multipart body: `files` only
  // — no manual type. The backend auto-classifies each file (GPT-4o-mini) and
  // returns its detected type + confidence; the user corrects it afterward via
  // patchSourceType, never a pre-upload manual choice. Returns the created
  // narrative sources (in their reported extraction state — 'extracting' until
  // ready; never treated as ready early, D-12).
  uploadEarningsSources: (reportId: string, files: File[]): Promise<SelectableSource[]> => {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    return request<unknown>(
      `/api/v1/earnings/reports/${encodeURIComponent(reportId)}/sources/upload`,
      { method: "POST", form: fd },
    ).then((raw) => {
      const rec = earnRecord(raw);
      if (Array.isArray(raw) || Array.isArray(rec.sources) || Array.isArray(rec.items)) {
        return normalizeEarningsSources(raw).sources;
      }
      // Single-object response ({ source } or the source itself).
      const one = normalizeEarningsSourceItem(rec.source ?? raw);
      return one ? [one] : [];
    });
  },

  // Correct a document's auto-detected type. `reportId` MUST be the source's
  // own `owning_report_id`, never the page's current session id — a GET
  // /sources row can belong to a different draft than the one this session
  // has open. Response is the lean ack shape ({report_id, document_id,
  // filing_type} per D-29) — NOT a full source row (no label/coverage/period),
  // so it's read directly here rather than run through
  // normalizeEarningsSourceItem, which would fabricate those missing fields.
  patchSourceType: (
    reportId: string,
    documentId: string,
    type: SourceUploadType,
  ): Promise<{ report_id: string; document_id: string; type: SourceUploadType | null }> =>
    request<unknown>(
      `/api/v1/earnings/reports/${encodeURIComponent(reportId)}/sources/${encodeURIComponent(documentId)}`,
      { method: "PATCH", body: { type } },
    ).then((raw) => {
      const o = earnRecord(raw);
      return {
        report_id: earnStr(o.report_id) ?? reportId,
        document_id: earnStr(o.document_id) ?? documentId,
        type: earnStr(o.filing_type) ?? earnStr(o.type) ?? type,
      };
    }),

  // Create the draft earnings report. JSON body (NOT multipart) carrying the
  // chosen document ids. Returns { report_id }. A duplicate active period may
  // surface as a 409 (not in the OpenAPI schema, but handled by callers).
  createEarningsReport: (
    payload: CreateEarningsReportPayload,
  ): Promise<CreateEarningsReportResponse> =>
    request<unknown>(`/api/v1/earnings/reports`, {
      method: "POST",
      body: payload,
    }).then(readCreatedEarningsReportId),

  // ── Dashboard — list a company's earnings reports (newest first) ──
  // company_id defaults to the caller's JWT company; pass it explicitly to match
  // the create contract. Optional status filter + limit (1–200, default 50).
  listEarningsReports: (
    companyId?: string,
    opts?: { status?: string; limit?: number },
    signal?: AbortSignal,
  ): Promise<EarningsReportsListResponse> =>
    request<unknown>(`/api/v1/earnings/reports`, {
      query: {
        ...(companyId ? { company_id: companyId } : {}),
        ...(opts?.status ? { status: opts.status } : {}),
        ...(opts?.limit != null ? { limit: opts.limit } : {}),
      },
      signal,
    }).then(normalizeEarningsReportsList),

  // A single report's true status/approval info. There's no singular GET
  // /earnings/reports/{id} endpoint — GET /sections doesn't carry status at
  // all (confirmed live: it returns only {report_id, sections}), so this is
  // the one place a report's real approved/locked state actually lives.
  getEarningsReportSummary: (
    companyId: string,
    reportId: string,
    signal?: AbortSignal,
  ): Promise<EarningsReportSummary | null> =>
    request<unknown>(`/api/v1/earnings/reports`, {
      query: { company_id: companyId },
      signal,
    })
      .then(normalizeEarningsReportsList)
      .then((res) => res.reports.find((r) => r.report_id === reportId) ?? null),

  // ── Part 2 — figures ──
  // The reviewed figure set for a report. Path takes report_id ONLY (no
  // company_id). The FIRST load triggers the backend resolve, so it may be slow.
  getEarningsFigures: (reportId: string, signal?: AbortSignal): Promise<EarningsFiguresResponse> =>
    request<unknown>(
      `/api/v1/earnings/reports/${encodeURIComponent(reportId)}/figures`,
      { signal },
    ).then(normalizeEarningsFigures),

  // Edit a single figure's value (+ optional unit). Returns the updated figure
  // (untyped → normalised defensively; also unwraps a `{ figure }` envelope).
  patchEarningsFigure: (
    reportId: string,
    figureId: string,
    body: EditEarningsFigurePayload,
  ): Promise<EarningsFigure> =>
    request<unknown>(
      `/api/v1/earnings/reports/${encodeURIComponent(reportId)}/figures/${encodeURIComponent(figureId)}`,
      { method: "PATCH", body },
    ).then((raw) => {
      const fig = normalizeEarningsFigure(earnRecord(raw).figure ?? raw);
      if (!fig) throw new Error("Edit earnings figure: response was not a figure.");
      return fig;
    }),

  // ── Part 3 — outline ──
  // The report outline (included + available sections). Path takes report_id ONLY
  // (no company_id), mirroring the figures endpoints. Response untyped → normalised.
  getEarningsOutline: (reportId: string, signal?: AbortSignal): Promise<EarningsOutlineResponse> =>
    request<unknown>(
      `/api/v1/earnings/reports/${encodeURIComponent(reportId)}/outline`,
      { signal },
    ).then(normalizeEarningsOutline),

  // Save the arrangement (inclusion + order). Returns the re-normalised outline
  // when the backend echoes it; callers may ignore the body. A 422 (e.g. a stale
  // include of an unavailable optional) throws ApiError for the caller to surface.
  saveEarningsOutline: (
    reportId: string,
    payload: SaveEarningsOutlinePayload,
  ): Promise<EarningsOutlineResponse> =>
    request<unknown>(
      `/api/v1/earnings/reports/${encodeURIComponent(reportId)}/outline`,
      { method: "PUT", body: payload },
    ).then(normalizeEarningsOutline),

  // Rename one FINANCIAL section for this report — the name then appears on the
  // Outline, on Figures, and as the heading and table-of-contents entry in the
  // exported PDF. An empty title clears the rename and puts the catalogue name
  // back. It cannot change which figures the section gets: the picker is prompted
  // with the catalogue name, never this one. Returns the rebuilt outline.
  renameEarningsSection: (
    reportId: string,
    sectionCode: string,
    title: string,
  ): Promise<EarningsOutlineResponse> =>
    request<unknown>(
      `/api/v1/earnings/reports/${encodeURIComponent(reportId)}` +
        `/outline/sections/${encodeURIComponent(sectionCode)}/title`,
      { method: "PATCH", body: { title } },
    ).then(normalizeEarningsOutline),

  // ── Figures (user-metrics lane) ──
  // A user-metrics quarterly report is built from the company's own workbook, so
  // its lines carry the workbook's labels and nothing canonical. Figures get into
  // an earnings report one way: the user asks for them, per section, in their own
  // words. Nothing is picked on their behalf.

  // The Figures screen: every table section with its prompt and its figures.
  getEarningsFigureSections: (
    reportId: string,
    signal?: AbortSignal,
  ): Promise<EarningsFigureSectionsResponse> =>
    request<EarningsFigureSectionsResponse>(
      `/api/v1/earnings/reports/${encodeURIComponent(reportId)}/figures/sections`,
      { signal },
    ),

  // Runs the model for ONE section with the user's prompt in the call. Results are
  // added to what the section already has, so searching again broadens it.
  searchSectionFigures: (
    reportId: string,
    sectionCode: string,
    prompt: string,
  ): Promise<EarningsSectionFiguresResponse> =>
    request(
      `/api/v1/earnings/reports/${encodeURIComponent(reportId)}/sections/` +
        `${encodeURIComponent(sectionCode)}/search-figures`,
      { method: "POST", body: { prompt } },
    ),

  // Sets exactly which lines a section carries — what the Add-figure picker saves,
  // and how one figure is removed. Scoped to the section.
  setSectionFigures: (
    reportId: string,
    sectionCode: string,
    lineIds: string[],
  ): Promise<EarningsSectionFiguresResponse> =>
    request(
      `/api/v1/earnings/reports/${encodeURIComponent(reportId)}/sections/` +
        `${encodeURIComponent(sectionCode)}/figures`,
      { method: "PUT", body: { line_ids: lineIds } },
    ),

  // Every line in the source report, for the Add-figure picker. A plain read —
  // sectionCode ticks what that section already holds.
  getEarningsSourceLines: (
    reportId: string,
    sectionCode?: string,
    signal?: AbortSignal,
  ): Promise<EarningsSourceLinesResponse> => {
    const qs = sectionCode ? `?section_code=${encodeURIComponent(sectionCode)}` : "";
    return request<EarningsSourceLinesResponse>(
      `/api/v1/earnings/reports/${encodeURIComponent(reportId)}/figures/source-lines${qs}`,
      { signal },
    );
  },

  // ── Cover template + brand colors ──
  // Same contract style as the quarterly picker, but earnings splits the current
  // selection into its own report-scoped GET (quarterly folds it into
  // cover-templates). Colors apply to accents/headings and reach the exported file.
  getEarningsCoverTemplates: (signal?: AbortSignal): Promise<CoverTemplatesResponse> =>
    request<CoverTemplatesResponse>(`/api/v1/earnings/cover-templates`, { signal }),

  getEarningsColorPalettes: (signal?: AbortSignal): Promise<ColorPalettesResponse> =>
    request<ColorPalettesResponse>(`/api/v1/earnings/color-palettes`, { signal }),

  // The report's current cover/brand selection (for pre-select on load).
  // cover_template_key is null until picked; brand has defaults applied. Works on
  // locked reports (read-only).
  getEarningsCoverSelection: (
    reportId: string,
    signal?: AbortSignal,
  ): Promise<CoverSelectionResponse> =>
    request<CoverSelectionResponse>(
      `/api/v1/earnings/reports/${encodeURIComponent(reportId)}/cover-template`,
      { signal },
    ),

  // Persist the chosen cover design + brand colors.
  saveEarningsCoverSelection: (
    reportId: string,
    body: CoverSelectionPayload,
  ): Promise<CoverSelectionResponse> =>
    request<CoverSelectionResponse>(
      `/api/v1/earnings/reports/${encodeURIComponent(reportId)}/cover-template`,
      { method: "PATCH", body },
    ),

  // ── Part 4/5 — preview & publish ──
  // The produced sections (cover + body) for a report. Report-scoped, untyped → normalised.
  // `includedOnly` → GET .../sections?included_only=true, so the preview shows
  // only the sections the user selected in the outline (only included sections
  // are ever produced anyway).
  getEarningsSections: (
    reportId: string,
    includedOnly = false,
    signal?: AbortSignal,
  ): Promise<EarningsSectionsResponse> =>
    request<unknown>(
      `/api/v1/earnings/reports/${encodeURIComponent(reportId)}/sections`,
      { query: includedOnly ? { included_only: true } : undefined, signal },
    ).then(normalizeEarningsSections),

  // Kick batch production of all included sections. Async 202-style → {run_id, poll_url};
  // poll with agentRuns.getByPollUrl, then re-fetch getEarningsSections on completion.
  produceEarningsReport: (reportId: string): Promise<EarningsProduceHandle> =>
    request<unknown>(
      `/api/v1/earnings/reports/${encodeURIComponent(reportId)}/produce`,
      { method: "POST", body: {} },
    ).then(readEarningsProduceHandle),

  // Build the whole report: search every financial section with the brief typed
  // on the Outline, then produce every section. One job, one poll, one loader --
  // this is what the Outline's Continue fires, and Preview opens finished.
  buildEarningsReport: (reportId: string): Promise<EarningsProduceHandle> =>
    request<unknown>(
      `/api/v1/earnings/reports/${encodeURIComponent(reportId)}/produce`,
      { method: "POST", body: { search_figures: true } },
    ).then(readEarningsProduceHandle),

  // Write the short commentary under one section's figures, or re-write it.
  // Cached server-side on a fingerprint of the table, model, prompt, tone and
  // language, so re-opening a section costs nothing; force is "write it again".
  analyseEarningsSection: (
    reportId: string,
    sectionCode: string,
    opts: { force?: boolean; signal?: AbortSignal } = {},
  ): Promise<unknown> =>
    request<unknown>(
      `/api/v1/earnings/reports/${encodeURIComponent(reportId)}` +
        `/sections/${encodeURIComponent(sectionCode)}/analyse`,
      { method: "POST", body: { force: !!opts.force }, signal: opts.signal },
    ),

  // Save an edited analysis, or clear it with an empty string. Marks it edited,
  // which stops the cache serving our words over the user's.
  saveEarningsSectionAnalysis: (
    reportId: string,
    sectionCode: string,
    text: string,
  ): Promise<unknown> =>
    request<unknown>(
      `/api/v1/earnings/reports/${encodeURIComponent(reportId)}` +
        `/sections/${encodeURIComponent(sectionCode)}/analysis`,
      { method: "PATCH", body: { text } },
    ),

  // Mark a section's figures as done with, or undo it — and store the
  // expectations typed against them, all in this one request.
  //
  // The expectations ride along here rather than having an endpoint of their
  // own. Preview holds them locally while the user types, because a consensus
  // table gets a dozen numbers entered and half of them changed, and none of it
  // is meant until the user says the section is done. One write at that moment.
  //
  // `expectations` maps a figure id to its expected value, or to null to clear
  // one. Omit it entirely when only the bookmark is moving.
  finaliseEarningsSectionFigures: (
    reportId: string,
    sectionCode: string,
    finalised: boolean,
    expectations?: Record<string, number | null>,
  ): Promise<unknown> =>
    request<unknown>(
      `/api/v1/earnings/reports/${encodeURIComponent(reportId)}` +
        `/sections/${encodeURIComponent(sectionCode)}/finalise-figures`,
      { method: "PATCH", body: { finalised, ...(expectations ? { expectations } : {}) } },
    ),

  // Produce ONLY the sections that can be built before a figure exists — the
  // CEO quote, guidance, the disclaimer, the IR calendar. This is what the
  // Outline's Continue fires, so the wait before Preview buys the user readable
  // narrative instead of buying nothing. Same 202 + poll shape as produce-all.
  produceEarningsFigureFreeSections: (reportId: string): Promise<EarningsProduceHandle> =>
    request<unknown>(
      `/api/v1/earnings/reports/${encodeURIComponent(reportId)}/produce`,
      { method: "POST", body: { figure_free_only: true } },
    ).then(readEarningsProduceHandle),

  // Run (or re-run) one section, synchronously. Backs both the Run button on a
  // section that has never been produced and Regenerate on one that has;
  // `regenerate` bypasses the produce cache so a re-run is a real re-run.
  runEarningsSection: (
    reportId: string,
    sectionCode: string,
    regenerate = false,
  ): Promise<EarningsSectionPatch> =>
    request<unknown>(
      `/api/v1/earnings/reports/${encodeURIComponent(reportId)}/sections/${encodeURIComponent(sectionCode)}/produce`,
      { method: "POST", body: { regenerate } },
    ).then((raw) => {
      const patch = readEarningsSectionPatch(earnRecord(raw).section ?? raw);
      if (!patch) throw new Error("Run earnings section: response was not a section.");
      return patch;
    }),

  // Save a user's manual input for a needs_input section (typed directly, or
  // edited after extractSectionInput prefilled it from an uploaded file).
  // Reuses the section-produce route — the backend turns the raw text into
  // this section's actual mode-appropriate content (table/kpi sections still
  // need structured data, not just a stored string) and flips its feeder to
  // ready. NOT called for a bare regenerate — there's no button for that
  // anymore; this is the "Save" action on the needs-input form only.
  produceEarningsSection: (
    reportId: string,
    sectionCode: string,
    body: { user_input: string },
  ): Promise<EarningsProducedSection> =>
    request<unknown>(
      `/api/v1/earnings/reports/${encodeURIComponent(reportId)}/sections/${encodeURIComponent(sectionCode)}/produce`,
      { method: "POST", body },
    ).then((raw) => {
      const sec = normalizeEarningsSection(earnRecord(raw).section ?? raw);
      if (!sec) throw new Error("Produce earnings section: response was not a section.");
      return sec;
    }),

  // Extract text from an uploaded document to PREFILL the needs-input textarea
  // — never saves anything on its own; the user reviews/edits the result and
  // Save (produceEarningsSection) is the actual persist step. Route/shape
  // TODO(Step 0): confirm live — proposed in the backend spec for this feature.
  extractSectionInput: (
    reportId: string,
    sectionCode: string,
    file: File,
  ): Promise<string> => {
    const fd = new FormData();
    fd.append("file", file);
    return request<unknown>(
      `/api/v1/earnings/reports/${encodeURIComponent(reportId)}/sections/${encodeURIComponent(sectionCode)}/extract-input`,
      { method: "POST", form: fd },
    ).then((raw) => {
      const o = earnRecord(raw);
      const text = earnStr(o.extracted_text) ?? earnStr(o.text) ?? earnStr(o.content);
      if (text == null) throw new Error("Extract section input: response carried no extracted text.");
      return text;
    });
  },

  // Inline-edit a produced section's content. Unwraps a { section } envelope.
  patchEarningsSectionContent: (
    reportId: string,
    sectionCode: string,
    body: SaveEarningsSectionContentPayload,
    // A PATCH answers for the fields it owns — content, status, violations. Read
    // as a whole section it invented a title (falling back to the section CODE),
    // display_order 0 and mode 'generate' for everything absent, and the caller
    // spread those over the real section. Same defect the run endpoint had.
  ): Promise<EarningsSectionPatch> =>
    request<unknown>(
      `/api/v1/earnings/reports/${encodeURIComponent(reportId)}/sections/${encodeURIComponent(sectionCode)}/content`,
      { method: "PATCH", body },
    ).then((raw) => {
      const sec = readEarningsSectionPatch(earnRecord(raw).section ?? raw);
      if (!sec) throw new Error("Edit earnings section: response was not a section.");
      return sec;
    }),

  // Have the model rewrite one narrative section from a free-text instruction.
  // One LLM call server-side, and it only re-words the prose already stored --
  // producing the section again is what Regenerate is for. 422 the section is a
  // table (nothing to rewrite) or the instruction is missing/too long · 409 the
  // section is empty, or the report is locked · 502 the model returned nothing,
  // in which case the stored text is untouched and a retry is safe.
  //
  // Deliberately NOT run through normalizeEarningsSection: the response carries
  // only what changed, and the normaliser would default mode/source_type/title
  // back over the real ones (the trap EarningsReportPage.tsx documents). The
  // caller merges these three fields and nothing else.
  refineEarningsSection: (
    reportId: string,
    sectionCode: string,
    instruction: string,
  ): Promise<{
    section_code: string;
    content: string | null;
    status: string;
    grounding_violations: string[];
  }> =>
    request<unknown>(
      `/api/v1/earnings/reports/${encodeURIComponent(reportId)}/sections/${encodeURIComponent(sectionCode)}/refine`,
      { method: "POST", body: { instruction } },
    ).then((raw) => {
      const o = earnRecord(raw).section ? earnRecord(earnRecord(raw).section) : earnRecord(raw);
      const code = earnStr(o.section_code) ?? sectionCode;
      const content = typeof o.content === "string" ? o.content : null;
      if (content == null) throw new Error("Refine: the server returned no text.");
      return {
        section_code: code,
        content,
        status: earnStr(o.status) ?? "produced",
        grounding_violations: Array.isArray(o.grounding_violations)
          ? o.grounding_violations.filter((v): v is string => typeof v === "string")
          : [],
      };
    }),

  // Approve & lock. On a gate failure the backend throws a 409 whose ApiError.body
  // carries the blocker list (read defensively in the UI).
  approveEarningsReport: (reportId: string): Promise<unknown> =>
    request<unknown>(
      `/api/v1/earnings/reports/${encodeURIComponent(reportId)}/approve`,
      { method: "POST", body: {} },
    ),

  // Export DOCX/PDF. Binary response → bypass request<T>() (which parses JSON) and
  // use fetchWithAuth + blob, mirroring quarterlyReports.downloadExport. Prefers the
  // server Content-Disposition filename when present.
  downloadEarningsExport: async (
    reportId: string,
    format: EarningsExportFormat,
    filename?: string,
  ): Promise<void> => {
    const res = await fetchWithAuth(
      `/api/v1/earnings/reports/${encodeURIComponent(reportId)}/export`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ format }) },
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
    // Prefer the server-provided filename (Content-Disposition), else synthesize one.
    const cd = res.headers.get("Content-Disposition") ?? "";
    const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(cd);
    const serverName = match ? decodeURIComponent(match[1].trim()) : null;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = serverName || `${(filename || "earnings-report").replace(/[^\w.-]+/g, "_")}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

// ---------------------------------------------------------------------------
// Board of Directors' Report — /api/v1/board.
//
// Unlike quarterly/earnings, the 46-section registry and the profile→section
// resolution live server-side: the client PATCHes a profile and renders whatever
// outline comes back. Two endpoints are async (202 + poll_url): document upload
// and batch produce. Everything is company-scoped — another company's report is
// a 404, never a 403.
// ---------------------------------------------------------------------------

const BOARD_BASE = "/api/v1/board/reports";
const boardPath = (reportId: string, suffix = "") =>
  `${BOARD_BASE}/${encodeURIComponent(reportId)}${suffix}`;

export const boardReports = {
  // 409 when an unfinished report already exists for that company + year; the
  // body carries `existing_report_id` so the caller can offer "continue".
  createReport: (body: CreateBoardReportPayload) =>
    request<BoardReportSummary>(BOARD_BASE, { method: "POST", body }),

  listReports: (companyId: string) =>
    request<BoardReportListResponse>(BOARD_BASE, { query: { company_id: companyId } }),

  // One report by id. `locked` comes precomputed — don't re-derive it from status.
  getReport: (reportId: string, signal?: AbortSignal) =>
    request<BoardReportDetail>(boardPath(reportId), { signal }),

  getProfile: (reportId: string, signal?: AbortSignal) =>
    request<BoardProfileResponse>(boardPath(reportId, "/profile"), { signal }),

  // Re-resolves and re-saves the WHOLE outline server-side — refetch the outline
  // (and the sources, whose slots derive from issuer_type) after every call.
  patchProfile: (reportId: string, body: BoardIssuerProfile) =>
    request<BoardProfileResponse>(boardPath(reportId, "/profile"), { method: "PATCH", body }),

  getSources: (reportId: string, signal?: AbortSignal) =>
    request<BoardSourcesResponse>(boardPath(reportId, "/sources"), { signal }),

  // One call, one run, every staged file extracted concurrently. `files` and
  // `slots` are repeated fields matched BY POSITION — the nth file is filed
  // under the nth slot, so they must be appended in lockstep.
  //
  // Only one job may run per report, so uploading slot-by-slot would 409 on the
  // second call. The UI stages the picks and submits them together.
  //
  // 202 → poll the returned poll_url. Deliberately NOT routed through
  // postPipeline(): that normalises a 409 into a handle, which would hide the
  // `existing_run_id` the caller wants to surface.
  //
  // `sectionCode` is set only by the per-section upload on the Review step,
  // where one document is supplied for one named section. The Sources screen
  // uploads across many slots at once and sends none.
  uploadSources: (
    reportId: string,
    staged: { slot: string; file: File }[],
    sectionCode?: string,
  ) => {
    const fd = new FormData();
    staged.forEach(({ slot, file }) => {
      fd.append("files", file);
      fd.append("slots", slot);
    });
    if (sectionCode) fd.append("section_code", sectionCode);
    return request<BoardRunHandle>(boardPath(reportId, "/sources/upload"), {
      method: "POST",
      form: fd,
    });
  },

  // Clears the slot tag only — the document stays in the company's document
  // bank, so "replace" is delete-then-upload and nothing is destroyed.
  deleteSourceDocument: (reportId: string, documentId: string) =>
    request<unknown>(
      boardPath(reportId, `/sources/${encodeURIComponent(documentId)}`),
      { method: "DELETE" },
    ),

  // Returns all 46 sections including the non-applicable ones, so the UI can
  // grey them rather than have them vanish. Built and saved lazily on first call.
  getOutline: (reportId: string, signal?: AbortSignal) =>
    request<BoardOutlineResponse>(boardPath(reportId, "/outline"), { signal }),

  // Array order IS display order. Mandatory sections are force-included
  // silently; including a dropped/na section is a 422 and nothing is saved.
  saveOutline: (reportId: string, body: BoardOutlineSavePayload) =>
    request<BoardOutlineResponse>(boardPath(reportId, "/outline"), { method: "PUT", body }),

  // Synchronous, and cached — `cached: true` means nothing it depends on changed
  // and no LLM call was made. 422 when the section has no producer yet.
  produceSection: (reportId: string, sectionCode: string, regenerate = false) =>
    request<BoardProduceSectionResponse>(
      boardPath(reportId, `/sections/${encodeURIComponent(sectionCode)}/produce`),
      { method: "POST", query: { regenerate } },
    ),

  // 202 → poll; `output_summary` carries {produced, skipped, failed, total}.
  produceAll: (reportId: string) =>
    request<BoardRunHandle>(boardPath(reportId, "/produce"), { method: "POST" }),

  getSections: (reportId: string, signal?: AbortSignal) =>
    request<BoardSectionsResponse>(boardPath(reportId, "/sections"), { signal }),

  // A human edit is authoritative: the section becomes produced/updated and the
  // cache key is cleared, so the next produce sees changed input rather than
  // serving the cache over the edit.
  patchSectionContent: (reportId: string, sectionCode: string, content: string) =>
    request<BoardSection>(
      boardPath(reportId, `/sections/${encodeURIComponent(sectionCode)}/content`),
      { method: "PATCH", body: { content } },
    ),

  // Have the model rewrite a narrative section to a free-text instruction.
  // Narrative content is now lifted verbatim from the source document, so this
  // is how a reviewer turns extracted text into prose. Returns the rewritten
  // section. 422 not refinable · 409 no content yet · 502 the model returned
  // nothing (keep the existing text and offer a retry).
  refineSection: (reportId: string, sectionCode: string, instruction: string) =>
    request<BoardSection>(
      boardPath(reportId, `/sections/${encodeURIComponent(sectionCode)}/refine`),
      { method: "POST", body: { instruction } },
    ),

  getCompletion: (reportId: string, signal?: AbortSignal) =>
    request<BoardCompletion>(boardPath(reportId, "/completion"), { signal }),

  // Confirms a carried-forward section is still accurate — the check that stops
  // last year's board list going out as this year's. 409 if it wasn't carried
  // forward, i.e. there was nothing to confirm.
  confirmSection: (reportId: string, sectionCode: string) =>
    request<BoardSection>(
      boardPath(reportId, `/sections/${encodeURIComponent(sectionCode)}/confirm`),
      { method: "POST" },
    ),

  // 409 while completion.can_approve is false — and the error body IS the
  // completion payload, so the caller can list exactly what is missing.
  approve: (reportId: string) =>
    request<unknown>(boardPath(reportId, "/approve"), { method: "POST" }),

  // The cover design + colours already saved on this report, so the picker
  // opens on the current choice rather than blank.
  // `cover_template_key` is null until the user picks one; `brand` always comes
  // back with real hex. Safe to call on an approved report.
  getCoverTemplate: (reportId: string, signal?: AbortSignal) =>
    request<Partial<CoverSelectionResponse>>(boardPath(reportId, "/cover-template"), { signal }),

  // Cover design + brand colours, same payload shape as the quarterly picker
  // (`PATCH .../cover-template`). The catalogue and palettes themselves are
  // company-scoped, so the board step reuses quarterlyReports.getCoverTemplates.
  // Answers {report_id, generation_config} — not the selection — so the caller
  // keeps what the user picked rather than reading it back. 409 once the report
  // is approved; 422 on an unknown template key or a bad colour.
  selectCoverTemplate: (reportId: string, body: CoverSelectionPayload) =>
    request<Partial<CoverSelectionResponse>>(boardPath(reportId, "/cover-template"), {
      method: "PATCH",
      body,
    }),

  // The same dict the exporter renders, so the preview and the PDF can't drift.
  getAssemble: (reportId: string, signal?: AbortSignal) =>
    request<BoardAssembleResponse>(boardPath(reportId, "/assemble"), { signal }),

  // Binary response → bypass request<T>() (which parses JSON) and use
  // fetchWithAuth + blob, mirroring earnings.downloadEarningsExport. Unlike
  // earnings, `format` is a query param rather than a JSON body.
  downloadExport: async (
    reportId: string,
    format: BoardExportFormat,
    filename?: string,
  ): Promise<void> => {
    const res = await fetchWithAuth(
      `${boardPath(reportId, "/export")}?format=${encodeURIComponent(format)}`,
      { method: "POST" },
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
    const cd = res.headers.get("Content-Disposition") ?? "";
    const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(cd);
    const serverName = match ? decodeURIComponent(match[1].trim()) : null;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = serverName || `${(filename || "board-report").replace(/[^\w.-]+/g, "_")}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
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
  // One general thread and one private thread per person, per report.
  // Which flag disables the row depends on the Private tickbox.
  has_general_thread: boolean;
  has_my_private_thread: boolean;
  // "cycle" → this row is a reporting cycle with no annual report behind it
  // yet, and `id` is the cycle's. Starting a thread on it creates that report
  // server-side; nothing else here needs to know. Absent on real reports.
  source?: 'cycle';
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
  // Presentation fields — use directly, no client-side role mapping.
  display_role: string;
  initials: string;
  department: string | null;
}

export interface CommunicationMembersResponse {
  members: CommunicationMember[];
}

// A thread is either on a report (report_id set) or ad-hoc (subject set
// instead) — 422 if neither is given. Omit report_id entirely for an ad-hoc
// thread rather than sending null.
export interface StartThreadBody {
  report_id?: string;
  subject?: string;
  message: string;
  // Members' `id` UUIDs (NOT their usr_ `user_id`). Empty array if none.
  // On a private thread these people ARE the members — 422 if empty.
  mentioned_user_ids: string[];
  // Only the mentioned people can see the thread. Omit for a normal thread.
  is_private?: boolean;
}

export interface CommunicationThread {
  id: string;
  company_id: string;
  report_id: string | null;
  subject: string | null;
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

// POST /ad-hoc/draft — stateless; nothing is saved. Call again to regenerate
// before the user commits. The resulting text becomes StartThreadBody.message
// verbatim (edited or not) when the user posts the ad-hoc thread.
export interface GenerateAdHocDraftResponse {
  draft: string;
}

// ── Communication Hub list (Communication tab) ────────────────────────────

// Where a report's CONTENT stands, which `status` does not answer: status is
// the review workflow (who shared it, who signed it off), so a Draft report and
// an In review one both land on an empty page when nothing was ever written.
//
// `ready` means APPROVED, not written — board and quarterly approve enforce no
// completeness check. Don't label it "complete" in the UI.
//
// An unrecognised future `state` should be treated as not_applicable rather
// than crashing the card.
export interface ReportGeneration {
  state: 'ready' | 'not_ready' | 'in_progress' | 'not_applicable';
  // Annual only — its sections live in the reporting-cycles system, which
  // counts them. null for every other type, so never render a bar off these
  // without checking. `percent` is a whole number.
  done: number | null;
  total: number | null;
  percent: number | null;
  // Ids and a kind, never a URL — the backend has no view of our routes.
  // See generationHref() in @/lib/reportRoutes.
  target: {
    kind:
      | 'quarterly_report'
      | 'board_report'
      | 'earnings_report'
      | 'annual_cycle'
      | 'esg_page'
      | null;
    company_id: string;
    // Module lanes only.
    report_id?: string;
    // Annual only, and NOT the report id — an annual `reports` row is a shell
    // pointing at a cycle; navigating to the report id lands on an empty page.
    cycle_id?: string;
  };
}

export interface ThreadReport {
  id: string;
  report_type: string;
  // Display strings — use directly; report_type/status are the raw codes.
  type_label: string;
  period: string;
  title: string;
  status: string;
  status_label: string;
  // Always present when `report` itself is non-null (it is null on an ad-hoc
  // thread) — every report type resolves to one of the four states.
  generation: ReportGeneration;
}

// The person who STARTED the thread (confirmed with the backend) — not the
// report's owner, even on a report thread. `can_add_members` is true only for
// them on a private thread.
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
// don't re-sort. `owner` and `last_message` can both be null. Exactly one of
// `report` / `subject` is set — null report + non-null subject means an
// ad-hoc thread; render `subject` as the title and skip report-only UI
// (status pill, review actions) in that case.
export interface ThreadSummary {
  thread_id: string;
  report: ThreadReport | null;
  subject: string | null;
  // Private threads you're not a member of never appear in the list at all.
  is_private: boolean;
  // Non-null once you've been removed — the row stays, read-only.
  removed_at: string | null;
  owner: ThreadOwner | null;
  // Added alongside the review flow; null when the report isn't out for review
  // (always null for ad-hoc threads — review doesn't apply to them).
  assignment: ReviewAssignment | null;
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

// `kind` drives the bubble: "system" lines are rendered with a muted avatar and
// name the actor (`sender`) — who added or removed someone; "user" renders as a
// person;
// "attachment" also renders as a person (the uploader) but with `attachment`
// rendered as a file chip instead of `body` as plain text.
export type ThreadMessageKind = 'system' | 'user' | 'attachment';

// download_url is short-lived/signed, same convention as documents.list etc.
export interface ThreadAttachment {
  id: string;
  filename: string;
  file_size_bytes: number;
  content_type?: string | null;
  download_url: string;
}

export interface ThreadMessage {
  id: string;
  kind: ThreadMessageKind;
  sender: MessageSender;
  body: string;
  mentioned_user_ids: string[];
  created_at: string;
  // Only present on kind === "attachment" messages.
  attachment?: ThreadAttachment | null;
}

// Who the report is currently out for review with. `label` is the snapshotted
// authority title ("Board Chairman") — display-only, not a backend entity.
export interface ReviewAssignment {
  id: string;
  user_id: string;
  full_name: string;
  label: string | null;
  is_you: boolean;
  assigned_at: string;
}

// A member of a private thread. `id` is the users.id UUID the member endpoints
// take; `user_id` is the usr_… string (matches MessageSender.user_id) and is
// what membership comparisons against the mention picker go through.
export interface ThreadMemberSummary {
  // The users.id UUID — what BOTH member endpoints take. Not `user_id`: the
  // usr_… string won't resolve and comes back 403.
  id: string;
  user_id: string;
  full_name: string;
  role: string;
  is_you: boolean;
}

// Both member calls return this — drop it straight into the strip.
export interface ThreadMembersResponse {
  members: ThreadMemberSummary[];
  can_add_members: boolean;
}

export interface ThreadDetail {
  thread_id: string;
  report: ThreadReport | null;
  subject: string | null;
  is_private: boolean;
  // When you were removed from this thread. null = current member. Non-null
  // means read-only: the backend still serves the thread, cut off at that
  // moment, and 403s every write.
  removed_at: string | null;
  // [] on a public thread — render the members strip off this alone, no need
  // to check is_private first.
  members: ThreadMemberSummary[];
  // True only for the creator of a private thread; false for its other members
  // and on every public thread. Gates who may pull a non-member in.
  can_add_members: boolean;
  owner: ThreadOwner | null;
  assignment: ReviewAssignment | null;
  // True only for the assigned reviewer — gates "Open as reviewer". Always
  // false for ad-hoc threads (report === null) — the review endpoints
  // themselves 422 on those, so don't surface any review UI when report is null.
  can_review: boolean;
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

export interface UploadAttachmentResponse {
  message: ThreadMessage;
}

// POST .../send-external — works on any thread (ad-hoc or report-based).
// `body` omitted defaults server-side to the thread's latest message.
export interface SendExternalBody {
  subject: string;
  recipients: ComposeRecipient[];
  audience_label?: string;
  body?: string | null;
}

export interface SendExternalResponse {
  send: EmailSend;
  recipient_count: number;
  delivery_status: 'sent' | 'failed' | 'skipped' | null;
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

// ── Report review & approval ──────────────────────────────────────────────
// The four UI states map straight onto reports.status. `locked`/`published`
// also exist on finished reports — show via status_label and treat the panel
// as read-only (can_set_status: false).
export type ReportReviewStatus = 'draft' | 'in_review' | 'pending_approval' | 'approved';

// Radio options for the hub panel — render from the API, never hardcode.
export interface ReportStatusOption {
  code: string;
  label: string;
  hint: string;
}

export interface ReportHubResponse {
  report: ThreadReport;
  statuses: ReportStatusOption[];
  // False once locked/published — render the panel read-only.
  can_set_status: boolean;
  owner: ThreadOwner | null;
  // Null until the report has been shared.
  thread_id: string | null;
  assignment: ReviewAssignment | null;
  can_review: boolean;
  unread_count: number;
}

export interface SetReportStatusResponse {
  report_id: string;
  status: string;
  status_label: string;
}

export interface ShareReportBody {
  // A users.id UUID from GET /communications/members — never a usr_ user_id.
  assigned_to: string;
  // Free-text authority title, snapshotted on the thread ("Board Chairman").
  assigned_label?: string;
  comment?: string;
}

// Share returns the full review-thread payload, so the thread modal can paint
// straight from it without a second request.
export interface ShareReportResponse extends ThreadDetailResponse {
  report_status: string;
}

// ── Reviewer view ─────────────────────────────────────────────────────────

export interface ReviewSection {
  id: string;
  // The number badge next to each heading.
  order: number;
  title: string;
  type: string;
}

export interface ReviewCommentAuthor {
  full_name: string;
  initials: string;
  is_you: boolean;
}

export interface ReviewComment {
  id: string;
  // Null for a comment on the report as a whole.
  section_id: string | null;
  section_title: string | null;
  author: ReviewCommentAuthor;
  body: string;
  resolved: boolean;
  created_at: string;
}

export interface ReviewViewResponse {
  thread_id: string;
  report: ThreadReport;
  owner: { full_name: string; is_you: boolean } | null;
  assignment: ReviewAssignment | null;
  // can_act = you are the assigned reviewer. can_approve additionally requires
  // the report to be in review — show Approve disabled, not hidden, when
  // can_act && !can_approve.
  can_act: boolean;
  can_approve: boolean;
  // Same flag the thread payload carries: non-null → you were removed, so the
  // screen is read-only. `can_comment` is the derived form — use that.
  removed_at: string | null;
  can_comment: boolean;
  // Empty when the narrative hasn't been generated — hide the per-section rail.
  sections: ReviewSection[];
  comments: ReviewComment[];
  // Same comments keyed by section_id; report-level ones sit under "null".
  comments_by_section: Record<string, ReviewComment[]>;
}

export interface CreateReviewCommentBody {
  section_id?: string | null;
  section_title?: string | null;
  body: string;
}

export interface CreateReviewCommentResponse {
  comment: ReviewComment;
}

export interface ReassignReviewBody {
  assigned_to: string;
  assigned_label?: string;
}

export interface ReassignReviewResponse {
  thread_id: string;
  assigned_to: string;
  assigned_label: string | null;
  full_name: string;
}

export interface ApproveReviewResponse {
  report_id: string;
  status: string;
  status_label: string;
  approved_at: string;
}

export interface SendBackReviewResponse {
  report_id: string;
  status: string;
  status_label: string;
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
  // Add people to a private thread. Creator only (403 otherwise); idempotent —
  // re-adding an existing member is a 200 that changes nothing. The
  // "X added Y" system line lands on the next message fetch, not in here.
  addThreadMembers: (threadId: string, userIds: string[]) =>
    request<ThreadMembersResponse>(
      `/api/v1/communications/threads/${encodeURIComponent(threadId)}/members`,
      { method: "POST", body: { user_ids: userIds } },
    ),

  // Remove one person. `userId` is the users.id UUID, NOT the usr_ `user_id`
  // on ThreadMemberSummary. Creator only · 422 removing yourself, or the last
  // other person, or on a public thread · 404 if you're not in the thread.
  removeThreadMember: (threadId: string, userId: string) =>
    request<ThreadMembersResponse>(
      `/api/v1/communications/threads/${encodeURIComponent(threadId)}/members/${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    ),

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

  // Attach a document to a thread. Returns the kind:"attachment" message the
  // backend created for it — append it to the message list the same way as
  // sendMessage's response, no refetch needed. 422 → bad file type / empty /
  // too large. 404 → thread gone / not accessible.
  uploadAttachment: (threadId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return postForm<UploadAttachmentResponse>(
      `/api/v1/communications/threads/${encodeURIComponent(threadId)}/attachments`,
      form,
    );
  },

  // Stateless draft generation for the "Draft with AI" ad-hoc flow — nothing
  // is saved server-side, so call again to regenerate. document, if given,
  // must be PDF/DOCX (other types 422 here but can still be attached to the
  // thread afterwards via uploadAttachment). 422 → blank instructions,
  // unsupported/empty file, or a document the AI couldn't extract text from.
  generateAdHocDraft: (params: { instructions: string; sourceText?: string; document?: File }) => {
    const form = new FormData();
    form.append("instructions", params.instructions);
    if (params.sourceText) form.append("source_text", params.sourceText);
    if (params.document) form.append("document", params.document);
    return postForm<GenerateAdHocDraftResponse>("/api/v1/communications/ad-hoc/draft", form);
  },

  // All threadless reports + the type pills. `type` narrows only the reports
  // list; the pills always reflect the full unfiltered set.
  threadlessReports: (type?: string) =>
    request<ThreadlessReportsResponse>(
      "/api/v1/communications/threadless-reports",
      { query: type ? { type } : undefined },
    ),

  // Company members. With `reportId` the list narrows to people who can open
  // that report (404 if it isn't in your company) — that's the assign/reassign
  // picker. The @mention picker passes nothing and gets every active member.
  members: (reportId?: string) =>
    request<CommunicationMembersResponse>("/api/v1/communications/members", {
      query: reportId ? { report_id: reportId } : undefined,
    }),

  // Start a thread on a report with a first message + optional mentions.
  startThread: (body: StartThreadBody) =>
    request<StartThreadResponse>("/api/v1/communications/threads", {
      method: "POST",
      body,
    }),

  // Works on any thread (ad-hoc or report-based). 422 → blank subject or no
  // recipients. 404 → thread gone / not in your company. Logs a system
  // message onto the thread — refetch getThread() to show it.
  sendExternal: (threadId: string, body: SendExternalBody) =>
    request<SendExternalResponse>(
      `/api/v1/communications/threads/${encodeURIComponent(threadId)}/send-external`,
      { method: "POST", body },
    ),

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

  // ── Report review & approval ─────────────────────────────────────────────
  // One call renders the whole hub side rail. Re-fetch after any action below.
  // 404 → report not in your company.
  reportHub: (reportId: string) =>
    request<ReportHubResponse>(
      `/api/v1/communications/reports/${encodeURIComponent(reportId)}/hub`,
    ),

  // 403 → "approved" isn't settable here (approve from the reviewer view so a
  // sign-off is recorded). 422 → outside draft/in_review/pending_approval.
  // 409 → report locked or published.
  setReportStatus: (reportId: string, status: string) =>
    request<SetReportStatusResponse>(
      `/api/v1/communications/reports/${encodeURIComponent(reportId)}/status`,
      { method: "PATCH", body: { status } },
    ),

  // Creates or reuses the thread, assigns the reviewer, posts the system line
  // and your comment, moves the report to in_review, notifies the reviewer.
  // Sharing twice is expected (reassignment / a second round).
  // 422 → assigned_to is you · 403 → not an active member · 404 → no report.
  shareReport: (reportId: string, body: ShareReportBody) =>
    request<ShareReportResponse>(
      `/api/v1/communications/reports/${encodeURIComponent(reportId)}/share`,
      { method: "POST", body },
    ),

  // An annual report's written body for the reviewer screen. Annual reports are
  // written in the reporting-cycles system, so this reads cycle_report_sections
  // rather than a per-report table — same envelope as the earnings sections
  // endpoint, keyed on the section_code the review payload emits as each
  // section's `id`. 422 for any other report type.
  reviewAnnualSections: (reportId: string) =>
    request<EarningsSectionsResponse>(
      `/api/v1/communications/reports/${encodeURIComponent(reportId)}/annual-sections`,
    ),

  // Reviewer screen: sections, comments, and the action gates. Any company
  // member may read this — only the write calls below are restricted.
  reviewView: (threadId: string) =>
    request<ReviewViewResponse>(
      `/api/v1/communications/threads/${encodeURIComponent(threadId)}/review`,
    ),

  // Open to any company member. Omit both section fields for a report-level
  // comment. 422 → empty body, or a section_id not in this report.
  addReviewComment: (threadId: string, body: CreateReviewCommentBody) =>
    request<CreateReviewCommentResponse>(
      `/api/v1/communications/threads/${encodeURIComponent(threadId)}/comments`,
      { method: "POST", body },
    ),

  // After this the caller is no longer the reviewer — re-fetch and expect
  // can_act: false. 403 → not the reviewer · 422 → same person · 409 → unassigned.
  reassignReview: (threadId: string, body: ReassignReviewBody) =>
    request<ReassignReviewResponse>(
      `/api/v1/communications/threads/${encodeURIComponent(threadId)}/reassign`,
      { method: "POST", body },
    ),

  // The sign-off that unblocks publishing. 403 → not the assigned reviewer
  // (admins included) · 409 → report not in review, or thread unassigned.
  approveReview: (threadId: string, note?: string) =>
    request<ApproveReviewResponse>(
      `/api/v1/communications/threads/${encodeURIComponent(threadId)}/approve`,
      { method: "POST", body: note ? { note } : {} },
    ),

  // Note is REQUIRED (422 if blank). Returns the report to draft and hands the
  // review back to the report's owner — the person who shared it — so it is a
  // reassignment, not an unassignment. 403 → not the reviewer · 409 → report
  // locked/published.
  sendBackReview: (threadId: string, note: string) =>
    request<SendBackReviewResponse>(
      `/api/v1/communications/threads/${encodeURIComponent(threadId)}/send-back`,
      { method: "POST", body: { note } },
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

  // Reveal the temp password of a user who hasn't set their own yet. Its own
  // call rather than a field on `listUsers` so a live credential only leaves
  // the server when an admin actually asks (and the read can be audited).
  // Only worth calling when the row says `has_temp_password`; a user who has
  // since rotated 409s, and ApiError carries the backend's explanation.
  getTempPassword: (userId: string) =>
    request<TempPasswordResponse>(
      `/api/v1/admin/users/${encodeURIComponent(userId)}/temp-password`,
    ),

  // Issue a fresh temp password: invalidates the old one, re-emails it, and
  // returns it so the admin can still hand it over if delivery failed. 409s
  // for a user with their own password — they go through "Forgot password".
  regenerateTempPassword: (userId: string) =>
    request<RegenerateTempPasswordResponse>(
      `/api/v1/admin/users/${encodeURIComponent(userId)}/regenerate-password`,
      { method: "POST" },
    ),

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

// Per-user feature-permission grants — additive-only on top of a user's role
// defaults, distinct from the role-keyed matrix above (getPermissions/
// savePermissions, which is a separate, older system: manage_users_roles etc).
// A grant/revoke here only takes effect on the target user's NEXT login.
export const adminUserPermissions = {
  get: (userId: string) =>
    request<UserPermissionsResponse>(
      `/api/v1/admin/users/${encodeURIComponent(userId)}/permissions`,
    ),

  grant: (userId: string, featureKey: string, action: string) =>
    request<unknown>(
      `/api/v1/admin/users/${encodeURIComponent(userId)}/permissions`,
      { method: "POST", body: { feature_key: featureKey, action } },
    ),

  revoke: (userId: string, featureKey: string, action: string) =>
    request<unknown>(
      `/api/v1/admin/users/${encodeURIComponent(userId)}/permissions/${encodeURIComponent(featureKey)}/${encodeURIComponent(action)}`,
      { method: "DELETE" },
    ),
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
  const claims = parseJwtPayload<
    {
      company_id?: string | null;
      onboarding_completed?: boolean | null;
    } & JwtPermissionClaims
  >(res.access_token);
  if (user.company_id == null && claims && "company_id" in claims) {
    user.company_id = claims.company_id;
  }
  user.onboarding_completed =
    res.onboarding_completed ?? claims?.onboarding_completed ?? null;

  // Feature/app permission system — computed once at login, baked into both
  // the response and the JWT. Prefer the response field, fall back to the
  // claim, same pattern as company_id above.
  user.permissions = res.permissions ?? claims?.permissions ?? null;
  user.visible_features = res.visible_features ?? claims?.visible_features ?? null;
  user.apps = res.apps ?? claims?.apps ?? null;
  user.default_app = res.default_app ?? claims?.default_app ?? null;

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
    // Nothing to backfill if every field a prior session might be missing is
    // already present. `visible_features` is checked by key presence, not
    // nullish, since a legitimate empty array (a fully-locked-out user) must
    // not be mistaken for "needs backfill".
    if (
      user.company_id != null &&
      user.onboarding_completed != null &&
      "visible_features" in user
    ) {
      return user;
    }

    // Backfill from the JWT for sessions saved before these fields were
    // captured, so the onboarding gate + permission gates still resolve on a
    // page reload.
    const token = getAuthToken();
    if (!token) return user;
    const claims = parseJwtPayload<
      {
        company_id?: string | null;
        onboarding_completed?: boolean | null;
      } & JwtPermissionClaims
    >(token);
    if (!claims) return user;
    const merged: AuthUser = { ...user };
    if (merged.company_id == null && "company_id" in claims) {
      merged.company_id = claims.company_id;
    }
    if (merged.onboarding_completed == null && "onboarding_completed" in claims) {
      merged.onboarding_completed = claims.onboarding_completed;
    }
    if (!("visible_features" in merged) && "visible_features" in claims) {
      merged.visible_features = claims.visible_features;
    }
    if (!("permissions" in merged) && "permissions" in claims) {
      merged.permissions = claims.permissions;
    }
    if (!("apps" in merged) && "apps" in claims) {
      merged.apps = claims.apps;
    }
    if (!("default_app" in merged) && "default_app" in claims) {
      merged.default_app = claims.default_app;
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

// Spec-named register() — consumed by SignupPage. JSON body only; the backend
// no longer logs the caller in here, it only creates the unverified account
// and queues a verification email (see VerifyEmailPage). Throws ApiError, so
// callers can branch on .status: 409 "Email already registered", 403 "This
// company already has members" (only reachable if a non-fresh company_id is
// ever passed in), 422 validation.
export async function register(
  params: RegisterRequest,
): Promise<RegisterResponse> {
  return request<RegisterResponse>("/api/v1/auth/register", {
    method: "POST",
    body: {
      email: params.email,
      password: params.password,
      full_name: params.full_name,
      company_id: params.company_id ?? null,
    },
    auth: false,
  });
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
