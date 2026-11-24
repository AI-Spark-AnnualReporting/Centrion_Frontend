// The client's Subscription page (/admin-console/subscription) and its checkout
// step had no title entry, so the top bar read "Command Center" (QA audit
// SB-05). Both now say "Subscription", matching the sidebar item.

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let pathname = "/admin-console/subscription";

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

describe("Subscription page title", () => {
  it("titles the plan page Subscription, not Command Center", () => {
    expect(topbarTitle("/admin-console/subscription")).toBe("Subscription");
  });

  it("titles the checkout step Subscription too", () => {
    expect(topbarTitle("/admin-console/subscription/checkout")).toBe("Subscription");
  });

  it("leaves the other Admin Console pages alone", () => {
    expect(topbarTitle("/admin-console")).toBe("Admin Console");
    expect(topbarTitle("/admin-console/users")).toBe("Users & Roles");
  });
});
