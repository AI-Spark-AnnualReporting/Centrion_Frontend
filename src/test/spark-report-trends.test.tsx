// Two risks in the trends chart:
//   1. `normalizeTrends` was written against a prose description of the wire
//      format, not a live sample, so it reads per-type counts BOTH nested
//      under `counts` and spread flat on the bucket. If that tolerance breaks,
//      the chart silently renders all-zero bars instead of erroring.
//   2. The month picker is a client-side highlight, not a filter — it must
//      never refetch. A regression there turns every month change into a round
//      trip and collapses the twelve-month shape the chart exists to show.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { normalizeTrends } from "@/types/spark";

const reportTrends = vi.fn();

vi.mock("@/lib/api", () => ({ spark: { reportTrends: (p: unknown) => reportTrends(p) } }));

const { ReportTrendsCard } = await import("@/components/spark/ReportTrendsCard");

const COMPANIES = [
  { id: "c1", name: "Aramco" },
  { id: "c2", name: "Zain KSA" },
];

// Nested `counts`, the shape the backend describes.
const NESTED = {
  buckets: [
    { key: "2026-01", label: "Jan", counts: { annual: 5, quarterly: 2 }, total: 7 },
    { key: "2026-02", label: "Feb", counts: { annual: 1, quarterly: 9 }, total: 10 },
  ],
  report_types: ["annual", "quarterly"],
  totals: { annual: 6, quarterly: 11 },
  total: 17,
  top_type: "quarterly",
  available_years: [2025, 2026],
};

describe("normalizeTrends", () => {
  it("reads per-type counts nested under `counts`", () => {
    const t = normalizeTrends(NESTED);
    expect(t.buckets[0].counts).toEqual({ annual: 5, quarterly: 2 });
    expect(t.report_types).toEqual([
      { key: "annual", label: "Annual" },
      { key: "quarterly", label: "Quarterly" },
    ]);
  });

  it("reads per-type counts spread flat on the bucket", () => {
    const t = normalizeTrends({
      ...NESTED,
      buckets: [{ key: "2026-01", label: "Jan", annual: 5, quarterly: 2, total: 7 }],
    });
    expect(t.buckets[0].counts).toEqual({ annual: 5, quarterly: 2 });
  });

  it("title-cases a raw enum and honours an explicit label", () => {
    const t = normalizeTrends({
      ...NESTED,
      report_types: ["board_report", { key: "esg", label: "ESG" }],
    });
    expect(t.report_types).toEqual([
      { key: "board_report", label: "Board Report" },
      { key: "esg", label: "ESG" },
    ]);
  });

  it("zero-fills a type missing from a bucket rather than dropping it", () => {
    const t = normalizeTrends({
      ...NESTED,
      buckets: [{ key: "2026-01", label: "Jan", counts: { annual: 5 } }],
    });
    expect(t.buckets[0].counts.quarterly).toBe(0);
    // total absent → derived from the counts, so the tooltip still adds up.
    expect(t.buckets[0].total).toBe(5);
  });

  it("unwraps totals nested under `by_type`", () => {
    const t = normalizeTrends({ ...NESTED, totals: { by_type: { annual: 6, quarterly: 11 } } });
    expect(t.totals).toEqual({ annual: 6, quarterly: 11 });
  });

  it("survives a junk payload instead of throwing", () => {
    const t = normalizeTrends({});
    expect(t.buckets).toEqual([]);
    expect(t.available_years).toEqual([]);
    expect(t.total).toBe(0);
  });
});

describe("ReportTrendsCard", () => {
  beforeEach(() => {
    reportTrends.mockReset().mockResolvedValue(normalizeTrends(NESTED));
  });

  it("adopts the newest available year after the first unfiltered load", async () => {
    render(<ReportTrendsCard companies={COMPANIES as never} />);
    await waitFor(() => expect(reportTrends).toHaveBeenCalledTimes(2));
    expect(reportTrends.mock.calls[0][0]).toEqual({});
    expect(reportTrends.mock.calls[1][0]).toEqual({ year: 2026 });
  });

  it("names the leading report type for the whole year", async () => {
    render(<ReportTrendsCard companies={COMPANIES as never} />);
    // 11 quarterly vs 6 annual across both buckets.
    await screen.findByText(/Quarterly leads — 11 of 17 reports/);
  });

  it("re-reads the leader for a selected month WITHOUT refetching", async () => {
    render(<ReportTrendsCard companies={COMPANIES as never} />);
    await waitFor(() => expect(reportTrends).toHaveBeenCalledTimes(2));

    // January is 5 annual vs 2 quarterly — the year-wide leader flips.
    fireEvent.change(screen.getByLabelText("Filter by month"), { target: { value: "Jan" } });
    await screen.findByText(/Annual leads — 5 of 7 reports/);
    expect(reportTrends).toHaveBeenCalledTimes(2); // no extra round trip
  });

  it("refetches scoped to one tenant when a company is picked", async () => {
    render(<ReportTrendsCard companies={COMPANIES as never} />);
    await waitFor(() => expect(reportTrends).toHaveBeenCalledTimes(2));

    fireEvent.change(screen.getByLabelText("Filter by company"), { target: { value: "c2" } });
    await waitFor(() => expect(reportTrends).toHaveBeenCalledTimes(3));
    expect(reportTrends.mock.calls[2][0]).toEqual({ year: 2026, company_id: "c2" });
  });

  it("re-adopts a year the newly-filtered company actually has data for", async () => {
    // Narrowing to one tenant can leave the selected year with no data at all.
    // Left alone, the dropdown would point at a year it no longer lists and
    // the chart would sit empty with no way back.
    const older = normalizeTrends({ ...NESTED, available_years: [2024] });
    reportTrends
      .mockResolvedValueOnce(normalizeTrends(NESTED))
      .mockResolvedValueOnce(normalizeTrends(NESTED))
      .mockResolvedValue(older);

    render(<ReportTrendsCard companies={COMPANIES as never} />);
    await waitFor(() => expect(reportTrends).toHaveBeenCalledTimes(2));

    fireEvent.change(screen.getByLabelText("Filter by company"), { target: { value: "c2" } });
    await waitFor(() => expect(reportTrends).toHaveBeenCalledTimes(4));
    expect(reportTrends.mock.calls[3][0]).toEqual({ year: 2024, company_id: "c2" });
  });

  it("shows an empty state rather than a blank chart when nothing was created", async () => {
    reportTrends.mockResolvedValue(
      normalizeTrends({ ...NESTED, buckets: [], totals: {}, total: 0, top_type: null }),
    );
    render(<ReportTrendsCard companies={COMPANIES as never} />);
    await screen.findByText("No reports in this period");
  });
});
