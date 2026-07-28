// `mergeRun` decides what the background watcher remembers about a run as
// reports arrive from three different places with three different amounts of
// information. Every rule here fails silently when it breaks — a card goes
// anonymous, a run is polled at the wrong cadence, or a finished run never
// leaves the dock — so none of it is visible in a screenshot.

import { describe, it, expect } from "vitest";
import { mergeRun, type WatchedRun } from "@/context/ComplianceRunsContext";
import { runStateLabel, runTitle } from "@/lib/compliance-runs";

const NOW = 1_700_000_000_000;

// A run as the set-up screen first reports it: named, dated, still going.
function seed(over: Partial<WatchedRun> = {}): WatchedRun {
  const base = mergeRun(
    undefined,
    {
      runId: "run-1",
      status: "running",
      title: "FY-2025 Annual Report",
      period: "FY-2025",
      reportType: "annual",
      createdAt: NOW - 30_000,
    },
    NOW,
  );
  return { ...base, ...over };
}

describe("mergeRun — first sighting", () => {
  it("takes the run's own start time, not the moment this tab noticed it", () => {
    // A run discovered ten minutes in must look ten minutes old, or the poller
    // treats it as fresh and hammers it at the fast cadence indefinitely.
    const started = NOW - 10 * 60 * 1000;
    const run = mergeRun(undefined, { runId: "r", status: "running", createdAt: started }, NOW);
    expect(run.createdAt).toBe(started);
  });

  it("falls back to now when the report carries no start time", () => {
    const run = mergeRun(undefined, { runId: "r", status: "running" }, NOW);
    expect(run.createdAt).toBe(NOW);
  });

  it("is not marked terminal, notified or polled yet", () => {
    const run = mergeRun(undefined, { runId: "r", status: "running" }, NOW);
    expect(run.terminalAt).toBeNull();
    expect(run.notified).toBe(false);
    expect(run.lastPolledAt).toBe(0);
  });

  it("stamps terminalAt when the very first sighting is already finished", () => {
    const run = mergeRun(undefined, { runId: "r", status: "done" }, NOW);
    expect(run.terminalAt).toBe(NOW);
  });
});

describe("mergeRun — later reports", () => {
  it("keeps the label the first report gave it", () => {
    // GET /runs/{id} carries no title or period — only GET /runs does. A watcher
    // poll must not blank the name the set-up screen supplied.
    const first = seed();
    const next = mergeRun(first, { runId: "run-1", status: "running" }, NOW + 5_000);
    expect(next.title).toBe("FY-2025 Annual Report");
    expect(next.period).toBe("FY-2025");
    expect(next.reportType).toBe("annual");
  });

  it("fills a missing label in later, rather than leaving it blank forever", () => {
    // The progress screen after a refresh knows the id and nothing else; the
    // discovery sweep is what finally supplies a name.
    const bare = mergeRun(undefined, { runId: "run-1", status: "running" }, NOW);
    expect(bare.title).toBeNull();
    const named = mergeRun(bare, { runId: "run-1", status: "running", title: "Q3-2025" }, NOW);
    expect(named.title).toBe("Q3-2025");
  });

  it("never re-dates the run", () => {
    const first = seed();
    const next = mergeRun(first, { runId: "run-1", status: "running", createdAt: NOW }, NOW);
    expect(next.createdAt).toBe(first.createdAt);
  });

  it("stamps terminalAt once, on the transition", () => {
    const running = seed();
    const done = mergeRun(running, { runId: "run-1", status: "done" }, NOW + 60_000);
    expect(done.terminalAt).toBe(NOW + 60_000);
    // Re-stamping on every later report would keep a finished run in the dock
    // for as long as anything kept reporting it.
    const again = mergeRun(done, { runId: "run-1", status: "done" }, NOW + 120_000);
    expect(again.terminalAt).toBe(NOW + 60_000);
  });

  it("carries the error code through and preserves it when a later report omits it", () => {
    const running = seed();
    const failed = mergeRun(
      running,
      { runId: "run-1", status: "error", errorCode: "unreadable_file" },
      NOW,
    );
    expect(failed.errorCode).toBe("unreadable_file");
    const again = mergeRun(failed, { runId: "run-1", status: "error" }, NOW);
    expect(again.errorCode).toBe("unreadable_file");
  });

  it("clears a lost-contact state as soon as a report gets through", () => {
    const struggling = { ...seed(), consecutiveFailures: 5, lostContact: true };
    const recovered = mergeRun(struggling, { runId: "run-1", status: "running" }, NOW);
    expect(recovered.consecutiveFailures).toBe(0);
    expect(recovered.lostContact).toBe(false);
  });

  it("leaves `notified` for the caller to set, so a merge can't re-announce", () => {
    const announced = { ...seed(), status: "done" as const, terminalAt: NOW, notified: true };
    const again = mergeRun(announced, { runId: "run-1", status: "done" }, NOW + 1_000);
    expect(again.notified).toBe(true);
  });
});

describe("runStateLabel", () => {
  it("gives each state its own words", () => {
    // A run that failed has no results to be ready. The dock's summary line
    // read "1 result ready" over a row saying "Didn’t finish" until these
    // three were counted separately.
    expect(runStateLabel("running")).toBe("Validating…");
    expect(runStateLabel("done")).toBe("Results ready");
    expect(runStateLabel("error")).toBe("Didn’t finish");
    expect(runStateLabel("done")).not.toBe(runStateLabel("error"));
  });

  it("falls back rather than rendering an unrecognised status raw", () => {
    expect(runStateLabel(undefined)).toBe("Results ready");
    expect(runStateLabel("something_new")).toBe("Results ready");
  });
});

describe("runTitle", () => {
  it("reads an uploaded file's name as a name, not as a filename", () => {
    expect(runTitle("GHG_Protocol")).toBe("GHG Protocol");
    expect(runTitle("annual_report_final_v2")).toBe("annual report final v2");
  });

  it("leaves hyphens alone", () => {
    // "Q3-2025" and hyphenated report names read correctly as they are.
    expect(runTitle("Q3-2025 Interim")).toBe("Q3-2025 Interim");
  });

  it("returns empty for nothing, so callers can fall back", () => {
    expect(runTitle(null)).toBe("");
    expect(runTitle(undefined)).toBe("");
    expect(runTitle("   ")).toBe("");
  });
});
