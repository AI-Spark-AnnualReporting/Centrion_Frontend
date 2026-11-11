// spark_admin → Licenses → a client's license key page (Generate / Upgrade /
// Renew). Plan: Centriton/.claude/plans/license-key-page-and-people-checks.md

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const get = vi.fn();
const generate = vi.fn();

vi.mock("@/lib/api", () => ({
  sparkLicenses: {
    get: (...args: unknown[]) => get(...args),
    generate: (...args: unknown[]) => generate(...args),
  },
}));

const { default: SparkLicenseKeyPage, describeChanges, limitsOfKey } = await import("@/pages/spark/SparkLicenseKeyPage");

const MODULES = [
  { key: "board_report", label: "Board Report", report_type: "board_report" },
  { key: "quarterly_report", label: "Quarterly Report", report_type: "quarterly" },
  { key: "leadership", label: "Leadership", report_type: null },
];
const today = new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const NEW_CLIENT = {
  company_id: "cmp_1", company_name: "omn prem", deployment: "on_prem", status: "none",
  starts_at: null, expires_at: null, issued_at: null, modules: [], report_limits: {},
  max_seats: null,
  server_id: null, seats_used: null, reports_counted: {}, lock: null, open_upgrade_requests: 0,
  reports_used: null, modules_catalogue: MODULES,
};
const ACTIVE = {
  ...NEW_CLIENT, status: "active", starts_at: addDays(today, -10), expires_at: addDays(today, 200),
  modules: ["board_report"], report_limits: { board_report: 4 },
  max_seats: 15, server_id: "SRV-7K2M-9QXA-4T8P",
};

function openPage() {
  return render(
    <MemoryRouter initialEntries={["/spark/licenses/cmp_1/key"]}>
      <Routes>
        <Route path="/spark/licenses/:companyId/key" element={<SparkLicenseKeyPage />} />
        <Route path="/spark/licenses" element={<div>LICENSES</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  get.mockReset();
  generate.mockReset();
  generate.mockResolvedValue({ license_key: "eyJ.KEY.sig", activated: false, claims: {} });
});

describe("License key page — generate", () => {
  it("needs a proper Client ID and a module, then sends the people and reports", async () => {
    get.mockResolvedValue(NEW_CLIENT);
    openPage();
    const review = await screen.findByRole("button", { name: "Review" });
    expect(screen.getByText("Generate license key")).toBeInTheDocument();
    expect(review).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("SRV-7K2M-9QXA-4T8P"), { target: { value: "192.168.1.1" } });
    expect(screen.getByText("Looks like SRV-XXXX-XXXX-XXXX")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("SRV-7K2M-9QXA-4T8P"), { target: { value: "srv-aaaa-bbbb-cccc" } });
    fireEvent.click(screen.getByRole("button", { name: /Reports/ }));      // nothing on yet: the group starts closed
    fireEvent.click(screen.getByRole("switch", { name: "Board Report" }));
    fireEvent.click(screen.getByRole("button", { name: "More Board Report reports" }));
    fireEvent.click(screen.getByRole("button", { name: "More Users" }));                // 4 → 5 besides the admin = 6
    expect(screen.queryByText(/Department/)).not.toBeInTheDocument();
    expect(review).toBeEnabled();

    fireEvent.click(review);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("6 users (admin included)");
    expect(dialog).toHaveTextContent("Board Report · 2 reports");
    fireEvent.click(within(dialog).getByRole("button", { name: "Generate key" }));

    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    expect(generate.mock.calls[0][1]).toEqual({
      modules: ["board_report"], report_limits: { board_report: 2 },
      max_users: 6,
      starts_at: today, expires_at: addDays(today, 364), server_id: "SRV-AAAA-BBBB-CCCC",
    });
    expect(await screen.findByText("eyJ.KEY.sig")).toBeInTheDocument();   // shown once, to copy
    fireEvent.click(screen.getByRole("button", { name: "Done — back to Licenses" }));
    expect(await screen.findByText("LICENSES")).toBeInTheDocument();
  });

  it("shows the server's reason when the key is refused", async () => {
    get.mockResolvedValue({ ...NEW_CLIENT, server_id: "SRV-7K2M-9QXA-4T8P" });
    generate.mockRejectedValue(new Error("Board Report needs at least 1 report"));
    openPage();
    fireEvent.click(await screen.findByRole("button", { name: /Reports/ }));
    fireEvent.click(screen.getByRole("switch", { name: "Board Report" }));
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Generate key" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("needs at least 1 report");
  });
});

describe("License key page — upgrade", () => {
  it("can't remove a module or go below the current users", async () => {
    get.mockResolvedValue(ACTIVE);
    openPage();
    expect(await screen.findByText("Upgrade license")).toBeInTheDocument();

    const board = screen.getByRole("switch", { name: "Board Report" });
    fireEvent.click(board);
    expect(board).toHaveAttribute("aria-checked", "true");        // locked on
    expect(screen.getByRole("button", { name: "Fewer Board Report reports" })).toBeDisabled();   // at 4 now
    expect(screen.getByLabelText("Users")).toHaveValue("14");                                    // 15 people = admin + 14
    expect(screen.getByRole("button", { name: "Fewer Users" })).toBeDisabled();                  // at the current 15
    expect(screen.getByPlaceholderText("SRV-7K2M-9QXA-4T8P")).toHaveAttribute("readonly");
  });

  it("users can go up on an upgrade", async () => {
    get.mockResolvedValue(ACTIVE);
    openPage();
    const review = await screen.findByRole("button", { name: "Review upgrade" });
    fireEvent.click(screen.getByRole("button", { name: "More Users" }));                       // 15 → 16 people
    expect(screen.getByLabelText("Users")).toHaveValue("15");
    expect(review).toBeEnabled();
  });

  it("the review lists only what goes up", () => {
    const current = limitsOfKey(ACTIVE as never);
    const form = { ...current, max_users: 20, modules: ["board_report", "leadership"],
      report_limits: { board_report: 10 } };
    expect(describeChanges("upgrade", form, current, ACTIVE.starts_at, ACTIVE.expires_at, ACTIVE.expires_at, MODULES as never))
      .toEqual(["Users 15 → 20", "Board Report 4 → 10 reports", "Leadership added"]);
  });
});

describe("License key page — renew", () => {
  it("starts today and keeps the Client ID", async () => {
    get.mockResolvedValue({ ...ACTIVE, status: "expired", starts_at: addDays(today, -400), expires_at: addDays(today, -35) });
    openPage();
    expect(await screen.findByText("Renew license")).toBeInTheDocument();
    expect(screen.getByText(/^Today,/)).toBeInTheDocument();
    // A renewal may lower anything.
    expect(screen.getByRole("button", { name: "Fewer Users" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Review renewal" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Report counts start again from 0");
    fireEvent.click(within(dialog).getByRole("button", { name: "Renew" }));
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    expect(generate.mock.calls[0][1]).toMatchObject({ starts_at: today, server_id: "SRV-7K2M-9QXA-4T8P" });
  });
});
