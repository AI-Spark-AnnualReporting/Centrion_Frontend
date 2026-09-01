// Covers the Currency + "Numbers are in" selectors on the Generate Quarterly
// Report form, and — the important part — that both actually reach the wire.
//
// These selectors existed once and were removed in 7d7eaad on the understanding
// that the backend auto-detects. Detection resolves a SINGLE sheet-wide value, so
// a sheet carrying both SAR and USD columns produced every metric twice in the
// report. The payload assertion below is the permanent proof that the frontend
// half of the fix is wired; nothing else in the app reads these fields back.
//
// Runs against the REAL @/lib/api (only `fetch` is stubbed) so a bad module
// reference surfaces as "is not a function" rather than passing against a mock.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import QuarterlyReportForm from "@/components/reports/QuarterlyReportForm";

const realFetch = global.fetch;

let generateBody: FormData | null = null;

/** Company payload for /companies/me; null means the call rejects. */
let companyPayload: { reporting_currency: string | null } | null = {
  reporting_currency: "SAR",
};
/** Resolve /companies/me only when released — used by the no-clobber test. */
let holdCompany: (() => void) | null = null;

function installFetch() {
  generateBody = null;
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown) =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    if (url.includes("/quarterly/generate")) {
      generateBody = init?.body as FormData;
      return json({ report_id: "r-1", run_id: "run-1", status: "running" });
    }
    if (url.includes("/companies/me")) {
      if (!companyPayload) return Promise.reject(new Error("no company"));
      const payload = companyPayload;
      if (holdCompany) {
        return new Promise<Response>((resolve) => {
          holdCompany = () =>
            resolve(
              new Response(JSON.stringify(payload), {
                status: 200,
                headers: { "content-type": "application/json" },
              }),
            );
        });
      }
      return json(payload);
    }
    // Fail-open language check, or the narrative file keeps Generate disabled.
    if (url.includes("/quarterly/check-language"))
      return json({ success: true, matches: true, detected_language: "english", expected_language: "english" });
    // An in-flight comparison check also gates Generate.
    if (url.includes("/comparison-availability")) return json({ yoy: true, qoq: true });
    if (url.includes("/quarterly/system-metrics")) return json({ total: 5, groups: [] });
    if (url.includes("/quarterly/report-areas")) return json({ areas: [] });
    return Promise.reject(new Error("offline"));
  }) as typeof fetch;
}

beforeEach(() => {
  companyPayload = { reporting_currency: "SAR" };
  holdCompany = null;
  installFetch();
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

function file(name: string) {
  return new File(["x"], name, { type: "application/octet-stream" });
}

/** Fill everything Generate gates on. Returns the two file inputs. */
async function fillForm(container: HTMLElement, opts: { scale?: string; currency?: string } = {}) {
  const selects = () => Array.from(container.querySelectorAll("select")) as HTMLSelectElement[];

  // Year, then quarter (the quarter select only renders once a year is picked).
  const yearSelect = selects()[0];
  fireEvent.change(yearSelect, { target: { value: String(new Date().getFullYear()) } });
  await waitFor(() => expect(screen.getByText("Select quarter…")).toBeInTheDocument());
  const quarterSelect = selects().find((s) =>
    Array.from(s.options).some((o) => o.value === "Q1"),
  )!;
  fireEvent.change(quarterSelect, { target: { value: "Q1" } });

  const fileInputs = Array.from(
    container.querySelectorAll('input[type="file"]'),
  ) as HTMLInputElement[];
  // DOM order: narrative lane first, financial lane second.
  fireEvent.change(fileInputs[0], { target: { files: [file("mdna.pdf")] } });
  fireEvent.change(fileInputs[1], { target: { files: [file("statements.xlsx")] } });

  if (opts.currency) {
    fireEvent.change(await screen.findByLabelText("Currency"), {
      target: { value: opts.currency },
    });
  }
  if (opts.scale) {
    fireEvent.change(await screen.findByLabelText("Numbers are in"), {
      target: { value: opts.scale },
    });
  }

  fireEvent.click(screen.getByRole("button", { name: "Non-financial" }));
  return fileInputs;
}

describe("financial currency + scale", () => {
  it("sends financial_currency and financial_scale on the generate request", async () => {
    const { container } = renderForm();
    await fillForm(container, { currency: "USD", scale: "thousands" });

    const generate = screen.getByRole("button", { name: /generate report/i });
    await waitFor(() => expect(generate).not.toBeDisabled());
    fireEvent.click(generate);

    await waitFor(() => expect(generateBody).not.toBeNull());
    expect(generateBody!.get("financial_currency")).toBe("USD");
    expect(generateBody!.get("financial_scale")).toBe("thousands");
  });

  it("defaults the currency to the company's reporting currency", async () => {
    companyPayload = { reporting_currency: "AED" };
    renderForm();
    await waitFor(() =>
      expect((screen.getByLabelText("Currency") as HTMLSelectElement).value).toBe("AED"),
    );
  });

  it("falls back to SAR when the company lookup fails", async () => {
    companyPayload = null;
    renderForm();
    const currency = await screen.findByLabelText("Currency");
    await waitFor(() => expect((currency as HTMLSelectElement).value).toBe("SAR"));
  });

  it("keeps a currency the user picked when the company lookup resolves late", async () => {
    companyPayload = { reporting_currency: "AED" };
    holdCompany = () => {}; // hold the response open
    renderForm();

    const currency = (await screen.findByLabelText("Currency")) as HTMLSelectElement;
    fireEvent.change(currency, { target: { value: "GBP" } });
    expect(currency.value).toBe("GBP");

    // The company resolves only now — it must not overwrite the explicit choice.
    holdCompany!();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(currency.value).toBe("GBP");
  });

  it("shows a currency the company reports in even when it is off our list", async () => {
    companyPayload = { reporting_currency: "JPY" };
    renderForm();
    await waitFor(() =>
      expect((screen.getByLabelText("Currency") as HTMLSelectElement).value).toBe("JPY"),
    );
  });

  it("blocks Generate until a scale is chosen, and says so", async () => {
    const { container } = renderForm();
    await fillForm(container, { currency: "SAR" }); // no scale

    const generate = screen.getByRole("button", { name: /generate report/i });
    await waitFor(() => expect(generate).toBeDisabled());
    expect(screen.getByText(/what scale the financial figures are in/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Numbers are in"), {
      target: { value: "millions" },
    });
    await waitFor(() => expect(generate).not.toBeDisabled());
  });
});
