// Typed fetch client for the Centriton Platform API.
// Paths + shapes derived from openapi.json.
//
// All authenticated calls MUST go through either:
//   - the typed `request<T>()` helper (used by the namespaced clients below), or
//   - `fetchWithAuth(path, init)` for raw Response access.
// Both attach Authorization: Bearer <token> automatically and trigger logout
// on a 401. Do not use raw `fetch()` for authenticated endpoints.

import type {
  AuthUser,
  LoginResponse,
  OnboardingPayload,
  OnboardingResponse,
} from "@/types/auth";
import type { RegisterRequest, RegisterResponse } from "@/types/register";
import type {
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
  Cycle,
  CreateCyclePayload,
  CycleOverview,
  CycleSection,
  SARUser,
} from "@/types/cycles";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL ?? "http://localhost:8000"
).replace(/\/+$/, "");

// The SAR service (Annual Report cycles) is a SEPARATE backend from Centriton,
// running locally on :8010. Calls go through `sarRequest()` below, which reuses
// the Centriton JWT for token passthrough.
const SAR_BASE_URL = (
  import.meta.env.VITE_SAR_URL ?? "http://127.0.0.1:8010"
).replace(/\/+$/, "");

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
  old_password: string;
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

  // Question Bank — every manual question raised across this company's reports,
  // enriched with indicator + report metadata so the page can group by report.
  listQuestions: <T = unknown>(
    companyId: string,
    filters: { report_id?: string; indicator_id?: string } = {},
  ) =>
    request<T>(`/api/v1/companies/${encodeURIComponent(companyId)}/questions`, {
      query: filters,
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

  list: <T = unknown>(companyId: string) =>
    request<T>(`/api/v1/documents/${encodeURIComponent(companyId)}`),

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
// `sarRequest` is just `request` pinned to the SAR host; the Centriton JWT is
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

export const sarCycles = {
  list: async (): Promise<Cycle[]> => {
    const raw = await sarRequest<unknown>("/api/v1/admin/cycles");
    const list = unwrap<Cycle[]>(raw, "cycles");
    return Array.isArray(list) ? list : [];
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

  overview: (id: string): Promise<CycleOverview> =>
    sarRequest<CycleOverview>(
      `/api/v1/admin/cycles/${encodeURIComponent(id)}/overview`,
    ),

  sections: async (id: string): Promise<CycleSection[]> => {
    const raw = await sarRequest<unknown>(
      `/api/v1/admin/cycles/${encodeURIComponent(id)}/sections`,
    );
    const list = unwrap<CycleSection[]>(raw, "sections");
    return Array.isArray(list) ? list : [];
  },
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
  team,
  agents,
  esg,
  compliance,
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
