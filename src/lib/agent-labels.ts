// Canonical list of pipeline agents in execution order. The frontend always
// renders exactly these 5 rows on the Processing page; agents missing from
// the backend's /nodes response render as "pending" rather than dynamically
// shrinking the timeline.
export const EXPECTED_AGENTS = [
  { key: "validate_file", label: "Validating file" },
  { key: "data_extractor", label: "Extracting content" },
  { key: "esg_harvester", label: "Harvesting ESG indicators" },
  { key: "kpi_normalizer", label: "Normalizing KPIs" },
  { key: "save_to_db", label: "Saving to database" },
] as const;

export type ExpectedAgentKey = (typeof EXPECTED_AGENTS)[number]["key"];
