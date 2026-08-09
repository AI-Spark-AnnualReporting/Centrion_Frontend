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
