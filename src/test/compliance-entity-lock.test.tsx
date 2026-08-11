// The regulators an approved report is validated against aren't a choice —
// they follow from the company's reporting sector. What's worth a test is the
// scope of that lock, because both ways of getting it wrong are silent: locking
// the upload tab (where the file may be some other entity's report) and locking
// a company that has no sector recorded (which would validate everyone as a
// corporate).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const getMyCompany = vi.fn<() => Promise<{ reporting_sector: string | null }>>();
const preview = vi.fn<(q: { entity_type: string }) => Promise<unknown>>();

vi.mock("@/lib/api", () => ({
  companies: { getMyCompany: () => getMyCompany() },
  complianceValidation: {
    // Both galleries and the candidate list are beside the point here.
    listCandidates: () => Promise.resolve([]),
    listRuns: () => Promise.resolve([]),
    listCertified: () => Promise.resolve([]),
    preview: (q: { entity_type: string }) => preview(q),
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

// Every entity type sees CMA; only a bank sees SAMA. That asymmetry is what
// makes "which chips rendered" a readable proxy for "which entity type is live".
const FRAMEWORKS: Record<string, { regulator: string; checks: number }[]> = {
  corporate: [{ regulator: "CMA", checks: 5 }],
  bank: [
    { regulator: "CMA", checks: 5 },
    { regulator: "SAMA", checks: 3 },
  ],
  insurer: [
    { regulator: "CMA", checks: 5 },
    { regulator: "IA", checks: 2 },
  ],
};

function renderPage() {
  render(
    <MemoryRouter>
      <ComplianceSetupPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  preview.mockImplementation((q) =>
    Promise.resolve({
      frameworks: FRAMEWORKS[q.entity_type] ?? [],
      framework_count: 0,
      check_count: 0,
    }),
  );
});

describe("regulators locked by company profile", () => {
  it("locks the entity type to the company's reporting sector", async () => {
    getMyCompany.mockResolvedValue({ reporting_sector: "insurance" });
    renderPage();

    // insurance → Insurer, and only the chosen pill survives.
    await waitFor(() => expect(screen.getByText("Insurer")).toBeTruthy());
    expect(screen.queryByText("Corporate")).toBeNull();
    expect(screen.queryByText("Bank")).toBeNull();

    // The frameworks that follow from it are shown but inert.
    const chip = await screen.findByRole("button", { name: /IA/ });
    expect((chip as HTMLButtonElement).disabled).toBe(true);
  });

  it("leaves the pickers editable on the upload tab", async () => {
    getMyCompany.mockResolvedValue({ reporting_sector: "bank" });
    renderPage();
    await waitFor(() => expect(screen.getByText("Bank")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Upload a report" }));

    // All three pills return, and the chips can be toggled again.
    expect(screen.getByText("Corporate")).toBeTruthy();
    expect(screen.getByText("Insurer")).toBeTruthy();
    const chip = await screen.findByRole("button", { name: /SAMA/ });
    expect((chip as HTMLButtonElement).disabled).toBe(false);
  });

  it("falls back to manual pickers when no sector is recorded", async () => {
    getMyCompany.mockResolvedValue({ reporting_sector: null });
    renderPage();

    await waitFor(() => expect(screen.getByText("Corporate")).toBeTruthy());
    expect(screen.getByText("Bank")).toBeTruthy();
    expect(screen.getByText("Insurer")).toBeTruthy();
  });
});
