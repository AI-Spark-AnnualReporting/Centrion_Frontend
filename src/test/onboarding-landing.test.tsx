// Where the setup wizard drops you when it finishes.
//
// This had NO test coverage in either direction, and the loader is shared by two
// callers with different needs:
//   - /onboarding: a client admin setting up their OWN company → dashboard;
//     a Spark user setting up someone else's → that client's annual report.
//   - /upload-reports: an in-app re-ingest → dashboard, always.
//
// The shared navigate is also the ONLY exit from Upload Reports' fixed
// full-screen overlay (no cancel control, and doneRef latches), so "lands
// nowhere" is a trap, not a cosmetic bug. Hence the default-prop design and the
// last test in this file.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

const navigate = vi.fn();
const completeOnboarding = vi.fn().mockResolvedValue(undefined);
let role = "admin";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    completeOnboarding,
    user: { role, company_id: "cmp_1", company_name: "Acme" },
  }),
}));

// No files staged → the "nothing to ingest" short-circuit, which is the Skip
// path and reaches the same single exit as every other path.
vi.mock("@/lib/api", () => ({
  companies: {
    ingestOnboarding: vi.fn().mockResolvedValue({}),
    getMyCompany: vi.fn().mockResolvedValue({ report_extraction_status: "done" }),
  },
}));

const { default: SetupInProgressAnimation } = await import(
  "@/pages/onboarding/SetupInProgressAnimation"
);

const PAYLOAD = { description: "x".repeat(30) } as never;

describe("the wizard's landing", () => {
  beforeEach(() => {
    navigate.mockClear();
    completeOnboarding.mockClear();
    role = "admin";
  });

  it("sends a Spark user to the client's annual report", async () => {
    render(<SetupInProgressAnimation payload={PAYLOAD} landingPath="/annual-report" />);
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/annual-report", expect.anything()),
    );
  });

  it("still sends everyone else to their dashboard", async () => {
    // The scoping guard: a client admin's own first run must be unchanged.
    render(<SetupInProgressAnimation payload={PAYLOAD} landingPath="/dashboard" />);
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/dashboard", expect.anything()),
    );
  });

  it("defaults to the dashboard when no destination is given", async () => {
    // UploadReportsPage passes no landingPath and must keep working untouched.
    // The default is what makes "no destination" impossible — see the header.
    render(<SetupInProgressAnimation payload={null} force overlay />);
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/dashboard", expect.anything()),
    );
  });

  it("skips completeOnboarding entirely when there is no payload", async () => {
    // The Upload Reports path: onboarding is already done, so re-submitting it
    // would be wrong. It still has to reach an exit.
    render(<SetupInProgressAnimation payload={null} force overlay />);
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it("always reaches an exit — the overlay has no other way out", async () => {
    render(<SetupInProgressAnimation payload={PAYLOAD} landingPath="/annual-report" />);
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    const [dest] = navigate.mock.calls[0];
    expect(typeof dest).toBe("string");
    expect(dest).not.toBe("");
  });
});
