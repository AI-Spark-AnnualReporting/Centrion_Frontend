// Source documents are required for a new quarterly report: the narrative
// sections have nothing to write from without them.
//
// The cap test is the load-bearing one. Both lanes share a 10-document cap, and
// each reserves a slot for the other. Without the financial lane's reservation a
// user could fill all 10 with spreadsheets, never be able to add a source
// document, and leave Generate permanently disabled with no way out.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import QuarterlyReportForm from "@/components/reports/QuarterlyReportForm";

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
    if (url.includes("/companies/me")) return json({ reporting_currency: "SAR" });
    if (url.includes("/quarterly/check-language"))
      return json({ success: true, matches: true, detected_language: "english", expected_language: "english" });
    if (url.includes("/comparison-availability")) return json({ yoy: true, qoq: true });
    if (url.includes("/quarterly/system-metrics")) return json({ total: 5, groups: [] });
    if (url.includes("/quarterly/report-areas")) return json({ areas: [] });
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

const file = (name: string) => new File(["x"], name, { type: "application/octet-stream" });

function fileInputs(container: HTMLElement) {
  const inputs = Array.from(
    container.querySelectorAll('input[type="file"]'),
  ) as HTMLInputElement[];
  return { narrative: inputs[0], financial: inputs[1] };
}

async function pickPeriod(container: HTMLElement) {
  const selects = () => Array.from(container.querySelectorAll("select")) as HTMLSelectElement[];
  fireEvent.change(selects()[0], { target: { value: String(new Date().getFullYear()) } });
  await waitFor(() => expect(screen.getByText("Select quarter…")).toBeInTheDocument());
  const quarter = selects().find((s) => Array.from(s.options).some((o) => o.value === "Q1"))!;
  fireEvent.change(quarter, { target: { value: "Q1" } });
}

describe("source documents are required", () => {
  it("labels the field as required", async () => {
    renderForm();
    const labels = await screen.findAllByText("— required");
    // Both lanes carry the marker now.
    expect(labels.length).toBe(2);
  });

  it("blocks Generate with financial data but no source document", async () => {
    const { container } = renderForm();
    await pickPeriod(container);
    const { narrative, financial } = fileInputs(container);

    fireEvent.change(financial, { target: { files: [file("statements.xlsx")] } });
    fireEvent.change(screen.getByLabelText("Numbers are in"), { target: { value: "millions" } });
    fireEvent.click(screen.getByRole("button", { name: "Non-financial" }));

    const generate = screen.getByRole("button", { name: /generate report/i });
    await waitFor(() => expect(generate).toBeDisabled());
    expect(screen.getByText(/upload at least one source document/i)).toBeInTheDocument();

    fireEvent.change(narrative, { target: { files: [file("mdna.pdf")] } });
    await waitFor(() => expect(generate).not.toBeDisabled());
  });

  it("reserves a slot so the financial lane can never starve the narrative lane", async () => {
    const { container } = renderForm();
    const { narrative, financial } = fileInputs(container);

    // Ten spreadsheets against a ten-document cap.
    const many = Array.from({ length: 10 }, (_, i) => file(`sheet-${i}.xlsx`));
    fireEvent.change(financial, { target: { files: many } });

    // One is held back for the other lane, so only nine land.
    await waitFor(() => expect(screen.getByText("sheet-8.xlsx")).toBeInTheDocument());
    expect(screen.queryByText("sheet-9.xlsx")).toBeNull();

    // And the source-document lane is still fillable — the whole point.
    fireEvent.change(narrative, { target: { files: [file("mdna.pdf")] } });
    await waitFor(() => expect(screen.getByText("mdna.pdf")).toBeInTheDocument());
  });

  it("keeps staged spreadsheets when the metrics mode is toggled", async () => {
    const { container } = renderForm();
    const { financial } = fileInputs(container);

    fireEvent.change(financial, { target: { files: [file("statements.xlsx")] } });
    await waitFor(() => expect(screen.getByText("statements.xlsx")).toBeInTheDocument());

    // The Financial Data field is shown in BOTH modes, so a toggle must not
    // discard what the user staged.
    fireEvent.click(screen.getByRole("radio", { name: /custom metrics/i }));
    expect(screen.getByText("statements.xlsx")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /system metrics/i }));
    expect(screen.getByText("statements.xlsx")).toBeInTheDocument();
  });
});
