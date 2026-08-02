// Covers the "System metrics" hover list on the Generate Quarterly Report form.
//
// Runs against the REAL @/lib/api — same reasoning as
// brand-identity-api-contract.test.tsx: a mocked api module is free to invent an
// export production doesn't have, and this feature adds a brand-new endpoint
// (getQuarterlySystemMetrics) that the form calls on mount. Only `fetch` is
// stubbed, so a bad module reference still surfaces as "is not a function".

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { reports } from "@/lib/api";
import QuarterlyReportForm from "@/components/reports/QuarterlyReportForm";

const CATALOGUE = {
  total: 5,
  groups: [
    {
      code: "income",
      title: "Income Statement",
      count: 3,
      metrics: [
        { key: "revenue", label: "Revenue" },
        { key: "gross_profit", label: "Gross Profit" },
        { key: "net_income", label: "Net Income" },
      ],
    },
    {
      // The sector/operational bucket comes back with a null code — it must not
      // collide as a React key or crash the group render.
      code: null,
      title: "Sector & Operational KPIs",
      count: 2,
      metrics: [
        { key: "store_count", label: "Store count" },
        { key: "churn_rate", label: "Churn rate" },
      ],
    },
  ],
};

const realFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    const json = (body: unknown) =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    if (url.includes("/quarterly/system-metrics")) return json(CATALOGUE);
    if (url.includes("/quarterly/report-areas")) return json({ areas: [] });
    // Everything else the form pokes on mount (company-type detection, …) can
    // fail — none of it gates the metrics block.
    return Promise.reject(new Error("offline"));
  }) as typeof fetch;
});

afterEach(() => {
  global.fetch = realFetch;
  vi.restoreAllMocks();
});

const renderForm = () =>
  render(
    <MemoryRouter>
      <QuarterlyReportForm companyId="company-1" />
    </MemoryRouter>,
  );

describe("System metrics hover list", () => {
  it("exposes the endpoint the form calls", () => {
    expect(typeof reports.getQuarterlySystemMetrics).toBe("function");
  });

  it("shows the metric count pill once the catalogue loads", async () => {
    renderForm();
    expect(await screen.findByText("5 metrics")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalled();
  });

  it("opens the scrollable list on hover and keeps it open over the panel", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderForm();

    const pill = await screen.findByText("5 metrics");
    // The hover handlers live on the wrapper around the radio + pill.
    const wrapper = pill.closest("div") as HTMLElement;

    expect(screen.queryByRole("group", { name: /system metrics catalogue/i })).toBeNull();

    fireEvent.mouseEnter(wrapper);
    const panel = await screen.findByRole("group", { name: /system metrics catalogue/i });

    // Both groups render, including the null-code one.
    expect(screen.getByText("Income Statement")).toBeInTheDocument();
    expect(screen.getByText("Sector & Operational KPIs")).toBeInTheDocument();
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.getByText("Churn rate")).toBeInTheDocument();

    // The point of the close delay: leaving the wrapper for the panel must not
    // close the list, or it can never be scrolled.
    fireEvent.mouseLeave(wrapper);
    fireEvent.mouseEnter(panel);
    await vi.advanceTimersByTimeAsync(400);
    expect(screen.getByRole("group", { name: /system metrics catalogue/i })).toBeInTheDocument();

    // Leaving the panel for good closes it.
    fireEvent.mouseLeave(panel);
    await vi.advanceTimersByTimeAsync(400);
    await waitFor(() =>
      expect(screen.queryByRole("group", { name: /system metrics catalogue/i })).toBeNull(),
    );

    vi.useRealTimers();
  });

  it("swaps the hint line when Custom metrics is picked", async () => {
    renderForm();
    await screen.findByText("5 metrics");

    expect(
      screen.getByText(/we map your data to our standard 5 metrics/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /custom metrics/i }));

    expect(
      screen.getByText(/exactly as they are, place each line in the right section/i),
    ).toBeInTheDocument();
  });

  it("hides the catalogue pill in Custom mode and brings it back on System", async () => {
    renderForm();
    await screen.findByText("5 metrics");

    // The catalogue describes system mode only — it has nothing to say about a
    // report built from the sheet's own lines.
    fireEvent.click(screen.getByRole("radio", { name: /custom metrics/i }));
    expect(screen.queryByText("5 metrics")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: /system metrics/i }));
    expect(screen.getByText("5 metrics")).toBeInTheDocument();
  });

  it("does not reopen a pinned list after a round trip through Custom", async () => {
    renderForm();

    // Pin it open, then switch away — the pill unmounts with the panel.
    fireEvent.click(await screen.findByText("5 metrics"));
    expect(screen.getByRole("group", { name: /system metrics catalogue/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /custom metrics/i }));
    fireEvent.click(screen.getByRole("radio", { name: /system metrics/i }));

    // Pill is back, but the panel must not spring open on its own.
    expect(screen.getByText("5 metrics")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /system metrics catalogue/i })).toBeNull();
  });
});
