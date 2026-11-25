// AI credits — shapes returned by Centriton's AI credit endpoints.
// Backend: Centriton routes/ai_credit_routes.py (company admin + spark_admin).
// Cloud companies pay for AI by the real tokens used (1 credit = $0.02 of
// OpenAI cost to start with). Nothing is held; a job starts while the balance
// is above zero and at least the action's minimum; the balance may go below zero.
// Plan: Centriton/.claude/plans/ai-credits.md

// One of Spark's credit packs: this many credits for this many dollars. Spark
// sets up to 5 once; every cloud client sees the same ones.
// Plan: Centriton/.claude/plans/admin-usage-page.md
export interface CreditPack {
  id: string;
  credits: number;
  price: number;
}

// A pack in Spark's editor: no id yet for a new one.
export interface CreditPackDraft {
  id?: string;
  credits: number;
  price: number;
}

// This period's credits. total = included + packs; balance = total + carried − used.
export interface CreditBalance {
  included: number;
  packs: number;
  carried: number;          // the minus brought in from the last period (≤ 0)
  used: number;
  total: number;
  balance: number;          // may be below zero
  low: boolean;             // under the low-balance percent of total
}

// One action's credits in a period (or a month, for Spark).
export interface ActionUsage {
  action: string;
  jobs: number;
  credits: number;          // what clients were charged
  cost_usd: number;         // what OpenAI charged Spark
  label?: string | null;    // full name, as on Spark's screens ("Design extract"); client Usage only
}

export interface PackPurchase {
  id: string;
  credits: number;
  price: number;
  paid_at: string | null;
}

// GET /ai-credits (company admin). subscription null = no active plan.
export interface AiCreditsSummary {
  subscription: {
    subscription_id: string;
    period: { starts_at: string; ends_at: string };
    balance: CreditBalance;
    credit_packs: CreditPack[];     // Spark's packs on sale (the same for every client)
    packs: PackPurchase[];          // bought this period
    by_action: ActionUsage[];
  } | null;
}

// A pack waiting for payment, or paid.
export interface PackCheckout {
  id: string;
  credits: number;
  price: number;
  status: "pending_payment" | "paid" | "cancelled";
  payment_reference?: string | null;
}

// Spark: one AI model the apps really use (from their .env files, or seen in
// the last 30 days) and the price OpenAI charges per 1 million tokens.
// Spark only types prices; it can't add or remove models.
export type ModelUsedBy = "Centriyon" | "Annual Reporting" | "Recent usage";

export interface ModelPrice {
  model: string;
  used_by: ModelUsedBy[];
  // What each app uses this model for, in plain words ({"Centriyon": ["Company chatbot", ...]}).
  // Empty for a model seen only in recent usage.
  steps: Partial<Record<ModelUsedBy, string[]>>;
  has_price: boolean;
  input_price_per_million: number | null;    // null = no price yet
  output_price_per_million: number | null;
  updated_at: string | null;
}

export interface ModelPriceList {
  items: ModelPrice[];
  annual_reporting_reachable: boolean;
  settings: CreditSettings;
}

export interface CreditSettings {
  credit_value_usd: number;
  low_balance_percent: number;   // read-only: set in the backend's .env, not by Spark
  action_minimums: Record<string, number>;
  credit_packs: CreditPack[];
}

// The company admin's invoices: every paid plan and every paid credit pack.
export interface Invoice {
  id: string;
  kind: "plan" | "ai_credits";
  description: string;           // "Gold · 1 year", "500 AI credits"
  total: number;
  status: "paid";
  paid_at: string;
}

export interface InvoicePage {
  items: Invoice[];
  page: number;
  limit: number;
  total: number;
}

export type SettingsChanges = Partial<{
  credit_value_usd: number;
  action_minimums: Record<string, number>;   // 0 removes that action's minimum
}>;

// The 8 groups Spark's minimums table shows the AI actions under. Groups only
// organise the page: each action keeps its own minimum.
// Plan: Centriton/.claude/plans/ai-action-groups.md
export type ActionGroup =
  | "generate" | "refine" | "assemble" | "translate"
  | "validate" | "design" | "documents" | "chat";

export interface ActionGroupInfo {
  key: ActionGroup;
  label: string;
  line: string;
}

// Spark's minimums table: one AI action, its minimum, and the last 30 days.
export interface ActionRow {
  key: string;
  group: ActionGroup;
  per: "section" | "job" | "document" | "message";
  label: string;
  line: string;
  minimum: number;
  jobs: number;
  usual_credits: number | null;   // null = hasn't run in the last 30 days
  most_credits: number | null;
}

export interface ActionList {
  items: ActionRow[];
  groups: ActionGroupInfo[];
  days: number;
}

export interface OpenAiBill {
  connected: boolean;             // false = no OpenAI admin key set
  cost_usd: number | null;
  error: string | null;
}

export interface CompanyUsageRow {
  company_id: string | null;
  company_name: string;
  plan_name: string | null;
  balance: CreditBalance | null;
  credits: number;
  cost_usd: number;
}

// GET /spark/ai-credits/usage?month=YYYY-MM
export interface MonthlyUsage {
  month: string;
  credits: number;
  cost_usd: number;
  openai_bill: OpenAiBill;
  by_action: ActionUsage[];
  by_model: { model: string; input_tokens: number; output_tokens: number; cost_usd: number }[];
  unpriced_models: string[];
  companies: { items: CompanyUsageRow[]; total: number; page: number; limit: number };
}

// GET /api/v1/ai-credits/status — which AI steps the company can start now.
// Plan: Centriton/.claude/plans/ai-credits-before-start.md
export interface AiCreditStatus {
  applies: boolean;                 // false: Spark staff / on-premises — never blocked
  balance: number | null;           // the company admin only
  actions: Record<string, { label?: string; minimum: number; allowed: boolean; reason: string | null }>;
}
