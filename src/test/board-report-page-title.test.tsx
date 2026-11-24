// The Board Report builder steps all carry a report id in the URL
// (/board-report/<id>/sources, /sections, /outline, /preview, /report).
// PAGE_NAMES only had the exact '/board-report' path, so every step fell
// through to the default and the top bar read "Command Center" (QA audit BR-03).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let pathname = "/board-report";

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { user_id: "usr_a", full_name: "Acme Admin", role: "admin", company_id: "cmp_1", company_name: "Acme" },
    logout: vi.fn(),
    actingCompany: null,
  }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useLocation: () => ({ pathname, search: "", hash: "", state: null, key: "t" }),
    useNavigate: () => vi.fn(),
    Outlet: () => <div>PAGE</div>,
  };
});

vi.mock("@/components/layout/Sidebar", () => ({ Sidebar: () => <nav /> }));
vi.mock("@/context/ComplianceRunsContext", () => ({
  ComplianceRunsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useComplianceRuns: () => ({ runs: [] }),
}));
vi.mock("@/components/shared/ComplianceRunsDock", () => ({
  ComplianceRunsDock: () => null,
}));
vi.mock("@/components/layout/NotificationBell", () => ({
  NotificationBell: () => <div>BELL</div>,
}));

const { AppLayout } = await import("@/components/layout/AppLayout");

const renderShell = () =>
  render(
    <MemoryRouter>
      <AppLayout />
    </MemoryRouter>,
  );

const BUILDER_STEPS = ["sources", "sections", "outline", "preview", "report"];

describe("Board Report page title", () => {
  beforeEach(() => {
    pathname = "/board-report";
  });

  it("reads Board Report on the setup page", () => {
    renderShell();
    expect(screen.getByText("Board Report")).toBeInTheDocument();
    expect(screen.queryByText("Command Center")).not.toBeInTheDocument();
  });

  for (const step of BUILDER_STEPS) {
    it(`reads Board Report, not Command Center, on the ${step} step`, () => {
      pathname = `/board-report/rep_123/${step}`;
      renderShell();
      expect(screen.getByText("Board Report")).toBeInTheDocument();
      expect(screen.queryByText("Command Center")).not.toBeInTheDocument();
    });
  }

  it("leaves the Command Center itself titled Command Center", () => {
    pathname = "/dashboard";
    renderShell();
    expect(screen.getByText("Command Center")).toBeInTheDocument();
  });
});
