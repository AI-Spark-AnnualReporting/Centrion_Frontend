// Drives the real provider — timers, discovery sweep, foreground claim and all
// — against a mocked API. `mergeRun` is covered next door as a pure function;
// what's here is the behaviour that only shows up once the coordinator is
// actually running, and that a reader can't verify by inspection: that a
// claimed run is never polled twice, that a completion is announced exactly
// once, and that the announcement survives a hidden tab.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

// Only the fields the coordinator actually reads off GET /runs/{id}.
interface MockRun {
  run_id: string;
  status: string;
  report_type?: string;
  certified?: boolean;
  error_code?: string | null;
}

interface ToastBody {
  title: string;
  description: string;
  variant?: string;
}

const getRun = vi.fn<(runId: string) => Promise<MockRun>>();
const listRuns = vi.fn<(companyId: string, query?: unknown) => Promise<unknown[]>>();
const toastSpy = vi.fn<(body: ToastBody) => { id: string; dismiss: () => void; update: () => void }>(
  () => ({ id: "1", dismiss: () => {}, update: () => {} }),
);

vi.mock("@/lib/api", () => ({
  complianceValidation: {
    getRun: (runId: string) => getRun(runId),
    listRuns: (companyId: string, query?: unknown) => listRuns(companyId, query),
  },
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public statusText = "",
      public body: unknown = null,
      public url = "",
    ) {
      super(`API ${status}`);
    }
  },
}));

vi.mock("@/hooks/use-toast", () => ({ toast: (body: ToastBody) => toastSpy(body) }));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", company_id: "co-1" } }),
}));

import {
  ComplianceRunsProvider,
  useComplianceRuns,
  useForegroundRun,
} from "@/context/ComplianceRunsContext";

function runRow(over: Record<string, unknown> = {}) {
  return {
    run_id: "run-a",
    subject_type: "report",
    subject_id: "s1",
    report_type: "annual",
    title: "FY-2025 Annual Report",
    period: "FY-2025",
    source: "generated",
    status: "running",
    error_code: null,
    overall_readiness: null,
    publication_gate: null,
    certified: false,
    certified_by: null,
    certified_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...over,
  };
}

// Reads the dock's view of the world without rendering the dock itself.
function Probe() {
  const { runs } = useComplianceRuns();
  return <div data-testid="runs">{runs.map((r) => `${r.runId}:${r.status}`).join(",")}</div>;
}

// Stands in for ComplianceRunningPage: claims the run so the coordinator
// leaves it alone.
function Foreground({ runId }: { runId: string }) {
  useForegroundRun(runId);
  return null;
}

function mount(children?: ReactNode) {
  return render(
    <MemoryRouter>
      <ComplianceRunsProvider>
        <Probe />
        {children}
      </ComplianceRunsProvider>
    </MemoryRouter>,
  );
}

// Lets pending promises settle between timer advances — the coordinator awaits
// getRun(), so advancing timers alone never reaches the state update.
async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  getRun.mockReset();
  listRuns.mockReset();
  toastSpy.mockReset();
  listRuns.mockResolvedValue([]);
  getRun.mockResolvedValue({ run_id: "run-a", status: "running", report_type: "annual", certified: false });
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("background watching", () => {
  it("picks up a run nobody in this tab started", async () => {
    // The whole point of the discovery sweep: a refresh, a second tab, or a
    // colleague's run should all surface without anyone registering them.
    listRuns.mockResolvedValue([runRow()]);
    mount();
    await advance(0);

    expect(listRuns).toHaveBeenCalledWith("co-1", { status: "running", limit: 50 });
    expect(screen.getByTestId("runs")).toHaveTextContent("run-a:running");
  });

  it("polls a run it owns, and announces it once when it lands", async () => {
    listRuns.mockResolvedValue([runRow()]);
    mount();
    await advance(0);

    getRun.mockResolvedValue({
      run_id: "run-a",
      status: "done",
      report_type: "annual",
      certified: false,
    });
    await advance(6_000);

    expect(getRun).toHaveBeenCalledWith("run-a");
    expect(screen.getByTestId("runs")).toHaveTextContent("run-a:done");
    expect(toastSpy).toHaveBeenCalledTimes(1);
    expect(toastSpy.mock.calls[0][0]).toMatchObject({ title: "Validation complete" });

    // Still terminal on every later tick — announcing again would be the bug.
    await advance(30_000);
    expect(toastSpy).toHaveBeenCalledTimes(1);
  });

  it("says a failed run failed, rather than calling it a result", async () => {
    listRuns.mockResolvedValue([runRow()]);
    mount();
    await advance(0);

    getRun.mockResolvedValue({
      run_id: "run-a",
      status: "error",
      report_type: "annual",
      certified: false,
      error_code: "unreadable_file",
    });
    await advance(6_000);

    expect(toastSpy).toHaveBeenCalledTimes(1);
    const body = toastSpy.mock.calls[0][0];
    expect(body.title).toBe("Validation didn’t finish");
    expect(body.variant).toBe("destructive");
    // The one failure that is about the file rather than about us.
    expect(body.description).toContain("couldn’t read");
  });

  it("does not poll a run a screen has claimed", async () => {
    // Two pollers for one run is the failure this whole claim mechanism exists
    // to prevent, and it's invisible except in a network tab.
    listRuns.mockResolvedValue([runRow()]);
    mount(<Foreground runId="run-a" />);
    await advance(0);
    await advance(30_000);

    expect(getRun).not.toHaveBeenCalled();
  });

  it("takes the run over as soon as the screen holding it goes away", async () => {
    listRuns.mockResolvedValue([runRow()]);
    const view = mount(<Foreground runId="run-a" />);
    await advance(0);
    expect(getRun).not.toHaveBeenCalled();

    // Standing in for "Continue in background", or any other way out.
    view.rerender(
      <MemoryRouter>
        <ComplianceRunsProvider>
          <Probe />
        </ComplianceRunsProvider>
      </MemoryRouter>,
    );
    await advance(6_000);

    expect(getRun).toHaveBeenCalledWith("run-a");
  });

  it("keeps watching well past the progress screen's five-minute ceiling", async () => {
    // The screen gives up at five minutes because someone is watching a
    // spinner. Giving up here would just lose the run.
    listRuns.mockResolvedValue([runRow({ created_at: new Date(Date.now() - 9 * 60_000).toISOString() })]);
    mount();
    await advance(0);

    const before = getRun.mock.calls.length;
    await advance(35_000);
    expect(getRun.mock.calls.length).toBeGreaterThan(before);
  });

  it("keeps polling while the tab is hidden, so the answer is waiting on return", async () => {
    listRuns.mockResolvedValue([runRow()]);
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    mount();
    await advance(0);
    await advance(20_000);

    expect(getRun).toHaveBeenCalled();
  });

  it("drops a run the server no longer has", async () => {
    const { ApiError } = await import("@/lib/api");
    listRuns.mockResolvedValue([runRow()]);
    mount();
    await advance(0);

    getRun.mockRejectedValue(new ApiError(404, "Not Found", null, "/runs/run-a"));
    await advance(6_000);

    expect(screen.getByTestId("runs")).toHaveTextContent("");
  });

  it("rides out a network wobble instead of dropping the run", async () => {
    listRuns.mockResolvedValue([runRow()]);
    mount();
    await advance(0);

    getRun.mockRejectedValue(new Error("network"));
    await advance(20_000);

    // Still tracked — an unreachable server says nothing about the run itself.
    expect(screen.getByTestId("runs")).toHaveTextContent("run-a:running");
    expect(toastSpy).not.toHaveBeenCalled();
  });
});
