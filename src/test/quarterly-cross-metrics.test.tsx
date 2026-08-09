// Two things, both about the System/Custom metrics split:
//
//  1. Card 4 must explain a comparison that's blocked because the prior period
//     holds the OTHER metrics type — that case is invisible today (same greyed
//     pill as "no data at all") and silently produces an empty comparison column.
//  2. Quarterly gallery cards must say which metric set built the report, in
//     place of the old hardcoded "ESG Reporting".
//
// Runs against the REAL @/lib/api with only `fetch` stubbed, same as the sibling
// quarterly-metrics-popup.test.tsx.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import QuarterlyReportForm from "@/components/reports/QuarterlyReportForm";
import ReportsPage from "@/pages/ReportsPage";

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { company_id: "company-1" } }),
}));

const realFetch = global.fetch;

const jsonRes = (body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );

// Q1 2026 (the prior quarter) has figures, but as CUSTOM — this report is
// System, so QoQ (and therefore Both) can't be compared. YoY is fine.
const CROSS_MODE_AVAILABILITY = {
  available: false,
  comparison: "both",
  metrics_mode: "system",
  target_period: "Q2-2026",
  specs: [
    { key: "qoq", period: "Q1-2026", label: "Q1 2026", present: false, other_mode_present: true },
    { key: "yoy", period: "Q2-2025", label: "Q2 2025", present: true, other_mode_present: false },
  ],
};

// Same shape, but the prior quarter genuinely has nothing in either lane.
const NO_DATA_AVAILABILITY = {
  ...CROSS_MODE_AVAILABILITY,
  specs: [
    { key: "qoq", period: "Q1-2026", label: "Q1 2026", present: false, other_mode_present: false },
    { key: "yoy", period: "Q2-2025", label: "Q2 2025", present: true, other_mode_present: false },
  ],
};

function stubFetch(availability: unknown) {
  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("comparison-availability")) return jsonRes(availability);
    if (url.includes("/quarterly/system-metrics")) return jsonRes({ total: 0, groups: [] });
    if (url.includes("/quarterly/report-areas")) return jsonRes({ areas: [] });
    return Promise.reject(new Error("offline"));
  }) as typeof fetch;
}

afterEach(() => {
  global.fetch = realFetch;
  vi.restoreAllMocks();
});

// Drives the year + quarter pickers, which is what makes the availability check
// fire (it no-ops until both are set).
async function pickPeriod() {
  const selects = screen.getAllByRole("combobox");
  const year = selects.find((s) => s.textContent?.includes("Select year"))!;
  fireEvent.change(year, { target: { value: "2026" } });
  const quarter = screen
    .getAllByRole("combobox")
    .find((s) => s.textContent?.includes("Select quarter"))!;
  fireEvent.change(quarter, { target: { value: "Q2" } });
}

describe("cross-metrics comparison warning", () => {
  beforeEach(() => stubFetch(CROSS_MODE_AVAILABILITY));

  it("explains that the prior period's data is the other metrics type", async () => {
    render(
      <MemoryRouter>
        <QuarterlyReportForm companyId="company-1" />
      </MemoryRouter>,
    );
    await pickPeriod();

    const note = await screen.findByRole("note");
    // Names the period, both metrics types, and which bases it costs.
    expect(note).toHaveTextContent(/Q1 2026 has data/i);
    expect(note).toHaveTextContent(/it's custom metrics/i);
    expect(note).toHaveTextContent(/this report uses system metrics/i);
    // QoQ is cross-blocked and Both depends on it; YoY is available so it must
    // NOT be listed as unavailable.
    expect(note).toHaveTextContent(/Previous quarter and Both/i);
    expect(note).not.toHaveTextContent(/Year on year and/i);
    expect(note).toHaveTextContent(/produce an empty column/i);
  });

  it("agrees with the disabled pill's tooltip", async () => {
    render(
      <MemoryRouter>
        <QuarterlyReportForm companyId="company-1" />
      </MemoryRouter>,
    );
    await pickPeriod();
    await screen.findByRole("note");

    // The pill must not claim there's no data when there is — in the other lane.
    const pill = screen.getByRole("button", { name: "Previous quarter" });
    expect(pill.getAttribute("title")).toMatch(/data is custom metrics, not system metrics/i);
    expect(pill).toBeDisabled();
  });
});

describe("genuinely-missing prior data", () => {
  beforeEach(() => stubFetch(NO_DATA_AVAILABILITY));

  it("shows no cross-metrics note, and keeps the plain tooltip", async () => {
    render(
      <MemoryRouter>
        <QuarterlyReportForm companyId="company-1" />
      </MemoryRouter>,
    );
    await pickPeriod();

    // Wait for the check to land by observing the pill it disables.
    const pill = await screen.findByRole("button", { name: "Previous quarter" });
    expect(pill).toBeDisabled();
    expect(pill.getAttribute("title")).toMatch(/No previous-quarter data/i);
    expect(screen.queryByRole("note")).toBeNull();
  });
});

describe("quarterly gallery card badge", () => {
  beforeEach(() => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/reports/company-1")) {
        return jsonRes({
          reports: [
            {
              id: "r-custom",
              period: "Q2-2026",
              title: "Quarterly Report",
              generation_config: { metrics_mode: "custom" },
            },
            {
              id: "r-system",
              period: "Q1-2026",
              title: "Quarterly Report",
              generation_config: { metrics_mode: "system" },
            },
            {
              // Predates the custom lane — no metrics_mode key at all.
              id: "r-legacy",
              period: "Q3-2024",
              title: "Quarterly Report",
              generation_config: {},
            },
          ],
        });
      }
      return Promise.reject(new Error("offline"));
    }) as typeof fetch;
  });

  it("prints the metrics mode instead of 'ESG Reporting'", async () => {
    render(
      <MemoryRouter initialEntries={["/reports/quarterly"]}>
        <ReportsPage />
      </MemoryRouter>,
    );

    // Scope to the cards — the form above the gallery has "System metrics" /
    // "Custom metrics" radio labels that would otherwise match.
    const cards = await screen.findAllByTitle("Continue this quarterly report");
    expect(cards).toHaveLength(3);
    const badgeFor = (period: string) => {
      const card = cards.find((c) => c.textContent?.includes(period))!;
      return within(card).getByText(/^(System|Custom) metrics$/).textContent;
    };

    expect(badgeFor("Q2 2026")).toBe("Custom metrics");
    expect(badgeFor("Q1 2026")).toBe("System metrics");
    // No metrics_mode key at all — predates the custom lane, so it's System.
    expect(badgeFor("Q3 2024")).toBe("System metrics");
    expect(screen.queryByText("ESG Reporting")).toBeNull();
  });
});
