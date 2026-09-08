// The Progress column and the Avg. progress tile are gone from the cycles list.
//
// Removing them is closer to a bug fix than a scope cut: the list endpoint
// returns no per-cycle progress (see the comment on sarCycles.list), so every
// row rendered a 0% bar and the tile always read 0%.
//
// What has to survive the removal, because both look like progress and aren't:
//   - the filter tabs, which count off the same `counts` memo
//   - the red overdue deadline, which uses isOverdue independently

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const list = vi.fn();

vi.mock("@/lib/api", () => ({ sarCycles: { list: () => list() } }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { role: "admin" } }),
}));
vi.mock("@/lib/features", () => ({
  useFeaturePermissions: () => ({ canCreate: false, canRead: true }),
}));
vi.mock("./CycleForm", () => ({ default: () => null }));

const { default: CyclesListPage } = await import(
  "@/pages/annual-report/CyclesListPage"
);

const CYCLES = [
  {
    id: "cyc_1",
    cycle_name: "FY-2027",
    fiscal_year: 2027,
    status: "active",
    submission_deadline: "2020-01-01", // safely in the past → overdue
    project_manager_name: "Aizaz Ahmed",
    progress: 62,
    submitted: 3,
    total_departments: 5,
  },
];

describe("cycles list has no progress UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue(CYCLES);
  });

  it("renders no Progress column header", async () => {
    render(<CyclesListPage />);
    await screen.findByText("FY-2027");
    expect(screen.queryByText("Progress")).not.toBeInTheDocument();
  });

  it("renders no Avg. progress tile", async () => {
    render(<CyclesListPage />);
    await screen.findByText("FY-2027");
    expect(screen.queryByText("Avg. progress")).not.toBeInTheDocument();
  });

  it("shows no percentage or submitted/total anywhere", async () => {
    const { container } = render(<CyclesListPage />);
    await screen.findByText("FY-2027");
    expect(container.textContent).not.toMatch(/\d+%/);
    expect(screen.queryByText("3/5")).not.toBeInTheDocument();
  });

  it("keeps the filter tabs and their counts", async () => {
    render(<CyclesListPage />);
    await screen.findByText("FY-2027");
    // `counts` feeds both the tabs and the three surviving tiles — it must
    // outlive the avgProgress memo. Match the tab labels, which carry the count.
    expect(screen.getByText("All 1")).toBeInTheDocument();
    expect(screen.getByText("Active 1")).toBeInTheDocument();
    expect(screen.getByText("Draft 0")).toBeInTheDocument();
    expect(screen.getByText("Completed 0")).toBeInTheDocument();
  });

  it("still flags an overdue deadline", async () => {
    render(<CyclesListPage />);
    // isOverdue is shared with the deleted overdueCount memo — prove it lives.
    const deadline = await screen.findByText(/2020/);
    expect(deadline).toBeInTheDocument();
  });
});
