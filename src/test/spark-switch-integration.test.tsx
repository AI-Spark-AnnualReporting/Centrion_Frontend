// Integration: the REAL AuthContext driving the REAL Sidebar and directory.
//
// Every other spark test mocks `useAuth`, so each piece is verified in isolation
// and the wiring between them is not. This file exercises the actual round trip
// — real context, real localStorage store — because the failure that would slip
// past mocked tests is exactly a wiring one: switchCompany not reaching the
// sidebar, or the page's mount-effect clearing a selection it just made.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const SPARK_USER = {
  user_id: "usr_s",
  email: "spark@wearespark.me",
  full_name: "Spark Staff",
  role: "spark_internal",
  company_id: null,
  must_change_password: false,
  onboarding_completed: false,
  permissions: {},
  visible_features: ["ai_copilot", "communication_hub", "document_bank", "annual_report"],
  apps: ["centriton_dashboard", "spark_studio"],
  default_app: "centriton_dashboard",
};

const ROWS = [
  { id: "cmp_1", name: "Acme Corporation", cycle_count: 4 },
  { id: "cmp_2", name: "Bahri", cycle_count: 0 },
];

const navigate = vi.fn();

// `@/lib/acting-company` is deliberately NOT mocked — it is half of what's under test.
vi.mock("@/lib/api", () => ({
  getStoredUser: () => SPARK_USER,
  getToken: () => "jwt",
  setStoredUser: vi.fn(),
  setAuthToken: vi.fn(),
  logout: vi.fn(),
  companies: { get: vi.fn() },
  auth: { me: vi.fn(), onboarding: vi.fn(), changePassword: vi.fn() },
  sparkInternal: {
    companies: () => Promise.resolve({ companies: ROWS, total: 2, stats: null }),
    createCompany: vi.fn(),
  },
  communications: { listThreads: () => Promise.resolve({ threads: [] }) },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

vi.mock("@/lib/features", () => ({
  useFeatureAccess: () => ({ isVisible: () => true, visibleFeatures: [] }),
  isFeatureVisible: () => true,
  useFeaturePermissions: () => ({ canCreate: true, canRead: true }),
}));

const { AuthProvider } = await import("@/context/AuthContext");
const { Sidebar } = await import("@/components/layout/Sidebar");
const { default: SparkCompaniesPage } = await import("@/pages/spark/CompaniesPage");

// Sidebar and directory side by side under one real provider, so a state change
// in the page is observable in the nav exactly as it is in the running app.
const renderBoth = () =>
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/companies"]}>
        <Sidebar />
        <Routes>
          <Route path="/companies" element={<SparkCompaniesPage />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );

describe("picking and leaving a company, end to end", () => {
  beforeEach(() => {
    localStorage.clear();
    navigate.mockClear();
  });

  it("starts company-less: the nav offers only the directory", async () => {
    renderBoth();
    await screen.findByText("Acme Corporation");
    // Scoped by role: "Companies" is also the page's own <h1>.
    expect(screen.getByRole("button", { name: /Companies/ })).toBeInTheDocument();
    // Hand-rolled like the directory button, so nothing hides it for free.
    expect(screen.queryByText("Annual Report")).not.toBeInTheDocument();
    expect(screen.queryByText("AI Copilot")).not.toBeInTheDocument();
    expect(screen.queryByText("Admin Console")).not.toBeInTheDocument();
  });

  it("picking a company opens the nav and persists the choice", async () => {
    renderBoth();
    fireEvent.click(await screen.findByText("Acme Corporation"));

    // The real context reached the real sidebar.
    await waitFor(() => expect(screen.getByText("AI Copilot")).toBeInTheDocument());
    expect(screen.getByText("Communication Hub")).toBeInTheDocument();
    expect(screen.getByText("Document Bank")).toBeInTheDocument();
    expect(screen.getByText("Admin Console")).toBeInTheDocument();

    expect(navigate).toHaveBeenCalledWith("/annual-report");
    // Survives a reload.
    expect(JSON.parse(localStorage.getItem("centriton_acting_company")!)).toEqual({
      id: "cmp_1",
      name: "Acme Corporation",
    });
  });

  it("the page's mount-effect does not wipe the company it just set", async () => {
    // The regression this pass nearly shipped: keyed on actingCompany, the
    // catch-all fires the instant a row sets it.
    renderBoth();
    fireEvent.click(await screen.findByText("Acme Corporation"));
    await waitFor(() => expect(screen.getByText("AI Copilot")).toBeInTheDocument());
    // Still set a tick later — not cleared out from under us.
    await new Promise((r) => setTimeout(r, 20));
    expect(localStorage.getItem("centriton_acting_company")).not.toBeNull();
  });

  it("the Annual Report tab goes back to the report and KEEPS the client", async () => {
    // The mirror of the test below, and the reason the tab exists: Companies
    // clears the client, this must not. Worth proving here rather than against
    // a spy — this file runs the real context and the real localStorage store.
    renderBoth();
    fireEvent.click(await screen.findByText("Acme Corporation"));
    await waitFor(() => expect(screen.getByText("AI Copilot")).toBeInTheDocument());
    navigate.mockClear(); // picking the row already navigated there once

    fireEvent.click(screen.getByText("Annual Report"));

    expect(navigate).toHaveBeenLastCalledWith("/annual-report");
    expect(localStorage.getItem("centriton_acting_company")).not.toBeNull();
    // Still inside the client: the nav did not collapse back to the directory.
    expect(screen.getByText("AI Copilot")).toBeInTheDocument();
  });

  it("clicking Companies in the nav collapses it again and clears storage", async () => {
    renderBoth();
    fireEvent.click(await screen.findByText("Acme Corporation"));
    await waitFor(() => expect(screen.getByText("AI Copilot")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Companies/ }));

    await waitFor(() => expect(screen.queryByText("AI Copilot")).not.toBeInTheDocument());
    expect(screen.queryByText("Admin Console")).not.toBeInTheDocument();
    expect(localStorage.getItem("centriton_acting_company")).toBeNull();
    expect(navigate).toHaveBeenLastCalledWith("/companies");
  });
});
