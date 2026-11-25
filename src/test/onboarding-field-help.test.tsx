// The "i" help button beside every field on onboarding's Review step.
//
// Each one says what the field is and what it changes later (feedback F05:
// "Company Profile and Reporting Sector don't say what they change later;
// Fiscal Year doesn't say start or end month").
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

beforeEach(() => {
  getMyCompany.mockReset().mockResolvedValue({
    id: "co-1",
    name: "Acme",
    description: "Acme runs gyms and fitness studios across Saudi Arabia.",
    sector_id: "sec_tech",
    employee_count: 500,
    profile_extraction_status: "done",
  });
  getSectors.mockReset().mockResolvedValue([{ id: "sec_tech", code: "technology", name: "Technology" }]);
});

afterEach(() => vi.restoreAllMocks());

async function renderReviewStep() {
  const OnboardingPage = (await import("@/pages/OnboardingPage")).default;
  render(
    <MemoryRouter>
      <OnboardingPage />
    </MemoryRouter>,
  );
  await screen.findByText(/Review Company Details/i);
}

const helpButton = (title: string) => screen.getByRole("button", { name: `About ${title}` });

// Every field on the step, with the one line its help box must show.
const FIELDS: [string, RegExp][] = [
  ["Sector", /The industry your company operates in\./],
  ["Company profile", /Whether your company is listed or private\./],
  ["Reporting sector", /The regulatory category your company reports under\./],
  ["Employees", /The total number of people your company employs\./],
  ["Founded year", /The year your company was founded\./],
  ["HQ city", /The city where your head office is\./],
  ["Fiscal year end", /The month your financial year ends\./],
  ["Currency", /The currency your financial figures are reported in\./],
  ["Language", /main language\./],
  ["Exchange", /The stock exchange and ticker/],
  ["Shariah-compliant", /Whether your company follows Shariah principles\./],
  ["Has subsidiaries", /Whether your company owns other companies\./],
  ["Has sukuk", /Whether your company has issued sukuk\./],
];

const SHARED_LINE = /Centriyon uses this to set up your workspace and reports/;

describe("every Review-step field has an info button", () => {
  it("the description keeps its own button", async () => {
    await renderReviewStep();
    expect(screen.getByRole("button", { name: /About the company description/i })).toBeInTheDocument();
  });

  it.each(FIELDS)("%s explains itself when clicked", async (title, phrase) => {
    await renderReviewStep();
    fireEvent.click(helpButton(title));
    expect(await screen.findByText(phrase)).toBeInTheDocument();
    expect(screen.getByText(SHARED_LINE)).toBeInTheDocument();
  });

  it("opens when the cursor rests on the icon, and closes when it leaves", async () => {
    await renderReviewStep();
    fireEvent.mouseEnter(helpButton("Reporting sector"));
    expect(await screen.findByText(/regulatory category/)).toBeInTheDocument();
    fireEvent.mouseLeave(helpButton("Reporting sector"));
    await waitFor(() => expect(screen.queryByText(/regulatory category/)).not.toBeInTheDocument());
  });

  it("does NOT open when the cursor just passes over the icon", async () => {
    await renderReviewStep();
    fireEvent.mouseEnter(helpButton("Reporting sector"));
    await new Promise((r) => setTimeout(r, 150));
    fireEvent.mouseLeave(helpButton("Reporting sector"));
    await new Promise((r) => setTimeout(r, 600));
    expect(screen.queryByText(/regulatory category/)).not.toBeInTheDocument();
  });

  it("each help box is short: one line plus the shared sentence", async () => {
    await renderReviewStep();
    fireEvent.click(helpButton("Has sukuk"));
    await screen.findByText(/issued sukuk/);
    const box = document.querySelector(".ob-info-pop") as HTMLElement;
    expect(box.querySelectorAll("p").length).toBe(3); // title + line + shared sentence
  });
});

describe("tick-boxes still behave", () => {
  const checkbox = (name: string) => screen.getByRole("checkbox", { name }) as HTMLInputElement;

  it("clicking the label text still ticks the box", async () => {
    await renderReviewStep();
    fireEvent.click(screen.getByText("Has sukuk"));
    expect(checkbox("Has sukuk").checked).toBe(true);
  });

  it("clicking the info button does NOT tick the box", async () => {
    await renderReviewStep();
    fireEvent.click(helpButton("Has sukuk"));
    expect(checkbox("Has sukuk").checked).toBe(false);
    expect(await screen.findByText(/issued sukuk/)).toBeInTheDocument();
  });
});

describe("fiscal year is clearly the END month", () => {
  it("the label and the empty option both say so", async () => {
    await renderReviewStep();
    expect(screen.getByDisplayValue("Select the month it ends")).toBeInTheDocument();
    const label = Array.from(document.querySelectorAll("label")).find((l) =>
      (l.textContent ?? "").startsWith("Fiscal year end"),
    );
    expect(label).toBeTruthy();
  });
});
