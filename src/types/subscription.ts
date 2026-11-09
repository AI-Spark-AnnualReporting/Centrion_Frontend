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

// The prices spark_admin types on a quote's offer: a price per report (report
// modules) or one flat price (other modules), one price for the Users card
// and one for the Departments card. Plan: Centriton/.claude/plans/quote-offers.md
export interface OfferPrices {
  modules: Record<string, number>;
  users: number;
  departments: number;
}

// Where a quote's offer is: received (not emailed yet), sent (emailed, waiting
// for the client's reply), approved (Spark published it for them), deleted.
// Only Spark approves; the client answers by replying to the email.
/** A quote's company's active plan, shown as small "Current" words on the offer page. */
export interface CurrentPlan {
  name: string;
  ends_at: string;
  modules: string[];
  report_limits: Record<string, number>;
  max_pms: number;
  max_ir_users: number;
  department_sizes: number[];
}

// "changed" = edited after it was emailed: send it again before Approve.
export type OfferState = "received" | "sent" | "changed" | "approved" | "deleted";

export interface PlanOffer {
  sent_at?: string | null;
  sent_by?: string | null;
  sent_to?: string[];
  changed_at?: string | null;         // edited after it was emailed; cleared by sending again
  approved_at?: string | null;
  approved_by?: string | null;
}

// POST /spark/subscription-plans/{id}/offers: who gets the email, and its subject.
export interface OfferEmailForm {
  recipients: string[];               // 1 to 5 addresses
  subject: string;
}

// What a client admin sent with Contact us on the Enterprise card.
export interface PlanQuote {
  name: string;
  phone: string;
  message: string;
  enterprise_plan_id: string;
  asked_by: string;
  asked_by_name: string | null;
  asked_at: string;
  prices?: OfferPrices;               // set once spark_admin types prices
  offer?: PlanOffer;                  // set once the offer is emailed or approved
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
  company_name?: string | null;       // list, and one plan
  subscriber_count?: number;          // list only: companies on it now
  offer_state?: OfferState;           // quote plans only
  company_admin_emails?: string[];    // one quote plan: the Send offer popup starts with these
  current_plan?: CurrentPlan | null;  // one open quote plan: the company's active plan (null = none)
}

export interface PlanPage {
  items: SubscriptionPlan[];
  total: number;
  page: number;
  limit: number;
  modules_catalogue: LicensableModule[];
}

// Spark → Subscriptions tabs: plans for every company, or plans made for one.
export type PlanKind = "public" | "custom";

// What Delete did: "deleted" = nobody ever bought it, the row is gone;
// "hidden" = it was bought, so it's kept (history) but nobody sees it.
export interface PlanDeleteResult {
  result: "deleted" | "hidden";
  companies_on_it: number;            // they keep it until it ends
}

// One row of Custom plans → the companies table.
export interface CustomPlanCompany {
  company_id: string;
  company_name: string;
  plans: number;
  published: number;
  drafts: number;
}

export interface CustomPlanCompanyPage {
  items: CustomPlanCompany[];
  total: number;
  page: number;
  limit: number;
}

export interface PlanForm extends PlanLimits {
  name: string;
  duration: Duration;
  price: number | null;
  contact: PlanContact | null;
  company_id?: string | null;
  status?: PlanStatus;
}

export type PlanChanges = Partial<PlanForm> & { apply_to?: "everyone" | "new"; offer_prices?: OfferPrices };

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
  // Changing plan (shown in a popup on Buy now):
  too_small: string[];        // why it can't take the company's people — can't be bought
  lost_modules: string[];     // modules the company has now that it doesn't include — confirm first
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

// Contact us on an Enterprise card.
export interface QuoteRequestForm {
  plan_id: string;            // the Enterprise card clicked
  name: string;
  phone: string;
  message: string;
}
