// The Spark overview is now counts + chart only — the lists moved to
// /spark/:section, reached from the sidebar. What's worth pinning here is that
// the overview does NOT pull every user and report on the platform just to
// show three numbers; the counts ride along with the overview call.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const listUsers = vi.fn();
const listReports = vi.fn();

const OVERVIEW = {
  total_companies: 20,
  total_reports: 48,
  total_users: 103,
  companies: [
    { id: "c1", name: "Aramco", user_count: 16, report_count: 12 },
    { id: "c2", name: "Zain KSA", user_count: 1, report_count: 1 },
  ],
};

vi.mock("@/lib/api", () => ({
  spark: {
    overview: () => Promise.resolve(OVERVIEW),
    listUsers: () => listUsers(),
    listReports: () => listReports(),
    // The overview renders ReportTrendsCard, which fetches on mount. Empty is
    // enough — the chart has its own test file.
    reportTrends: () =>
      Promise.resolve({
        buckets: [],
        report_types: [],
        totals: {},
        total: 0,
        top_type: null,
        available_years: [],
      }),
  },
}));

const { default: SparkDashboardPage } = await import(
  "@/pages/spark/SparkDashboardPage"
);

const card = (name: string) =>
  screen.getByText(name).closest(".card")?.textContent ?? "";

describe("Spark overview", () => {
  it("shows the three totals without fetching any list", async () => {
    render(<SparkDashboardPage />);
    await screen.findByText("Companies");
    expect(card("Companies")).toContain("20");
    expect(card("Reports")).toContain("48");
    expect(card("Users")).toContain("103");
    expect(listUsers).not.toHaveBeenCalled();
    expect(listReports).not.toHaveBeenCalled();
  });

  it("carries no list table — those live on their own routes now", async () => {
    render(<SparkDashboardPage />);
    await screen.findByText("Companies");
    expect(screen.queryByRole("table")).toBeNull();
    // Company names still appear — but only as options in the chart's company
    // filter. Anywhere else would mean a list leaked back onto the overview.
    for (const el of screen.queryAllByText("Zain KSA")) {
      expect(el.tagName).toBe("OPTION");
    }
  });
});
