// Annual Earnings Report is hidden from the setup screen for now, at the
// client's request. earnings-setup.test.tsx overrides HIDDEN_EARNINGS_VARIANTS
// to keep testing the annual path, so this file — which deliberately does NOT
// override it — is the one that pins what a real user actually sees.
//
// When Annual is unhidden (empty the array in earnings-flags.ts), these two
// expectations flip, which is the signal to update this file.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReportTypeToggle } from "@/components/earnings/ReportTypeToggle";
import { HIDDEN_EARNINGS_VARIANTS } from "@/components/earnings/earnings-flags";

describe("earnings report-type toggle", () => {
  it("hides Annual and still offers Quarterly", () => {
    render(<ReportTypeToggle value={null} onChange={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /Annual Earnings Report/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Quarterly Earnings Report/i })).toBeInTheDocument();
  });

  it("hides it via the flag, not by deleting the option", () => {
    // Guards the intent: this must stay a one-line revert, not a rewrite.
    expect(HIDDEN_EARNINGS_VARIANTS).toEqual(["annual"]);
  });
});
