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
