// "No tables found" — the popup on the Financial Data field.
//
// A .docx is read by the backend as TABLES ONLY, so a plain Word document is an
// empty file to us. A user testing the app blind dropped one here expecting the
// narrative to be read out of it, and the report generated end to end with every
// figure blank and nothing said. This is the moment it gets said.
//
// Runs against the REAL @/lib/api — same reasoning as quarterly-metrics-popup:
// this feature adds a brand-new endpoint (checkTables) that the form calls on
// upload, and a mocked api module is free to invent an export production hasn't
// got. Only `fetch` is stubbed.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { reports } from "@/lib/api";
import QuarterlyReportForm from "@/components/reports/QuarterlyReportForm";

const NO_TABLES = {
  success: true,
  has_tables: false,
  table_count: 0,
  table_names: [],
  reason: "no_tables",
  message:
    "'prose.docx' has no tables in it. Every figure we read comes out of a table.",
};

const TWO_TABLES = {
  success: true,
  has_tables: true,
  table_count: 2,
  table_names: ["Income Statement", "Balance Sheet"],
  reason: null,
  message: null,
};

const realFetch = global.fetch;
let tablesReply: unknown = NO_TABLES;

beforeEach(() => {
  tablesReply = NO_TABLES;
  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    const json = (body: unknown) =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    if (url.includes("/quarterly/check-tables")) return json(tablesReply);
    if (url.includes("/companies/me")) return json({ reporting_currency: "SAR" });
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

/** The hidden Financial Data input — the only one accepting .xlsx. */
const financialInput = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>('input[type="file"][accept*=".xlsx"]')!;

const attach = (container: HTMLElement, name: string) => {
  const input = financialInput(container);
  const file = new File(["x"], name, { type: "application/octet-stream" });
  fireEvent.change(input, { target: { files: [file] } });
};

describe("no-tables popup on the financial upload", () => {
  it("exposes the endpoint the form calls", () => {
    expect(typeof reports.checkTables).toBe("function");
  });

  it("pops the backend's own sentence when the file has no tables", async () => {
    const { container } = renderForm();
    await waitFor(() => expect(financialInput(container)).toBeTruthy());

    attach(container, "prose.docx");

    const dialog = await screen.findByRole("dialog", {
      name: /no tables found in the financial file/i,
    });
    // The wording is the backend's — one source, so the popup, the 422 and the
    // per-section upload can't drift apart.
    expect(dialog).toHaveTextContent("has no tables in it");
    expect(dialog).toHaveTextContent("prose.docx");
  });

  it("blocks Generate while the bad file is attached, even after dismissing", async () => {
    const { container } = renderForm();
    await waitFor(() => expect(financialInput(container)).toBeTruthy());

    attach(container, "prose.docx");
    await screen.findByRole("dialog", { name: /no tables found/i });

    fireEvent.click(screen.getByRole("button", { name: /got it/i }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /no tables found/i })).toBeNull(),
    );

    // Dismissing the popup is not fixing the file: the chip stays flagged and
    // the button stays off.
    expect(screen.getByText("No tables found")).toBeInTheDocument();
    const generate = screen.getByRole("button", { name: /generate report/i });
    expect(generate).toBeDisabled();
  });

  it("Remove file drops the file and the flag together", async () => {
    const { container } = renderForm();
    await waitFor(() => expect(financialInput(container)).toBeTruthy());

    attach(container, "prose.docx");
    const dialog = await screen.findByRole("dialog", { name: /no tables found/i });

    // Scoped: the file chip carries its own "Remove file" ✕.
    fireEvent.click(within(dialog).getByRole("button", { name: /remove file/i }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /no tables found/i })).toBeNull(),
    );
    expect(screen.queryByText("prose.docx")).toBeNull();
    expect(screen.queryByText("No tables found")).toBeNull();
  });

  it("confirms what it found on a readable file, with no popup", async () => {
    tablesReply = TWO_TABLES;
    const { container } = renderForm();
    await waitFor(() => expect(financialInput(container)).toBeTruthy());

    attach(container, "book.xlsx");

    expect(await screen.findByText("2 tables found")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /no tables found/i })).toBeNull();
  });

  it("drops the answer for a file removed while the check was still running", async () => {
    let release!: (body: unknown) => void;
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      if (url.includes("/quarterly/check-tables"))
        return new Promise<Response>((res) => {
          release = (body) => res(json(body));
        });
      if (url.includes("/companies/me")) return Promise.resolve(json({ reporting_currency: "SAR" }));
      return Promise.reject(new Error("offline"));
    }) as typeof fetch;

    const { container } = renderForm();
    await waitFor(() => expect(financialInput(container)).toBeTruthy());

    attach(container, "prose.docx");
    await screen.findByText("Checking for tables…");

    // The chip's own ✕, while the request is still open.
    fireEvent.click(screen.getByRole("button", { name: /remove file/i }));
    expect(screen.queryByText("prose.docx")).toBeNull();

    release(NO_TABLES);

    // The file is gone, so its answer is too — no popup about a file that isn't there.
    await waitFor(() => expect(screen.queryByText("Checking for tables…")).toBeNull());
    expect(screen.queryByRole("dialog", { name: /no tables found/i })).toBeNull();
  });

  it("fails open when the check itself errors", async () => {
    // The submit-time gate is the real backstop — a flaky network must not be
    // able to lock the user out of their own report.
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/quarterly/check-tables")) return Promise.reject(new Error("offline"));
      if (url.includes("/companies/me"))
        return Promise.resolve(
          new Response(JSON.stringify({ reporting_currency: "SAR" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      return Promise.reject(new Error("offline"));
    }) as typeof fetch;

    const { container } = renderForm();
    await waitFor(() => expect(financialInput(container)).toBeTruthy());

    attach(container, "book.xlsx");

    await waitFor(() => expect(screen.getByText("book.xlsx")).toBeInTheDocument());
    expect(screen.queryByRole("dialog", { name: /no tables found/i })).toBeNull();
    expect(screen.queryByText("No tables found")).toBeNull();
  });
});
