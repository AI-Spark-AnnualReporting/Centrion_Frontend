// One gate in ProtectedRoute stands in for role-aware handling at all six
// places that assume /dashboard is home (three bounces inside ProtectedRoute,
// the two gates after it, AuthPages' post-login navigate('/'), and the index
// route). They all land on /dashboard, which lands here — so this file is the
// only thing proving a company-less Spark user never sees the empty
// Welcome-to-Centriyon dashboard.
//
// The exemptions matter as much as the redirect: /companies is where we send
// them, and /onboarding is Add Company. Trap either behind the gate and it
// loops.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

let mockAuth: Record<string, unknown> = {};

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

vi.mock("@/lib/appRouting", () => ({
  shouldStayInCentriton: () => true,
  redirectToApp: vi.fn(),
}));

vi.mock("@/lib/features", () => ({
  isFeatureVisible: () => true,
}));

const { ProtectedRoute } = await import("@/components/ProtectedRoute");

const SPARK = {
  user_id: "usr_s",
  email: "spark@wearespark.me",
  full_name: "Spark",
  role: "spark_internal",
  company_id: null,
  must_change_password: false,
  onboarding_completed: true,
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<div>DASHBOARD</div>} />
          <Route path="/companies" element={<div>DIRECTORY</div>} />
          <Route path="/onboarding" element={<div>WIZARD</div>} />
          <Route path="/annual-report" element={<div>CYCLES</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("spark_internal routing", () => {
  beforeEach(() => {
    mockAuth = { user: SPARK, loading: false, actingCompany: null };
  });

  it("sends a company-less Spark user from the dashboard to the directory", () => {
    renderAt("/dashboard");
    expect(screen.getByText("DIRECTORY")).toBeInTheDocument();
  });

  it("keeps them off every other company-scoped page too", () => {
    renderAt("/annual-report");
    expect(screen.getByText("DIRECTORY")).toBeInTheDocument();
  });

  it("does not trap them on the directory itself", () => {
    renderAt("/companies");
    expect(screen.getByText("DIRECTORY")).toBeInTheDocument();
  });

  it("lets them reach the wizard with no company yet — that is Add Company", () => {
    renderAt("/onboarding");
    expect(screen.getByText("WIZARD")).toBeInTheDocument();
  });

  it("lets them into the app once a company is chosen", () => {
    mockAuth = {
      user: SPARK,
      loading: false,
      actingCompany: { id: "cmp_1", name: "Acme" },
    };
    renderAt("/dashboard");
    expect(screen.getByText("DASHBOARD")).toBeInTheDocument();
  });

  it("lets them run the wizard again for a second company", () => {
    // onboarding_completed is true on their own row and must not lock them out:
    // the flag means "finished setting up MY company", and they set up others'.
    mockAuth = {
      user: SPARK,
      loading: false,
      actingCompany: { id: "cmp_new", name: "Fresh" },
    };
    renderAt("/onboarding");
    expect(screen.getByText("WIZARD")).toBeInTheDocument();
  });
});

describe("everyone else is unaffected", () => {
  const ADMIN = { ...SPARK, role: "admin", company_id: "cmp_1" };

  it("an admin still lands on the dashboard", () => {
    mockAuth = { user: ADMIN, loading: false, actingCompany: null };
    renderAt("/dashboard");
    expect(screen.getByText("DASHBOARD")).toBeInTheDocument();
  });

  it("a completed admin is still bounced off the onboarding wizard", () => {
    mockAuth = { user: ADMIN, loading: false, actingCompany: null };
    renderAt("/onboarding");
    expect(screen.getByText("DASHBOARD")).toBeInTheDocument();
  });
});
