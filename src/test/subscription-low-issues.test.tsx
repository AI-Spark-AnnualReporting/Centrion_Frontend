// The low issues found by the subscription test runs:
//  4 — after login you go back to the page a link pointed to (ProtectedRoute → LoginPage);
//  5 — the Disclosure Timeline locks "Start …" buttons for modules the user can't create.
// Plan: Centriton/.claude/plans/subscription-low-issues-fixes.md

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const authState: { user: Record<string, unknown> | null; login: ReturnType<typeof vi.fn> } = { user: null, login: vi.fn() };
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: authState.user, loading: false, actingCompany: null, login: authState.login }),
}));

const { safeReturnPath } = await import("@/lib/appRouting");
const { ProtectedRoute } = await import("@/components/ProtectedRoute");
const { LoginPage } = await import("@/components/auth/AuthPages");
const { lockFor } = await import("@/components/dashboard/DisclosureTimeline");

function Where() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname}|{JSON.stringify(location.state)}</div>;
}

beforeEach(() => {
  authState.user = null;
  authState.login.mockReset();
});

// ── Issue 4 ─────────────────────────────────────────────────────────

describe("safeReturnPath", () => {
  it("keeps an address inside this app", () => {
    expect(safeReturnPath("/spark/quotes")).toBe("/spark/quotes");
    expect(safeReturnPath("/reports/quarterly?tab=2")).toBe("/reports/quarterly?tab=2");
  });

  it("sends anything else home", () => {
    for (const bad of [undefined, null, "", "spark/quotes", "//evil.com", "/\\evil.com", "https://evil.com", "/login", "/login?x=1"]) {
      expect(safeReturnPath(bad)).toBe("/");
    }
  });
});

describe("login returns to the page a link pointed to", () => {
  it("a logged-out visitor is sent to login with the page they asked for", () => {
    render(
      <MemoryRouter initialEntries={["/spark/quotes?x=1"]}>
        <Routes>
          <Route element={<ProtectedRoute />}><Route path="/spark/quotes" element={<div>Quotes</div>} /></Route>
          <Route path="/login" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("where")).toHaveTextContent('/login|{"from":"/spark/quotes?x=1"}');
  });

  it("after logging in it goes there — and home when there's no page", async () => {
    authState.login.mockResolvedValue({ must_change_password: false, default_app: "centriton_dashboard" });
    for (const [state, expected] of [[{ from: "/spark/quotes" }, "/spark/quotes"], [null, "/"], [{ from: "//evil.com" }, "/"]] as const) {
      const { unmount } = render(
        <MemoryRouter initialEntries={[{ pathname: "/login", state }]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </MemoryRouter>,
      );
      fireEvent.change(document.querySelector("input[type=email]")!, { target: { value: "a@b.com" } });
      fireEvent.change(document.querySelector("input[type=password]")!, { target: { value: "secret123" } });
      fireEvent.click(document.querySelector("button.btn-auth")!);
      await waitFor(() => expect(screen.getByTestId("where").textContent?.split("|")[0]).toBe(expected));
      unmount();
    }
  });

  it("a user who must change their password still goes to change it first", async () => {
    authState.login.mockResolvedValue({ must_change_password: true });
    render(
      <MemoryRouter initialEntries={[{ pathname: "/login", state: { from: "/spark/quotes" } }]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.change(document.querySelector("input[type=email]")!, { target: { value: "a@b.com" } });
    fireEvent.change(document.querySelector("input[type=password]")!, { target: { value: "secret123" } });
    fireEvent.click(document.querySelector("button.btn-auth")!);
    await waitFor(() => expect(screen.getByTestId("where").textContent?.startsWith("/change-password")).toBe(true));
  });
});

// ── Issue 5 ─────────────────────────────────────────────────────────

const can = (...keys: string[]) => Object.fromEntries(keys.map((k) => [k, { read: true, create: true }]));

describe("Disclosure Timeline locks modules the user can't create", () => {
  it("a module the user can create: not locked", () => {
    expect(lockFor("due-quarterly", { role: "admin", permissions: can("quarterly_report") } as never, false)).toBeNull();
  });

  it("cloud admin without the module: 'Not in your plan' + Choose a plan", () => {
    const lock = lockFor("due-esg", { role: "admin", permissions: can("quarterly_report") } as never, false);
    expect(lock).toEqual({ tip: "Not in your plan — choose a plan to switch it on", linkLabel: "Choose a plan →", linkPath: "/admin-console/subscription" });
  });

  it("on-premises admin: 'Update your license' (there is no Subscription page)", () => {
    const lock = lockFor("due-annual", { role: "admin", permissions: {} } as never, true);
    expect(lock?.linkLabel).toBe("Update your license →");
    expect(lock?.linkPath).toBe("/admin-console");
  });

  it("anyone else: 'Not available to you', no link (it may be their role, not the plan)", () => {
    expect(lockFor("due-quarterly", { role: "ir", permissions: {} } as never, false)).toEqual({ tip: "Not available to you", linkLabel: null, linkPath: null });
  });

  it("rows that don't start a report (meetings, an existing cycle) are never locked", () => {
    expect(lockFor("meeting-123", { role: "ir", permissions: {} } as never, false)).toBeNull();
  });
});
