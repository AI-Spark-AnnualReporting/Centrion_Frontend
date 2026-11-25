// The small "AI" chip on onboarding's Review step labels.
//
// It must only sit on a field the AI actually filled (website scrape at signup,
// or the profile document uploaded on step 1) and that still has a value. An
// empty field marked "AI" made users ask why the AI didn't pick it up.
// Plan: Centrion_Frontend/.claude/plans/onboarding-description-box.md

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const getMyCompany = vi.fn();
const getSectors = vi.fn();
const extractCompanyProfile = vi.fn();

vi.mock("@/lib/api", () => ({
  companies: { getMyCompany: () => getMyCompany() },
  extractCompanyProfile: (f: File | null, u?: string) => extractCompanyProfile(f, u),
  getSectors: () => getSectors(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message?: string) {
      super(message ?? `ApiError ${status}`);
      this.status = status;
    }
  },
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { company_id: "co-1" }, refresh: vi.fn() }),
}));

// What a website scrape typically leaves: a description and headcount, but no
// founding year, city or exchange. Currency/language are the DB defaults.
const SCRAPED_COMPANY = {
  id: "co-1",
  name: "Acme",
  description: "Acme runs gyms and fitness studios across Saudi Arabia.",
  sector_id: "sec_tech",
  employee_count: 500,
  founded_year: null,
  headquarter_city: null,
  listed_exchange: null,
  reporting_currency: "SAR",
  primary_language: "en",
  created_by: null,
  profile_extraction_status: "done",
};

beforeEach(() => {
  getMyCompany.mockReset().mockResolvedValue({ ...SCRAPED_COMPANY });
  getSectors.mockReset().mockResolvedValue([{ id: "sec_tech", code: "technology", name: "Technology" }]);
  extractCompanyProfile.mockReset();
});

afterEach(() => vi.restoreAllMocks());

async function renderWizard() {
  const OnboardingPage = (await import("@/pages/OnboardingPage")).default;
  render(
    <MemoryRouter>
      <OnboardingPage />
    </MemoryRouter>,
  );
}

/** The <label> whose text starts with this field name. */
function labelFor(name: string): HTMLLabelElement {
  const label = Array.from(document.querySelectorAll("label")).find((l) =>
    (l.textContent ?? "").startsWith(name),
  );
  if (!label) throw new Error(`No label for ${name}`);
  return label;
}

const hasAiChip = (name: string) => labelFor(name).querySelector(".ai-chip") !== null;

describe("AI chip after the signup website scrape", () => {
  it("shows only on fields the scrape filled", async () => {
    await renderWizard();
    await screen.findByText(/Review Company Details/i);
    expect(hasAiChip("Company description")).toBe(true);
    expect(hasAiChip("Sector")).toBe(true);
    expect(hasAiChip("Employees")).toBe(true);
    // Empty — the scrape found nothing.
    expect(hasAiChip("Founded year")).toBe(false);
    expect(hasAiChip("HQ city")).toBe(false);
    expect(hasAiChip("Exchange")).toBe(false);
    // Never AI-filled from the row; a person must choose these.
    expect(hasAiChip("Fiscal year")).toBe(false);
    expect(hasAiChip("Company profile")).toBe(false);
    expect(hasAiChip("Reporting sector")).toBe(false);
  });

  it("does not claim the default currency and language as AI", async () => {
    await renderWizard();
    await screen.findByText(/Review Company Details/i);
    expect(hasAiChip("Currency")).toBe(false);
    expect(hasAiChip("Language")).toBe(false);
  });

  it("does claim a non-default currency and language", async () => {
    getMyCompany.mockResolvedValue({ ...SCRAPED_COMPANY, reporting_currency: "USD", primary_language: "ar" });
    await renderWizard();
    await screen.findByText(/Review Company Details/i);
    expect(hasAiChip("Currency")).toBe(true);
    expect(hasAiChip("Language")).toBe(true);
  });

  it("does not claim a sector on a Spark-created company (a person may have picked it)", async () => {
    getMyCompany.mockResolvedValue({ ...SCRAPED_COMPANY, created_by: "spark-user-1" });
    await renderWizard();
    await screen.findByText(/Review Company Details/i);
    expect(hasAiChip("Sector")).toBe(false);
  });

  it("hides the chip when the user empties an AI field", async () => {
    await renderWizard();
    await screen.findByText(/Review Company Details/i);
    const employees = screen.getByPlaceholderText("e.g. 120");
    fireEvent.change(employees, { target: { value: "" } });
    expect(hasAiChip("Employees")).toBe(false);
  });

  it("keeps the AI wording and badge while AI fields are shown", async () => {
    await renderWizard();
    await screen.findByText(/Review Company Details/i);
    expect(screen.getByText("AI extracted")).toBeInTheDocument();
    expect(screen.getByText(/AI wrote this from your sources/)).toBeInTheDocument();
  });
});

describe("AI chip when the user fills everything in by hand", () => {
  it("shows no chips, no AI badge and no AI wording", async () => {
    // Nothing scraped — the wizard opens on step 1.
    getMyCompany.mockResolvedValue({
      ...SCRAPED_COMPANY, description: null, sector_id: null, employee_count: null,
    });
    await renderWizard();
    fireEvent.click(await screen.findByRole("button", { name: /fill in manually/i }));
    await screen.findByText(/Review Company Details/i);

    for (const name of ["Company description", "Sector", "Employees", "Founded year", "HQ city",
      "Fiscal year", "Currency", "Language", "Exchange"]) {
      expect(hasAiChip(name)).toBe(false);
    }
    expect(screen.queryByText("AI extracted")).not.toBeInTheDocument();
    expect(screen.queryByText(/AI wrote this from your sources/)).not.toBeInTheDocument();
    expect(screen.getByText(/Describe what the company does/)).toBeInTheDocument();

    // Typing a value by hand does not make it "AI".
    fireEvent.change(screen.getByPlaceholderText("e.g. 120"), { target: { value: "40" } });
    expect(hasAiChip("Employees")).toBe(false);
  });
});

describe("AI chip after uploading a profile document on step 1", () => {
  it("adds the chip to fields the document answered, including fiscal year", async () => {
    extractCompanyProfile.mockResolvedValue({
      description: "Acme is a Saudi fitness group, from the profile document.",
      sector_id: null,
      employee_count: null,
      founded_year: 2019,
      headquarter_city: "Riyadh",
      fiscal_year_end_month: 12,
      reporting_currency: null,
      primary_language: null,
      listed_exchange: null,
      sector_name: null,
      website_url: null,
    });
    await renderWizard();
    await screen.findByText(/Review Company Details/i);
    expect(hasAiChip("Founded year")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /Back/i }));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "profile.docx")] } });
    fireEvent.click(screen.getByRole("button", { name: /Analyse Document/i }));

    await waitFor(() => expect(hasAiChip("Founded year")).toBe(true));
    expect(hasAiChip("HQ city")).toBe(true);
    expect(hasAiChip("Fiscal year")).toBe(true);
    // Still empty — the document didn't answer it either.
    expect(hasAiChip("Exchange")).toBe(false);
  });
});
