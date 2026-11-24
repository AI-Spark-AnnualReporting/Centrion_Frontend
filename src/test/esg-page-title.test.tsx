// An ESG Validator result lives at /reports/<id>. Only exact paths were mapped,
// so the top bar read "Command Center" there (QA audit ES-03), and the ESG
// Validator list at /reports read "Reports" while the sidebar item says
// "ESG Validator". /reports/processing (shared by ESG and Quarterly runs) must
// NOT be claimed by the new /reports/ rule.

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let pathname = "/reports";

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

/** The text in the top bar's page-name slot. */
function topbarTitle(path: string): string | null {
  pathname = path;
  const { container, unmount } = render(
    <MemoryRouter>
      <AppLayout />
    </MemoryRouter>,
  );
  const title = container.querySelector(".tb-page")?.textContent ?? null;
  unmount();
  return title;
}

describe("ESG Validator page titles", () => {
  it("titles the ESG result page ESG Validator, not Command Center", () => {
    expect(topbarTitle("/reports/9f2c1e7a-report-id")).toBe("ESG Validator");
  });

  it("titles the ESG Validator list ESG Validator, matching the sidebar", () => {
    expect(topbarTitle("/reports")).toBe("ESG Validator");
  });

  it("does not claim the shared progress page", () => {
    expect(topbarTitle("/reports/processing")).toBe("Reports");
  });

  it("leaves Quarterly Reports alone", () => {
    expect(topbarTitle("/reports/quarterly")).toBe("Quarterly Reports");
  });

  it("does not touch the Command Center", () => {
    expect(topbarTitle("/dashboard")).toBe("Command Center");
  });
});
