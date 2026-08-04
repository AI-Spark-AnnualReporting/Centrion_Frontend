// The Report outline page renders ONE list, not a REQUIRED container followed by
// an OPTIONAL one. That matters beyond looks: the list order is written straight
// to display_order, and the backend's render path sorts by display_order — so the
// order shown here IS the order of the generated report. The old split forced
// every optional section below every required one, which silently misrepresented
// the blueprint's own interleaved order (the CEO statement belongs near the top).
//
// What's covered: the single container, interleaving, the OPTIONAL badge, numbers
// that count only included rows, the hidden Table of Contents leaving no gap, and
// the payload produced by dragging an optional above a required section.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { OutlineResponse, OutlineSection, OutlineSavePayload } from "@/types/quarterly";

const getOutline = vi.fn<() => Promise<OutlineResponse>>();
const saveOutline =
  vi.fn<(c: string, r: string, body: OutlineSavePayload) => Promise<unknown>>();

vi.mock("@/lib/api", () => ({
  quarterlyReports: {
    getOutline: () => getOutline(),
    saveOutline: (c: string, r: string, body: OutlineSavePayload) => saveOutline(c, r, body),
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

// Mirrors the real blueprint: optional sections are interleaved among required
// ones by display_order, not parked at the end.
const SECTIONS: OutlineSection[] = [
  section({ section_code: "cover", title: "Cover / Title Page", display_order: 0 }),
  section({ section_code: "table_of_contents", title: "Table of Contents", display_order: 1 }),
  section({
    section_code: "ceo_statement",
    title: "CEO Statement",
    requirement: "optional",
    included: true,
    display_order: 2,
  }),
  section({ section_code: "results_headline", title: "Results Headline", display_order: 3 }),
  section({
    section_code: "seasonality",
    title: "Seasonality",
    requirement: "optional",
    included: false,
    display_order: 4,
  }),
];

const response = (over: Partial<OutlineResponse> = {}): OutlineResponse => ({
  report_id: "rpt-1",
  company_id: "co-1",
  total_catalogue: SECTIONS.length,
  locked: false,
  ingest_running: false,
  sections: SECTIONS,
  ...over,
});

beforeEach(() => {
  getOutline.mockReset().mockResolvedValue(response());
  saveOutline.mockReset().mockResolvedValue({});
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

// Every rendered row, in DOM order. Anchored on the grip's aria-label, which is
// the one stable per-row handle; its parent is the row root.
function rows() {
  return screen.getAllByRole("button", { name: /^Reorder / }).map((grip) => {
    const root = grip.parentElement as HTMLElement;
    return {
      title: (grip.getAttribute("aria-label") ?? "").replace(/^Reorder /, ""),
      // children: [grip, checkbox, number, title block, badges]
      number: (root.children[2] as HTMLElement).textContent,
      root,
      dropTarget: root.parentElement as HTMLElement,
    };
  });
}

// jsdom's synthetic drag events carry no dataTransfer.
const DT = { dataTransfer: { effectAllowed: "" } };

function dragTo(fromTitle: string, toTitle: string) {
  const all = rows();
  const from = all.find((r) => r.title === fromTitle)!;
  const to = all.find((r) => r.title === toTitle)!;
  fireEvent.dragStart(within(from.root).getByRole("button", { name: `Reorder ${fromTitle}` }), DT);
  fireEvent.dragOver(to.dropTarget, DT);
  fireEvent.drop(to.dropTarget, DT);
}

describe("quarterly outline — single merged section list", () => {
  it("renders one card, not separate REQUIRED and OPTIONAL containers", async () => {
    await renderPage();
    expect(screen.queryByText(/REQUIRED — always included/i)).toBeNull();
    expect(screen.queryByText(/^OPTIONAL — drag to reorder$/i)).toBeNull();
    expect(screen.getByText(/Report sections/i)).toBeInTheDocument();
  });

  it("interleaves optional sections among required ones by display_order", async () => {
    await renderPage();
    expect(rows().map((r) => r.title)).toEqual([
      "Cover / Title Page",
      "CEO Statement", // optional, but sits ABOVE a required section
      "Results Headline",
      "Seasonality",
    ]);
  });

  it("labels optional rows OPTIONAL and required rows REQUIRED + LOCKED", async () => {
    await renderPage();
    const byTitle = Object.fromEntries(rows().map((r) => [r.title, r.root]));

    expect(within(byTitle["CEO Statement"]).getByText("OPTIONAL")).toBeInTheDocument();
    expect(within(byTitle["CEO Statement"]).queryByText("REQUIRED")).toBeNull();

    expect(within(byTitle["Cover / Title Page"]).getByText("REQUIRED")).toBeInTheDocument();
    expect(within(byTitle["Cover / Title Page"]).getByText("LOCKED")).toBeInTheDocument();
    expect(within(byTitle["Cover / Title Page"]).queryByText("OPTIONAL")).toBeNull();
  });

  it("hides the Table of Contents and numbers only included rows", async () => {
    await renderPage();
    expect(rows().map((r) => r.title)).not.toContain("Table of Contents");
    // The hidden ToC consumes no number (no 1,3,4 gap), and the excluded
    // Seasonality row gets a dash rather than a position it doesn't have.
    expect(rows().map((r) => r.number)).toEqual(["1", "2", "3", "—"]);
  });

  it("gives an optional dragged above a required the lower display_order", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await renderPage();

    dragTo("Seasonality", "Cover / Title Page");
    expect(rows().map((r) => r.title)[0]).toBe("Seasonality");

    // autosave is debounced 700ms
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    await waitFor(() => expect(saveOutline).toHaveBeenCalled());

    const body = saveOutline.mock.calls.at(-1)![2];
    const order = Object.fromEntries(
      body.sections.map((s) => [s.section_code, s.display_order]),
    );
    expect(order.seasonality).toBe(0);
    expect(order.seasonality).toBeLessThan(order.cover);
    // Excluded sections are still sent, so the backend persists their position.
    expect(body.sections.find((s) => s.section_code === "seasonality")?.included).toBe(false);
    // The hidden Table of Contents still reaches the payload.
    expect(body.sections.map((s) => s.section_code)).toContain("table_of_contents");
  });

  it("renumbers when an excluded section is ticked", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await renderPage();

    const seasonality = rows().find((r) => r.title === "Seasonality")!;
    fireEvent.click(within(seasonality.root).getByRole("checkbox"));

    // It now has a real position instead of a dash.
    expect(rows().map((r) => r.number)).toEqual(["1", "2", "3", "4"]);
  });

  it("does not let the ingest poll clobber an unsaved reorder", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    getOutline.mockResolvedValue(response({ ingest_running: true }));
    await renderPage();

    dragTo("Seasonality", "Cover / Title Page");
    expect(rows().map((r) => r.title)[0]).toBe("Seasonality");

    // Two poll ticks land, each returning the ORIGINAL server order.
    await act(async () => { await vi.advanceTimersByTimeAsync(9000); });

    // The local reorder survives — the poll only refreshes feeder/recommended.
    expect(rows().map((r) => r.title)[0]).toBe("Seasonality");
  });
});
