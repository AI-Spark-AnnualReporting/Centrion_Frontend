// Admin Console → Usage and Buy credits, and Spark's Credit packs card.
// Plan: Centriton/.claude/plans/admin-usage-page.md

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { AiCreditsSummary, CreditSettings, InvoicePage } from "@/types/ai-credits";

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ refreshPermissions: vi.fn(), user: { role: "admin" } }),
}));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
// The plan card has its own tests (licensing.test.tsx); here it's a stand-in.
vi.mock("@/components/license/LicenseCard", () => ({ LicenseCard: () => <div>Plan card</div> }));

const summary = vi.fn();
const invoices = vi.fn();
const startPackCheckout = vi.fn();
const payPack = vi.fn();
const modelPrices = vi.fn();
const saveCreditPacks = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    aiCredits: {
      summary: () => summary(),
      invoices: (page: number, limit: number) => invoices(page, limit),
      startPackCheckout: (key: string, packId: string) => startPackCheckout(key, packId),
      payPack: (id: string, key: string) => payPack(id, key),
    },
    sparkAiCredits: {
      ...actual.sparkAiCredits,
      modelPrices: () => modelPrices(),
      actions: () => Promise.resolve({ items: [], groups: [], days: 30 }),
      saveCreditPacks: (packs: unknown) => saveCreditPacks(packs),
    },
  };
});

const { default: UsagePage } = await import("@/pages/admin/UsagePage");
const { default: BillingPage } = await import("@/pages/admin/BillingPage");
const { default: BuyCreditsPage } = await import("@/pages/admin/BuyCreditsPage");
const { default: SparkAiCreditsPage } = await import("@/pages/spark/SparkAiCreditsPage");

const PACKS = [
  { id: "pk_small", credits: 500, price: 50 },
  { id: "pk_mid", credits: 1000, price: 90 },
  { id: "pk_big", credits: 2500, price: 200 },
];

function creditsSummary(overrides: Partial<NonNullable<AiCreditsSummary["subscription"]>> = {}): AiCreditsSummary {
  return {
    subscription: {
      subscription_id: "sub1",
      period: { starts_at: "2026-11-16", ends_at: "2027-11-15" },
      balance: { included: 1, packs: 500, carried: 0, used: 4.05, total: 501, balance: 496.95, low: false },
      credit_packs: PACKS,
      packs: [],
      by_action: [{ action: "annual.brief", jobs: 1, credits: 0.2, cost_usd: 0.004 }],
      ...overrides,
    },
  };
}

function invoicePage(total: number, page = 1, limit = 10): InvoicePage {
  return {
    items: [{ id: "p1", kind: "ai_credits", description: "500 AI credits", total: 50, status: "paid",
      paid_at: "2026-11-18T12:11:00.123+00:00" }],
    page, limit, total,
  };
}

beforeEach(() => {
  for (const mock of [summary, invoices, startPackCheckout, payPack, modelPrices, saveCreditPacks, toast]) mock.mockReset();
});

