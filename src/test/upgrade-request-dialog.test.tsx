// The client admin's Request upgrade popup: one table of current limits and
// "You need" boxes (only more), modules added from "+ Module" pills, then
// review, consent, send exactly what was asked.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CompanyLicense } from "@/types/license";

const requestUpgrade = vi.fn();
vi.mock("@/lib/api", () => ({ license: { requestUpgrade: (...args: unknown[]) => requestUpgrade(...args) } }));

const { UpgradeRequestDialog, checkHigher } = await import("@/components/license/UpgradeRequestDialog");

const DATA = {
  company_name: "Aramco", deployment: "cloud", status: "active", message: null,
  starts_at: "2026-11-03", expires_at: "2027-11-03",
  modules: ["annual_report", "leadership"],
  report_limits: { annual: 10 }, reports_used: { annual: 0 },
  max_seats: 23, seats_used: 20, lock_id: null, lock_reason: null, server_id: null, upgrade_requested_at: null,
  modules_catalogue: [
    { key: "quarterly_report", label: "Quarterly Report", report_type: "quarterly" },
    { key: "annual_report", label: "Annual Report", report_type: "annual" },
    { key: "board_report", label: "Board Report", report_type: "board_report" },
    { key: "leadership", label: "Leadership", report_type: null },
    { key: "board_meetings", label: "Board Meetings", report_type: null },
  ],
} as unknown as CompanyLicense;

function open(props: Partial<Parameters<typeof UpgradeRequestDialog>[0]> = {}) {
  const onSent = vi.fn();
  render(<UpgradeRequestDialog data={DATA} companyName="Aramco" onClose={vi.fn()} onSent={onSent} {...props} />);
  return { onSent };
}

describe("checkHigher", () => {
  it("blank keeps, same is no change, lower is refused, higher is fine", () => {
    expect(checkHigher("", 3).state).toBe("keep");
    expect(checkHigher("3", 3).state).toBe("same");
    expect(checkHigher("2", 3)).toEqual({ state: "bad", text: "Must be more than your current 3." });
    expect(checkHigher("4", 3).state).toBe("ok");
  });
});

describe("Request upgrade popup", () => {
  beforeEach(() => {
    requestUpgrade.mockReset().mockResolvedValue({ requested: true, details: "" });
  });

  it("shows each current limit with a 'You need' box, and +N for more", () => {
    open();
    expect(screen.getByText("Current limit")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("New Users"), { target: { value: "30" } });
    expect(screen.getByText("+7")).toBeInTheDocument();
    expect(screen.getByText("1 change")).toBeInTheDocument();
  });

  it("a number that isn't higher turns red and blocks Review", () => {
    open();
    fireEvent.change(screen.getByLabelText("New Annual Report"), { target: { value: "8" } });
    expect(screen.getByText("More than 10")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review" })).toBeDisabled();
  });

  it("modules not in the license are '+ Module' pills; added ones move into the table", () => {
    open();
    expect(screen.queryByRole("button", { name: "+ Annual Report" })).not.toBeInTheDocument();   // already licensed
    fireEvent.click(screen.getByRole("button", { name: "+ Board Report" }));
    expect(screen.getByText("NEW")).toBeInTheDocument();
    expect(screen.getByLabelText("Board Report reports")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Board Report" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Board Report" }));
    expect(screen.getByRole("button", { name: "+ Board Report" })).toBeInTheDocument();
  });

  it("needs the consent tick, then sends exactly what was asked", async () => {
    const { onSent } = open();
    fireEvent.change(screen.getByLabelText("New Users"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("New Annual Report"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Board Report" }));
    fireEvent.change(screen.getByLabelText("Board Report reports"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Review" }));

    expect(screen.getByText("Send this request to Centriyon?")).toBeInTheDocument();
    expect(screen.getByText("• Users: 23 → 30 (+7 more users)")).toBeInTheDocument();
    expect(screen.getByText("• Annual Report: 10 → 12 (+2 more reports)")).toBeInTheDocument();
    const send = screen.getByRole("button", { name: "Send request" });
    expect(send).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(send);

    await waitFor(() => expect(requestUpgrade).toHaveBeenCalledWith({
      consent: true, max_seats: 30,
      report_limits: { annual: 12, board_report: 5 }, modules: ["board_report"],
    }));
    expect(onSent).toHaveBeenCalled();
  });

  it("opened for a renewal, it starts with 'Renew my license' ticked", async () => {
    open({ startWithRenewal: true });
    expect(screen.getByLabelText(/Renew my license/)).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(requestUpgrade).toHaveBeenCalledWith({ consent: true, renewal: true }));
  });
});
