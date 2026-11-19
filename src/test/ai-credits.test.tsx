// AI credits screens: the shared helpers, the plan editor's AI credits card,
// the admin's low-balance banner, the admin page's sentences, Spark's
// minimums table and the usage page's difference.
// Plan: Centriton/.claude/plans/ai-credits.md

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const authState: { user: Record<string, unknown> | null } = { user: null };
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: authState.user, loading: false, actingCompany: null }),
}));

const usage = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, license: { ...actual.license, usage: () => usage() } };
});

const {
  actionName, formatCredits, formatCreditsDetail, formatDollars, formatPaidDate, isNotEnoughCreditsMessage, monthOf,
  packMinimumPrice, packSavingPercent,
} = await import("@/components/ai-credits/creditFormat");
const { AiCreditsBanner, bannerText } = await import("@/components/ai-credits/AiCreditsBanner");
const { CreditsCard } = await import("@/components/subscriptions/PlanFields");
const { balanceText, creditsLeftPercent } = await import("@/pages/admin/UsagePage");
const { packTileLine } = await import("@/pages/admin/BuyCreditsPage");
const { changedMinimums, packRowProblem, priceBoxState, readAmount } = await import("@/pages/spark/SparkAiCreditsPage");
const { billDifference } = await import("@/pages/spark/SparkAiUsagePage");
const { limitsChanged } = await import("@/pages/spark/SparkPlanEditorPage");

beforeEach(() => {
  authState.user = null;
  usage.mockReset();
});

describe("credit helpers", () => {
  it("shows credits as whole numbers with a real minus sign", () => {
    expect(formatCredits(5000)).toBe("5,000");
    expect(formatCredits(-95.4)).toBe("−95");
    expect(formatCredits(2.37)).toBe("2");
    expect(formatCredits(null)).toBe("—");
  });

  it("shows dollars with cents", () => {
    expect(formatDollars(352.1)).toBe("$352.10");
    expect(formatDollars(0.08, 3)).toBe("$0.080");
  });

  it("shows small credit amounts with one decimal, so light use isn't 0", () => {
    expect(formatCreditsDetail(0.2)).toBe("0.2");
    expect(formatCreditsDetail(3.05)).toBe("3.0");
    expect(formatCreditsDetail(-3.05)).toBe("−3.0");
    expect(formatCreditsDetail(1250.4)).toBe("1,250");
  });

  it("works out a pack's lowest price and its saving against the smallest pack", () => {
    // 500 credits at $0.02 of AI each → at least $10.00; $0.05 → $25.00.
    expect(packMinimumPrice(500, 0.02)).toBe(10);
    expect(packMinimumPrice(500, 0.05)).toBe(25);
    const packs = [
      { id: "a", credits: 500, price: 50 },
      { id: "b", credits: 1000, price: 90 },
      { id: "c", credits: 2500, price: 200 },
    ];
    expect(packSavingPercent(packs[0], packs)).toBe(0);
    expect(packSavingPercent(packs[1], packs)).toBe(10);
    expect(packSavingPercent(packs[2], packs)).toBe(20);
    expect(packTileLine(packs[0], packs)).toBe("$50.00 · $0.100 a credit");
    expect(packTileLine(packs[1], packs)).toBe("$90.00 · save 10%");
  });

  it("shows a paid date without 'Invalid Date' (full timestamps)", () => {
    expect(formatPaidDate("2026-11-18T12:11:00.123+00:00")).toBe("18 Nov 2026");
    expect(formatPaidDate(null)).toBe("—");
    expect(formatPaidDate("not a date")).toBe("—");
  });

  it("recognises the backend's not-enough-credits refusals", () => {
    expect(isNotEnoughCreditsMessage("Not enough AI credits (balance -95). Ask your admin to buy more.")).toBe(true);
    expect(isNotEnoughCreditsMessage("Custom template needs at least 60 AI credits to start; you have 45.")).toBe(true);
    expect(isNotEnoughCreditsMessage("Annual Report limit reached (1/1)")).toBe(false);
  });

  it("turns an action key into words", () => {
    expect(actionName("annual.design.custom_template")).toBe("Custom template");
    expect(actionName("annual.chat")).toBe("Department chat message");
    expect(actionName("annual.questions")).toBe("Questions");
  });

  it("names the month as the usage page asks for it", () => {
    expect(monthOf(new Date(2026, 10, 15))).toBe("2026-11");
  });
});