describe("Usage page", () => {
  it("shows the Settings tabs, the plan and AI credits, but not payment or invoices", async () => {
    summary.mockResolvedValue(creditsSummary());
    invoices.mockResolvedValue(invoicePage(1));
    render(<MemoryRouter initialEntries={["/admin-console/usage"]}><UsagePage /></MemoryRouter>);
    expect(screen.getByRole("tab", { name: "Usage" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Plan card")).toBeInTheDocument();
    expect(await screen.findByText("Generate brief")).toBeInTheDocument();
    expect(screen.getByText("0.2")).toBeInTheDocument();                    // small use isn't shown as 0
    expect(screen.getByRole("link", { name: "Buy credits" })).toHaveAttribute("href", "/admin-console/usage/buy-credits");
    expect(screen.queryByText("Invoices")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add payment method" })).toBeNull();
    expect(invoices).not.toHaveBeenCalled();
  });
});

describe("Billing page", () => {
  it("shows greyed-out payment and invoices with real dates", async () => {
    invoices.mockResolvedValue(invoicePage(1));
    render(<MemoryRouter initialEntries={["/admin-console/billing"]}><BillingPage /></MemoryRouter>);
    expect(screen.getByRole("tab", { name: "Billing" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Add payment method" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Update" })).toBeDisabled();
    expect(screen.getByText(/Card payments are coming soon/)).toBeInTheDocument();
    expect(await screen.findByText("18 Nov 2026")).toBeInTheDocument();     // not "Invalid Date"
    expect(screen.getByText("500 AI credits")).toBeInTheDocument();
  });

  it("shows invoices 10 to a page with the app's pager", async () => {
    invoices.mockImplementation((page: number, limit: number) => Promise.resolve(invoicePage(19, page, limit)));
    render(<MemoryRouter><BillingPage /></MemoryRouter>);
    expect(await screen.findByText("1–10")).toBeInTheDocument();     // "Showing 1–10 of 19"
    expect(invoices).toHaveBeenLastCalledWith(1, 10);
    expect(screen.getByRole("button", { name: "2" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next ›" }));
    await waitFor(() => expect(invoices).toHaveBeenLastCalledWith(2, 10));
    expect(await screen.findByText("11–19")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "25" } });
    await waitFor(() => expect(invoices).toHaveBeenLastCalledWith(1, 25));    // a new size starts at page 1
  });

  it("shows the pager even when everything fits on one page", async () => {
    invoices.mockResolvedValue(invoicePage(3));
    render(<MemoryRouter><BillingPage /></MemoryRouter>);
    expect(await screen.findByText("1–3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next ›" })).toBeDisabled();
  });
});

describe("Usage page, nothing on sale", () => {
  it("says when nothing is on sale", async () => {
    summary.mockResolvedValue(creditsSummary({ credit_packs: [] }));
    invoices.mockResolvedValue(invoicePage(0));
    render(<MemoryRouter><UsagePage /></MemoryRouter>);
    expect(await screen.findByText(/Extra credits aren't on sale yet/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Buy credits" })).toBeNull();
  });
});

describe("Buy credits", () => {
  function showBuy() {
    render(
      <MemoryRouter initialEntries={["/admin-console/usage/buy-credits"]}>
        <Routes>
          <Route path="/admin-console/usage/buy-credits" element={<BuyCreditsPage />} />
          <Route path="/admin-console/usage" element={<div>Usage page</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("shows Spark's packs, works out the total and pays by pack id", async () => {
    summary.mockResolvedValue(creditsSummary());
    startPackCheckout.mockResolvedValue({ id: "chk1", credits: 1000, price: 90, status: "pending_payment" });
    payPack.mockResolvedValue({ id: "chk1", credits: 1000, price: 90, status: "paid" });
    showBuy();
    const middle = await screen.findByRole("radio", { name: /1,000 credits/ });
    expect(screen.getByText("$90.00 · save 10%")).toBeInTheDocument();
    fireEvent.click(middle);
    expect(middle).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("1,497 credits")).toBeInTheDocument();          // 496.95 + 1,000
    fireEvent.click(screen.getByRole("button", { name: "Pay $90.00 now" }));
    await waitFor(() => expect(screen.getByText("Usage page")).toBeInTheDocument());
    expect(startPackCheckout).toHaveBeenCalledWith(expect.any(String), "pk_mid");
    expect(toast).toHaveBeenCalledWith({ title: "Added 1,000 AI credits" });
  });

  it("shows the backend's message when a pack was removed meanwhile", async () => {
    summary.mockResolvedValue(creditsSummary());
    startPackCheckout.mockRejectedValue(new Error("This pack is no longer on sale. Refresh and pick again."));
    showBuy();
    fireEvent.click(await screen.findByRole("button", { name: "Pay $50.00 now" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("no longer on sale");
  });
});

describe("Spark credit packs", () => {
  function settings(packs = PACKS): CreditSettings {
    return { credit_value_usd: 0.02, low_balance_percent: 20, action_minimums: {}, credit_packs: packs };
  }

  it("blocks Save while a pack is below its AI cost, then saves the list", async () => {
    modelPrices.mockResolvedValue({ items: [], annual_reporting_reachable: true, settings: settings([PACKS[0]]) });
    saveCreditPacks.mockResolvedValue({ packs: PACKS });
    render(<MemoryRouter><SparkAiCreditsPage /></MemoryRouter>);
    const price = await screen.findByLabelText("Price of pack 1");
    const save = screen.getByRole("button", { name: "Save packs" });
    expect(save).toBeDisabled();                                           // nothing changed yet
    fireEvent.change(price, { target: { value: "5" } });
    expect(screen.getByText("At least $10.00 for 500 credits (the AI cost). Raise the price.")).toBeInTheDocument();
    expect(save).toBeDisabled();
    fireEvent.change(price, { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Add pack" }));
    fireEvent.change(screen.getByLabelText("Credits in pack 2"), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText("Price of pack 2"), { target: { value: "90" } });
    fireEvent.click(save);
    await waitFor(() => expect(saveCreditPacks).toHaveBeenCalledWith([
      { id: "pk_small", credits: 500, price: 60 },
      { credits: 1000, price: 90 },
    ]));
  });

  it("puts each message under the box it's about", async () => {
    modelPrices.mockResolvedValue({ items: [], annual_reporting_reachable: true, settings: settings([PACKS[0]]) });
    render(<MemoryRouter><SparkAiCreditsPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "+ Add pack" }));
    const creditsBox = screen.getByLabelText("Credits in pack 2");
    expect(creditsBox.closest("td")).toHaveTextContent("Credits must be a whole number");
    expect(screen.getByLabelText("Price of pack 2").closest("td")).not.toHaveTextContent("Credits must be");
    fireEvent.change(creditsBox, { target: { value: "1000" } });
    expect(screen.getByLabelText("Price of pack 2").closest("td")).toHaveTextContent("Enter a price of at least $0.01.");
  });

  it("says Remove isn't saved yet, and saving an empty list takes packs off sale", async () => {
    modelPrices.mockResolvedValue({ items: [], annual_reporting_reachable: true, settings: settings([PACKS[0]]) });
    saveCreditPacks.mockResolvedValue({ packs: [] });
    render(<MemoryRouter><SparkAiCreditsPage /></MemoryRouter>);
    await screen.findByLabelText("Price of pack 1");
    expect(screen.queryByText(/Unsaved changes/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByText(/Unsaved changes — press Save packs/)).toBeInTheDocument();
    expect(screen.getByText(/No packs\. After you save, clients see/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save packs" }));
    await waitFor(() => expect(saveCreditPacks).toHaveBeenCalledWith([]));
  });

  it("allows at most 5 packs", async () => {
    const five = [1, 2, 3, 4, 5].map((n) => ({ id: `pk_${n}`, credits: n * 100, price: n * 10 }));
    modelPrices.mockResolvedValue({ items: [], annual_reporting_reachable: true, settings: settings(five) });
    render(<MemoryRouter><SparkAiCreditsPage /></MemoryRouter>);
    expect(await screen.findByRole("button", { name: "+ Add pack" })).toBeDisabled();
  });
});


describe("Settings tabs", () => {
  it("each tab goes to its page", async () => {
    const { SettingsTabs } = await import("@/components/admin/SettingsTabs");
    const { Routes, Route, useLocation } = await import("react-router-dom");
    function Where() { return <div data-testid="where">{useLocation().pathname}</div>; }
    render(
      <MemoryRouter initialEntries={["/admin-console/subscription"]}>
        <SettingsTabs />
        <Routes><Route path="*" element={<Where />} /></Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("tab", { name: "Subscription" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Billing" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/admin-console/billing");
    fireEvent.click(screen.getByRole("tab", { name: "Usage" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/admin-console/usage");
  });

  it("knows which addresses belong to Settings (for the sidebar)", async () => {
    const { isSettingsPath } = await import("@/components/admin/SettingsTabs");
    expect(isSettingsPath("/admin-console/subscription/checkout")).toBe(true);
    expect(isSettingsPath("/admin-console/usage/buy-credits")).toBe(true);
    expect(isSettingsPath("/admin-console/billing")).toBe(true);
    expect(isSettingsPath("/admin-console/users")).toBe(false);
  });
});
