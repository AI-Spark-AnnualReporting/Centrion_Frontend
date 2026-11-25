// Spark → Companies → one company's dashboard.
// Plan: Centriton/.claude/plans/spark-company-dashboard.md

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { daysUntil, endingSoonText } from "@/components/spark/companyKpis";

const companyDashboard = vi.fn();

vi.mock("@/lib/api", () => ({
  spark: { companyDashboard: (id: string, range: string) => companyDashboard(id, range) },
}));

// recharts needs a real layout size; the chart itself isn't what's tested here.
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="chart">{children}</div>,
  };
});

const { default: SparkCompanyDashboardPage } = await import("@/pages/spark/SparkCompanyDashboardPage");

const DASHBOARD = {
  company: { id: "c1", name: "Aramco", jurisdiction: "KSA", created_at: "2026-02-03T09:00:00Z" },
  plan: { name: "Gold", status: "active", starts_at: "2026-11-19", ends_at: "2099-11-18" },
  users: { used: 14, limit: 21 },
  credits: { included: 200, packs: 100, carried: 0, used: 231, total: 300, balance: 69, low: true },
  paid: { total: 1271, plans: 1200, packs: 71 },
  reports_this_period: 2,
  last_activity: "2026-11-24T08:00:00Z",
  modules: [
    { key: "annual_report", label: "Annual Report", in_plan: true, used: 2, limit: 2 },
    { key: "leadership", label: "Leadership", in_plan: true, used: null, limit: null },
    { key: "board_report", label: "Board Report", in_plan: false, used: 0, limit: null },
  ],
  usage: {
    range: "period", from: "2026-11-19T00:00:00+00:00", to: "2099-11-19T00:00:00+00:00",
    over_time: { bucket: "day", points: [{ date: "2026-11-19", credits: 0 }, { date: "2026-11-20", credits: 38.6 }] },
    by_feature: [{ action: "annual.design.custom_template", label: "Custom template", credits: 153.4, jobs: 5 }],
    by_user: [{ user_id: "u1", full_name: "Sara Haddad", role: "admin", credits: 142.6, jobs: 71 }],
  },
  purchases: [{ id: "p1", paid_at: "2026-11-21T10:00:00Z", credits: 50, price: 36, bought_by: "Sara Haddad" }],
};

const open = () =>
  render(
    <MemoryRouter initialEntries={["/spark/companies/c1"]}>
      <Routes>
        <Route path="/spark/companies" element={<div>COMPANIES</div>} />
        <Route path="/spark/companies/:companyId" element={<SparkCompanyDashboardPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe("Spark company dashboard", () => {
  beforeEach(() => {
    companyDashboard.mockReset().mockResolvedValue(DASHBOARD);
  });

  it("shows the header, tiles, modules, usage and purchases", async () => {
    open();
    await screen.findByText("Aramco");
    expect(companyDashboard).toHaveBeenCalledWith("c1", "period");
    expect(screen.getByText("Gold")).toBeTruthy();
    expect(screen.getByText("$1,271")).toBeTruthy();
    expect(screen.getByText("2 / 2 · full")).toBeTruthy();
    expect(screen.getByText("Included")).toBeTruthy();
    expect(screen.getByTestId("module-board_report").textContent).toContain("Not in plan");
    expect(screen.getByText("Custom template")).toBeTruthy();
    expect(screen.getAllByText("Sara Haddad").length).toBe(2);   // by user + bought by
    expect(screen.getByText("+100")).toBeTruthy();
  });

  it("reloads with the picked range", async () => {
    open();
    await screen.findByText("Aramco");
    fireEvent.click(screen.getByRole("tab", { name: "90 days" }));
    await waitFor(() => expect(companyDashboard).toHaveBeenLastCalledWith("c1", "90d"));
  });

  it("lists every feature, with no 'Other' row", async () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      action: `annual.step_${index}`, label: `Feature ${index + 1}`, credits: 10 - index, jobs: 1,
    }));
    companyDashboard.mockResolvedValue({ ...DASHBOARD, usage: { ...DASHBOARD.usage, by_feature: many } });
    open();
    await screen.findByText("Feature 9");
    expect(screen.getByText("Feature 1")).toBeTruthy();
    expect(screen.queryByText(/^Other/)).toBeNull();
    expect(screen.getByText("· 9")).toBeTruthy();
  });

  it("shows skeletons while a new range loads, then the new numbers", async () => {
    open();
    await screen.findByText("Custom template");
    let answer: (value: unknown) => void = () => undefined;
    companyDashboard.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    fireEvent.click(screen.getByRole("tab", { name: "30 days" }));
    expect(await screen.findByTestId("chart-skeleton")).toBeTruthy();
    expect(screen.getAllByTestId("feature-skeleton").length).toBe(8);
    expect(screen.getAllByTestId("user-skeleton").length).toBe(3);
    expect(screen.queryByText("Custom template")).toBeNull();
    answer({ ...DASHBOARD, usage: { ...DASHBOARD.usage, range: "30d",
      by_feature: [{ action: "annual.brief", label: "Generate brief", credits: 3, jobs: 2 }] } });
    expect(await screen.findByText("Generate brief")).toBeTruthy();
    expect(screen.queryByTestId("chart-skeleton")).toBeNull();
  });

  it("handles a company with no plan and no AI use", async () => {
    companyDashboard.mockResolvedValue({
      ...DASHBOARD, plan: null, credits: null, users: { used: 1, limit: null },
      modules: DASHBOARD.modules.map((module) => ({ ...module, in_plan: false })),
      usage: { ...DASHBOARD.usage, over_time: { bucket: "day", points: [] }, by_feature: [], by_user: [] },
      purchases: [],
    });
    open();
    await screen.findByText("Aramco");
    expect(screen.getByText("No plan")).toBeTruthy();
    expect(screen.getByText("No plan, so no credits.")).toBeTruthy();
    expect(screen.getByText("No credit packs bought.")).toBeTruthy();
    expect(screen.getAllByText("No AI use in this range.").length).toBe(3);
  });

  it("goes back to the Companies list", async () => {
    open();
    fireEvent.click(await screen.findByText("← Back to Companies"));
    await waitFor(() => screen.getByText("COMPANIES"));
  });

  it("shows the error when the company can't be loaded", async () => {
    companyDashboard.mockRejectedValue(new Error("Company not found"));
    open();
    await screen.findByText("Company not found");
  });
});

describe("ending soon", () => {
  const today = new Date("2026-11-24T12:00:00Z");
  it("counts whole days to a date", () => {
    expect(daysUntil("2026-12-06", today)).toBe(12);
    expect(daysUntil("2026-11-24", today)).toBe(0);
  });
  it("only says it within 30 days of the end of an active plan", () => {
    const plan = { name: "Gold", status: "active" as const, starts_at: "2026-01-01", ends_at: "2026-12-06" };
    expect(endingSoonText(plan, today)).toBe("ends in 12 days");
    expect(endingSoonText({ ...plan, ends_at: "2027-06-01" }, today)).toBe("");
    expect(endingSoonText({ ...plan, status: "expired" }, today)).toBe("");
  });
});
