// Adding a department after kickoff (Annual Reporting plan: add-department-after-kickoff.md).
//
// An admin can add departments to an active cycle until the PM clicks Start
// Building in the Annual Reporting app (cycle.sections_locked). Then the card
// is gone. A draft cycle keeps its setup panel and Submit cycle, unchanged.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const api = {
  overview: vi.fn(),
  sections: vi.fn(),
  listDepartments: vi.fn(),
};

vi.mock("@/lib/api", () => ({
  sarCycles: {
    overview: (...a: unknown[]) => api.overview(...a),
    sections: (...a: unknown[]) => api.sections(...a),
    resolveSections: vi.fn(),
    assignDepartments: vi.fn(),
    setOutlineSource: vi.fn(),
    outlinePreview: vi.fn(() => new Promise(() => {})),
  },
  sarUsers: { listProjectManagers: () => Promise.resolve([]) },
  adminConsole: { listDepartments: () => api.listDepartments() },
  companies: {
    getLatestOutline: () => Promise.resolve({ outline: null }),
    getDepartmentSuggestions: () => Promise.resolve(null),
  },
  ApiError: class ApiError extends Error {},
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { role: "admin", company_id: "cmp_1", full_name: "Admin" } }),
}));

const { default: CycleDetailPage } = await import("@/pages/annual-report/CycleDetailPage");

/** A cycle overview with one kicked-off department. */
function overview(status: string, sectionsLocked: boolean) {
  return {
    cycle: {
      id: "cyc_1",
      company_id: "cmp_1",
      cycle_name: "Annual Report v7",
      fiscal_year: 2026,
      status,
      sections_locked: sectionsLocked,
      project_manager_id: "usr_pm",
      submission_deadline: "2026-10-13",
      outline_source: "system",
    },
    stats: { total_sections: 0, completed_sections: 0, total_departments: 1, submitted: 0, in_progress: 1, completion_rate: 0 },
    departments: [
      { session_id: "s1", department_id: "d1", department_name: "Human Resources", department_code: "HR", status: "in_progress", progress_percentage: 40 },
    ],
  };
}

function renderPage() {
  const view = render(
    <MemoryRouter initialEntries={["/annual-report/cycles/cyc_1"]}>
      <Routes>
        <Route path="/annual-report/cycles/:cycleId" element={<CycleDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
  return view.container;
}

beforeEach(() => {
  api.overview.mockReset();
  api.sections.mockReset();
  api.listDepartments.mockReset();
  api.sections.mockResolvedValue([]);
  api.listDepartments.mockResolvedValue([]);
});

describe("Adding a department after kickoff", () => {
  it("shows the departments card with Save on an active cycle before Start Building", async () => {
    api.overview.mockResolvedValue(overview("active", false));
    const container = renderPage();

    expect(await screen.findByRole("button", { name: "Save departments" })).toBeInTheDocument();
    expect(container.querySelector("#cycle-setup-departments")).not.toBeNull();
    // The draft-only setup panel stays away.
    expect(screen.queryByRole("button", { name: /Submit cycle/ })).not.toBeInTheDocument();
  });

  it("hides the card once the PM has started building", async () => {
    api.overview.mockResolvedValue(overview("active", true));
    const container = renderPage();

    await waitFor(() => expect(screen.getByText("Department Sessions")).toBeInTheDocument());
    expect(container.querySelector("#cycle-setup-departments")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save departments" })).not.toBeInTheDocument();
  });

  it("keeps the draft setup unchanged: Submit cycle, no extra Save", async () => {
    api.overview.mockResolvedValue(overview("draft", false));
    renderPage();

    expect(await screen.findByRole("button", { name: /Submit cycle/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save departments" })).not.toBeInTheDocument();
  });
});
