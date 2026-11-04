// Cloud subscriptions v2: the pricing cards, spark_admin's plan editor page
// (Enterprise, reports ≥ 1, department cards, "who gets new limits"), the
// client's Subscription page (Buy now / Contact us), payment and quote form.
// Plan: Centriton/.claude/plans/cloud-subscriptions-v2-redesign.md

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const refreshPermissions = vi.fn().mockResolvedValue(undefined);
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ refreshPermissions }) }));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const sparkPlans = { get: vi.fn(), create: vi.fn(), update: vi.fn(), subscribers: vi.fn(), list: vi.fn(), remove: vi.fn() };
const subscriptions = { plans: vi.fn(), current: vi.fn(), startCheckout: vi.fn(), pay: vi.fn(), requestQuote: vi.fn() };
vi.mock("@/lib/api", () => ({ sparkPlans, subscriptions }));

const { default: SparkPlanEditorPage, limitsChanged } = await import("@/pages/spark/SparkPlanEditorPage");
const { default: SparkSubscriptionsPage } = await import("@/pages/spark/SparkSubscriptionsPage");
const { peopleTotal, departmentUsersTotal, resizeDepartments } = await import("@/components/subscriptions/PlanFields");
const { PlanCard } = await import("@/components/subscriptions/PlanCard");
const { QuoteForm } = await import("@/components/subscriptions/QuoteForm");
const { default: SubscriptionPage } = await import("@/pages/admin/SubscriptionPage");
const { default: CheckoutPage } = await import("@/pages/admin/CheckoutPage");

const CATALOGUE = [
  { key: "quarterly_report", label: "Quarterly Report", report_type: "quarterly" },
  { key: "earnings_report", label: "Earnings Report", report_type: "earnings" },
  { key: "leadership", label: "Leadership", report_type: null },
];
const LIMITS = {
  modules: ["quarterly_report"], report_limits: { quarterly: 4 },
  max_pms: 2, max_ir_users: 1, department_sizes: [5, 2, 1],
};
const GOLD = {
  ...LIMITS, id: "plan_gold", name: "Gold", duration: "yearly" as const, price: 40000, contact: null,
  max_departments: 3, company_id: null, status: "published" as const, quote: null, created_at: "", updated_at: "",
  subscriber_count: 2,
};
const ENTERPRISE = {
  ...GOLD, id: "plan_ent", name: "Enterprise", duration: "enterprise" as const, price: null, modules: [],
  report_limits: {}, max_pms: 0, max_ir_users: 0, department_sizes: [], max_departments: 0, subscriber_count: 0,
  contact: { message: "Sized for you", person: "Centriyon Sales", email: "sales@centriyon.com", phone: "+966 1" },
};

beforeEach(() => {
  for (const fn of [...Object.values(sparkPlans), ...Object.values(subscriptions), toast]) fn.mockReset();
  sparkPlans.list.mockResolvedValue({ items: [], total: 0, page: 1, limit: 1, modules_catalogue: CATALOGUE });
});

function Where() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname}</div>;
}

// ── Plan numbers ─────────────────────────────────────────────────────

describe("plan numbers", () => {
  it("adds up the department cards, and the total counts the admin", () => {
    expect(departmentUsersTotal(LIMITS)).toBe(8);
    expect(peopleTotal(LIMITS)).toBe(1 + 2 + 1 + 3 + 8);
  });

  it("new department cards start at 1 user; fewer departments drop the last cards", () => {
    expect(resizeDepartments([5, 2], 4)).toEqual([5, 2, 1, 1]);
    expect(resizeDepartments([5, 2, 1], 1)).toEqual([5]);
  });

  it("only modules, reports, people and departments count as a change — not name or price", () => {
    const form = { ...LIMITS, name: "Gold 2", duration: "yearly" as const, price: 1, contact: null };
    expect(limitsChanged(GOLD, form)).toBe(false);
    expect(limitsChanged(GOLD, { ...form, max_pms: 3 })).toBe(true);
    expect(limitsChanged(GOLD, { ...form, department_sizes: [5, 2, 2] })).toBe(true);
    expect(limitsChanged(GOLD, { ...form, modules: ["leadership", "quarterly_report"] })).toBe(true);
  });
});

// ── The pricing card ─────────────────────────────────────────────────