describe("plan editor", () => {
  const plan = {
    id: "p1", name: "Gold", duration: "yearly" as const, price: 1000, contact: null, modules: ["board_report"],
    report_limits: { board_report: 2 }, max_users: 5, ai_credits: 5000,
    company_id: null, status: "published" as const, quote: null, created_at: "", updated_at: "",
  };
  const form = { name: "Gold", duration: "yearly" as const, price: 1000, contact: null, modules: ["board_report"],
    report_limits: { board_report: 2 }, max_users: 5, ai_credits: 5000 };

  it("asks 'Apply to everyone?' when the AI credits change", () => {
    expect(limitsChanged(plan, form)).toBe(false);
    expect(limitsChanged(plan, { ...form, ai_credits: 8000 })).toBe(true);
  });

  it("treats a plan saved before AI credits existed as 0 credits", () => {
    const older = { ...plan, ai_credits: undefined };
    expect(limitsChanged(older, { ...form, ai_credits: 0 })).toBe(false);
  });

  it("keeps only the included credits: packs are Spark's, for every client", () => {
    const onChange = vi.fn();
    render(<CreditsCard value={{ ai_credits: 0 }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Included AI credits"), { target: { value: "5000" } });
    expect(onChange).toHaveBeenLastCalledWith({ ai_credits: 5000 });
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText(/Sell extra packs/)).toBeNull();
    expect(screen.getByText(/set them on Spark → AI credits/)).toBeInTheDocument();
  });
});

describe("admin's AI credits", () => {
  it("words the balance", () => {
    expect(balanceText(405, 1000)).toBe("405 of 1,000 credits left this period.");
    expect(balanceText(0, 1000)).toMatch(/AI is paused/);
    expect(balanceText(-95, 1000)).toBe("95 credits below zero — AI is paused until you buy more.");
    expect(creditsLeftPercent(250, 1000)).toBe(25);
    expect(creditsLeftPercent(-95, 1000)).toBe(0);
  });

  it("only says something when credits are low or gone", () => {
    expect(bannerText(null)).toBeNull();
    expect(bannerText({ balance: 900, total: 1000, low: false })).toBeNull();
    expect(bannerText({ balance: 180, total: 1000, low: true })).toBe("Your AI credits are running low: 180 left.");
    expect(bannerText({ balance: -95, total: 1000, low: true })).toBe("AI is paused: your credits are 95 below zero.");
  });

  it("shows the banner with Buy more to the company admin", async () => {
    authState.user = { role: "admin" };
    usage.mockResolvedValue({ unlimited: false, ai_credits: { balance: 180, total: 1000, low: true } });
    render(<MemoryRouter initialEntries={["/dashboard"]}><AiCreditsBanner /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/running low: 180 left/)).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Buy more" })).toHaveAttribute("href", "/admin-console/usage");
  });

  it("never shows the banner to other roles", async () => {
    authState.user = { role: "project_manager" };
    usage.mockResolvedValue({ unlimited: false, ai_credits: { balance: -95, total: 1000, low: true } });
    render(<MemoryRouter><AiCreditsBanner /></MemoryRouter>);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(usage).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("Spark's pages", () => {
  it("checks a credit pack row like the backend does", () => {
    const row = (rowKey: number, creditsText: string, priceText: string) => ({ rowKey, creditsText, priceText });
    const fine = [row(0, "500", "50"), row(1, "1000", "90")];
    expect(packRowProblem(fine[0], fine, 0.02)).toBeNull();
    expect(packRowProblem(row(0, "500", "5"), [row(0, "500", "5")], 0.02))
      .toBe("At least $10.00 for 500 credits (the AI cost). Raise the price.");
    expect(packRowProblem(row(0, "500", "50"), [row(0, "500", "50")], 0.15)).toMatch(/At least \$75\.00/);
    const twins = [row(0, "500", "50"), row(1, "500", "60")];
    expect(packRowProblem(twins[0], twins, 0.02)).toMatch(/Another pack also has 500 credits/);
    expect(packRowProblem(row(0, "2.5", "50"), [], 0.02)).toMatch(/whole number/);
    expect(packRowProblem(row(0, "500", ""), [], 0.02)).toMatch(/at least \$0\.01/);
  });

  it("sends only the minimums that changed", () => {
    const saved = { "annual.design.custom_template": 60, "annual.design.sketch": 20 };
    const edited = { "annual.design.custom_template": 60, "annual.design.sketch": 0, "annual.translate": 100 };
    expect(changedMinimums(saved, edited)).toEqual({ "annual.design.sketch": 0, "annual.translate": 100 });
  });

  it("reads a price box", () => {
    expect(readAmount("2.5")).toBe(2.5);
    expect(readAmount("")).toBeNull();
    expect(readAmount("-1")).toBeNull();
    expect(readAmount("abc")).toBeNull();
  });

  it("only offers Save for a valid, changed model price", () => {
    const priced = {
      model: "gpt-4o", used_by: ["Centriyon" as const], has_price: true,
      input_price_per_million: 2.5, output_price_per_million: 10, updated_at: "2026-11-15",
    };
    expect(priceBoxState(priced, "2.5", "10")).toMatchObject({ valid: true, changed: false });
    expect(priceBoxState(priced, "3", "10")).toMatchObject({ valid: true, changed: true, input: 3 });
    expect(priceBoxState(priced, "-1", "10").valid).toBe(false);
    expect(priceBoxState(priced, "", "10").valid).toBe(false);

    const unpriced = { ...priced, model: "gpt-9", has_price: false,
      input_price_per_million: null, output_price_per_million: null, updated_at: null };
    expect(priceBoxState(unpriced, "", "")).toMatchObject({ valid: false, changed: true });
    expect(priceBoxState(unpriced, "1", "4")).toMatchObject({ valid: true, changed: true });
  });

  it("works out how far our total is from OpenAI's bill", () => {
    expect(billDifference(352.1, { connected: true, cost_usd: 361.75, error: null })).toBe(2.7);
    expect(billDifference(352.1, { connected: false, cost_usd: null, error: null })).toBeNull();
  });
});
