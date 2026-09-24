// The bell polls the Communication Hub every 45s from the app shell, so it
// runs on every authenticated page. Threads live inside a company, so for a
// user who has none (Spark staff, `spark_internal`, before picking one) that
// poll is a 400 on a loop, forever, on a screen that has nothing to do with
// communications.
//
// A regression here is silent — the page still works, it just quietly hammers
// a failing endpoint — so the guard is pinned rather than left to review.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const listThreads = vi.fn();
const listNotifications = vi.fn();
const listSystemNotifications = vi.fn();
const listIndexFailures = vi.fn();
const auth: { user: Record<string, unknown> | null; actingCompany: unknown } = {
  user: null,
  actingCompany: null,
};

vi.mock("@/lib/api", () => ({
  communications: { listThreads: () => listThreads(), markThreadRead: vi.fn() },
  // The bell reads three more feeds beyond Communication Hub threads: the
  // shared `notifications` table (system/department-suggestion rows), the
  // SAR backend's readiness feed, and board-report index failures. All are
  // mocked so the company guard below is measured on its own.
  notifications: { list: () => listSystemNotifications(), markRead: vi.fn() },
  sarNotifications: { list: () => listNotifications(), markRead: vi.fn() },
  agentRuns: { getByPollUrl: vi.fn() },
  earnings: { reindexEarningsReport: vi.fn() },
  quarterlyReports: { reindexReport: vi.fn() },
  boardReports: { listIndexFailures: () => listIndexFailures(), retryIndex: vi.fn() },
  ApiError: class extends Error {},
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));

const { NotificationBell } = await import("@/components/layout/NotificationBell");

describe("notification bell scoping", () => {
  beforeEach(() => {
    listThreads.mockReset().mockResolvedValue({ threads: [] });
    listNotifications.mockReset().mockResolvedValue({ notifications: [] });
    listSystemNotifications.mockReset().mockResolvedValue({ notifications: [] });
    listIndexFailures.mockReset().mockResolvedValue({ failures: [] });
    auth.actingCompany = null;
  });

  it("does not poll, or render, for a user with no company", async () => {
    auth.user = { user_id: "u_spark", role: "spark_internal", company_id: null };
    const { container } = render(<NotificationBell />);
    await waitFor(() => expect(listThreads).not.toHaveBeenCalled());
    // None of the four feeds — all are company-scoped in effect, and polling
    // any of them for a user with no company is the same wasted loop.
    expect(listNotifications).not.toHaveBeenCalled();
    expect(listSystemNotifications).not.toHaveBeenCalled();
    expect(listIndexFailures).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it("still polls and renders for a normal company user", async () => {
    auth.user = { user_id: "u_admin", role: "admin", company_id: "cmp_1" };
    render(<NotificationBell />);
    await waitFor(() => expect(listThreads).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button")).toBeTruthy();
  });
});