describe("PlanCard", () => {
  it("shows the USD price for the duration, ✓/✗ per module and the people lines", () => {
    render(<PlanCard plan={GOLD} position={0} catalogue={CATALOGUE} />);
    expect(screen.getByText("40,000")).toBeInTheDocument();
    expect(screen.getByText("$")).toBeInTheDocument();
    expect(screen.getByText("Quarterly Report · 4 reports")).toBeInTheDocument();
    expect(screen.getByText("Earnings Report").closest("li")).toHaveClass("off");
    expect(screen.getByText("1 admin (included)")).toBeInTheDocument();
    expect(screen.getByText("3 departments · 1 HOD each · 8 department users")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();      // no Buy now unless given one
  });

  it("Enterprise shows Let's talk and the contact details instead of a price", () => {
    render(<PlanCard plan={ENTERPRISE} position={0} catalogue={CATALOGUE} />);
    expect(screen.getByText("Let's talk")).toBeInTheDocument();
    expect(screen.getByText("sales@centriyon.com")).toBeInTheDocument();
    expect(screen.queryByText("1 admin (included)")).not.toBeInTheDocument();
  });
});

// ── spark_admin: the cards page ──────────────────────────────────────

describe("SparkSubscriptionsPage", () => {
  function renderPage() {
    return render(
      <MemoryRouter initialEntries={["/spark/subscriptions"]}>
        <Routes>
          <Route path="/spark/subscriptions" element={<SparkSubscriptionsPage />} />
          <Route path="/spark/subscriptions/:planId/edit" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("shows the plans as cards without Buy now; clicking one gives Edit, which opens the editor", async () => {
    sparkPlans.list.mockResolvedValue({ items: [GOLD, ENTERPRISE], total: 2, page: 1, limit: 10, modules_catalogue: CATALOGUE });
    renderPage();
    expect(await screen.findByRole("button", { name: "Gold" })).toBeInTheDocument();
    expect(screen.queryByText("Buy now")).not.toBeInTheDocument();
    expect(screen.queryByText("Contact us")).not.toBeInTheDocument();
    expect(screen.getByText("2 companies")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Gold" }));
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();      // in use: no Delete
    fireEvent.click(screen.getByRole("button", { name: "✎ Edit" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/spark/subscriptions/plan_gold/edit");
  });
});

// ── spark_admin: the editor page ─────────────────────────────────────

function renderEditor(path = "/spark/subscriptions/new") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/spark/subscriptions/new" element={<SparkPlanEditorPage />} />
        <Route path="/spark/subscriptions/:planId/edit" element={<SparkPlanEditorPage />} />
        <Route path="/spark/subscriptions" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SparkPlanEditorPage", () => {
  it("creates a plan: duration, USD price, a report module starting at 1, department cards", async () => {
    sparkPlans.create.mockResolvedValue({});
    renderEditor();
    fireEvent.change(await screen.findByLabelText("Plan name"), { target: { value: "Standard" } });
    fireEvent.change(screen.getByLabelText("Duration"), { target: { value: "half_year" } });
    expect(screen.getByText("per 6 months", { selector: "span" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Price \(USD\)/), { target: { value: "12000" } });

    fireEvent.click(screen.getByRole("switch", { name: "Quarterly Report" }));
    expect(screen.getByLabelText("Quarterly Report reports")).toHaveValue("1");          // starts at 1
    expect(screen.getByRole("button", { name: "Fewer Quarterly Report reports" })).toBeDisabled();   // never below 1
    fireEvent.click(screen.getByRole("button", { name: "More Quarterly Report reports" }));

    fireEvent.change(screen.getByLabelText("Number of departments"), { target: { value: "3" } });
    expect(screen.getByText("Department 3")).toBeInTheDocument();                         // cards appear by themselves
    fireEvent.click(screen.getByRole("button", { name: "More Department 1 users" }));
    expect(screen.getByText("10 people")).toBeInTheDocument();     // 1 admin + 1 PM + 1 IR + 3 HODs + (2 + 1 + 1) users
    expect(screen.queryByText(/×/)).not.toBeInTheDocument();                              // no calculation

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(sparkPlans.create).toHaveBeenCalled());
    expect(sparkPlans.create.mock.calls[0][0]).toMatchObject({
      name: "Standard", duration: "half_year", price: 12000, status: "published",
      modules: ["quarterly_report"], report_limits: { quarterly: 2 }, department_sizes: [2, 1, 1],
    });
    expect(screen.getByTestId("where")).toHaveTextContent("/spark/subscriptions");
  });

  it("typing 0 users in a department keeps it at 1", async () => {
    renderEditor();
    const users = await screen.findByLabelText("Department 1 users");
    fireEvent.change(users, { target: { value: "0" } });
    expect(users).toHaveValue("1");
  });

  it("Enterprise shows only the contact details, and the preview has no button", async () => {
    sparkPlans.create.mockResolvedValue({});
    renderEditor();
    fireEvent.change(await screen.findByLabelText("Plan name"), { target: { value: "Enterprise" } });
    fireEvent.change(screen.getByLabelText("Duration"), { target: { value: "enterprise" } });
    expect(screen.queryByText("Modules")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Price \(USD\)/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "sales@centriyon.com" } });
    expect(screen.getAllByText("sales@centriyon.com").length).toBeGreaterThan(0);       // in the preview
    expect(screen.queryByText("Contact us", { selector: "button" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(sparkPlans.create).toHaveBeenCalled());
    expect(sparkPlans.create.mock.calls[0][0]).toMatchObject({
      duration: "enterprise", price: null, contact: { email: "sales@centriyon.com" },
    });
  });

  it("asks who gets new limits when companies are on the plan, then sends the choice", async () => {
    sparkPlans.get.mockResolvedValue(GOLD);
    sparkPlans.subscribers.mockResolvedValue({
      items: [{ id: "s1", company_id: "c1", company_name: "Aramco" }, { id: "s2", company_id: "c2", company_name: "BUPA" }], total: 2,
    });
    sparkPlans.update.mockResolvedValue({});
    renderEditor("/spark/subscriptions/plan_gold/edit");
    fireEvent.change(await screen.findByLabelText("Project managers (PMs)"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("2 companies are on Gold")).toBeInTheDocument();
    expect(sparkPlans.update).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByLabelText(/Apply to everyone on Gold/));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(sparkPlans.update).toHaveBeenCalledWith("plan_gold",
      expect.objectContaining({ max_pms: 5, apply_to: "everyone" })));
  });

  it("a price change saves without asking", async () => {
    sparkPlans.get.mockResolvedValue(GOLD);
    sparkPlans.update.mockResolvedValue({});
    renderEditor("/spark/subscriptions/plan_gold/edit");
    fireEvent.change(await screen.findByLabelText(/Price \(USD\)/), { target: { value: "45000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(sparkPlans.update).toHaveBeenCalled());
    expect(sparkPlans.subscribers).not.toHaveBeenCalled();
    expect(sparkPlans.update.mock.calls[0][1].apply_to).toBeUndefined();
  });

  it("publishes a quote for that company", async () => {
    sparkPlans.get.mockResolvedValue({
      ...GOLD, status: "draft", price: null, company_id: "c1", company_name: "Aramco",
      quote: { asked: LIMITS, duration: null, note: "Two subsidiaries", asked_by: "usr_a", asked_by_name: "Aizaz", asked_at: "" },
    });
    sparkPlans.update.mockResolvedValue({});
    renderEditor("/spark/subscriptions/plan_gold/edit");
    expect(await screen.findByText("Their note: “Two subsidiaries”")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Price \(USD\)/), { target: { value: "30000" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish for Aramco" }));
    await waitFor(() => expect(sparkPlans.update).toHaveBeenCalledWith("plan_gold",
      expect.objectContaining({ status: "published", price: 30000 })));
    expect(toast).toHaveBeenCalledWith({ title: "Published — Aramco can subscribe now" });
  });
});

// ── Client: Subscription page, payment, quote ────────────────────────

const CURRENT = {
  status: "active", reason: null,
  subscription: { ...LIMITS, id: "sub_1", plan_id: "plan_gold", plan_name: "Gold", billing_period: "yearly",
                  ends_at: "2027-11-03", starts_at: "2026-11-04", status: "active", max_departments: 3 },
};

function renderSubscriptionPage() {
  return render(
    <MemoryRouter initialEntries={["/admin-console/subscription"]}>
      <Routes>
        <Route path="/admin-console/subscription" element={<SubscriptionPage />} />
        <Route path="/admin-console/subscription/checkout" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SubscriptionPage", () => {
  beforeEach(() => {
    subscriptions.plans.mockResolvedValue({
      items: [
        { ...GOLD, made_for_you: false },
        { ...GOLD, id: "plan_custom", name: "Custom plan for Aramco", duration: "quarterly", price: 9000, made_for_you: true },
        { ...ENTERPRISE, made_for_you: false },
      ],
      modules_catalogue: CATALOGUE,
    });
    subscriptions.current.mockResolvedValue(CURRENT);
  });

  it("shows the current plan, the one made for this company, and Contact us on Enterprise", async () => {
    renderSubscriptionPage();
    expect(await screen.findByText("You're on Gold (1 year) until 3 Nov 2027.")).toBeInTheDocument();
    expect(screen.getByText("Your plan")).toBeInTheDocument();
    expect(screen.getByText("Made for you")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Current · ends/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Contact us" })).toBeInTheDocument();
  });

  it("the duration tabs filter the cards (Enterprise always shows)", async () => {
    renderSubscriptionPage();
    await screen.findByText("Made for you");
    fireEvent.click(screen.getByRole("tab", { name: "1 year" }));
    expect(screen.queryByText("Custom plan for Aramco")).not.toBeInTheDocument();
    expect(screen.getByText("Gold")).toBeInTheDocument();
    expect(screen.getByText("Enterprise")).toBeInTheDocument();
  });

  it("Buy now starts a checkout with an Idempotency-Key and opens the payment page", async () => {
    subscriptions.startCheckout.mockResolvedValue({ id: "chk_1" });
    renderSubscriptionPage();
    fireEvent.click(await screen.findByRole("button", { name: "Buy now" }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/admin-console/subscription/checkout"));
    const [body, key] = subscriptions.startCheckout.mock.calls[0];
    expect(body).toEqual({ plan_id: "plan_custom" });
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("Contact us opens the quote popup with the contact details", async () => {
    renderSubscriptionPage();
    fireEvent.click(await screen.findByRole("button", { name: "Contact us" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("✉ sales@centriyon.com")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Send request" })).toBeInTheDocument();
  });
});

describe("CheckoutPage", () => {
  const CHECKOUT = { id: "chk_1", plan_name: "Standard", billing_period: "half_year", price: 12000,
                     starts_at: "2026-11-04", ends_at: "2027-05-03", status: "pending_payment" };

  function renderCheckout(state: unknown) {
    return render(
      <MemoryRouter initialEntries={[{ pathname: "/admin-console/subscription/checkout", state }]}>
        <Routes>
          <Route path="/admin-console/subscription/checkout" element={<CheckoutPage />} />
          <Route path="/admin-console/subscription" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("shows the USD price and period, and Pay activates it once, then goes back", async () => {
    subscriptions.pay.mockResolvedValue({ ...CHECKOUT, status: "active" });
    renderCheckout({ checkout: CHECKOUT, replaces: "Gold" });
    expect(screen.getByText("Half year")).toBeInTheDocument();
    expect(screen.getByText("4 Nov 2026 → 3 May 2027")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pay $12,000" }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/admin-console/subscription"));
    expect(subscriptions.pay).toHaveBeenCalledTimes(1);
    expect(refreshPermissions).toHaveBeenCalled();
  });

  it("without a checkout (e.g. after a refresh) goes back to the plans", () => {
    renderCheckout(null);
    expect(screen.getByTestId("where")).toHaveTextContent("/admin-console/subscription");
  });
});

describe("QuoteForm", () => {
  it("sends the cards' numbers, the duration and the note", async () => {
    subscriptions.requestQuote.mockResolvedValue({});
    const onSent = vi.fn();
    render(<QuoteForm catalogue={CATALOGUE} contact={null} startFrom={LIMITS} onSent={onSent} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "More Department 3 users" }));
    fireEvent.change(screen.getByLabelText(/Duration you/), { target: { value: "quarterly" } });
    fireEvent.change(screen.getByLabelText(/Anything else/), { target: { value: "We grow in Q2" } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(subscriptions.requestQuote).toHaveBeenCalledWith(expect.objectContaining({
      department_sizes: [5, 2, 2], report_limits: { quarterly: 4 }, duration: "quarterly", note: "We grow in Q2",
    }));
  });

  it("shows the server's answer when a quote is already open", async () => {
    subscriptions.requestQuote.mockRejectedValue(new Error("You already asked for a quote on 2026-11-01."));
    render(<QuoteForm catalogue={CATALOGUE} contact={null} startFrom={LIMITS} onSent={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByText("You already asked for a quote on 2026-11-01.")).toBeInTheDocument();
  });
});
