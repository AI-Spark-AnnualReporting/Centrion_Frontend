// sarCycles.overview() is where the SAR payload's shape is translated for this
// app, and two of its translations are invisible when they break:
//
//   - session_id / hod_user_id / hod_name were being dropped entirely, which is
//     what stopped the Report team card from linking to a workspace at all;
//   - SAR sends the literal string "Unknown" for an unassigned session
//     (cycle_service: `user_info.get("full_name") or "Unknown"`), which is
//     truthy, so every "nobody assigned" fallback downstream silently loses.
//     Downstream is now CycleDetailPage's Assigned user column — the Report
//     team card stopped listing the assignee — so this is the only place the
//     assigned_user_* half of that mapping is pinned at all.
//
// Both fail by rendering something plausible, so they need pinning here.

import { describe, it, expect, beforeEach, vi } from "vitest";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const overviewPayload = (
  dept: Record<string, unknown>,
  cycle: Record<string, unknown> = {},
) => ({
  cycle: { id: "cyc_1", project_manager_id: "usr_pm", ...cycle },
  stats: {},
  departments: [
    {
      session_id: "sess_1",
      department_id: "dep_1",
      department_name: "Human Resources",
      department_code: "HR",
      hod_user_id: "usr_hod",
      hod_name: "Hr HOD",
      status: "in_progress",
      progress_percentage: 36,
      submitted_at: null,
      ...dept,
    },
  ],
});

describe("sarCycles.overview mapping", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("keeps the fields the workspace links are built from", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      jsonResponse(overviewPayload({ user_name: "Sara Khalid" })),
    ));
    const { sarCycles } = await import("@/lib/api");
    const [d] = (await sarCycles.overview("cyc_1")).departments;

    expect(d.session_id).toBe("sess_1");   // without this there is no deep link
    expect(d.hod_name).toBe("Hr HOD");     // the only dept->lead source on a live cycle
    expect(d.hod_user_id).toBe("usr_hod");
  });

  it("treats SAR's \"Unknown\" sentinel as nobody assigned", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      jsonResponse(overviewPayload({ user_name: "Unknown", user_id: null })),
    ));
    const { sarCycles } = await import("@/lib/api");
    const [d] = (await sarCycles.overview("cyc_1")).departments;

    expect(d.assigned_user_name).toBeUndefined();
  });

  it("leaves a real name alone", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      jsonResponse(overviewPayload({ user_name: "Sara Khalid" })),
    ));
    const { sarCycles } = await import("@/lib/api");
    const [d] = (await sarCycles.overview("cyc_1")).departments;

    expect(d.assigned_user_name).toBe("Sara Khalid");
  });

  it("keeps the PM's name, which the page has no other way to resolve", async () => {
    // CycleDetailPage falls back to searching the role=project_manager list, so
    // any PM outside it — a Spark-run cycle, for one — renders as "—" without
    // this. list() has always mapped it; overview() did not.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      jsonResponse(overviewPayload({ user_name: "Sara Khalid" }, { pm_name: "Spark Staff" })),
    ));
    const { sarCycles } = await import("@/lib/api");
    const { cycle } = await sarCycles.overview("cyc_1");

    expect(cycle.project_manager_name).toBe("Spark Staff");
  });

  it("prefers an explicit project_manager_name over pm_name", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      jsonResponse(overviewPayload({}, {
        project_manager_name: "Explicit", pm_name: "Fallback",
      })),
    ));
    const { sarCycles } = await import("@/lib/api");
    const { cycle } = await sarCycles.overview("cyc_1");

    expect(cycle.project_manager_name).toBe("Explicit");
  });

  it("still maps the renamed status and progress fields", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      jsonResponse(overviewPayload({ user_name: "Sara Khalid" })),
    ));
    const { sarCycles } = await import("@/lib/api");
    const [d] = (await sarCycles.overview("cyc_1")).departments;

    expect(d.session_status).toBe("in_progress");
    expect(d.progress).toBe(36);
  });
});
