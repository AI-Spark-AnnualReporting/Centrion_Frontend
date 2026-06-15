// Types for the Admin Console (Part 5). Field names follow the AdminPortal
// spec; shapes the backend hasn't pinned down yet are kept optional so the UI
// degrades gracefully rather than crashing on a missing key.

import type { BackendRole } from "@/constants/roles";

export type UserStatus = "active" | "invited" | "suspended";

// ── Overview (GET /api/v1/admin/overview) ──────────────────────────────────
export type ActivityType =
  | "USER"
  | "REPORT"
  | "SYSTEM"
  | "PERMISSION"
  | "DEPARTMENT";

export interface ActivityItem {
  id: string;
  actor: string; // Who performed the action ("System" for automated events)
  action: string; // Human-readable description
  type: ActivityType;
  timestamp: string; // ISO 8601
}

export interface NeedsAttentionItem {
  id: string;
  kind: string; // e.g. "invites" | "onboarding" | "integration" | "seats"
  title: string;
  description: string;
  target?: string | null; // Route to navigate to on click
}

export interface QuarterPoint {
  quarter: string; // e.g. "Q4'23"
  count: number;
}

export interface AdminOverview {
  active_users: number;
  total_seats: number;
  new_users_this_month: number;
  reports_this_quarter: number;
  reports_qoq_pct: number;
  document_storage_gb: number;
  storage_limit_gb: number;
  pending_actions: number;
  pending_invites: number;
  pending_onboarding: number;
  reports_by_quarter: QuarterPoint[];
  recent_activity: ActivityItem[];
  needs_attention: NeedsAttentionItem[];
}

// The backend returns a nested shape with different key names than the flat
// AdminOverview the UI consumes. This mirrors the wire format so we can map it.
export interface RawAdminOverview {
  stats?: {
    active_users?: number;
    max_seats?: number;
    new_users_this_month?: number;
    reports_this_quarter?: number;
    reports_qoq_change?: number;
    document_storage_gb?: number;
    document_storage_max_gb?: number;
    pending_actions?: number;
    pending_invites?: number;
    pending_onboarding?: number;
  };
  reports_chart?: { period: string; count: number }[];
  recent_activity?: {
    user_name?: string;
    actor?: string;
    action: string;
    type: ActivityType;
    timestamp: string;
  }[];
  needs_attention?: {
    type?: string;
    kind?: string;
    title?: string;
    count?: number;
    max?: number;
    description?: string;
    target?: string | null;
  }[];
}

// Human-friendly titles for the "needs attention" tiles, keyed by the backend
// `type`. Falls back to a title-cased version of the raw type.
const ATTENTION_TITLES: Record<string, string> = {
  seat_usage: "Seat usage",
  invites: "Pending invites",
  onboarding: "Onboarding",
  integration: "Integration health",
};

function titleCase(s: string): string {
  return s
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Map the backend's nested overview payload onto the flat AdminOverview the page
// renders. Defaults keep the UI from showing `undefined` when a field is absent.
export function normalizeOverview(raw: RawAdminOverview): AdminOverview {
  const s = raw.stats ?? {};
  return {
    active_users: s.active_users ?? 0,
    total_seats: s.max_seats ?? 0,
    new_users_this_month: s.new_users_this_month ?? 0,
    reports_this_quarter: s.reports_this_quarter ?? 0,
    reports_qoq_pct: s.reports_qoq_change ?? 0,
    document_storage_gb: s.document_storage_gb ?? 0,
    storage_limit_gb: s.document_storage_max_gb ?? 0,
    pending_actions: s.pending_actions ?? 0,
    pending_invites: s.pending_invites ?? 0,
    pending_onboarding: s.pending_onboarding ?? 0,
    reports_by_quarter: (raw.reports_chart ?? []).map((p) => ({
      quarter: p.period,
      count: p.count,
    })),
    recent_activity: (raw.recent_activity ?? []).map((a, i) => ({
      id: String(i),
      actor: a.actor ?? a.user_name ?? "System",
      action: a.action,
      type: a.type,
      timestamp: a.timestamp,
    })),
    needs_attention: (raw.needs_attention ?? []).map((n, i) => {
      const key = n.type ?? n.kind ?? "";
      const seatInfo =
        n.count != null && n.max != null ? `${n.count} of ${n.max} seats used` : null;
      return {
        id: String(i),
        kind: key,
        title: n.title ?? ATTENTION_TITLES[key] ?? (key ? titleCase(key) : "Attention"),
        description: [seatInfo, n.description].filter(Boolean).join(" · "),
        target: n.target ?? null,
      };
    }),
  };
}

// ── Users (GET /api/v1/admin/users) ────────────────────────────────────────
export interface AdminUserRow {
  user_id: string;
  full_name: string;
  email: string;
  role: BackendRole;
  status: UserStatus;
  companies?: string[] | string | null; // "All companies" / list / "—"
  last_active?: string | null; // ISO 8601 or null
  reports_count?: number | null;
  two_factor?: boolean | null;
  onboarding_completed?: boolean | null;
  // Department link — only populated for `department_user` roles. Null otherwise.
  department_id?: string | null;
  department_name?: string | null;
  department_code?: string | null;
  invite_link?: string | null;
}

// ── Invite (POST /api/v1/admin/users/invite) ───────────────────────────────
export interface InviteUserPayload {
  full_name: string;
  email: string;
  role: BackendRole;
  // Required when role is `department_user`; omitted for every other role.
  department_id?: string | null;
}

export interface InviteUserResponse {
  user_id: string;
  email: string;
  temp_password: string; // Shown to the admin exactly once
}

// ── Permissions (GET/PUT /api/v1/admin/permissions) ────────────────────────
// Map of role -> { capabilityKey: enabled }. Admin is omitted/locked.
export type PermissionMatrix = Partial<
  Record<BackendRole, Record<string, boolean>>
>;

export interface SavePermissionsPayload {
  role: BackendRole;
  capability: string;
  enabled: boolean;
}

// ── Departments (/api/v1/admin/departments) ────────────────────────────────
// initial_prompt / system_prompt are generated server-side (enriched with the
// company's context). They're surfaced read-only in the edit view and only sent
// back when an admin explicitly overrides them.
export interface Department {
  id: string;
  department_code: string;
  department_name: string;
  description?: string | null;
  member_count?: number | null;
  is_active?: boolean | null;
  // Default / system-seeded departments are created automatically for every
  // company and must not be edited or deleted. The backend marks them with this
  // flag (is_system is accepted as an alias in case the API names it that way).
  is_default?: boolean | null;
  is_system?: boolean | null;
  initial_prompt?: string | null;
  system_prompt?: string | null;
}

export interface DepartmentPayload {
  department_code: string;
  department_name: string;
  description?: string;
  // Sent only when "Advanced: Override prompts" is enabled — otherwise the
  // backend regenerates both prompts automatically from name/description.
  initial_prompt?: string;
  system_prompt?: string;
}
