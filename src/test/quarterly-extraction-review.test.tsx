// The extraction-review screen — step 2 of the quarterly flow, and the gate that
// makes every figure in the report one a human approved.
//
// The guarantee under test is narrow and important: a figure only reaches the report
// if the user clicked Yes. Rejecting excludes it, and so does leaving the row alone —
// a default of "included" would quietly re-create the false-positive problem this
// whole screen exists to solve.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type {
  ExtractionReviewResponse,
  ExtractionReviewDecision,
} from "@/types/quarterly";

const getExtractionReview = vi.fn<() => Promise<ExtractionReviewResponse>>();
const submitExtractionReview =
  vi.fn<(c: string, r: string, d: ExtractionReviewDecision[]) => Promise<unknown>>();
const navigateMock = vi.fn();

vi.mock("@/lib/api", () => ({
  quarterlyReports: {
    getExtractionReview: () => getExtractionReview(),
    submitExtractionReview: (c: string, r: string, d: ExtractionReviewDecision[]) =>
      submitExtractionReview(c, r, d),
  },
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { company_id: "co-1" } }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const RESPONSE: ExtractionReviewResponse = {
  report_id: "rpt-1",
  company_id: "co-1",
  run_id: "run-1",
  awaiting_review: true,
  confirmed: [
    {
      id: "c1", metric_key: "total_assets", metric_label: "Total Assets",
      source_label: "Total assets", statement: "balance_sheet", period: "Q3-2026",
      value: 900, value_display: "﷼900.000M", unit: "SAR_million",
      confidence: 100, source: "table", source_page: 3,
    },
  ],
  pending: [
    {
      id: "p1", metric_key: "net_income", metric_label: "Net Income",
      source_label: "Profit for the period", statement: "income_statement",
      period: "Q3-2026", value: 122008, value_display: "﷼122.008B",
      unit: "SAR_million", confidence: 82, source: "table", source_page: 5,
    },
    {
      id: "p2", metric_key: "revenue", metric_label: "Revenue",
      source_label: "Turnover", statement: "income_statement",
      period: "Q3-2026", value: 400000, value_display: "﷼400.000B",
      unit: "SAR_million", confidence: 74, source: "table", source_page: 5,
    },
  ],
  summary: { confirmed_count: 1, pending_count: 2, discarded_count: 7 },
};

beforeEach(() => {
  getExtractionReview.mockReset().mockResolvedValue(structuredClone(RESPONSE));
  submitExtractionReview.mockReset().mockResolvedValue({
    report_id: "rpt-1", accepted: 1, rejected: 1, next: "/quarterly-report/rpt-1/outline",
  });
  navigateMock.mockReset();
});

afterEach(() => vi.restoreAllMocks());

async function renderPage() {
  const Page = (await import("@/pages/quarterly/ExtractionReviewPage")).default;
  render(
    <MemoryRouter initialEntries={["/quarterly-report/rpt-1/extraction"]}>
      <Routes>
        <Route path="/quarterly-report/:reportId/extraction" element={<Page />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByText(/Check the figures we found/i);
}

// The row wrapper for a pending figure, found via its Yes button's aria-label.
function rowFor(sourceLabel: string) {
  const yes = screen.getByRole("radio", { name: new RegExp(`^Yes — .*${sourceLabel}`) });
  return yes.closest("div[role='radiogroup']")!.parentElement as HTMLElement;
}

function answer(sourceLabel: string, choice: "Yes" | "No") {
  fireEvent.click(
    screen.getByRole("radio", { name: new RegExp(`^${choice} — .*${sourceLabel}`) }),
  );
}

describe("quarterly extraction review", () => {
  it("asks about each uncertain figure using the document's own wording", async () => {
    await renderPage();
    const row = rowFor("Profit for the period");
    expect(within(row).getByText(/Profit for the period/)).toBeInTheDocument();
    expect(within(row).getByText("Net Income")).toBeInTheDocument();
    expect(within(row).getByText("82% match")).toBeInTheDocument();
  });

  it("starts with every row unanswered", async () => {
    await renderPage();
    for (const r of screen.getAllByRole("radio")) {
      expect(r).toHaveAttribute("aria-checked", "false");
    }
    expect(screen.getByText(/0 of 2 answered/)).toBeInTheDocument();
  });

  it("sends accept only for the rows answered Yes", async () => {
    await renderPage();
    answer("Profit for the period", "Yes");
    answer("Turnover", "No");

    fireEvent.click(screen.getByRole("button", { name: /Continue to outline/i }));

    await waitFor(() => expect(submitExtractionReview).toHaveBeenCalled());
    const decisions = submitExtractionReview.mock.calls.at(-1)![2];
    expect(decisions).toEqual([
      { id: "p1", accept: true },
      { id: "p2", accept: false },
    ]);
  });

  it("treats an unanswered row as No, after warning the user", async () => {
    // The load-bearing behaviour: silence must never mean "put it in the report".
    await renderPage();
    answer("Profit for the period", "Yes");

    fireEvent.click(screen.getByRole("button", { name: /Continue to outline/i }));

    // Nothing submitted yet — the user is told what leaving a row out means.
    expect(submitExtractionReview).not.toHaveBeenCalled();
    expect(await screen.findByText(/1 figure still unanswered/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Continue anyway/i }));
    await waitFor(() => expect(submitExtractionReview).toHaveBeenCalled());
    expect(submitExtractionReview.mock.calls.at(-1)![2]).toEqual([
      { id: "p1", accept: true },
      { id: "p2", accept: false },
    ]);
  });

  it("lets the user keep checking instead of continuing", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Continue to outline/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Keep checking/i }));
    expect(submitExtractionReview).not.toHaveBeenCalled();
  });

  it("answers a whole statement group at once", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Yes to all/i }));
    expect(screen.getByText(/2 of 2 answered · 2 will be added/)).toBeInTheDocument();
  });

  it("goes to the outline once the answers are saved", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Yes to all/i }));
    fireEvent.click(screen.getByRole("button", { name: /Continue to outline/i }));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/quarterly-report/rpt-1/outline"),
    );
  });

  it("skips straight through when nothing needs checking", async () => {
    getExtractionReview.mockResolvedValue({
      ...structuredClone(RESPONSE),
      awaiting_review: false,
      pending: [],
      summary: { confirmed_count: 1, pending_count: 0, discarded_count: 0 },
    });
    await renderPage();
    expect(screen.getByText(/Nothing needs checking/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Continue to outline/i }));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/quarterly-report/rpt-1/outline"),
    );
    // No decisions to send, so no pointless round trip.
    expect(submitExtractionReview).not.toHaveBeenCalled();
  });

  it("shows the already-matched figures as a record, collapsed by default", async () => {
    await renderPage();
    expect(screen.getByText(/1 saved · nothing to do/)).toBeInTheDocument();
    expect(screen.queryByText("Total assets")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Matched to your metrics/i }));
    expect(screen.getByText("Total assets")).toBeInTheDocument();
    expect(screen.getByText("Total Assets")).toBeInTheDocument();
  });

  it("says how many lines were read but not used", async () => {
    await renderPage();
    expect(screen.getByText(/7 other lines that didn't match/i)).toBeInTheDocument();
  });

  it("explains the rename before the user commits to it", async () => {
    await renderPage();
    expect(screen.getByText(/will appear in the report as/i)).toBeInTheDocument();
  });

  // The unit was on the payload all along and rendered nowhere, which is exactly
  // how a dual-currency sheet produced two visually identical rows.
  describe("units", () => {
    it("shows each figure's unit", async () => {
      await renderPage();
      const row = rowFor("Profit for the period");
      expect(within(row).getByText("SAR · millions")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Matched to your metrics/i }));
      expect(screen.getAllByText("SAR · millions").length).toBeGreaterThan(1);
    });

    it("stays quiet when everything is in one currency", async () => {
      await renderPage();
      expect(screen.queryByRole("note", { name: /mixed units/i })).toBeNull();
    });

    it("warns when the same metric was read in two currencies", async () => {
      const mixed = structuredClone(RESPONSE);
      // The reported bug: one metric, one period, two currency columns.
      mixed.pending.push({
        ...mixed.pending[0],
        id: "p1-usd",
        value: 32535,
        value_display: "$32.535B",
        unit: "USD_million",
      });
      getExtractionReview.mockResolvedValue(mixed);
      await renderPage();

      const note = await screen.findByRole("note", { name: /mixed units/i });
      expect(note).toHaveTextContent(/more than one currency/i);
      expect(note).toHaveTextContent("SAR");
      expect(note).toHaveTextContent("USD");
      // Both rows are pending, so dismissing them here is a real remedy.
      expect(note).toHaveTextContent(/answer .no./i);
      expect(screen.getByText("USD · millions")).toBeInTheDocument();
    });

    it("tells the user to regenerate when the duplicates are already saved", async () => {
      const mixed = structuredClone(RESPONSE);
      mixed.confirmed.push({
        ...mixed.confirmed[0],
        id: "c1-usd",
        value_display: "$240.000M",
        unit: "USD_million",
      });
      getExtractionReview.mockResolvedValue(mixed);
      await renderPage();

      const note = await screen.findByRole("note", { name: /mixed units/i });
      // Answering "No" cannot remove a confirmed row — saying otherwise would
      // send the user down a dead end.
      expect(note).toHaveTextContent(/regenerate/i);
    });
  });
});
