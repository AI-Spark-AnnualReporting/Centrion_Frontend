// Rules are effective from 2024-01-01, so an older report matches zero of them.
// It's still selectable — people legitimately have 2022 reports — but the only
// honest answer is an acknowledgement, not a run that would 400. Worth a test
// because the failure is silent both ways: a suppressed run button on a valid
// report, or a POST fired for a period nothing applies to.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const createRun = vi.fn();

vi.mock("@/lib/api", () => ({
  companies: { getMyCompany: () => Promise.resolve({ reporting_sector: null }) },
  complianceValidation: {
    listCandidates: () =>
      Promise.resolve([
        {
          subject_type: "cycle",
          subject_id: "old",
          title: "Annual Report 2022",
          period: "FY-2022",
          status: "approved",
          report_type: "annual",
        },
        {
          subject_type: "cycle",
          subject_id: "new",
          title: "Annual Report 2025",
          period: "FY-2025",
          status: "approved",
          report_type: "annual",
        },
      ]),
    listRuns: () => Promise.resolve([]),
    listCertified: () => Promise.resolve([]),
    preview: () =>
      Promise.resolve({
        frameworks: [{ regulator: "CMA", checks: 5 }],
        framework_count: 1,
        check_count: 5,
      }),
    createRun: (p: unknown) => {
      createRun(p);
      return new Promise(() => {});
    },
  },
  ApiError: class ApiError extends Error {},
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      company_id: "c1",
      permissions: { compliance_validation: { read: true, create: true } },
    },
  }),
}));

vi.mock("@/context/ComplianceRunsContext", () => ({
  useComplianceRuns: () => ({ report: vi.fn() }),
}));

const { default: ComplianceSetupPage } = await import(
  "@/pages/compliance/ComplianceSetupPage"
);

const runButton = () =>
  screen.queryByRole("button", { name: /Run validation/ }) as HTMLButtonElement | null;
const radio = (name: RegExp) =>
  screen.getByRole("radio", { name }) as HTMLInputElement;

async function renderPage() {
  render(
    <MemoryRouter>
      <ComplianceSetupPage />
    </MemoryRouter>,
  );
  // Candidates and the framework preview both have to land before Card 3 means
  // anything — the run button is gated on an enabled framework too.
  await waitFor(() => expect(screen.getByText("Annual Report 2022")).toBeTruthy());
  await waitFor(() => expect(runButton()).toBeTruthy());
}

beforeEach(() => vi.clearAllMocks());

describe("pre-2024 reports get consent, not validation", () => {
  it("pops the acknowledgement, holds the run button shut, and sends nothing", async () => {
    await renderPage();

    fireEvent.click(radio(/Annual Report 2022/));

    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(runButton()!.disabled).toBe(true);
    expect(createRun).not.toHaveBeenCalled();

    // "I understand" is the whole flow: it clears the pick and hands the user
    // back to Card 1 rather than starting anything.
    fireEvent.click(screen.getByRole("button", { name: "I understand" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(radio(/Annual Report 2022/).checked).toBe(false);
    expect(createRun).not.toHaveBeenCalled();
  });

  // The period is what decides which rules were in force, so it's the trigger —
  // waiting for a file would be asking for an upload we already know is
  // unvalidatable. Picking it also drops any already-uploaded row, which would
  // otherwise ignore the period entirely and silently win.
  it("pops on an old reporting period alone, with no file chosen", async () => {
    await renderPage();

    fireEvent.click(radio(/Annual Report 2025/));
    fireEvent.click(screen.getByRole("button", { name: "Upload a report" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "2018" } });

    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(createRun).not.toHaveBeenCalled();
  });

  // A picked subject carries its own period, so the pickers follow it — leaving
  // them on a default that contradicts the row above is how you end up
  // validating one period while the screen shows another.
  it("mirrors the picked subject's period into the pickers", async () => {
    await renderPage();

    fireEvent.click(radio(/Annual Report 2025/));
    fireEvent.click(screen.getByRole("button", { name: "Upload a report" }));

    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("2025");
  });

  it("still runs a 2024-or-later report", async () => {
    await renderPage();

    fireEvent.click(radio(/Annual Report 2025/));
    await waitFor(() => expect(runButton()!.disabled).toBe(false));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(runButton()!);
    await waitFor(() => expect(createRun).toHaveBeenCalledTimes(1));
    expect(createRun.mock.calls[0][0]).toMatchObject({ subject_id: "new" });
  });
});
