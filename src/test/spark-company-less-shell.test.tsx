// The directory is a company-less state: while you're choosing a client you are
// not inside one, so nothing company-shaped should be on screen.
//
// Four things vanish on their own once actingCompany is null (sidebar nav, the
// Admin Console, the "Acting as" chip, the breadcrumb's company name). Two do
// not, and are what this file guards:
//   - the "Ask Centriyon" chatbot, which on the directory was a DEAD button:
//     it routes to /ai, which the spark gate bounces straight back here;
//   - the notifications bell, which loads company-scoped threads and would
//     re-poll every 45s for a company that isn't selected.
//
// The last describe block is the guard on the scoping rule: none of this may
// change what any other role sees.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let mockAuth: Record<string, unknown> = {};
let pathname = "/companies";

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => mockAuth,
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

const SPARK = { user_id: "usr_s", full_name: "Spark", email: "s@wearespark.me", role: "spark_internal" };
const ADMIN = { ...SPARK, role: "admin", company_id: "cmp_1", company_name: "Acme" };

const renderShell = () =>
  render(
    <MemoryRouter>
      <AppLayout />
    </MemoryRouter>,
  );

describe("shell on the company directory", () => {
  beforeEach(() => {
    pathname = "/companies";
    mockAuth = { user: SPARK, logout: vi.fn(), actingCompany: null };
  });

  it("hides the Ask Centriyon chatbot", () => {
    renderShell();
    expect(screen.queryByText(/ask centriyon/i)).not.toBeInTheDocument();
  });

  it("titles the page Companies, not Command Center", () => {
    // PAGE_NAMES had no /companies entry, so it fell through to the default and
    // the topbar read "Command Center" above a page headed Companies.
    renderShell();
    expect(screen.getByText("Companies")).toBeInTheDocument();
    expect(screen.queryByText("Command Center")).not.toBeInTheDocument();
  });
});

describe("shell inside a company", () => {
  beforeEach(() => {
    pathname = "/annual-report";
    mockAuth = {
      user: { ...SPARK, company_id: "cmp_1", company_name: "Acme" },
      logout: vi.fn(),
      actingCompany: { id: "cmp_1", name: "Acme" },
    };
  });

  it("brings the chatbot back", () => {
    renderShell();
    expect(screen.getByText(/ask centriyon/i)).toBeInTheDocument();
  });

  it("names the company in the breadcrumb", () => {
    renderShell();
    expect(screen.getByText("Acme")).toBeInTheDocument();
  });
});

// The scoping rule: every change in this pass is spark-only or a no-op.
describe("other roles are untouched", () => {
  beforeEach(() => {
    pathname = "/reports";
    mockAuth = { user: ADMIN, logout: vi.fn(), actingCompany: null };
  });

  it("an admin keeps the chatbot even with actingCompany null", () => {
    // actingCompany is ALWAYS null for a non-Spark role — it must never be read
    // as "company-less" for them.
    renderShell();
    expect(screen.getByText(/ask centriyon/i)).toBeInTheDocument();
  });

  it("an admin still sees their company in the breadcrumb", () => {
    renderShell();
    expect(screen.getByText("Acme")).toBeInTheDocument();
  });
});
