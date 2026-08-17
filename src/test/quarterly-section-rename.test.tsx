// Renaming a section on the Report outline page.
//
// In the user/custom lanes a section is named after the sheet or table it came
// from, so a workbook tab called "Sheet1 Cons IS FY" became a heading in the
// delivered PDF. The pencil on each row is how that gets fixed, and the name then
// applies everywhere the backend resolves it — outline, preview, PDF, and the
// table of contents.
//
// The load-bearing case is the LOCKED outline: that is the state the user is in
// when they actually notice a bad name, and every other control on the page is
// frozen there. A rename must not be.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { OutlineResponse, OutlineSection, OutlineSavePayload } from "@/types/quarterly";

const getOutline = vi.fn<() => Promise<OutlineResponse>>();
const saveOutline =
  vi.fn<(c: string, r: string, body: OutlineSavePayload) => Promise<unknown>>();
const renameSection =
  vi.fn<(c: string, r: string, code: string, title: string) => Promise<OutlineResponse>>();

vi.mock("@/lib/api", () => ({
  quarterlyReports: {
    getOutline: () => getOutline(),
    saveOutline: (c: string, r: string, body: OutlineSavePayload) => saveOutline(c, r, body),
    renameSection: (c: string, r: string, code: string, title: string) =>
      renameSection(c, r, code, title),
  },
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, body?: unknown) {
      super(`ApiError ${status}`);
      this.status = status;
      this.body = body;
    }
  },
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { company_id: "co-1" } }),
}));

function section(over: Partial<OutlineSection> & { section_code: string }): OutlineSection {
  return {
    title: over.section_code,
    title_original: over.title ?? over.section_code,
    part_label: "Band",
    requirement: "required",
    included: true,
    recommended: false,
    locked: false,
    source_type: "system",
    mode: "generate",
    feeder: { status: "template", document_id: null, message: "" },
    ...over,
  };
}

// The case this exists for: a section named after the workbook tab it came from.
const SHEET_NAMED = "Sheet1 Cons IS FY";

const sections = (over: Partial<OutlineSection> = {}): OutlineSection[] => [
  section({ section_code: "cover", title: "Cover / Title Page", display_order: 0 }),
  section({
    section_code: "c_ab12_sheet1_cons_is_fy",
    title: SHEET_NAMED,
    title_original: SHEET_NAMED,
    display_order: 1,
    ...over,
  }),
];

const response = (over: Partial<OutlineResponse> = {}): OutlineResponse => ({
  report_id: "rpt-1",
  company_id: "co-1",
  total_catalogue: 2,
  locked: false,
  ingest_running: false,
  sections: sections(),
  ...over,
});

