// Approving a board report kicks off its embedding in the background. When that
// job fails, the only way the person who created the report finds out is this
// row in the bell — and the only way they fix it is the Retry button on it.
//
// Two things are pinned here because both are silent when they break:
//   1. The Retry click must not ALSO open the row and navigate away. The row is
//      a click target and the button sits inside it.
//   2. One feed failing must not blank the other. The bell reads two endpoints.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const listThreads = vi.fn();
const listIndexFailures = vi.fn();
const retryIndex = vi.fn();
const navigate = vi.fn();
const toasted: unknown[] = [];

class FakeApiError extends Error {
  status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

vi.mock("@/lib/api", () => ({
  communications: { listThreads: () => listThreads(), markThreadRead: vi.fn() },
  boardReports: {
    listIndexFailures: () => listIndexFailures(),
    retryIndex: (id: string) => retryIndex(id),
  },
  ApiError: FakeApiError,
}));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { user_id: "u_admin", role: "admin", company_id: "cmp_1" },
    actingCompany: null,
  }),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));
vi.mock("@/hooks/use-toast", () => ({ toast: (args: unknown) => toasted.push(args) }));

const { NotificationBell } = await import("@/components/layout/NotificationBell");

const MESSAGE =
  "FY 2026 board report is saved and locked, but we couldn't finish getting it " +
  "ready for the AI assistant. Until that's done, the assistant won't be able " +
  "to answer questions about this report.";

const FAILURE = {
  report_id: "rpt_1",
  period: "FY-2026",
  label: "FY 2026 board report",
  notification_id: "ntf_1",
  title: "The AI assistant can't read this report yet",
  message: MESSAGE,
  failed_at: "2026-01-02T10:00:00Z",
  stale: false,
};

const THREAD = {
  thread_id: "thr_1",
  subject: "Q4 review",
  report: null,
  unread_count: 2,
  updated_at: "2026-01-02T09:00:00Z",
  last_message: { preview: "Take a look", sender_full_name: "Noura", is_you: false },
};

async function openPanel() {
  render(<NotificationBell />);
  await waitFor(() => expect(listIndexFailures).toHaveBeenCalled());
  fireEvent.click(screen.getByLabelText("Notifications"));
  await screen.findByRole("menu");
}

describe("board report indexing failures in the bell", () => {
  beforeEach(() => {
    listThreads.mockReset().mockResolvedValue({ threads: [] });
    listIndexFailures.mockReset().mockResolvedValue({ failures: [FAILURE] });
    retryIndex.mockReset().mockResolvedValue({ run_id: "run_2", status: "running" });
    navigate.mockReset();
    toasted.length = 0;
  });

  it("renders the backend's wording verbatim, with a Try again button", async () => {
    await openPanel();
    expect(screen.getByText("The AI assistant can't read this report yet")).toBeTruthy();
    // Not truncated to a preview — the sentence is the point of the alert.
    expect(screen.getByText(MESSAGE)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("retries the job without navigating away from the panel", async () => {
    await openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(retryIndex).toHaveBeenCalledWith("rpt_1");
    // The row's own click handler must not have fired too.
    expect(navigate).not.toHaveBeenCalled();
  });

  it("shows a pending label while the report is still being reported as failed", async () => {
    await openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    // The refetch still reports it, so the row stays — with the pending label,
    // rather than silently looking like it worked.
    await waitFor(() => expect(screen.getByRole("button", { name: "Getting it ready…" })).toBeTruthy());
  });

  it("clears the row once the backend stops reporting the report", async () => {
    await openPanel();
    listIndexFailures.mockResolvedValue({ failures: [] });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() =>
      expect(screen.queryByText("The AI assistant can't read this report yet")).toBeNull(),
    );
  });

  it("confirms with a toast once the retry lands", async () => {
    await openPanel();
    listIndexFailures.mockResolvedValue({ failures: [] });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(toasted).toHaveLength(1));
    const t = toasted[0] as { title: string; description: string };
    expect(t.title).toBe("The assistant can read this report now");
    // Named, even though the row that carried the name is already gone.
    expect(t.description).toContain("FY 2026 board report");
  });

  it("announces one retry exactly once", async () => {
    // The transition is what fires it, not the poll — so the polls that follow
    // must stay quiet.
    await openPanel();
    listIndexFailures.mockResolvedValue({ failures: [] });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(toasted).toHaveLength(1));
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Notifications"));
      fireEvent.click(screen.getByLabelText("Notifications"));
    });
    expect(toasted).toHaveLength(1);
  });

  it("says nothing when a retry fails again", async () => {
    // The warning row coming back IS the message. Two channels saying the same
    // thing is worse than one.
    await openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Getting it ready…" })).toBeTruthy(),
    );
    expect(toasted).toHaveLength(0);
  });

  it("does not claim success when the feed request itself fails", async () => {
    // A failed request returns no failures, which must not read as "every retry
    // worked" — that would announce success for a job that may have failed.
    await openPanel();
    listIndexFailures.mockRejectedValue(new FakeApiError(500));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(retryIndex).toHaveBeenCalled());
    expect(toasted).toHaveLength(0);
  });

  it("never toasts for an index that succeeded without a retry", async () => {
    // The user never knew there was a problem; a fix they did not ask for is noise.
    listIndexFailures.mockResolvedValue({ failures: [] });
    await openPanel();
    expect(toasted).toHaveLength(0);
  });

  it("still shows thread messages when the failure feed is down", async () => {
    listThreads.mockResolvedValue({ threads: [THREAD] });
    listIndexFailures.mockRejectedValue(new FakeApiError(500));

    await openPanel();
    expect(screen.getByText("Q4 review")).toBeTruthy();
  });

  it("still shows failures when the thread feed is down", async () => {
    listThreads.mockRejectedValue(new FakeApiError(500));

    await openPanel();
    expect(screen.getByText("The AI assistant can't read this report yet")).toBeTruthy();
  });
});
