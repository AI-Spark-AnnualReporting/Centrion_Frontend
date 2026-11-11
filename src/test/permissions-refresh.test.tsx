// Logged-in users pick up a plan bought (or changed) while they're logged in,
// without a reload: AuthContext asks for fresh permissions every 5 minutes while
// the tab is visible, and when the tab comes back (at most once a minute).
// Plan: Centrion_Frontend/.claude/plans/subscription-refresh-and-banner.md

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";

const USER = {
  user_id: "usr_pm", email: "pm@example.com", role: "project_manager", company_id: "cmp_1",
  permissions: { board_report: { read: false, create: false } }, visible_features: [], apps: ["centriton_dashboard"],
  default_app: "centriton_dashboard",
};
const refreshToken = vi.fn();
vi.mock("@/lib/api", () => ({
  getStoredUser: () => USER,
  getToken: () => "jwt",
  setStoredUser: vi.fn(),
  setAuthToken: vi.fn(),
  logout: vi.fn(),
  login: vi.fn(),
  companies: { get: vi.fn().mockResolvedValue({}) },
  auth: { me: vi.fn().mockResolvedValue({}), onboarding: vi.fn(), changePassword: vi.fn(), refreshToken: () => refreshToken() },
}));

const { AuthProvider, useAuth } = await import("@/context/AuthContext");
const { samePermissions, REFRESH_EVERY_MS, MIN_GAP_ON_FOCUS_MS } = await import("@/lib/permissionsRefresh");

let renders = 0;
function Probe() {
  const { user } = useAuth();
  renders += 1;
  return <div data-testid="board">{user?.permissions?.board_report?.create ? "can create" : "can't create"}</div>;
}

function answer(boardCreate: boolean) {
  return { access_token: "jwt2", permissions: { board_report: { read: boardCreate, create: boardCreate } },
           visible_features: [], apps: ["centriton_dashboard"], default_app: "centriton_dashboard" };
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  refreshToken.mockReset();
  refreshToken.mockResolvedValue(answer(false));
  renders = 0;
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
});
afterEach(() => vi.useRealTimers());

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

describe("samePermissions", () => {
  it("same permissions, features, apps and default app → same", () => {
    expect(samePermissions(USER as never, answer(false) as never)).toBe(true);
  });
  it("a module added, or nothing saved yet → different", () => {
    expect(samePermissions(USER as never, answer(true) as never)).toBe(false);
    expect(samePermissions(null, answer(false) as never)).toBe(false);
  });
});

describe("AuthContext refreshes permissions while logged in", () => {
  it("every 5 minutes while visible: a plan bought meanwhile reaches the user without a reload", async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    await flush();
    expect(refreshToken).toHaveBeenCalledTimes(1);                      // on start, as before
    expect(screen.getByTestId("board")).toHaveTextContent("can't create");

    refreshToken.mockResolvedValue(answer(true));                       // the admin bought Board Report
    await act(async () => { vi.advanceTimersByTime(REFRESH_EVERY_MS); });
    await flush();
    expect(refreshToken).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("board")).toHaveTextContent("can create");
  });

  it("not while the tab is hidden", async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    await flush();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    await act(async () => { vi.advanceTimersByTime(REFRESH_EVERY_MS * 2); });
    expect(refreshToken).toHaveBeenCalledTimes(1);
  });

  it("coming back to the tab asks again — but not more than once a minute", async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    await flush();
    await act(async () => { setVisibility("hidden"); setVisibility("visible"); });   // right away: too soon
    expect(refreshToken).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(MIN_GAP_ON_FOCUS_MS); setVisibility("hidden"); setVisibility("visible"); });
    await flush();
    expect(refreshToken).toHaveBeenCalledTimes(2);
  });

  it("a check that finds nothing new doesn't redraw the screens", async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    await flush();
    const before = renders;
    await act(async () => { vi.advanceTimersByTime(REFRESH_EVERY_MS); });
    await flush();
    expect(refreshToken).toHaveBeenCalledTimes(2);
    expect(renders - before).toBeLessThanOrEqual(1);    // the new token only, not a new user object for every page
  });
});
