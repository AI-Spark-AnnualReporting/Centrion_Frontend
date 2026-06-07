export interface CoverageDriver {
  text: string;
  quote: string | null;
  page: number | null;
  source: "extracted" | "user_provided";
}

export interface CoverageFigure {
  figure_id: string;
  code: string;
  metric: string;
  label: string;
  statement: string;
  current_value: number;
  current_display: string;
  prior_value: number | null;
  prior_display: string | null;
  change_pct: number | null;
  change_direction: "up" | "down" | null;
  driver_status: "missing" | "found";
  drivers: CoverageDriver[];
}

export interface CoverageSummary {
  figures_extracted: number;
  documents_count: number;
  reason_linked: number;
  reason_missing: number;
  driver_coverage_pct: number;
  comparatives_matched: number;
  comparatives_total: number;
  comparatives_missing_prior: number;
}

export interface QuarterlyCoverageResponse {
  report_id: string;
  company_id: string;
  period_label: string;
  prior_period_label: string;
  summary: CoverageSummary;
  needs_reason: CoverageFigure[];
  reason_found: CoverageFigure[];
}
