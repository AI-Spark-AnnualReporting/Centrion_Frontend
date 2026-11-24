// Spark → AI credits → Model prices: the models come from the apps' .env files,
// Spark only types prices. Plan: Centriton/.claude/plans/model-prices-from-code.md

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ModelPriceList } from "@/types/ai-credits";

const modelPrices = vi.fn();
const saveModelPrice = vi.fn();
const actions = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    sparkAiCredits: {
      ...actual.sparkAiCredits,
      modelPrices: () => modelPrices(),
      saveModelPrice: (model: string, body: unknown) => saveModelPrice(model, body),
      actions: () => actions(),
    },
  };
});

const { default: SparkAiCreditsPage, actionsByGroup } = await import("@/pages/spark/SparkAiCreditsPage");
const { actionName } = await import("@/components/ai-credits/creditFormat");
const { parseErrorBody, ApiError } = await import("@/lib/api");

function listing(overrides: Partial<ModelPriceList> = {}): ModelPriceList {
  return {
    items: [
      { model: "gpt-9", used_by: ["Annual Reporting"], steps: { "Annual Reporting": ["Writing a section or a department's draft"] }, has_price: false,
        input_price_per_million: null, output_price_per_million: null, updated_at: null },
      { model: "gpt-4o", used_by: ["Centriyon", "Annual Reporting"],
        steps: { Centriyon: ["Company chatbot", "Writing quarterly reports"], "Annual Reporting": ["Report chat"] }, has_price: true,
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
  actions.mockReset();
  actions.mockResolvedValue({ items: [], groups: [], days: 30 });
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

// ── Minimums table in groups (ai-action-groups.md) ──────────────────

const GROUPS = [
  { key: "generate" as const, label: "Generate", line: "AI writes something new" },
  { key: "refine" as const, label: "Refine", line: "AI improves something written" },
  { key: "chat" as const, label: "Chat", line: "Questions people ask the AI" },
];

function action(key: string, group: "generate" | "refine" | "chat", label: string) {
  return { key, group, per: "job" as const, label, line: "", minimum: 0, jobs: 0,
    usual_credits: null, most_credits: null };
}

const ACTIONS = [
  action("annual.brief", "generate", "Generate brief"),
  action("annual.brief_refine", "refine", "Refine brief"),
  action("centriyon.copilot", "chat", "AI Copilot message"),
  action("annual.chat", "chat", "Department chat message"),
];

describe("Spark minimums in groups", () => {
  it("puts each action under its group, in the groups' order", () => {
    const sections = actionsByGroup(GROUPS, ACTIONS);
    expect(sections.map((s) => s.group.key)).toEqual(["generate", "refine", "chat"]);
    expect(sections[2].actions.map((a) => a.key)).toEqual(["centriyon.copilot", "annual.chat"]);
    expect(actionsByGroup(GROUPS, [ACTIONS[0]]).map((s) => s.group.key)).toEqual(["generate"]);
  });

  it("shows group headings, all collapsed at first, that open and close", async () => {
    modelPrices.mockResolvedValue(listing());
    actions.mockResolvedValue({ items: ACTIONS, groups: GROUPS, days: 30 });
    showPage();
    const chat = await screen.findByRole("button", { name: /Chat/ });
    expect(chat).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /Generate/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("AI Copilot message")).not.toBeInTheDocument();
    expect(screen.queryByText("Refine brief")).not.toBeInTheDocument();

    fireEvent.click(chat);
    expect(chat).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("AI Copilot message")).toBeInTheDocument();
    expect(screen.queryByText("Refine brief")).not.toBeInTheDocument();

    fireEvent.click(chat);
    expect(screen.queryByText("AI Copilot message")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Filter by area" })).not.toBeInTheDocument();
  });

  it("names the new and renamed actions", () => {
    expect(actionName("annual.brief_refine")).toBe("Refine brief");
    expect(actionName("annual.section")).toBe("Write a section");
    expect(actionName("centriyon.copilot")).toBe("AI Copilot message");
    expect(actionName("annual.chat")).toBe("Department chat message");
    expect(actionName("annual.design.custom_template")).toBe("Custom template");
  });
});

describe("Copilot refusals show the backend's words", () => {
  it("reads a JSON error body so the credits message is shown", () => {
    const body = parseErrorBody('{"detail":"Not enough AI credits (balance -3). Ask your admin to buy more."}');
    const error = new ApiError(403, "Forbidden", body, "/api/v1/chat/");
    expect(error.message).toBe("Not enough AI credits (balance -3). Ask your admin to buy more.");
    expect(parseErrorBody("not json")).toBe("not json");
  });
});


describe("Which steps use a model (the info icon)", () => {
  it("hovering the icon lists each app's steps", async () => {
    modelPrices.mockResolvedValue(listing());
    showPage();
    fireEvent.mouseEnter(await screen.findByRole("button", { name: "Where gpt-4o is used" }));
    const box = await screen.findByRole("dialog");
    expect(within(box).getByText("Centriyon")).toBeInTheDocument();
    expect(within(box).getByText("Company chatbot")).toBeInTheDocument();
    expect(within(box).getByText("Writing quarterly reports")).toBeInTheDocument();
    expect(within(box).getByText("Annual Reporting")).toBeInTheDocument();
    expect(within(box).getByText("Report chat")).toBeInTheDocument();
  });

  it("clicking the icon opens it too (touch screens)", async () => {
    modelPrices.mockResolvedValue(listing());
    showPage();
    fireEvent.click(await screen.findByRole("button", { name: "Where gpt-9 is used" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Writing a section or a department's draft");
  });

  it("a model seen only in recent usage says so", async () => {
    modelPrices.mockResolvedValue(listing({
      items: [{ model: "gpt-7", used_by: ["Recent usage"], steps: {}, has_price: false,
        input_price_per_million: null, output_price_per_million: null, updated_at: null }],
    }));
    showPage();
    fireEvent.click(await screen.findByRole("button", { name: "Where gpt-7 is used" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Not set in either app's .env");
  });
});
