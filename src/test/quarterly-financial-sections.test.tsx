// The Financial Data screen — Custom-metrics reports only, between Period and
// Extraction.
//
// The guarantee under test: a section that is ticked but has no file cannot reach
// the report. It would render as an empty table, and this screen is the one place
// where fixing that is a single upload rather than a puzzle at Preview.
//
// The second guarantee is quieter but matters as much: unticking a section here is
// the ONLY place that decision is made, so the section must actually go.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { FinancialsResponse } from "@/types/quarterly";

const getFinancials = vi.fn<() => Promise<FinancialsResponse>>();
const patchFinancialsSection = vi.fn();
const uploadFinancialsSection = vi.fn();
const addFinancialsSection = vi.fn();
const completeFinancials = vi.fn();
const navigateMock = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ApiError: actual.ApiError,
    quarterlyReports: {
      getFinancials: () => getFinancials(),
      patchFinancialsSection: (...a: unknown[]) => patchFinancialsSection(...a),
      uploadFinancialsSection: (...a: unknown[]) => uploadFinancialsSection(...a),
      deleteFinancialsSectionUpload: vi.fn(),
      saveFinancialsSettings: vi.fn(),
      addFinancialsSection: (...a: unknown[]) => addFinancialsSection(...a),
      completeFinancials: () => completeFinancials(),
    },
  };
});

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { company_id: "co-1" } }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock, useParams: () => ({ reportId: "rpt-1" }) };
});

const upload = (filename: string, rows: number, scaleSource = "units_text") => ({
  document_id: "doc-1",
  filename,
  row_count: rows,
  currency: "SAR",
  scale: "thousand",
  scale_source: scaleSource,
  uploaded_at: "2026-08-09T10:00:00Z",
});

const RESPONSE: FinancialsResponse = {
  report_id: "rpt-1",
  company_id: "co-1",
  period: "Q3-2025",
  currency: "SAR",
  scale: "millions",
  sections: [
    {
      section_code: "income_statement",
      title: "Income Statement",
      section_group: "Primary Statements",
      is_custom: false,
      included: true,
      file: upload("income.xlsx", 42),
    },
    {
      section_code: "financial_position",
      title: "Statement of Financial Position",
      section_group: "Primary Statements",
      is_custom: false,
      included: true,
      file: null,
    },
    {
      section_code: "taxation_zakat",
      title: "Taxation & Zakat",
      section_group: "Notes",
      is_custom: false,
      included: false,
      file: null,
    },
  ],
  can_continue: false,
  blocking: ["Statement of Financial Position"],
};

async function renderPage(res: FinancialsResponse = RESPONSE) {
  getFinancials.mockReset().mockResolvedValue(structuredClone(res));
  const { default: Page } = await import("@/pages/quarterly/FinancialSectionsPage");
  render(
    <MemoryRouter>
      <Page />
    </MemoryRouter>,
  );
  // The heading only renders once the fetch resolves, so it works as the ready
  // signal for any fixture — a section title would not.
  await screen.findByText("Financial Data");
}

beforeEach(() => {
  patchFinancialsSection.mockReset();
  uploadFinancialsSection.mockReset();
  addFinancialsSection.mockReset();
  completeFinancials.mockReset();
  navigateMock.mockReset();
});

afterEach(() => vi.clearAllMocks());

