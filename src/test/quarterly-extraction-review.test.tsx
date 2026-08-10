// The extraction-review screen — step 2 of the quarterly flow.
//
// It no longer asks "is this line the same as that metric?". Nothing is guessed, so
// there is nothing to agree with: the screen LISTS the lines we could not place, each
// already included and pre-filled, and the user corrects and continues. The payoff is
// the second quarter — every line filed here matches by itself from then on.
//
// The guarantee under test: nothing is lost silently. Every listed line is either
// added under a name the user can see, or excluded by an explicit click.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type {
  ExtractionReviewResponse,
  ExtractionReviewDecision,
  ExclusionsResponse,
} from "@/types/quarterly";

const getExtractionReview = vi.fn<() => Promise<ExtractionReviewResponse>>();
const submitExtractionReview =
  vi.fn<(c: string, r: string, d: ExtractionReviewDecision[]) => Promise<unknown>>();
const listExclusions = vi.fn<() => Promise<ExclusionsResponse>>();
const undoExclusions = vi.fn<(c: string, labels: string[]) => Promise<unknown>>();
const navigateMock = vi.fn();

vi.mock("@/lib/api", () => ({
  quarterlyReports: {
    getExtractionReview: () => getExtractionReview(),
    submitExtractionReview: (c: string, r: string, d: ExtractionReviewDecision[]) =>
      submitExtractionReview(c, r, d),
    listExclusions: () => listExclusions(),
    undoExclusions: (c: string, labels: string[]) => undoExclusions(c, labels),
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
      document_id: "doc-1", source_table: "Balance Sheet",
    },
  ],
  // Unmatched lines: no metric, no statement. The company's own wording is all
  // there is, which is exactly why the user has to name them.
  pending: [
    {
      id: "doc-1#5", metric_key: null, metric_label: null,
      source_label: "Refinery throughput adj", statement: null,
      period: "Q3-2026", value: 122008, value_display: "﷼122.008B",
      unit: "SAR_million", confidence: 100, source: "table", source_page: 5,
      document_id: "doc-1", source_table: "Income Statement",
    },
    {
      id: "doc-1#6", metric_key: null, metric_label: null,
      source_label: "Cracking spread", statement: null,
      period: "Q3-2026", value: 400000, value_display: "﷼400.000B",
      unit: "SAR_million", confidence: 100, source: "table", source_page: 6,
      document_id: "doc-1", source_table: "Income Statement",
    },
  ],
  summary: { confirmed_count: 1, pending_count: 2, discarded_count: 7 },
  sources: [
    {
      document_id: "doc-1",
      source_table: "Income Statement",
      filename: "Q3-databook.xlsx",
      guessed_section: "income_statement",
    },
  ],
  metric_sections: [
    {
      group: "Primary Statements",
      sections: [
        { section_code: "income_statement", title: "Income Statement" },
        { section_code: "financial_position", title: "Financial Position" },
      ],
    },
    { group: "Notes", sections: [{ section_code: "taxation_zakat", title: "Taxation & Zakat" }] },
  ],
};

beforeEach(() => {
  getExtractionReview.mockReset().mockResolvedValue(structuredClone(RESPONSE));
  submitExtractionReview.mockReset().mockResolvedValue({
    report_id: "rpt-1", accepted: 2, created: 2, ignored: 0, rejected: 0,
    next: "/quarterly-report/rpt-1/outline",
  });
  listExclusions.mockReset().mockResolvedValue({
    company_id: "co-1",
    exclusions: [
      { source_label: "Note 14 reference", excluded_at: "2026-05-02T10:00:00Z" },
    ],
  });
  undoExclusions.mockReset().mockResolvedValue({ company_id: "co-1", restored: 1 });
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
  await screen.findByText(/Add these to your metrics/i);
}

// Rows are keyed by the row id, which is (document_id, source_page) — the same key
// the server uses, so a test that finds a row proves the identity round-trips.
const rowFor = (id: string) => screen.getByTestId(`row-${id}`);
const nameInput = (id: string) =>
  within(rowFor(id)).getByLabelText(/^Name$/i) as HTMLInputElement;
const excludeBtn = (id: string) =>
  within(rowFor(id)).getByRole("button", { name: /Exclude/i });

const submitted = () => submitExtractionReview.mock.calls.at(-1)![2];

describe("quarterly extraction review", () => {
  it("lists each unplaced line under the file and sheet it came from", async () => {
    await renderPage();
    expect(screen.getByText("Q3-databook.xlsx")).toBeInTheDocument();
    expect(screen.getByText("Income Statement")).toBeInTheDocument();
    expect(nameInput("doc-1#5").value).toBe("Refinery throughput adj");
    expect(within(rowFor("doc-1#5")).getByText("﷼122.008B")).toBeInTheDocument();
  });

  it("starts every row included, with the section already guessed", async () => {
    // The inversion that makes a 200-row first upload survivable: the work is
    // correcting the guesses, not answering a question per row.
    await renderPage();
    expect(screen.getByText(/2 to add/)).toBeInTheDocument();
    // The footer counter specifically — a bare /excluded/ also matches the
    // excluded-lines panel's heading, which is always on the page.
    expect(screen.queryByText(/· \d+ excluded/)).toBeNull();
    for (const id of ["doc-1#5", "doc-1#6"]) {
      const picker = within(rowFor(id)).getByRole("combobox", { name: /Section for/i });
      expect(picker).toHaveValue("Income Statement");
    }
  });

  it("sends keep for what is left in and exclude for what is taken out", async () => {
    await renderPage();
    fireEvent.click(excludeBtn("doc-1#6"));
    expect(screen.getByText(/1 to add · 1 excluded/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Continue to outline/i }));
    await waitFor(() => expect(submitExtractionReview).toHaveBeenCalled());

    expect(submitted()).toEqual([
      {
        id: "doc-1#5",
        action: "keep",
        label: "Refinery throughput adj",
        section_code: "income_statement",
        unit_type: "currency",
      },
      { id: "doc-1#6", action: "exclude" },
    ]);
  });

  it("sends the edited name, and says the original still matches", async () => {
    // Renaming must not opt the line out of next quarter's matching — the server
    // keeps the document's wording as a synonym, and the row says so.
    await renderPage();
    fireEvent.change(nameInput("doc-1#5"), { target: { value: "Throughput adjustment" } });
    expect(within(rowFor("doc-1#5")).getByText(/was “Refinery throughput adj”/)).toBeInTheDocument();
    expect(within(rowFor("doc-1#5")).getByText(/we'll still match that/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Continue to outline/i }));
    await waitFor(() => expect(submitExtractionReview).toHaveBeenCalled());
    expect(submitted()[0]).toMatchObject({ label: "Throughput adjustment" });
  });

  it("every row gets an explicit decision, never silence", async () => {
    // The server refuses a partial batch, because a row with no answer carries no
    // label and no section and so cannot be honoured either way.
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Continue to outline/i }));
    await waitFor(() => expect(submitExtractionReview).toHaveBeenCalled());
    expect(submitted().map((d) => d.id)).toEqual(["doc-1#5", "doc-1#6"]);
  });

  it("blocks a row with no section rather than filing it somewhere", async () => {
    const noGuess = structuredClone(RESPONSE);
    noGuess.sources![0].guessed_section = null;
    getExtractionReview.mockResolvedValue(noGuess);
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: /Continue to outline/i }));
    expect(submitExtractionReview).not.toHaveBeenCalled();
    expect(await screen.findByText(/Pick a section for 2 figures/i)).toBeInTheDocument();
  });

  it("blocks two lines in one file sharing a name", async () => {
    // They would upsert onto the same row server-side and the second would
    // overwrite the first — a figure the user kept, gone with no error.
    await renderPage();
    fireEvent.change(nameInput("doc-1#6"), { target: { value: "Refinery throughput adj" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue to outline/i }));

    expect(submitExtractionReview).not.toHaveBeenCalled();
    expect(await screen.findByText(/would overwrite the other/i)).toBeInTheDocument();
  });

  it("blocks a row whose name has been cleared", async () => {
    await renderPage();
    fireEvent.change(nameInput("doc-1#5"), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: /Continue to outline/i }));

    expect(submitExtractionReview).not.toHaveBeenCalled();
    expect(await screen.findByText(/has no name/i)).toBeInTheDocument();
  });

  it("an excluded row keeps its place in the list", async () => {
    // A list that reorders under the cursor is unusable at sixty rows.
    await renderPage();
    const idsBefore = screen.getAllByTestId(/^row-/).map((el) => el.dataset.testid);
    fireEvent.click(excludeBtn("doc-1#5"));
    expect(screen.getAllByTestId(/^row-/).map((el) => el.dataset.testid)).toEqual(idsBefore);
  });

  it("goes to the outline once the answers are saved", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Continue to outline/i }));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/quarterly-report/rpt-1/outline"),
    );
  });

  it("skips straight through when there is nothing to file", async () => {
    getExtractionReview.mockResolvedValue({
      ...structuredClone(RESPONSE),
      awaiting_review: false,
      pending: [],
      sources: [],
      summary: { confirmed_count: 1, pending_count: 0, discarded_count: 0 },
    });
    await renderPage();
    expect(screen.getByText(/Nothing left to file/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Continue to outline/i }));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/quarterly-report/rpt-1/outline"),
    );
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

  it("says the first quarter is the slow one", async () => {
    await renderPage();
    expect(screen.getByText(/next quarter these match/i)).toBeInTheDocument();
  });

  // The searchable picker replaced a two-step group → section pair of selects.
  // With 53 sections, knowing the group before you can look was the friction.
  describe("section picker", () => {
    it("filters by title, group or code", async () => {
      await renderPage();
      const picker = within(rowFor("doc-1#5")).getByRole("combobox", { name: /Section for/i });

      fireEvent.focus(picker);
      fireEvent.change(picker, { target: { value: "zakat" } });
      const list = screen.getByRole("listbox", { name: /Section for/i });
      expect(within(list).getByText("Taxation & Zakat")).toBeInTheDocument();
      expect(within(list).queryByText("Income Statement")).toBeNull();
    });

    it("picking one sends its code", async () => {
      await renderPage();
      const picker = within(rowFor("doc-1#5")).getByRole("combobox", { name: /Section for/i });
      fireEvent.focus(picker);
      fireEvent.change(picker, { target: { value: "zakat" } });
      fireEvent.mouseDown(screen.getByText("Taxation & Zakat"));

      fireEvent.click(screen.getByRole("button", { name: /Continue to outline/i }));
      await waitFor(() => expect(submitExtractionReview).toHaveBeenCalled());
      expect(submitted()[0]).toMatchObject({ section_code: "taxation_zakat" });
    });

    it("says so when nothing matches, rather than showing an empty box", async () => {
      await renderPage();
      const picker = within(rowFor("doc-1#5")).getByRole("combobox", { name: /Section for/i });
      fireEvent.focus(picker);
      fireEvent.change(picker, { target: { value: "zzzz" } });
      expect(screen.getByText(/No section matches/i)).toBeInTheDocument();
    });
  });

  // The unit was on the payload all along and rendered nowhere, which is exactly
  // how a dual-currency sheet produced two visually identical rows.
  describe("units", () => {
    it("shows each figure's unit", async () => {
      await renderPage();
      expect(within(rowFor("doc-1#5")).getByText("SAR · millions")).toBeInTheDocument();
    });

    it("stays quiet when everything is in one currency", async () => {
      await renderPage();
      expect(screen.queryByRole("note", { name: /mixed units/i })).toBeNull();
    });

    it("warns when figures were read in two currencies", async () => {
      const mixed = structuredClone(RESPONSE);
      mixed.pending.push({
        ...mixed.pending[0],
        id: "doc-1#7",
        source_label: "Refinery throughput adj (USD)",
        source_page: 7,
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
      // The remedy is on the upload step, not this screen.
      expect(note).toHaveTextContent(/regenerate/i);
      expect(screen.getByText("USD · millions")).toBeInTheDocument();
    });

    it("the unit type can be corrected per row", async () => {
      // Without this a margin filed as a percentage prints "SAR millions".
      await renderPage();
      const unit = within(rowFor("doc-1#5")).getByLabelText(/This figure is/i);
      fireEvent.change(unit, { target: { value: "percent" } });

      fireEvent.click(screen.getByRole("button", { name: /Continue to outline/i }));
      await waitFor(() => expect(submitExtractionReview).toHaveBeenCalled());
      expect(submitted()[0]).toMatchObject({ unit_type: "percent" });
    });
  });

  // Excluding is the only decision on this screen that outlives the report, so it
  // is the only one that needed a way back. Without this a mis-click is permanent
  // and the remedy is a hand-written DELETE against the database.
  describe("excluded lines", () => {
    it("is not fetched until the panel is opened", async () => {
      await renderPage();
      expect(listExclusions).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: /Lines you've excluded/i }));
      await waitFor(() => expect(listExclusions).toHaveBeenCalledTimes(1));
      expect(await screen.findByText("Note 14 reference")).toBeInTheDocument();
    });

    it("brings a line back and stops showing it", async () => {
      await renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Lines you've excluded/i }));
      await screen.findByText("Note 14 reference");

      fireEvent.click(screen.getByRole("button", { name: /Ask me again/i }));
      await waitFor(() =>
        expect(undoExclusions).toHaveBeenCalledWith("co-1", ["Note 14 reference"]),
      );
      await waitFor(() => expect(screen.queryByText("Note 14 reference")).toBeNull());
    });

    it("is reachable when there is nothing left to file", async () => {
      // The case that matters most: a user who excluded everything sees an empty
      // review screen, and that is exactly when they need to get back in.
      getExtractionReview.mockResolvedValue({
        ...structuredClone(RESPONSE),
        awaiting_review: false,
        pending: [],
        sources: [],
        summary: { confirmed_count: 1, pending_count: 0, discarded_count: 0 },
      });
      await renderPage();
      expect(screen.getByText(/Nothing left to file/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Lines you've excluded/i }));
      expect(await screen.findByText("Note 14 reference")).toBeInTheDocument();
    });

    it("says so plainly when nothing has been excluded", async () => {
      listExclusions.mockResolvedValue({ company_id: "co-1", exclusions: [] });
      await renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Lines you've excluded/i }));
      expect(await screen.findByText(/haven't excluded anything yet/i)).toBeInTheDocument();
    });

    it("keeps the line listed when the restore fails", async () => {
      // Removing it optimistically would tell the user it is back when it is not,
      // and the next upload would skip it with no sign why.
      undoExclusions.mockRejectedValue(new Error("network down"));
      await renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Lines you've excluded/i }));
      await screen.findByText("Note 14 reference");

      fireEvent.click(screen.getByRole("button", { name: /Ask me again/i }));
      expect(await screen.findByText(/network down/i)).toBeInTheDocument();
      expect(screen.getByText("Note 14 reference")).toBeInTheDocument();
    });
  });
});
