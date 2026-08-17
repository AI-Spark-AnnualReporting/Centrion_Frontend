// The "?" panels next to the two upload fields, which tell the user which
// documents to bring.
//
// The closed-by-default assertion is not cosmetic: quarterly-cross-metrics
// queries `findByRole("note")` in the singular, which throws on multiple matches.
// A panel that rendered open on mount would break an unrelated suite.

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

const sourceTrigger = () =>
  screen.getByRole("button", { name: /what to upload as source documents/i });
const financialTrigger = () =>
  screen.getByRole("button", { name: /what financial documents to upload/i });

describe("upload help panels", () => {
  it("renders no panel until asked", async () => {
    renderForm();
    await waitFor(() => expect(sourceTrigger()).toBeInTheDocument());
    expect(screen.queryByRole("note")).toBeNull();
    expect(sourceTrigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("lists the source-document types on click", async () => {
    renderForm();
    fireEvent.click(sourceTrigger());

    const panel = await screen.findByRole("note", { name: /source documents/i });
    expect(panel).toHaveTextContent("MD&A");
    expect(panel).toHaveTextContent("Prior-year annual report");
    expect(panel).toHaveTextContent("Management notes");
    expect(panel).toHaveTextContent(/do not read any figures/i);
    expect(sourceTrigger()).toHaveAttribute("aria-expanded", "true");
  });

  it("lists the financial statements on click", async () => {
    renderForm();
    fireEvent.click(financialTrigger());

    const panel = await screen.findByRole("note", { name: /financial data/i });
    expect(panel).toHaveTextContent("Balance sheet");
    expect(panel).toHaveTextContent("Statement of income");
    expect(panel).toHaveTextContent("Cash flow statement");
    // Where the dual-currency mistake actually gets made.
    expect(panel).toHaveTextContent(/two\s+currency\s+columns/i);
  });

  it("opens on hover", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderForm();

    fireEvent.mouseEnter(sourceTrigger().parentElement as HTMLElement);
    await vi.advanceTimersByTimeAsync(200);
    expect(await screen.findByRole("note", { name: /source documents/i })).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("opening one panel closes the other", async () => {
    renderForm();

    fireEvent.click(sourceTrigger());
    await screen.findByRole("note", { name: /source documents/i });

    fireEvent.click(financialTrigger());
    await screen.findByRole("note", { name: /financial data/i });

    // One slot, so the first is gone rather than stacked behind it.
    expect(screen.queryByRole("note", { name: /source documents/i })).toBeNull();
  });

  it("closes on Escape", async () => {
    renderForm();
    fireEvent.click(financialTrigger());
    await screen.findByRole("note", { name: /financial data/i });

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("note", { name: /financial data/i })).toBeNull(),
    );
  });

  it("still explains the metrics modes", async () => {
    renderForm();
    fireEvent.click(
      screen.getByRole("button", { name: /how should we read your figures/i }),
    );
    const panel = await screen.findByRole("note", { name: /how we read your figures/i });
    // One line per mode — the panel is the only place the three are compared.
    expect(panel).toHaveTextContent(/standard report template/i);
    expect(panel).toHaveTextContent(/one statement into each/i);
    expect(panel).toHaveTextContent(/becomes a section/i);
  });
});
