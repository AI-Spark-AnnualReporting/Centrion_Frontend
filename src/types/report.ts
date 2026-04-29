export interface GenerateReportResponse {
  report_id: string;
  period: string;
  scope_type: string;
  persisted_frameworks: string[];
  ingested_frameworks: string[];
  documents: Array<{
    filename: string;
    status: string;
    document_id: string;
    reason?: string;
  }>;
  total_uploaded: number;
  succeeded: number;
  failed: number;
}

export type CoverageStatus = "FOUND" | "PARTIAL" | "NOT_DISCLOSED";
export type CoveragePillar = "E" | "S" | "G" | "ESG" | (string & {});

export interface CoveragePillarSummary {
  total: number;
  found: number;
  partial: number;
  not_disclosed: number;
}

export interface CoverageSummary {
  total_indicators: number;
  found_count: number;
  partial_count: number;
  not_disclosed_count: number;
  disclosure_rate: number;
  by_pillar: Record<string, CoveragePillarSummary>;
}

export interface CoverageIndicator {
  framework_indicator_id: string;
  framework: string;
  source_code: string;
  indicator_label: string;
  pillar: CoveragePillar;
  esg_category: string;
  data_type: string;
  status: CoverageStatus;
  value: number | null;
  unit: string | null;
  text_value: string | null;
  bool_value: boolean | null;
  confidence: number | null;
  source_page: number | null;
  document_id: string | null;
  evidence_id: string | null;
}

export interface CoverageDocument {
  id: string;
  filename: string;
  file_type: string;
  file_size_bytes: number;
  extraction_status: string;
  uploaded_at: string;
}

// GET /api/v1/documents/{company_id}/by-report — Document Bank shape. Each
// document carries a time-limited signed `download_url` (null when the upload
// failed) plus its expiry. Reports with zero documents are still returned.
export interface DocumentBankDocument {
  id: string;
  filename: string;
  file_type: string;
  file_size_bytes: number;
  extraction_status: string;
  uploaded_at: string;
  download_url: string | null;
  download_expires_at: string | null;
}

export interface DocumentBankReport {
  report_id: string;
  title: string;
  period: string;
  status: string;
  created_at: string;
  documents: DocumentBankDocument[];
}

export interface DocumentBankResponse {
  company_id: string;
  company_name: string;
  reports: DocumentBankReport[];
}

export interface CoverageCriticalGap {
  framework_indicator_id: string;
  source_code: string;
  indicator_label: string;
  pillar: CoveragePillar;
  sector_threshold: string | null;
  is_mandatory: boolean;
  status: CoverageStatus;
}

export interface CoverageSector {
  id: string;
  code: string;
  name: string;
}

// Regulators returned alongside the coverage payload when scope_type is
// "regional" — these carry the body-specific code (e.g. "QFMA") that should
// be surfaced in place of generic framework codes for regional reports.
export interface CoverageRegulator {
  id?: string;
  code: string;
  full_name?: string;
  country_id?: string;
}

export interface CoverageResponse {
  report_id: string;
  company_id?: string;
  company_name?: string;
  period: string;
  sector?: CoverageSector | null;
  scope_type: string;
  frameworks: string[];
  regulators?: CoverageRegulator[];
  documents?: CoverageDocument[];
  summary: CoverageSummary;
  indicators: CoverageIndicator[];
  critical_gaps?: CoverageCriticalGap[];
}

// Question Bank — GET /api/v1/companies/{company_id}/questions
// Each question is enriched with indicator + report metadata so the page can
// group by report and display indicator labels without an extra fetch.
export interface QuestionIndicatorMeta {
  id: string;
  framework: string;
  source_code: string;
  indicator_label: string;
  esg_pillar: string;
  esg_category: string;
  data_type: string;
  tier: string | null;
}

export interface QuestionReportMeta {
  id: string;
  report_type: string;
  period: string;
  status: string;
  created_at: string;
}

export interface CompanyQuestion {
  id: string;
  company_id: string;
  report_id: string;
  framework_indicator_id: string;
  question_text: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  indicator: QuestionIndicatorMeta;
  report: QuestionReportMeta;
}

export interface CompanyQuestionsResponse {
  company_id: string;
  questions: CompanyQuestion[];
  total: number;
}

// Async pipeline — 202 Accepted envelope returned by generate / addDocuments /
// upload endpoints.
export interface AsyncPipelineResponse {
  run_id: string;
  report_id: string;
  period: string;
  scope_type: string;
  persisted_frameworks: string[];
  ingested_frameworks: string[];
  status: "running" | string;
  started_at: string;
  poll_url: string;
  file_count: number;
  estimated_duration_seconds: number;
}

// 409 from the same endpoints — "a run already exists for this report."
// FastAPI wraps HTTPException responses under `detail`; shape is accepted both
// flat and nested by the API client.
export interface PipelineConflictBody {
  error: "pipeline_already_running" | string;
  message: string;
  existing_run_id: string;
  started_at: string;
  poll_url: string;
}

// Normalised shape returned by async API methods regardless of 202 vs 409.
// `isExisting` is true when we reconnected to an already-running pipeline.
export interface PipelineHandle {
  runId: string;
  pollUrl: string;
  reportId: string | null;
  startedAt: string;
  estimatedDurationSeconds: number | null;
  fileCount: number | null;
  isExisting: boolean;
  message?: string;
}

export type AgentRunStatus =
  | "running"
  | "completed"
  | "failed"
  | (string & {});

export interface PipelineResultItem {
  file_name: string;
  status: "success" | "failed" | "skipped" | (string & {});
  document_id: string | null;
  error: string | null;
}

export interface PipelineOutputSummary {
  results: PipelineResultItem[];
  total_uploaded: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

export interface PipelineInputSummary {
  report_id: string;
  file_count: number;
  file_names: string[];
  trigger: string;
}

export interface AgentRun {
  run_id: string;
  agent_name: string;
  status: AgentRunStatus;
  company_id?: string;
  started_at: string;
  elapsed_seconds: number;
  completed_at: string | null;
  input_summary: PipelineInputSummary | null;
  output_summary: PipelineOutputSummary | null;
  error_message: string | null;
}

// Per-agent node rows from GET /api/v1/agent_runs/{run_id}/nodes — one row per
// step in the pipeline, ordered by created_at ASC. Drives the live timeline on
// the Processing page.
export type AgentNodeStatus =
  | "running"
  | "completed"
  | "failed"
  | (string & {});

export interface AgentNode {
  agent_name: string;
  status: AgentNodeStatus;
  elapsed_seconds: number;
  created_at: string;
  error_message: string | null;
}

export interface AgentNodesResponse {
  run_id: string;
  nodes: AgentNode[];
}
