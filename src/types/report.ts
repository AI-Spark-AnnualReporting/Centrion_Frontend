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

export interface CoverageResponse {
  report_id: string;
  period: string;
  scope_type: string;
  frameworks: string[];
  summary: CoverageSummary;
  indicators: CoverageIndicator[];
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
