// spark_admin → Licenses (on-premises): the key form opens as a popup that only
// ✕ (or Cancel / Esc) closes — a click outside it must not lose a half-filled
// form. Cloud companies aren't listed: they subscribe to a plan instead.

import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const ROW = {
  company_id: "cmp_1", company_name: "Aramco", deployment: "on_prem", status: "none",
  starts_at: null, expires_at: null, issued_at: null, modules: [], report_limits: {},
  max_seats: null, server_id: "SRV-1111-2222-3333", seats_used: null, reports_counted: {}, lock: null,
  open_upgrade_requests: 0,
};
const MODULES = [
  { key: "board_report", label: "Board Report", report_type: "board_report" },
  { key: "annual_report", label: "Annual Report", report_type: "annual" },
  { key: "leadership", label: "Leadership", report_type: null },
];
const LICENSED = {
  ...ROW, company_id: "cmp_2", company_name: "BUPA", status: "active",
  modules: ["annual_report", "board_report", "leadership"], report_limits: { annual: 3 },
  open_upgrade_requests: 1,
};
const CLOUD = { ...ROW, company_id: "cmp_3", company_name: "Cloud Co", deployment: "cloud", server_id: null };

const list = vi.fn().mockResolvedValue({ licenses: [ROW, LICENSED, CLOUD], modules: MODULES, upgrade_requests: [] });

vi.mock("@/lib/api", () => ({
  sparkLicenses: {
    list: (...args: unknown[]) => list(...args),
    get: () => Promise.resolve(ROW),
    generate: vi.fn(),
    addOnPremClient: vi.fn(),
  },
}));

const { default: SparkLicensesPage } = await import("@/pages/spark/SparkLicensesPage");

async function openKeyForm() {
  render(<SparkLicensesPage />);
  // Opens on "Active"; the unlicensed company is under "All" / "No license".
  fireEvent.click(await screen.findByRole("button", { name: /^All/ }));
  fireEvent.click((await screen.findAllByRole("button", { name: "Generate key" }))[0]);
  return screen.findByRole("dialog");
}

describe("Licenses key form popup", () => {
  it("opens as a popup and a click outside does not close it", async () => {
    const dialog = await openKeyForm();
    expect(dialog).toHaveTextContent("Board Report");

    // Radix closes on pointerdown outside the content, unless we stop it.
    fireEvent.pointerDown(document.body);
    fireEvent.mouseDown(document.body);
    fireEvent.click(document.body);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes with ✕", async () => {
    await openKeyForm();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});


describe("Licenses (on-premises)", () => {
  it("lists on-premises clients with their Server ID and modules, and the add-client box", async () => {
    render(<SparkLicensesPage />);
    expect(await screen.findByText("BUPA")).toBeInTheDocument();
    expect(screen.getByText("Annual · 3")).toBeInTheDocument();
    expect(screen.getByText("Board")).toBeInTheDocument();       // no limit = no number
    expect(screen.getByText("Leadership")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("On-premises client name")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    expect(screen.getAllByText("SRV-1111-2222-3333").length).toBeGreaterThan(0);
  });

  it("doesn't list cloud companies (they subscribe to a plan) or offer cloud tabs", async () => {
    render(<SparkLicensesPage />);
    await screen.findByText("BUPA");
    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    expect(screen.queryByText("Cloud Co")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Cloud|Upgrade requests/ })).not.toBeInTheDocument();
  });
});


describe("Licenses page reloads by itself", () => {
  it("picks up a new client without a refresh, and not while a popup is open", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    list.mockClear();
    render(<SparkLicensesPage />);
    await screen.findByText("BUPA");
    expect(list).toHaveBeenCalledTimes(1);

    const added = { ...LICENSED, company_id: "cmp_4", company_name: "Ministry B" };
    list.mockResolvedValueOnce({ licenses: [ROW, LICENSED, added], modules: MODULES, upgrade_requests: [] });
    await act(async () => { vi.advanceTimersByTime(30_000); });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Ministry B")).toBeInTheDocument();

    // A popup is open: no reload under it.
    fireEvent.click(screen.getAllByRole("button", { name: "New key" })[0]);
    await screen.findByRole("dialog");
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(list).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("reloads when the browser tab comes back", async () => {
    list.mockClear();
    render(<SparkLicensesPage />);
    await screen.findByText("BUPA");
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });
});

describe("Licenses by license state, with pages", () => {
  it("opens on Active; All groups the companies under headings", async () => {
    render(<SparkLicensesPage />);
    expect(await screen.findByText("BUPA")).toBeInTheDocument();
    expect(screen.queryByText("Aramco")).not.toBeInTheDocument();        // no license: not in Active
    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    expect(screen.getByText("Aramco")).toBeInTheDocument();
    expect(screen.getByText("Active · 1")).toBeInTheDocument();
    expect(screen.getByText("No license · 1")).toBeInTheDocument();
  });

  it("No license shows only the unlicensed companies", async () => {
    render(<SparkLicensesPage />);
    fireEvent.click(await screen.findByRole("button", { name: /^No license/ }));
    expect(screen.getByText("Aramco")).toBeInTheDocument();
    expect(screen.queryByText("BUPA")).not.toBeInTheDocument();
  });

  it("pages the table, 10 rows at a time", async () => {
    const many = Array.from({ length: 23 }, (_, i) => ({
      ...LICENSED, company_id: `cmp_m${i}`, company_name: `Company ${String(i + 1).padStart(2, "0")}`, open_upgrade_requests: 0,
    }));
    list.mockResolvedValueOnce({ licenses: many, modules: MODULES, upgrade_requests: [] });
    render(<SparkLicensesPage />);
    expect(await screen.findByText("Company 01")).toBeInTheDocument();
    expect(screen.queryByText("Company 11")).not.toBeInTheDocument();
    expect(screen.getByText("1–10")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next ›" }));
    expect(screen.getByText("Company 11")).toBeInTheDocument();
    expect(screen.queryByText("Company 01")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    expect(screen.getByText("21–23")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next ›" })).toBeDisabled();
  });
});


describe("Ending soon", () => {
  it("lists active companies ending within 30 days, with how many days are left", async () => {
    const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    const soon = { ...LICENSED, company_id: "cmp_soon", company_name: "Soon Co", expires_at: inDays(10), open_upgrade_requests: 0 };
    const later = { ...LICENSED, company_id: "cmp_later", company_name: "Later Co", expires_at: inDays(200), open_upgrade_requests: 0 };
    list.mockResolvedValueOnce({ licenses: [soon, later], modules: MODULES, upgrade_requests: [] });
    render(<SparkLicensesPage />);
    expect(await screen.findByText("Later Co")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Ending soon/ }));
    expect(screen.getByText("Soon Co")).toBeInTheDocument();
    expect(screen.queryByText("Later Co")).not.toBeInTheDocument();
    expect(screen.getByText("ends in 10 days")).toBeInTheDocument();
  });
});


describe("A locked company", () => {
  it("shows only the Unlock code button (a new key wouldn't clear the lock)", async () => {
    const locked = { ...LICENSED, company_id: "cmp_locked", company_name: "Locked Co", open_upgrade_requests: 0,
                     lock: { lock_id: "LCK-9319", reason: "License usage record was changed", locked_at: "2026-11-03" } };
    list.mockResolvedValueOnce({ licenses: [locked], modules: MODULES, upgrade_requests: [] });
    render(<SparkLicensesPage />);
    fireEvent.click(await screen.findByRole("button", { name: /^Needs attention/ }));
    expect(screen.getByText("Locked Co")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unlock code" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New key" })).not.toBeInTheDocument();
  });
});
