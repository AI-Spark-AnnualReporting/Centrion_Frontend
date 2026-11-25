// The Company description box on onboarding's Review step (feedback F06).
//
// The AI writes a long paragraph here, and after setup nobody but Spark support
// can change it — so the box has to show the whole text, say how long it should
// be, explain itself through the "i" button, and warn (never block) on a very
// long paste. Plan: Centrion_Frontend/.claude/plans/onboarding-description-box.md

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

// A realistic AI description (~900 characters) — the typical length in the DB.
const LONG_AI_DESCRIPTION =
  "Acme Holding is a Saudi investment company founded in 2019 and headquartered in Riyadh. " +
  "It owns and operates a portfolio of fitness and wellness brands across the Kingdom, " +
  "including gyms, studios and recovery centres. The group serves more than 120,000 members " +
  "through 85 locations in 14 cities, and employs around 2,400 people. Its business is split " +
  "into three segments: premium clubs, budget gyms and boutique studios. Acme also runs a " +
  "digital membership platform and a training academy for coaches. The company works with " +
  "the Ministry of Sport on community programmes and supports Vision 2030 goals for an " +
  "active population. It plans to open 20 more locations over the next three years, with a " +
  "focus on women-only clubs and smaller cities. Acme reports under IFRS and publishes an " +
  "annual sustainability section covering energy use, member safety and staff training.";

function companyWith(description: string) {
  return {
    id: "co-1",
    name: "Acme",
    description,
    sector_id: "sec_tech",
    employee_count: 500,
    profile_extraction_status: "done",
  };
}

beforeEach(() => {
  getMyCompany.mockReset().mockResolvedValue(companyWith(LONG_AI_DESCRIPTION));
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

const descriptionBox = () => screen.getByLabelText(/^Company description/i, { selector: "textarea" }) as HTMLTextAreaElement;
const typeDescription = (text: string) => fireEvent.change(descriptionBox(), { target: { value: text } });
const clickContinue = () => fireEvent.click(screen.getByRole("button", { name: /Looks good, Continue/i }));
const infoButton = () => screen.getByRole("button", { name: /About the company description/i });
const infoText = () => screen.queryByText(/Where it.s used/i);

const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");

describe("the description box", () => {
  it("shows an existing long AI description in full, unchanged", async () => {
    await renderReviewStep();
    expect(descriptionBox().value).toBe(LONG_AI_DESCRIPTION);
    expect(descriptionBox().rows).toBe(9);
  });

  it("tells the user how long it should be", async () => {
    await renderReviewStep();
    expect(screen.getByText(/Aim for 4–8 sentences \(about 100–200 words\)/)).toBeInTheDocument();
  });

  it("is linked to its label, so clicking the label focuses the box", async () => {
    await renderReviewStep();
    expect(descriptionBox().id).toBe("company-description");
  });

  it("reads Arabic text right-to-left automatically", async () => {
    await renderReviewStep();
    expect(descriptionBox().getAttribute("dir")).toBe("auto");
  });
});

describe("the word count", () => {
  it("updates as the user types", async () => {
    await renderReviewStep();
    typeDescription("Acme runs gyms in Riyadh");
    expect(screen.getByText("5 words")).toBeInTheDocument();
  });

  it("says 0 words for spaces only, and 1 word (not 1 words)", async () => {
    await renderReviewStep();
    typeDescription("     ");
    expect(screen.getByText("0 words")).toBeInTheDocument();
    typeDescription("Acme");
    expect(screen.getByText("1 word")).toBeInTheDocument();
  });
});

describe("the long-text warning", () => {
  it("does not show at exactly 400 words", async () => {
    await renderReviewStep();
    typeDescription(words(400));
    expect(screen.queryByText(/This is long/i)).not.toBeInTheDocument();
  });

  it("shows above 400 words, but never blocks Continue", async () => {
    await renderReviewStep();
    typeDescription(words(401));
    expect(screen.getByText(/This is long/i)).toBeInTheDocument();
    clickContinue();
    // Other required fields are empty in this fixture, so we stay on Review —
    // but there must be no error on the description itself.
    expect(screen.queryByText(/at least 20 characters/i)).not.toBeInTheDocument();
  });
});

describe("the minimum length", () => {
  it("blocks Continue on spaces only, with a clear message", async () => {
    await renderReviewStep();
    typeDescription("      ");
    clickContinue();
    expect(
      screen.getByText(/Add a description of at least 20 characters: what the company does and where it operates\./),
    ).toBeInTheDocument();
  });

  it("blocks Continue under 20 characters, and the error clears on typing", async () => {
    await renderReviewStep();
    typeDescription("Acme gyms");
    clickContinue();
    expect(screen.getByText(/at least 20 characters/i)).toBeInTheDocument();
    typeDescription("Acme gyms in Riyadh and Jeddah");
    expect(screen.queryByText(/at least 20 characters/i)).not.toBeInTheDocument();
  });
});

describe("the i (info) button", () => {
  it("opens on click and stays open when the mouse leaves", async () => {
    await renderReviewStep();
    expect(infoText()).not.toBeInTheDocument();
    fireEvent.click(infoButton());
    expect(await screen.findByText(/Where it.s used/i)).toBeInTheDocument();
    fireEvent.mouseLeave(infoButton());
    await new Promise((r) => setTimeout(r, 200));
    expect(infoText()).toBeInTheDocument();
  });

  it("a second click closes it", async () => {
    await renderReviewStep();
    fireEvent.click(infoButton());
    await screen.findByText(/Where it.s used/i);
    fireEvent.click(infoButton());
    await waitFor(() => expect(infoText()).not.toBeInTheDocument());
  });

  it("opens on hover and closes when the mouse leaves", async () => {
    await renderReviewStep();
    fireEvent.mouseEnter(infoButton());
    expect(await screen.findByText(/Where it.s used/i)).toBeInTheDocument();
    fireEvent.mouseLeave(infoButton());
    await waitFor(() => expect(infoText()).not.toBeInTheDocument());
  });

  it("opens on keyboard focus and closes on Escape", async () => {
    await renderReviewStep();
    fireEvent.focus(infoButton());
    expect(await screen.findByText(/Where it.s used/i)).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(infoText()).not.toBeInTheDocument());
  });

  it("does NOT open when the label text itself is clicked", async () => {
    await renderReviewStep();
    fireEvent.click(screen.getByText("Company description"));
    await new Promise((r) => setTimeout(r, 50));
    expect(infoText()).not.toBeInTheDocument();
  });
});
