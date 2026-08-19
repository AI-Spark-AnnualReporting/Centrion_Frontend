// Single source of truth for the backend's feature catalogue. Never hardcode
// a feature key inline — import from here. Mirrors the convention in
// src/constants/roles.ts.
//
// board_report is new (added when the Board of Directors' Report builder
// landed on staging) and isn't part of the original 16-key catalogue — the
// backend needs GRANTABLE_FEATURE_KEYS/role_defaults/visible_features updated
// to actually grant it. Until then it fails closed (hidden for everyone),
// which is the safe default, not a bug.
//
// Visibility is computed entirely server-side into `visible_features` on
// login — this file never recomputes gating/derivation rules, it only names
// the keys and (for the admin grant/revoke UI) which actions each grantable
// feature supports.

import type { BackendRole } from "@/constants/roles";
import type { FeatureAction, FeaturePermissions } from "@/types/auth";

export type FeatureKey =
  | "command_center"
  | "quarterly_report"
  | "earnings_report"
  | "annual_report"
  | "board_report"
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
  "board_report",
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
  // Shown but never togglable — the admin UI still lists it (so its state
  // is visible) but no one can grant or revoke it from here.
  alwaysDisabled?: boolean;
}

export const GRANTABLE_FEATURES: GrantableFeature[] = [
  { key: "command_center", label: "Command Center", actions: ["read"] },
  { key: "quarterly_report", label: "Quarterly Report", actions: ["read", "create"] },
  { key: "earnings_report", label: "Earnings Report", actions: ["read", "create"] },
  { key: "board_report", label: "Board Report", actions: ["read", "create"] },
  { key: "esg_validator", label: "ESG Validator", actions: ["read", "create"] },
  { key: "compliance_validation", label: "Compliance Validation", actions: ["read", "create"] },
  { key: "board_meetings", label: "Board & Meetings", actions: ["read", "create"] },
  { key: "leadership", label: "Leadership", actions: ["read", "create"] },
  { key: "app:centriton_dashboard", label: "Centriyon access", actions: ["access"] },
  { key: "app:spark_studio", label: "Annual Report Dashboard access", actions: ["access"], alwaysDisabled: true },
];

// Static per-role defaults for the read-only Role Permissions matrix
// (PermissionMatrixView in AdminUsersPage.tsx). Hardcoded rather than fetched
// from a sample user's role_defaults, so every role — including one with zero
// current members — always shows a real answer instead of blanking out
// waiting on an account to sample from.
//
// project_manager and department_user are auto-redirected straight to the
// Spark Studio (Annual Report) app on login and never reach Centriyon's own
// dashboard at all (see AuthContext's login redirect and ProtectedRoute) —
// their Centriyon-side defaults are correctly false across the board, and
// app:spark_studio is their real home instead. hod (Department Lead) follows
// the same shape: curating questions and reviewing a department's answers is
// Spark Studio work too, not Centriyon's report screens. ir exists purely to
// read published reports, so it gets read-only access to the reporting
// features and nothing else.
//
// This is a platform constant, not a per-company setting: change a role's
// default by editing this table, not from the UI.
export const ROLE_FEATURE_DEFAULTS: Record<BackendRole, Record<string, FeaturePermissions>> = {
  admin: {
    command_center: { read: true },
    quarterly_report: { read: true, create: true },
    earnings_report: { read: true, create: true },
    board_report: { read: true, create: true },
    esg_validator: { read: true, create: true },
    compliance_validation: { read: true, create: true },
    board_meetings: { read: true, create: true },
    leadership: { read: true, create: true },
    "app:centriton_dashboard": { access: true },
    "app:spark_studio": { access: true },
  },
  project_manager: {
    command_center: { read: false },
    quarterly_report: { read: false, create: false },
    earnings_report: { read: false, create: false },
    board_report: { read: false, create: false },
    esg_validator: { read: false, create: false },
    compliance_validation: { read: false, create: false },
    board_meetings: { read: false, create: false },
    leadership: { read: false, create: false },
    "app:centriton_dashboard": { access: false },
    "app:spark_studio": { access: true },
  },
  hod: {
    command_center: { read: false },
    quarterly_report: { read: false, create: false },
    earnings_report: { read: false, create: false },
    board_report: { read: false, create: false },
    esg_validator: { read: false, create: false },
    compliance_validation: { read: false, create: false },
    board_meetings: { read: false, create: false },
    leadership: { read: false, create: false },
    "app:centriton_dashboard": { access: false },
    "app:spark_studio": { access: true },
  },
  department_user: {
    command_center: { read: false },
    quarterly_report: { read: false, create: false },
    earnings_report: { read: false, create: false },
    board_report: { read: false, create: false },
    esg_validator: { read: false, create: false },
    compliance_validation: { read: false, create: false },
    board_meetings: { read: false, create: false },
    leadership: { read: false, create: false },
    "app:centriton_dashboard": { access: false },
    "app:spark_studio": { access: true },
  },
  ir: {
    command_center: { read: true },
    quarterly_report: { read: true, create: false },
    earnings_report: { read: true, create: false },
    board_report: { read: true, create: false },
    esg_validator: { read: true, create: false },
    compliance_validation: { read: true, create: false },
    board_meetings: { read: false, create: false },
    leadership: { read: false, create: false },
    "app:centriton_dashboard": { access: true },
    "app:spark_studio": { access: false },
  },
};
