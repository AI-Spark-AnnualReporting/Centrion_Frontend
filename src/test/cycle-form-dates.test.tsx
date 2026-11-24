// The Create Reporting Cycle form no longer asks for Cycle Start/End dates. They
// are still required by the database, so the form fills them with the company's
// fiscal period for the picked year (from the onboarding fiscal year-end month).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { user_id: "usr_admin", full_name: "Acme Admin", role: "admin" } }),
}));

const create = vi.fn();
const getMyCompany = vi.fn();

vi.mock("@/lib/api", () => ({
  adminConsole: {
    listUsers: vi.fn().mockResolvedValue({
      users: [{ user_id: "usr_pm1", full_name: "testpm", role: "project_manager" }],
    }),
  },
  sarCycles: { create: (...a: unknown[]) => create(...a) },
  companies: { getMyCompany: () => getMyCompany() },
  license: { usage: vi.fn().mockRejectedValue(new Error("offline")), requestUpgrade: vi.fn() },
}));

const { default: CycleForm } = await import("@/pages/annual-report/CycleForm");

const LAST_YEAR = new Date().getFullYear() - 1;

const openCard = () => fireEvent.click(screen.getByText("Create Reporting Cycle"));

/** A deadline safely in the future, as YYYY-MM-DD. */
function futureDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toLocaleDateString("en-CA");
}

/** Fill every required field: name, last year via the shortcut, PM, deadline. */
async function fillForm() {
  fireEvent.change(screen.getByPlaceholderText("e.g. FY2025 Annual Report"), {
    target: { value: "FY Annual Report" },
  });
  fireEvent.click(screen.getByRole("button", { name: /fiscal year/i }));
  fireEvent.click(screen.getByRole("button", { name: `Last year (${LAST_YEAR})` }));
  await waitFor(() => expect(screen.getByRole("option", { name: "testpm" })).toBeInTheDocument());
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "usr_pm1" } });
  const deadline = document.querySelector('input[type="date"]') as HTMLInputElement;
  fireEvent.change(deadline, { target: { value: futureDate() } });
}

describe("Create cycle without start/end dates", () => {
  beforeEach(() => {
    create.mockReset().mockResolvedValue({ id: "cyc_new" });
    getMyCompany.mockReset().mockResolvedValue({ fiscal_year_end_month: 6 });
  });

  it("asks only for the submission deadline — no Start or End date inputs", () => {
    render(<CycleForm onCreated={vi.fn()} />);
    openCard();
    expect(screen.queryByText(/Cycle Start Date/i)).toBeNull();
    expect(screen.queryByText(/Cycle End Date/i)).toBeNull();
    expect(screen.getByText(/Submission Deadline/i)).toBeInTheDocument();
    expect(document.querySelectorAll('input[type="date"]')).toHaveLength(1);
  });

  it("shows what the picked year covers for this company's fiscal calendar", async () => {
    render(<CycleForm onCreated={vi.fn()} />);
    openCard();
    await waitFor(() => expect(getMyCompany).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /fiscal year/i }));
    fireEvent.click(screen.getByRole("button", { name: `Last year (${LAST_YEAR})` }));
    // June year-end: FY N = 1 Jul (N-1) – 30 Jun N.
    expect(await screen.findByText(`Covers 1 Jul ${LAST_YEAR - 1} – 30 Jun ${LAST_YEAR}`)).toBeInTheDocument();
  });

  it("sends the fiscal period as start_date / end_date", async () => {
    const onCreated = vi.fn();
    render(<CycleForm onCreated={onCreated} />);
    openCard();
    await waitFor(() => expect(getMyCompany).toHaveBeenCalled());
    await fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Create Cycle" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][0]).toMatchObject({
      fiscal_year: LAST_YEAR,
      start_date: `${LAST_YEAR - 1}-07-01`,
      end_date: `${LAST_YEAR}-06-30`,
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it("still creates the cycle (December period) when the company can't be loaded", async () => {
    getMyCompany.mockReset().mockRejectedValue(new Error("network"));
    render(<CycleForm onCreated={vi.fn()} />);
    openCard();
    await waitFor(() => expect(getMyCompany).toHaveBeenCalled());
    await fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Create Cycle" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][0]).toMatchObject({
      start_date: `${LAST_YEAR}-01-01`,
      end_date: `${LAST_YEAR}-12-31`,
    });
  });

  it("loads the company only once, however often the card is toggled", async () => {
    render(<CycleForm onCreated={vi.fn()} />);
    openCard();
    openCard();
    openCard();
    await waitFor(() => expect(getMyCompany).toHaveBeenCalledTimes(1));
  });
});
