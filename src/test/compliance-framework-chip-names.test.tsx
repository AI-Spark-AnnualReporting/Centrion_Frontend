// The regulator chips on the Compliance setup page showed the internal code next
// to the name — "GHG_PROTOCOL · GHG Protocol", "TADAWUL · Tadawul ESG", even
// "GRI · GRI" (QA audit CV-03). They now show the display name only.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/api", () => ({
  companies: { getMyCompany: () => Promise.resolve({ reporting_sector: null }) },
  complianceValidation: {
    listCandidates: () => Promise.resolve([]),
    listRuns: () => Promise.resolve([]),
    listCertified: () => Promise.resolve([]),
    preview: () =>
      Promise.resolve({
        frameworks: [
          { regulator: "GHG_PROTOCOL", checks: 4 },
          { regulator: "TADAWUL", checks: 6 },
          { regulator: "GRI", checks: 9 },
          { regulator: "NEW_REGULATOR", checks: 1 },
        ],
        framework_count: 4,
        check_count: 20,
      }),
  },
  ApiError: class ApiError extends Error {},
}));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { company_id: "c1", permissions: { compliance_validation: { read: true, create: true } } },
  }),
}));
vi.mock("@/context/ComplianceRunsContext", () => ({
  useComplianceRuns: () => ({ report: vi.fn() }),
}));

const { default: ComplianceSetupPage } = await import("@/pages/compliance/ComplianceSetupPage");

describe("Compliance regulator chips", () => {
  it("show the display name only, never the internal code", async () => {
    render(
      <MemoryRouter>
        <ComplianceSetupPage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("button", { name: "GHG Protocol" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tadawul ESG" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "GRI" })).toBeInTheDocument();
    expect(screen.queryByText(/GHG_PROTOCOL/)).toBeNull();
    expect(screen.queryByText(/TADAWUL ·/)).toBeNull();
    expect(screen.queryByText("GRI · GRI")).toBeNull();
  });

  it("falls back to the code for a regulator the app has no name for yet", async () => {
    render(
      <MemoryRouter>
        <ComplianceSetupPage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("button", { name: "NEW_REGULATOR" })).toBeInTheDocument();
  });
});
