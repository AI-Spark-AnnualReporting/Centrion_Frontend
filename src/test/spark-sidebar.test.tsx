// Spark staff run each client's ANNUAL REPORT as that client's admin. The sidebar
// has to say that: the directory, the three cross-cutting workspaces, and the
// Admin Console — and nothing else.
//
// Two ways this regresses silently:
//   1. Any new NAV_ITEMS entry is visible to every role by default, so it would
//      appear here too unless the allowlist stays the FIRST filter in the chain.
//   2. The Admin Console is company-scoped (_require_company 400s without one),
//      so it must stay hidden until a company is picked — same rule as the rest
//      of the nav, and the reason `sparkAwaitingCompany` exists.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let mockAuth: Record<string, unknown> = {};
const leaveCompany = vi.fn();

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

// Spark holds every feature, so the feature gate never hides anything for them —
// which is exactly why the allowlist has to do the work.
vi.mock("@/lib/features", () => ({
  useFeatureAccess: () => ({ isVisible: () => true, visibleFeatures: [] }),
  isFeatureVisible: () => true,
}));

const { Sidebar } = await import("@/components/layout/Sidebar");

const SPARK = { user_id: "usr_s", full_name: "Spark", email: "spark@wearespark.me", role: "spark_internal" };
const ADMIN = { ...SPARK, role: "admin" };

const ALLOWED = ["Companies", "AI Copilot", "Communication Hub", "Document Bank"];
// What renders unguarded: the section header and the expandable parent. Its
// children (Users & Roles, Departments) sit behind `adminOpen`, collapsed by
// default for every role — see the expand test below.
const ADMIN_ITEMS = ["Admin", "Admin Console"];
const HIDDEN = [
  "Command Center",
  "Reports",
  "Reports Validator",
  "KPI Normalizer",
  "Board & Meetings",
  "Leadership",
  "Questions Bank",
  "Profile",
  // Still hidden: it is a NAV_ITEMS entry the allowlist filters out, and is a
  // separate thing from the Admin Console section below.
  "Upload Previous Reports",
];

const renderSidebar = () =>
  render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>,
  );

describe("sidebar for spark_internal", () => {
  beforeEach(() => {
    leaveCompany.mockClear();
    mockAuth = {
      user: SPARK,
      logout: vi.fn(),
      leaveCompany,
      actingCompany: { id: "cmp_1", name: "Acme" },
    };
  });

  it.each(ALLOWED)("shows %s", (label) => {
    renderSidebar();
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it.each(HIDDEN)("hides %s", (label) => {
    renderSidebar();
    expect(screen.queryByText(label)).not.toBeInTheDocument();
  });

  it.each(ADMIN_ITEMS)("shows %s — Spark acts as the client's admin", (label) => {
    renderSidebar();
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("leaves the company when Companies is clicked", () => {
    // The directory is a company-less state. Clearing here rather than on the
    // page's mount means it mounts already company-less, so the AppLayout key
    // never flips and the directory isn't fetched twice.
    renderSidebar();
    fireEvent.click(screen.getByText("Companies"));
    expect(leaveCompany).toHaveBeenCalled();
  });

  it("reveals Users & Roles and Departments when the console is expanded", () => {
    renderSidebar();
    fireEvent.click(screen.getByText("Admin Console"));
    expect(screen.getByText("Users & Roles")).toBeInTheDocument();
    expect(screen.getByText("Departments")).toBeInTheDocument();
  });

  it("shows only the directory before a company is chosen", () => {
    mockAuth = { user: SPARK, logout: vi.fn(), leaveCompany, actingCompany: null };
    renderSidebar();
    expect(screen.getByText("Companies")).toBeInTheDocument();
    // Advertising links that all bounce back to the directory is worse than
    // showing none of them. The Admin Console especially: it is company-scoped
    // and would 400 rather than merely look empty.
    for (const label of ["AI Copilot", "Communication Hub", "Document Bank", "Admin Console"]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });
});

describe("sidebar for everyone else", () => {
  beforeEach(() => {
    mockAuth = { user: ADMIN, logout: vi.fn(), leaveCompany, actingCompany: null };
  });

  it("still shows the full nav for an admin", () => {
    renderSidebar();
    for (const label of ["Command Center", "AI Copilot", "Document Bank", "Leadership"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("keeps the Admin section for an admin", () => {
    renderSidebar();
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("does not show an admin the Spark directory", () => {
    renderSidebar();
    expect(screen.queryByText("Companies")).not.toBeInTheDocument();
  });
});