beforeEach(() => {
  getOutline.mockReset().mockResolvedValue(response());
  saveOutline.mockReset().mockResolvedValue({});
  renameSection.mockReset().mockImplementation((_c, _r, code, title) =>
    Promise.resolve(
      response({
        sections: sections({
          title: title || SHEET_NAMED,
          title_original: SHEET_NAMED,
        }).map((s) => (s.section_code === code ? s : s)),
      }),
    ),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function renderPage() {
  const OutlinePage = (await import("@/pages/quarterly/OutlinePage")).default;
  render(
    <MemoryRouter initialEntries={["/quarterly-report/rpt-1/outline"]}>
      <Routes>
        <Route path="/quarterly-report/:reportId/outline" element={<OutlinePage />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByText("Cover / Title Page");
}

const pencil = () => screen.getByRole("button", { name: `Rename ${SHEET_NAMED}` });
const input = () => screen.getByRole("textbox", { name: /^Section name for/ });

describe("renaming a section on the outline", () => {
  it("saves the typed name on Enter", async () => {
    await renderPage();
    fireEvent.click(pencil());

    fireEvent.change(input(), { target: { value: "Consolidated Income Statement" } });
    fireEvent.keyDown(input(), { key: "Enter" });

    await waitFor(() =>
      expect(renameSection).toHaveBeenCalledWith(
        "co-1",
        "rpt-1",
        "c_ab12_sheet1_cons_is_fy",
        "Consolidated Income Statement",
      ),
    );
    expect(await screen.findByText("Consolidated Income Statement")).toBeInTheDocument();
  });

  it("saves on blur too", async () => {
    await renderPage();
    fireEvent.click(pencil());
    fireEvent.change(input(), { target: { value: "Income Statement" } });
    fireEvent.blur(input());

    await waitFor(() => expect(renameSection).toHaveBeenCalledTimes(1));
  });

  it("Escape restores the old name and saves nothing", async () => {
    await renderPage();
    fireEvent.click(pencil());
    fireEvent.change(input(), { target: { value: "Never mind" } });
    fireEvent.keyDown(input(), { key: "Escape" });

    // Escape unmounts the input, which fires blur — the save must not sneak
    // through on the way out.
    await waitFor(() => expect(screen.getByText(SHEET_NAMED)).toBeInTheDocument());
    expect(renameSection).not.toHaveBeenCalled();
  });

  it("Enter does not save twice on the way out", async () => {
    await renderPage();
    fireEvent.click(pencil());
    // Held onto deliberately: Enter unmounts the input, and the blur it fires on
    // the way out is exactly the double-save this guards against.
    const el = input();
    fireEvent.change(el, { target: { value: "Once" } });
    fireEvent.keyDown(el, { key: "Enter" });
    fireEvent.blur(el);

    await waitFor(() => expect(renameSection).toHaveBeenCalledTimes(1));
  });

  it("offers Reset only once renamed, and clears with an empty title", async () => {
    getOutline.mockResolvedValue(
      response({
        sections: sections({ title: "Income Statement", title_original: SHEET_NAMED }),
      }),
    );
    await renderPage();

    expect(screen.getByText(/renamed/)).toBeInTheDocument();
    const reset = screen.getByRole("button", { name: "Reset" });
    // The hover title names what it goes back to, so the user isn't guessing.
    expect(reset).toHaveAttribute("title", `Back to "${SHEET_NAMED}"`);
    fireEvent.click(reset);

    await waitFor(() =>
      expect(renameSection).toHaveBeenCalledWith("co-1", "rpt-1", "c_ab12_sheet1_cons_is_fy", ""),
    );
  });

  it("shows no Reset on a section that was never renamed", async () => {
    await renderPage();
    expect(screen.queryByText(/renamed/)).toBeNull();
  });

  it("stays available on a LOCKED outline", async () => {
    // The state the user is in when they notice the name. Every other control on
    // the page is frozen here; this one is the point.
    getOutline.mockResolvedValue(response({ locked: true }));
    await renderPage();

    expect(pencil()).toBeInTheDocument();
    fireEvent.click(pencil());
    fireEvent.change(input(), { target: { value: "Income Statement" } });
    fireEvent.keyDown(input(), { key: "Enter" });

    await waitFor(() => expect(renameSection).toHaveBeenCalledTimes(1));
  });

  it("is frozen while ingest is still running", async () => {
    getOutline.mockResolvedValue(response({ ingest_running: true }));
    await renderPage();
    expect(screen.queryByRole("button", { name: /^Rename / })).toBeNull();
  });

  it("puts the old name back and says so when the save fails", async () => {
    renameSection.mockRejectedValue(new Error("offline"));
    await renderPage();

    fireEvent.click(pencil());
    fireEvent.change(input(), { target: { value: "Income Statement" } });
    fireEvent.keyDown(input(), { key: "Enter" });

    // Leaving the new name on screen would be a lie about what the report prints.
    expect(await screen.findByRole("alert")).toHaveTextContent(/Couldn't save that name/);
    expect(screen.getByText(SHEET_NAMED)).toBeInTheDocument();
  });
});
