// "Please review" notice + "AI can make mistakes" hints during onboarding.
//
// Everything entered in onboarding is what departments, reports and AI-written
// content are built from, and the AI that pre-fills it can be wrong (feedback
// F01). So: a notice in the left panel on every step, a hover note on every AI
// mark, and a small line beside Continue when the AI filled something.
// Plan: Centrion_Frontend/.claude/plans/onboarding-ai-disclaimers.md

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const getMyCompany = vi.fn();
const getSectors = vi.fn();

vi.mock("@/lib/api", () => ({
  companies: { getMyCompany: () => getMyCompany() },
  extractCompanyProfile: vi.fn(),
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

const NOTHING_SCRAPED = { ...SCRAPED_COMPANY, description: null, sector_id: null, employee_count: null };

beforeEach(() => {
  getMyCompany.mockReset().mockResolvedValue({ ...SCRAPED_COMPANY });
  getSectors.mockReset().mockResolvedValue([{ id: "sec_tech", code: "technology", name: "Technology" }]);
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

const notice = () => screen.queryByText("Please review everything carefully");
const footerNote = () => screen.queryByText(/AI can make mistakes\. Please check the details before you continue\./);

/** The AI chip on the label whose text starts with this field name. */
function aiChipFor(name: string): HTMLElement {
  const label = Array.from(document.querySelectorAll("label")).find((l) =>
    (l.textContent ?? "").startsWith(name),
  );
  const chip = label?.querySelector(".ai-chip") as HTMLElement | null;
  if (!chip) throw new Error(`No AI chip on ${name}`);
  return chip;
}

describe("the 'please review' notice in the left panel", () => {
  it("shows on the Company Intel step", async () => {
    getMyCompany.mockResolvedValue({ ...NOTHING_SCRAPED });
    await renderWizard();
    await screen.findByRole("button", { name: /fill in manually/i });
    expect(notice()).toBeInTheDocument();
    expect(screen.getByText(/Your departments, reports and AI-written content are all built from them\./)).toBeInTheDocument();
  });

  it("shows on the Review step", async () => {
    await renderWizard();
    await screen.findByText(/Review Company Details/i);
    expect(notice()).toBeInTheDocument();
  });
});

describe("the hover note on AI marks", () => {
  it("an AI chip says AI can make mistakes", async () => {
    await renderWizard();
    await screen.findByText(/Review Company Details/i);
    fireEvent.focus(aiChipFor("Employees"));
    const tips = await screen.findAllByText("Filled by AI. AI can make mistakes, so please check this.");
    expect(tips.length).toBeGreaterThan(0);
  });

  it("the 'AI extracted' badge says it too", async () => {
    await renderWizard();
    await screen.findByText(/Review Company Details/i);
    fireEvent.focus(screen.getByText("AI extracted"));
    const tips = await screen.findAllByText(/Some fields were filled by AI\. AI can make mistakes/);
    expect(tips.length).toBeGreaterThan(0);
  });

  it("no tooltip shows until the user points at a chip", async () => {
    await renderWizard();
    await screen.findByText(/Review Company Details/i);
    expect(screen.queryByText(/Filled by AI\./)).not.toBeInTheDocument();
  });
});

describe("the small line beside Continue", () => {
  it("shows when the AI filled something", async () => {
    await renderWizard();
    await screen.findByText(/Review Company Details/i);
    expect(footerNote()).toBeInTheDocument();
  });

  it("is hidden when the user fills everything in by hand", async () => {
    getMyCompany.mockResolvedValue({ ...NOTHING_SCRAPED });
    await renderWizard();
    fireEvent.click(await screen.findByRole("button", { name: /fill in manually/i }));
    await screen.findByText(/Review Company Details/i);
    expect(footerNote()).not.toBeInTheDocument();
  });

  it("hides once the user empties every AI-filled field", async () => {
    await renderWizard();
    await screen.findByText(/Review Company Details/i);
    const description = screen.getByLabelText(/^Company description/i, { selector: "textarea" });
    fireEvent.change(description, { target: { value: "" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. 120"), { target: { value: "" } });
    const sector = Array.from(document.querySelectorAll("select")).find(
      (s) => s.options[0]?.text === "Select a sector",
    ) as HTMLSelectElement;
    fireEvent.change(sector, { target: { value: "" } });
    expect(footerNote()).not.toBeInTheDocument();
    expect(screen.queryByText("AI extracted")).not.toBeInTheDocument();
  });
});
