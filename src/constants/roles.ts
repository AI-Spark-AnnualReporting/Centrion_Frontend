// Single source of truth for how backend role strings are presented in the
// Admin Console (and anywhere else that shows a role). Never hardcode display
// names inline — import from here.

// `spark_admin` is the platform owner (Spark), not a tenant role: it sits
// outside every company and is the only role allowed on /spark. It is
// deliberately absent from ROLE_ORDER and ASSIGNABLE_ROLES below — it never
// appears on a company's Users & Roles screen and can never be granted there.
export type BackendRole =
  | "admin"
  | "project_manager"
  | "hod"
  | "department_user"
  | "ir"
  | "spark_admin";

export interface RoleMeta {
  label: string; // Display name shown to users
  description: string; // One-line capability summary
  badgeClass: string; // `.badge` colour modifier from index.css
  dot: string; // Hex colour for the small status dot on role cards
}

export const ROLE_DISPLAY: Record<BackendRole, RoleMeta> = {
  admin: {
    label: "Admin",
    description: "Full platform & user control",
    badgeClass: "b-dk",
    dot: "#1A1D2E",
  },
  project_manager: {
    label: "Project Manager",
    description: "Builds and generates reports",
    badgeClass: "b-tl",
    dot: "#0D9488",
  },
  hod: {
    label: "HR Lead",
    description: "Curates questions & reviews answers for a department",
    badgeClass: "b-bl",
    dot: "#2563EB",
  },
  department_user: {
    label: "Department User",
    description: "Reviews, edits, approves content",
    badgeClass: "b-pp",
    dot: "#7C3AED",
  },
  ir: {
    label: "IR",
    description: "Read-only access to published reports",
    badgeClass: "b-gy",
    dot: "#9BA3C4",
  },
  spark_admin: {
    label: "Spark",
    description: "Platform owner — read-only across every company",
    badgeClass: "b-dk",
    dot: "#1A1D2E",
  },
};

// Stable display order for role summary cards / matrix columns.
export const ROLE_ORDER: BackendRole[] = [
  "admin",
  "project_manager",
  "hod",
  "department_user",
  "ir",
];

// Roles that can be assigned to other users. `admin` is intentionally excluded —
// the admin role can never be granted from the UI.
export const ASSIGNABLE_ROLES: BackendRole[] = [
  "project_manager",
  "hod",
  "department_user",
  "ir",
];

export function roleMeta(role: string | null | undefined): RoleMeta {
  return (role && ROLE_DISPLAY[role as BackendRole]) || ROLE_DISPLAY.ir;
}

// Capability matrix scaffold. The labels/sections are static frontend metadata;
// the checked-state per role is loaded from GET /api/v1/admin/permissions.
export interface Capability {
  key: string;
  label: string;
}

export interface CapabilityGroup {
  section: string;
  caps: Capability[];
}

export const CAPABILITY_GROUPS: CapabilityGroup[] = [
  {
    section: "REPORTING",
    caps: [
      { key: "generate_reports", label: "Generate reports" },
      { key: "edit_report_content", label: "Edit report content" },
      { key: "approve_publish", label: "Approve & publish" },
    ],
  },
  {
    section: "DATA",
    caps: [
      { key: "manage_document_bank", label: "Manage document bank" },
      { key: "manage_companies", label: "Manage companies" },
    ],
  },
  {
    section: "ADMINISTRATION",
    caps: [
      { key: "manage_users_roles", label: "Manage users & roles" },
      { key: "manage_billing_seats", label: "Manage billing & seats" },
      { key: "view_audit_log", label: "View audit log" },
      { key: "configure_integrations", label: "Configure integrations" },
    ],
  },
];

export const ALL_CAPABILITY_KEYS: string[] = CAPABILITY_GROUPS.flatMap((g) =>
  g.caps.map((c) => c.key),
);
