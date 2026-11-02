// spark_admin → Licenses: the key form opens as a popup that only ✕ (or
// Cancel / Esc) closes — a click outside it must not lose a half-filled form.

import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const ROW = {
  company_id: "cmp_1", company_name: "Aramco", deployment: "cloud", status: "none",
  starts_at: null, expires_at: null, issued_at: null, modules: [], report_limits: {},
  max_seats: null, server_id: null, seats_used: 16, reports_counted: {}, lock: null,
  open_upgrade_requests: 0,
};
const MODULES = [{ key: "board_report", label: "Board Report", report_type: "board_report" }];

const list = vi.fn().mockResolvedValue({ licenses: [ROW], modules: MODULES });

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
  fireEvent.click(await screen.findByRole("button", { name: "Generate key" }));
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
