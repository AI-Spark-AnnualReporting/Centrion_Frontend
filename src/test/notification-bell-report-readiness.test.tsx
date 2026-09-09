// When a finalised report can't be prepared for the AI assistant, the only way
// the person who approved it ever finds out is a row in this bell — the failure
// happens in a background task, after approve has already returned success.
//
// Three things are pinned here because each one silently defeats the feature:
//   * the row appears at all, and carries a working "Try again";
//   * retrying hits the right backend for the report's kind;
//   * Communication Hub rows in the SAME shared table are not listed twice.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const listThreads = vi.fn();
const listNotifications = vi.fn();
const markRead = vi.fn();
const reindexEarnings = vi.fn();
const reindexQuarterly = vi.fn();
const getByPollUrl = vi.fn();
const navigate = vi.fn();

const auth: { user: Record<string, unknown> | null; actingCompany: unknown } = {
  user: { user_id: "u_admin", role: "admin", company_id: "cmp_1" },
  actingCompany: null,
};

vi.mock("@/lib/api", () => ({
  communications: { listThreads: () => listThreads(), markThreadRead: vi.fn() },
  sarNotifications: { list: () => listNotifications(), markRead: (id: string) => markRead(id) },
  agentRuns: { getByPollUrl: (u: string) => getByPollUrl(u) },
  earnings: { reindexEarningsReport: (id: string) => reindexEarnings(id) },
  quarterlyReports: { reindexReport: (c: string, r: string) => reindexQuarterly(c, r) },
  ApiError: class extends Error {},
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

const { NotificationBell } = await import("@/components/layout/NotificationBell");

function readinessRow(over: Record<string, unknown> = {}) {
  return {
    id: "n-1",
    notification_type: "alert",
    related_type: "report",
    related_id: "rep-1",
    action_url: "/earnings/rep-1/report",
    title: "The AI assistant can't read this report yet",
    message:
      "Q3 2025 earnings report is saved and locked, but we couldn't finish getting it ready.",
    is_read: false,
    priority: "high",
    created_at: new Date().toISOString(),
    ...over,
  };
}

async function openBell() {
  render(<NotificationBell />);
  await waitFor(() => expect(listNotifications).toHaveBeenCalled());
  fireEvent.click(screen.getByLabelText("Notifications"));
  await screen.findByRole("menu");
}

describe("report-readiness notifications", () => {
  beforeEach(() => {
    listThreads.mockReset().mockResolvedValue({ threads: [] });
    listNotifications.mockReset().mockResolvedValue({ notifications: [readinessRow()] });
    markRead.mockReset();
    reindexEarnings.mockReset().mockResolvedValue({ report_id: "rep-1", run_id: null, poll_url: null });
    reindexQuarterly.mockReset().mockResolvedValue({ report_id: "rep-1", run_id: null, poll_url: null });
    getByPollUrl.mockReset();
    navigate.mockReset();
  });

  it("shows the warning and offers a way to fix it", async () => {
    await openBell();
    expect(screen.getByText(/can't read this report yet/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("says nothing technical", async () => {
    // The reader is an IR or finance person. "embedding" and "indexing" are not
    // words that tell them anything about what went wrong or what to do.
    await openBell();
    const panel = screen.getByRole("menu").textContent?.toLowerCase() ?? "";
    for (const jargon of ["embed", "index", "vector", "chunk", "rag"]) {
      expect(panel).not.toContain(jargon);
    }
  });

  it("retries an earnings report against the earnings backend", async () => {
    await openBell();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(reindexEarnings).toHaveBeenCalledWith("rep-1"));
    expect(reindexQuarterly).not.toHaveBeenCalled();
  });

  it("retries a quarterly report against the quarterly backend, with its company", async () => {
    listNotifications.mockResolvedValue({
      notifications: [readinessRow({ action_url: "/quarterly-report/rep-9/report", related_id: "rep-9" })],
    });
    await openBell();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(reindexQuarterly).toHaveBeenCalledWith("cmp_1", "rep-9"));
    expect(reindexEarnings).not.toHaveBeenCalled();
  });

  it("does not navigate away when Try again is pressed", async () => {
    // The point of fixing it from the bell is not having to go anywhere. The row
    // itself is still a deep link, so the button has to stop that click.
    await openBell();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(reindexEarnings).toHaveBeenCalled());
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does not list Communication Hub rows from the same shared table twice", async () => {
    // Centriyon writes comm-hub notifications into this table too, and those
    // already reach the bell through the thread feed. Without the type filter
    // every @mention would appear twice.
    listNotifications.mockResolvedValue({
      notifications: [
        readinessRow(),
        { ...readinessRow({ id: "n-2" }), notification_type: "system", related_type: null,
          title: "New comment on Q3" },
      ],
    });
    await openBell();
    expect(screen.queryByText("New comment on Q3")).toBeNull();
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
  });

  it("keeps the bell working when the shared feed is unreachable", async () => {
    // Two hosts, two failure modes. A dead SAR backend must not empty the bell.
    listNotifications.mockRejectedValue(new Error("SAR is down"));
    listThreads.mockResolvedValue({
      threads: [{
        thread_id: "t1", unread_count: 1, updated_at: new Date().toISOString(),
        subject: "Budget review", report: null,
        last_message: { is_you: false, sender_full_name: "Sam", preview: "take a look" },
      }],
    });
    await openBell();
    expect(screen.getByText("Budget review")).toBeTruthy();
  });

  it("leaves out the button when there is no report to act on", async () => {
    // A row whose link we cannot parse still reads fine; it just cannot self-heal.
    listNotifications.mockResolvedValue({
      notifications: [readinessRow({ action_url: null, related_id: null })],
    });
    await openBell();
    expect(screen.getByText(/can't read this report yet/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});
