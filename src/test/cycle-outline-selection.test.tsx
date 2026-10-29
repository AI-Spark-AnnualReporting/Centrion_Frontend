// The Outline card on the cycle page, before and after an outline is picked.
//
// A new cycle has outline_source = null. Until someone picks Previous or System:
//   - the card shows only "No outline selected yet" + Select outline;
//   - no section list is built behind their back (resolve-sections is NOT called);
//   - Submit stays blocked, with the reason stated.
// Once picked, the card names the outline in use and offers Change outline.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const api = {
  overview: vi.fn(),
  sections: vi.fn(),
  resolveSections: vi.fn(),
  assignDepartments: vi.fn(),
  listDepartments: vi.fn(),
};

vi.mock("@/lib/api", () => ({
  sarCycles: {
    overview: (...a: unknown[]) => api.overview(...a),
    sections: (...a: unknown[]) => api.sections(...a),
    resolveSections: (...a: unknown[]) => api.resolveSections(...a),
    assignDepartments: (...a: unknown[]) => api.assignDepartments(...a),
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

function overviewWith(outlineSource: "previous" | "system" | null, status = "draft") {
  return {
    cycle: {
      id: "cyc_1",
      company_id: "cmp_1",
      cycle_name: "Annual Report v7",
      fiscal_year: 2026,
      status,
      project_manager_id: "usr_pm",
      submission_deadline: "2026-10-13",
      outline_source: outlineSource,
    },
    stats: { total_sections: 0, completed_sections: 0, total_departments: 0, submitted: 0, in_progress: 0, completion_rate: 0 },
    departments: [],
  };
}

const SECTIONS = [
  { section_code: "toc", title: "Table of Contents", layer: "common", mode: "auto", status: "pending", display_order: 1 },
];

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/annual-report/cycles/cyc_1"]}>
      <Routes>
        <Route path="/annual-report/cycles/:cycleId" element={<CycleDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  api.overview.mockReset();
  api.sections.mockReset();
  api.resolveSections.mockReset();
  api.assignDepartments.mockReset();
  api.listDepartments.mockReset();
  api.listDepartments.mockResolvedValue([]);
});

describe("Outline card", () => {
  it("asks to select an outline and builds nothing while none is picked", async () => {
    api.overview.mockResolvedValue(overviewWith(null));
    api.sections.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText("No outline selected yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select outline" })).toBeInTheDocument();
    expect(screen.queryByText("Rebuild from this list")).not.toBeInTheDocument();
    expect(screen.queryByText(/Re-resolve from current profile/)).not.toBeInTheDocument();
    // The Cycle setup panel names the missing step and keeps Submit cycle disabled.
    expect(screen.getByText("Select an outline")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Submit cycle/ })).toBeDisabled();
    expect(api.resolveSections).not.toHaveBeenCalled();
  });

  it("names the outline in use once one is picked", async () => {
    api.overview.mockResolvedValue(overviewWith("system"));
    api.sections.mockResolvedValue(SECTIONS);
    renderPage();

    expect(await screen.findByText("Selected outline")).toBeInTheDocument();
    expect(screen.getByText("System · 1 section")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Change outline/ })).toBeInTheDocument();
    expect(screen.getByText(/Re-resolve from current profile/)).toBeInTheDocument();
    expect(screen.getByText("Table of Contents")).toBeInTheDocument();
  });

  it("still builds the list on first open when an outline is already picked", async () => {
    api.overview.mockResolvedValue(overviewWith("system"));
    api.sections.mockResolvedValue([]);
    api.resolveSections.mockResolvedValue({ success: true, cycle_id: "cyc_1", sections_created: 1, sections: SECTIONS });
    renderPage();

    expect(await screen.findByText("Table of Contents")).toBeInTheDocument();
    expect(api.resolveSections).toHaveBeenCalledWith("cyc_1");
  });

  it("hides Re-resolve on the Previous outline", async () => {
    api.overview.mockResolvedValue(overviewWith("previous"));
    api.sections.mockResolvedValue(SECTIONS);
    renderPage();

    expect(await screen.findByText("Selected outline")).toBeInTheDocument();
    expect(screen.queryByText(/Re-resolve from current profile/)).not.toBeInTheDocument();
  });

  it("Submit cycle sends the whole department list with replace, so removed ones go", async () => {
    const overview = overviewWith("system");
    overview.departments = [
      { department_id: "dep_fin", department_name: "Finance", department_code: "FIN" },
    ] as never[];
    api.overview.mockResolvedValue(overview);
    api.sections.mockResolvedValue(SECTIONS);
    api.listDepartments.mockResolvedValue([
      { id: "dep_fin", department_name: "Finance", department_code: "FIN", has_hod: true, is_active: true },
    ]);
    api.assignDepartments.mockResolvedValue({ success: true, message: "", assignments_created: 1, assignments_removed: 1, assignments: [] });
    renderPage();

    const submit = await screen.findByRole("button", { name: /Submit cycle/ });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);

    await waitFor(() => expect(api.assignDepartments).toHaveBeenCalled());
    expect(api.assignDepartments).toHaveBeenCalledWith("cyc_1", {
      assignments: [{ department_id: "dep_fin" }],
      replace: true,
    });
    expect(await screen.findByText(/1 removed/)).toBeInTheDocument();
  });

  it("locks the outline once the cycle has started: no Change outline, no Re-resolve", async () => {
    api.overview.mockResolvedValue(overviewWith("system", "active"));
    api.sections.mockResolvedValue(SECTIONS);
    renderPage();

    expect(await screen.findByText("Selected outline")).toBeInTheDocument();
    expect(screen.getByText(/Locked because the cycle has started/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Change outline/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Re-resolve from current profile/)).not.toBeInTheDocument();
    expect(screen.getByText("Table of Contents")).toBeInTheDocument();
  });
});
