// Single source of truth for the backend's 16-key feature catalogue. Never
// hardcode a feature key inline — import from here. Mirrors the convention in
// src/constants/roles.ts.
//
// Visibility is computed entirely server-side into `visible_features` on
// login — this file never recomputes gating/derivation rules, it only names
// the keys and (for the admin grant/revoke UI) which actions each grantable
// feature supports.

import type { FeatureAction } from "@/types/auth";

export type FeatureKey =
  | "command_center"
  | "quarterly_report"
  | "earnings_report"
  | "annual_report"
  | "esg_validator"
  | "compliance_validation"
  | "board_meetings"
  | "leadership"
  | "kpi_normalizer"
  | "questions_bank"
  | "ai_copilot"
  | "communication_hub"
  | "document_bank"
  | "profile"
  // Admin-only — never appear in visible_features. Gated purely on
  // role === 'admin' client-side. Kept here only for documentation/typing.
  | "brand_identity"
  | "admin_console";

// The keys the backend actually places in visible_features (everything
// except the 2 admin-only ones above — profile follows the standard
// visible_features pattern like every other feature).
export const CATALOGUED_FEATURE_KEYS: FeatureKey[] = [
  "command_center",
  "quarterly_report",
  "earnings_report",
  "annual_report",
  "esg_validator",
  "compliance_validation",
  "board_meetings",
  "leadership",
  "kpi_normalizer",
  "questions_bank",
  "ai_copilot",
  "communication_hub",
  "document_bank",
  "profile",
];

// Feature+action pairs an admin can grant/revoke on top of a user's role
// defaults (mirrors the backend's GRANTABLE_FEATURE_KEYS). The two `app:*`
// keys let an admin give a user access to the other dashboard app.
export interface GrantableFeature {
  key: string;
  label: string;
  actions: FeatureAction[];
}

export const GRANTABLE_FEATURES: GrantableFeature[] = [
  { key: "command_center", label: "Command Center", actions: ["read"] },
  { key: "quarterly_report", label: "Quarterly Report", actions: ["read", "create"] },
  { key: "earnings_report", label: "Earnings Report", actions: ["read", "create"] },
  { key: "esg_validator", label: "ESG Validator", actions: ["read", "create"] },
  { key: "compliance_validation", label: "Compliance Validation", actions: ["read", "create"] },
  { key: "board_meetings", label: "Board & Meetings", actions: ["read", "create"] },
  { key: "leadership", label: "Leadership", actions: ["read", "create"] },
  { key: "app:centriton_dashboard", label: "Centriton Dashboard access", actions: ["access"] },
  { key: "app:spark_studio", label: "Spark Studio access", actions: ["access"] },
];
