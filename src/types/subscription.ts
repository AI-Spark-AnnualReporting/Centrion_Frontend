// Cloud subscriptions — shapes returned by the backend's subscription endpoints.
// Backend: Centriton routes/spark_subscription_routes.py (spark_admin) and
// routes/subscription_routes.py (client admin).
// Plans: Centriton/.claude/plans/cloud-subscriptions.md and
// cloud-subscriptions-v2-redesign.md (one duration + price in USD, Enterprise,
// department cards).

import type { LicensableModule } from "@/types/license";

// One plan = one duration. Enterprise is never bought: it shows Contact us.
export type Duration = "quarterly" | "half_year" | "yearly" | "enterprise";
export type PaidDuration = Exclude<Duration, "enterprise">;
export type PlanStatus = "draft" | "published" | "archived";

// What a plan allows. Report limits are keyed by report type ("quarterly");
// every report module has a number ≥ 1. Each department card has 1 HOD and
// its own users (department_sizes, e.g. [5, 2, 1]); limits use the totals.
export interface PlanLimits {
  modules: string[];
  report_limits: Record<string, number>;
  max_pms: number;
  max_ir_users: number;
  department_sizes: number[];
}

// What an Enterprise card shows instead of a price.
export interface PlanContact {
  message?: string | null;
  person?: string | null;
  email?: string | null;
  phone?: string | null;
}

// What a client admin asked for in "Get a quote".
export interface PlanQuote {
  asked: PlanLimits;
  duration: PaidDuration | null;
  note: string | null;
  asked_by: string;
  asked_by_name: string | null;
  asked_at: string;
}

// spark_admin's view of a plan.
export interface SubscriptionPlan extends PlanLimits {
  id: string;
  name: string;
  duration: Duration;
  price: number | null;               // USD for the duration; null for Enterprise / not set yet
  contact: PlanContact | null;        // Enterprise only
  max_departments: number;            // = department_sizes.length
  company_id: string | null;          // set = made for that one company
  status: PlanStatus;
  quote: PlanQuote | null;            // set = made from a client's quote
  created_at: string;
  updated_at: string;
  company_name?: string | null;       // list only
  subscriber_count?: number;          // list only: companies on it now
}

export interface PlanPage {
  items: SubscriptionPlan[];
  total: number;
  page: number;
  limit: number;
  modules_catalogue: LicensableModule[];
}

export interface PlanForm extends PlanLimits {
  name: string;
  duration: Duration;
  price: number | null;
  contact: PlanContact | null;
  company_id?: string | null;
  status?: PlanStatus;
}

export type PlanChanges = Partial<PlanForm> & { apply_to?: "everyone" | "new" };

export interface PlanSubscriber {
  id: string;
  company_id: string;
  company_name: string | null;
  billing_period: PaidDuration;
  starts_at: string;
  ends_at: string;
  report_counts: Record<string, number>;
}

// A client admin's view of a plan they can buy (or Contact us for Enterprise).
export interface PlanForClient extends PlanLimits {
  id: string;
  name: string;
  duration: Duration;
  price: number | null;
  contact: PlanContact | null;
  max_departments: number;
  made_for_you: boolean;
}

// One row of company_subscriptions: a checkout waiting for payment, or a paid period.
export interface CompanySubscription extends PlanLimits {
  id: string;
  company_id: string;
  plan_id: string;
  plan_name: string;
  billing_period: PaidDuration;       // the plan's duration
  price: number;
  max_departments: number;
  starts_at: string;
  ends_at: string;
  status: "pending_payment" | "active" | "replaced" | "cancelled";
  payment_status: string | null;
  payment_reference: string | null;
  paid_at: string | null;
  report_counts: Record<string, number>;
}

export interface CurrentSubscription {
  status: "none" | "active" | "expired" | "not_started";
  reason: string | null;
  subscription: CompanySubscription | null;
}

export interface QuoteRequestForm extends PlanLimits {
  duration?: PaidDuration | null;
  note?: string | null;
}
