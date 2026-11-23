// What Submit cycle sends about who leads each department.
//
// Only Spark sends `lead` ('department' = the department's real lead, 'self' =
// the Spark user), and only for rows not yet saved on the cycle: a saved session
// is never rewritten, so a choice there would mean nothing. A client admin's
// request must stay byte-identical to before — no `lead` key at all, not even
// an undefined one.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const api = {
  overview: vi.fn(),
  sections: vi.fn(),
  assignDepartments: vi.fn(),
  listDepartments: vi.fn(),
};

vi.mock("@/lib/api", () => ({
  sarCycles: {
    overview: (...a: unknown[]) => api.overview(...a),
    sections: (...a: unknown[]) => api.sections(...a),
    resolveSections: vi.fn(),
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
  getToken: () => "token",
  ApiError: class ApiError extends Error {},
}));

// The signed-in user; each test sets the role it needs.
let currentUser: Record<string, unknown> = {};
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: currentUser }),
}));

const { default: CycleDetailPage } = await import("@/pages/annual-report/CycleDetailPage");

const SPARK_USER = { user_id: "usr_spark", role: "spark_internal", company_id: "cmp_1", full_name: "Spark Staff" };
const ADMIN_USER = { user_id: "usr_admin", role: "admin", company_id: "cmp_1", full_name: "Admin" };

// ESG is already saved on the cycle; HR (has a lead) and FIN (no lead) are not.
const DEPARTMENTS = [
  { id: "dep_esg", department_name: "Sustainability", department_code: "ESG", hod_user_id: "usr_esg", hod_name: "Esg Lead", has_hod: true, is_active: true },
  { id: "dep_hr", department_name: "Human Resources", department_code: "HR", hod_user_id: "usr_hr", hod_name: "Hr HOD", has_hod: true, is_active: true },
  { id: "dep_fin", department_name: "Finance", department_code: "FIN", hod_user_id: null, hod_name: null, has_hod: false, is_active: true },
];

function draftOverview() {
  return {
    cycle: {
      id: "cyc_1",
      company_id: "cmp_1",
      cycle_name: "Annual Report v7",
      fiscal_year: 2026,
      status: "draft",
      project_manager_id: "usr_pm",
      submission_deadline: "2026-10-13",
      outline_source: "system",
    },
    stats: { total_sections: 0, completed_sections: 0, total_departments: 1, submitted: 0, in_progress: 0, completion_rate: 0 },
    departments: [
      {
        session_id: "ses_esg",
        department_id: "dep_esg",
        department_name: "Sustainability",
        department_code: "ESG",
        hod_user_id: "usr_omar",
        hod_name: "Omar Ali",
        session_status: "not_started",
        progress: 0,
        submitted_at: null,
      },
    ],
  };
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/annual-report/cycles/cyc_1"]}>
      <Routes>
        <Route path="/annual-report/cycles/:cycleId" element={<CycleDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Adds a department through the search box, the way a user does. */
async function addDepartment(name: string) {
  const search = await screen.findByPlaceholderText("Search and add departments…");
  fireEvent.focus(search);
  fireEvent.click(await screen.findByRole("button", { name: new RegExp(name) }));
}

/** Clicks Submit cycle once it unlocks and returns the request body sent. */
async function submitAndReadBody() {
  const submit = await screen.findByRole("button", { name: /Submit cycle/ });
  await waitFor(() => expect(submit).toBeEnabled());
  fireEvent.click(submit);
  await waitFor(() => expect(api.assignDepartments).toHaveBeenCalled());
  return api.assignDepartments.mock.calls[0][1];
}

beforeEach(() => {
  vi.clearAllMocks();
  api.overview.mockResolvedValue(draftOverview());
  api.sections.mockResolvedValue([]);
  api.listDepartments.mockResolvedValue(DEPARTMENTS);
  api.assignDepartments.mockResolvedValue({ success: true, message: "", assignments_created: 2, assignments: [] });
});

describe("Submit cycle: the `lead` on each department", () => {
  it("Spark sends its choice for new rows and nothing for the saved one", async () => {
    currentUser = SPARK_USER;
    renderPage();

    await addDepartment("Human Resources");
    await addDepartment("Finance");

    // The saved row is locked on its session's lead, not offered as a picker.
    expect(await screen.findByLabelText("Led by Omar Ali, saved")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Who leads Sustainability" })).not.toBeInTheDocument();

    const body = await submitAndReadBody();
    expect(body).toStrictEqual({
      assignments: [
        { department_id: "dep_esg" },
        { department_id: "dep_hr", lead: "department" },
        { department_id: "dep_fin", lead: "self" },
      ],
      replace: true,
    });
  });

  it("Spark sends 'self' for a department after picking '(you)'", async () => {
    currentUser = SPARK_USER;
    renderPage();

    await addDepartment("Human Resources");
    const picker = await screen.findByRole("combobox", { name: "Who leads Human Resources" });
    fireEvent.change(picker, { target: { value: "self" } });

    const body = await submitAndReadBody();
    expect(body.assignments).toStrictEqual([
      { department_id: "dep_esg" },
      { department_id: "dep_hr", lead: "self" },
    ]);
  });

  it("a client admin's request carries no lead at all", async () => {
    currentUser = ADMIN_USER;
    renderPage();

    await addDepartment("Human Resources");
    // No picker and no "(you)" anywhere on an admin's screen.
    expect(screen.queryByRole("combobox", { name: /Who leads/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/\(you\)/)).not.toBeInTheDocument();

    const body = await submitAndReadBody();
    expect(body).toStrictEqual({
      assignments: [{ department_id: "dep_esg" }, { department_id: "dep_hr" }],
      replace: true,
    });
    for (const item of body.assignments) {
      expect(Object.keys(item)).toEqual(["department_id"]);
    }
  });
});
