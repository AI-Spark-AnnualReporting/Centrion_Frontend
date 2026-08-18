// Step 2's checklist — which of the quarterly report's own lines go into the
// earnings release.
//
// Earnings can canonicalise only the lines whose label exactly matches its
// registry (8 of 51 on the real report). The first attempt made the user pick a
// metric then hunt a line through 233 rows in which seven consecutive entries all
// read "Balance at September 30, 2023". A model now pre-ticks what an earnings
// release carries, and every row shows `label — column` so those seven are
// distinguishable at all.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { FigureChecklist } from "@/components/earnings/FigureChecklist";
import type { EarningsSourceLine } from "@/types/earnings";

const line = (over: Partial<EarningsSourceLine> & { id: string }): EarningsSourceLine => ({
  label: "Line", column: null, group: null, display_label: "Line", value: 1, unit: "SAR_million",
  table: "Balance Sheet", source_ref: "p.1", source_report_id: "rpt_q1",
  selected: false, suggested: false, ...over,
});

const LINES: EarningsSourceLine[] = [
  line({ id: "f1", label: "Revenue", display_label: "Revenue", value: 424095,
         table: "Income & Comprehensive Income", selected: true, suggested: true }),
  line({ id: "f2", label: "Total assets", display_label: "Total assets", value: 2515523,
         selected: true, suggested: true }),
  // The seven-identical-labels case, told apart only by their column.
  line({ id: "f3", label: "Balance at September 30, 2023", column: "Share capital",
         display_label: "Balance at September 30, 2023 — Share capital", value: 90000,
         table: "Changes in Equity" }),
  line({ id: "f4", label: "Balance at September 30, 2023", column: "Treasury shares",
         display_label: "Balance at September 30, 2023 — Treasury shares", value: -1529,
         table: "Changes in Equity" }),
];

let onSaveSelection: ReturnType<typeof vi.fn>;

beforeEach(() => {
  onSaveSelection = vi.fn().mockResolvedValue(undefined);
});

const renderPanel = (over: Partial<React.ComponentProps<typeof FigureChecklist>> = {}) =>
  render(
    <FigureChecklist
      lines={LINES}
      suggestedCount={2}
      onSaveSelection={onSaveSelection}
      {...over}
    />,
  );

describe("earnings figure checklist", () => {
  it("opens with the model's picks already ticked", () => {
    renderPanel();
    expect(screen.getByLabelText("Revenue")).toBeChecked();
    expect(screen.getByLabelText("Total assets")).toBeChecked();
    expect(screen.getByLabelText(/Share capital/)).not.toBeChecked();
    expect(screen.getByText("2 of 4 selected")).toBeInTheDocument();
    expect(screen.getByText(/pre-selected 2/i)).toBeInTheDocument();
  });

  it("shows the column, so repeated labels are distinguishable", () => {
    renderPanel();
    // Both exist and are different rows — the whole point.
    expect(screen.getByText("Balance at September 30, 2023 — Share capital")).toBeInTheDocument();
    expect(screen.getByText("Balance at September 30, 2023 — Treasury shares")).toBeInTheDocument();
  });

  it("ticking updates the count", () => {
    renderPanel();
    fireEvent.click(screen.getByLabelText(/Share capital/));
    expect(screen.getByText("3 of 4 selected")).toBeInTheDocument();
  });

  it("unticking is allowed and counted", () => {
    renderPanel();
    fireEvent.click(screen.getByLabelText("Revenue"));
    expect(screen.getByText("1 of 4 selected")).toBeInTheDocument();
  });

  it("saves the ticked set in one action, not one call per line", async () => {
    renderPanel();
    fireEvent.click(screen.getByLabelText(/Treasury shares/));
    fireEvent.click(screen.getByRole("button", { name: /save selection/i }));

    await waitFor(() => expect(onSaveSelection).toHaveBeenCalledTimes(1));
    expect(new Set(onSaveSelection.mock.calls[0][0])).toEqual(new Set(["f1", "f2", "f4"]));
  });

  it("groups by the source table and can select a whole group", () => {
    renderPanel();
    const heading = screen.getByText(/Changes in Equity · 2/);
    const group = heading.parentElement as HTMLElement;
    fireEvent.click(within(group).getByRole("button", { name: /select all/i }));
    expect(screen.getByText("4 of 4 selected")).toBeInTheDocument();
  });

  it("searches across the display label, not just the bare label", () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText(/search your report/i), {
      target: { value: "treasury" },
    });
    expect(screen.getByText(/Treasury shares/)).toBeInTheDocument();
    expect(screen.queryByText("Revenue")).toBeNull();
  });

  it("surfaces a failed save rather than pretending it worked", async () => {
    onSaveSelection.mockRejectedValue(new Error("Backend said no"));
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /save selection/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Backend said no");
  });

  it("stays out of the way when there is nothing to offer", () => {
    const { container } = renderPanel({ lines: [] });
    expect(container).toBeEmptyDOMElement();
  });
});
