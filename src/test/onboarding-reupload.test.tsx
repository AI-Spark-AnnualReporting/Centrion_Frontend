// Going Back to step 1 and uploading a better profile document.
//
// A company signs up with a website link, background extraction fills the row,
// and the wizard opens on the Review step already populated. The user then goes
// Back and uploads a proper company profile — those details have to take over the
// Review screen, and (backend side) the company row with them.
//
// The rule is merge, not replace: the new document wins on every field it answers,
// and a field it says nothing about keeps what is already in the box. A
// two-paragraph profile doc must not blank out the employee count the website gave.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const getMyCompany = vi.fn();
const extractCompanyProfile = vi.fn();
const getSectors = vi.fn();

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

// What signup extraction left behind — a full profile from the website.
const SIGNUP_COMPANY = {
  id: "co-1",
  name: "Acme",
  description: "Old description pulled from the website, long enough to pass.",
  sector_id: "sec_tech",
  employee_count: 500,
  founded_year: 1999,
  headquarter_city: "Jeddah",
  reporting_currency: "SAR",
  primary_language: "en",
  listed_exchange: "Tadawul",
  website_url: "https://old.example",
  profile_extraction_status: "done",
};

const SECTORS = [
  { id: "sec_tech", code: "technology", name: "Technology" },
  { id: "sec_fin", code: "financial_services", name: "Financial Services" },
];

beforeEach(() => {
  getMyCompany.mockReset().mockResolvedValue({ ...SIGNUP_COMPANY });
  getSectors.mockReset().mockResolvedValue(SECTORS);
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
  // Signup extraction gave us data, so the wizard opens on Review.
  await screen.findByText(/Review Company Details/i);
}

const description = () =>
  screen.getByPlaceholderText(/Brief description of your company/i) as HTMLTextAreaElement;

const backToStepOne = () => fireEvent.click(screen.getByRole("button", { name: /Back/i }));

async function uploadAndAnalyse() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["x"], "profile.docx", { type: "application/octet-stream" });
  fireEvent.change(input, { target: { files: [file] } });
  fireEvent.click(screen.getByRole("button", { name: /Analyse Document/i }));
}

describe("re-uploading a profile document from step 1", () => {
  it("shows the signup extraction on Review first", async () => {
    await renderWizard();
    expect(description().value).toMatch(/Old description/);
  });

  it("replaces the details with the new document's", async () => {
    extractCompanyProfile.mockResolvedValue({
      description: "Acme is a Saudi investment bank, newly described.",
      sector_id: "sec_fin",
      headquarter_city: "Riyadh",
      employee_count: null,
      founded_year: null,
      fiscal_year_end_month: null,
      reporting_currency: null,
      primary_language: null,
      listed_exchange: null,
      sector_name: null,
      website_url: null,
    });

    await renderWizard();
    backToStepOne();
    await screen.findByText(/Set Up Your Workspace|couldn't read your website/i);
    await uploadAndAnalyse();

    await waitFor(() => expect(description().value).toMatch(/newly described/));
    expect(extractCompanyProfile).toHaveBeenCalledTimes(1);
  });

  it("keeps a field the new document says nothing about", async () => {
    extractCompanyProfile.mockResolvedValue({
      description: "Acme is a Saudi investment bank, newly described.",
      sector_id: null, headquarter_city: null, employee_count: null,
      founded_year: null, fiscal_year_end_month: null, reporting_currency: null,
      primary_language: null, listed_exchange: null, sector_name: null, website_url: null,
    });

    await renderWizard();
    backToStepOne();
    await uploadAndAnalyse();
    await waitFor(() => expect(description().value).toMatch(/newly described/));

    // The website's employee count survives a doc that never mentions it.
    expect((screen.getByDisplayValue("500") as HTMLInputElement)).toBeInTheDocument();
  });

  it("does not let the document's URL replace the one given at signup", async () => {
    // There is no website field on this step, so applying it would swap a value
    // the user can neither see nor correct before submit. The backend leaves
    // website_url out of PERSISTED_PROFILE_FIELDS for the same reason.
    extractCompanyProfile.mockResolvedValue({
      description: "Acme is a Saudi investment bank, newly described.",
      website_url: "https://acme.example",
      sector_id: null, headquarter_city: null, employee_count: null,
      founded_year: null, fiscal_year_end_month: null, reporting_currency: null,
      primary_language: null, listed_exchange: null, sector_name: null,
    });

    await renderWizard();
    backToStepOne();
    await uploadAndAnalyse();
    await waitFor(() => expect(description().value).toMatch(/newly described/));

    expect(screen.queryByDisplayValue("https://acme.example")).toBeNull();
  });
});
