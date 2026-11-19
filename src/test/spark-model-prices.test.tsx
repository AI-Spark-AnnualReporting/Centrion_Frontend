// Spark → AI credits → Model prices: the models come from the apps' .env files,
// Spark only types prices. Plan: Centriton/.claude/plans/model-prices-from-code.md

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ModelPriceList } from "@/types/ai-credits";

const modelPrices = vi.fn();
const saveModelPrice = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    sparkAiCredits: {
      ...actual.sparkAiCredits,
      modelPrices: () => modelPrices(),
      saveModelPrice: (model: string, body: unknown) => saveModelPrice(model, body),
      actions: () => Promise.resolve({ items: [], days: 30 }),
    },
  };
});

const { default: SparkAiCreditsPage } = await import("@/pages/spark/SparkAiCreditsPage");

function listing(overrides: Partial<ModelPriceList> = {}): ModelPriceList {
  return {
    items: [
      { model: "gpt-9", used_by: ["Annual Reporting"], has_price: false,
        input_price_per_million: null, output_price_per_million: null, updated_at: null },
      { model: "gpt-4o", used_by: ["Centriyon", "Annual Reporting"], has_price: true,
        input_price_per_million: 2.5, output_price_per_million: 10, updated_at: "2026-11-15T00:00:00Z" },
    ],
    annual_reporting_reachable: true,
    settings: { credit_value_usd: 0.02, low_balance_percent: 20, action_minimums: {} },
    ...overrides,
  };
}

function showPage() {
  render(<MemoryRouter><SparkAiCreditsPage /></MemoryRouter>);
}

beforeEach(() => {
  modelPrices.mockReset();
  saveModelPrice.mockReset();
  saveModelPrice.mockResolvedValue({});
});

describe("Spark model prices", () => {
  it("shows the models the apps use, where, and flags one with no price", async () => {
    modelPrices.mockResolvedValue(listing());
    showPage();
    expect(await screen.findByText("gpt-9")).toBeInTheDocument();
    expect(screen.getByText(/No price yet: jobs on this model are free/)).toBeInTheDocument();
    expect(screen.getAllByText("Annual Reporting")).toHaveLength(2);
    expect(screen.queryByLabelText("New model name")).not.toBeInTheDocument();
  });

  it("shows Save only after a price changes, and saves it", async () => {
    modelPrices.mockResolvedValue(listing());
    showPage();
    const reading = await screen.findByLabelText("Reading price for gpt-4o");
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    fireEvent.change(reading, { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(saveModelPrice).toHaveBeenCalledWith("gpt-4o", { input_price_per_million: 3, output_price_per_million: 10 });
  });

  it("explains a bad price instead of silently disabling Save", async () => {
    modelPrices.mockResolvedValue(listing());
    showPage();
    fireEvent.change(await screen.findByLabelText("Reading price for gpt-4o"), { target: { value: "-5" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a price of 0 or more");
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("says when Annual Reporting couldn't be asked", async () => {
    modelPrices.mockResolvedValue(listing({ annual_reporting_reachable: false }));
    showPage();
    expect(await screen.findByText(/Couldn't reach Annual Reporting/)).toBeInTheDocument();
  });
});