describe("Financial Data screen", () => {
  it("lists the sections grouped, with each upload's line count and units", async () => {
    await renderPage();

    expect(screen.getByText("Primary Statements")).toBeInTheDocument();
    expect(screen.getByText("Notes")).toBeInTheDocument();
    // The count is the reassurance that the right file went into the right place.
    expect(screen.getByText(/42 lines · SAR · thousands/i)).toBeInTheDocument();
    expect(screen.getByText("No file yet")).toBeInTheDocument();
    expect(screen.getByText("Not included")).toBeInTheDocument();
  });

  it("blocks Continue and names the section still missing a file", async () => {
    await renderPage();

    const cont = screen.getByRole("button", { name: /continue to extraction/i });
    expect(cont).toBeDisabled();
    expect(
      screen.getByText(/still need a file: Statement of Financial Position/i),
    ).toBeInTheDocument();
    expect(completeFinancials).not.toHaveBeenCalled();
  });

  it("counts the rest instead of listing every section", async () => {
    // Every section starts ticked, so on a fresh report this line would otherwise
    // print all 18 titles and stop being readable.
    const many = Array.from({ length: 6 }, (_, i) => ({
      section_code: `s${i}`,
      title: `Section ${i}`,
      section_group: "Notes",
      is_custom: false,
      included: true,
      file: null,
    }));
    await renderPage({
      ...RESPONSE,
      sections: many,
      can_continue: false,
      blocking: many.map((s) => s.title),
    });

    expect(screen.getByText(/Section 0, Section 1, Section 2 \+3 more/)).toBeInTheDocument();
    expect(screen.getByText(/0 of 6 sections ready/)).toBeInTheDocument();
  });

  it("continues once every ticked section has a file", async () => {
    await renderPage({
      ...RESPONSE,
      sections: RESPONSE.sections.map((s) =>
        s.section_code === "financial_position" ? { ...s, file: upload("bs.xlsx", 20) } : s,
      ),
      can_continue: true,
      blocking: [],
    });
    completeFinancials.mockResolvedValue({
      report_id: "rpt-1",
      sections: [],
      next: "/quarterly-report/rpt-1/extraction",
    });

    fireEvent.click(screen.getByRole("button", { name: /continue to extraction/i }));

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/quarterly-report/rpt-1/extraction"),
    );
  });

  it("unticking a section sends included:false", async () => {
    await renderPage();
    patchFinancialsSection.mockResolvedValue(structuredClone(RESPONSE));

    fireEvent.click(screen.getByLabelText("Include Income Statement"));

    await waitFor(() =>
      expect(patchFinancialsSection).toHaveBeenCalledWith("co-1", "rpt-1", "income_statement", {
        included: false,
      }),
    );
  });

  it("flags a scale nobody actually stated", async () => {
    // 'default' means the file said nothing, there was no prior quarter, and the
    // model was unsure — the one value that silently multiplies a whole section by
    // 1000 when wrong, so it must not read like a reading.
    await renderPage({
      ...RESPONSE,
      sections: [{ ...RESPONSE.sections[0], file: upload("income.xlsx", 42, "default") }],
      can_continue: true,
      blocking: [],
    });

    fireEvent.click(screen.getByText("Income Statement"));
    expect(screen.getByText(/assumed — check this/i)).toBeInTheDocument();
    expect(screen.getByText(/confirm the scale/i)).toBeInTheDocument();
  });

  it("adds a section of the company's own", async () => {
    await renderPage();
    addFinancialsSection.mockResolvedValue(structuredClone(RESPONSE));

    fireEvent.click(screen.getByRole("button", { name: /add a section/i }));
    fireEvent.change(screen.getByPlaceholderText(/production volumes/i), {
      target: { value: "Production volumes by field" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(addFinancialsSection).toHaveBeenCalledWith(
        "co-1",
        "rpt-1",
        "Production volumes by field",
      ),
    );
  });

  // ── "Is this how we should read your file?" ──────────────────────────────
  // The dialog exists because an Aramco equity sheet held three tables and a
  // column of share-capital amounts that looked like line names, and went in with
  // "75000" as a label. Nothing may be stored while this is open.
  const CONFIRMATION = {
    needs_confirmation: true as const,
    section_code: "financial_position",
    section_title: "Statement of Financial Position",
    filename: "equity.xlsx",
    reasons: ["This file holds 2 separate tables."],
    currency: "SAR",
    scale: "million",
    tables: [
      {
        key: "0:0",
        sheet: "Changes in Equity",
        columns: [
          { index: 0, name: "Movement" },
          { index: 1, name: "Share capital" },
          { index: 5, name: "Total SAR mn" },
        ],
        header_row: 4,
        label_col: 0,
        value_col: 5,
        row_count: 14,
        preview: [{ label: "Balance at January 1, 2022", value: 1280668 }],
        header_options: [3, 4, 5],
      },
      {
        key: "0:1",
        sheet: "Changes in Equity",
        columns: [
          { index: 0, name: "Third quarter 2022 movement" },
          { index: 2, name: "Total SAR mn" },
        ],
        header_row: 11,
        label_col: 0,
        value_col: 2,
        row_count: 7,
        preview: [{ label: "Net income for the quarter", value: 159115 }],
        header_options: [11],
      },
    ],
  };

  const uploadEquity = async () => {
    await renderPage();
    uploadFinancialsSection.mockResolvedValueOnce(CONFIRMATION);
    fireEvent.click(screen.getByText("Statement of Financial Position"));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["x"], "equity.xlsx")] },
    });
    await screen.findByRole("dialog");
  };

  it("asks instead of guessing, and stores nothing while it asks", async () => {
    await uploadEquity();

    expect(screen.getByText(/Is this how we should read equity.xlsx/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing has been saved yet/i)).toBeInTheDocument();
    expect(screen.getByText("This file holds 2 separate tables.")).toBeInTheDocument();
    // Our reading is pre-filled — the user confirms rather than works it out.
    expect((screen.getByLabelText("Line names") as HTMLSelectElement).value).toBe("0");
    expect((screen.getByLabelText("Figures") as HTMLSelectElement).value).toBe("5");
    expect(screen.getByText("Balance at January 1, 2022")).toBeInTheDocument();
  });

  it("sends the chosen table and columns back with the same file", async () => {
    await uploadEquity();

    fireEvent.click(screen.getByRole("button", { name: /Table 2 · 7 lines/ }));
    fireEvent.change(screen.getByLabelText("Numbers are in"), {
      target: { value: "thousands" },
    });
    uploadFinancialsSection.mockResolvedValueOnce(structuredClone(RESPONSE));
    fireEvent.click(screen.getByRole("button", { name: "Use this" }));

    await waitFor(() => expect(uploadFinancialsSection).toHaveBeenCalledTimes(2));
    const [, , code, file, units, structure] = uploadFinancialsSection.mock.calls[1];
    expect(code).toBe("financial_position");
    expect((file as File).name).toBe("equity.xlsx");   // the same bytes, re-sent
    expect(units).toMatchObject({ scale: "thousands" });
    expect(structure).toEqual({
      table_key: "0:1",
      header_row: 11,
      label_col: 0,
      value_col: 2,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("cancel closes it and uploads nothing", async () => {
    await uploadEquity();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(uploadFinancialsSection).toHaveBeenCalledTimes(1);   // the probe only
  });

  it("rejects a file the extractor can't read as a grid", async () => {
    await renderPage();

    fireEvent.click(screen.getByText("Statement of Financial Position"));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["x"], "balance-sheet.pdf", { type: "application/pdf" })] },
    });

    // Caught before the request: a PDF reads as an empty grid, and the whole point
    // of this lane is exact cells with no OCR.
    expect(uploadFinancialsSection).not.toHaveBeenCalled();
    expect(screen.getByText(/isn't a data file/i)).toBeInTheDocument();
  });
});
