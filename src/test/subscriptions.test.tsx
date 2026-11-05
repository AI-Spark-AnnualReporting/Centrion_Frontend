// Cloud subscriptions v2: the pricing cards, spark_admin's plan editor page
// (Enterprise, reports ≥ 1, department cards, "who gets new limits"), the
// client's Subscription page (Buy now / Contact us), payment and quote form.
// Plan: Centriton/.claude/plans/cloud-subscriptions-v2-redesign.md

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const refreshPermissions = vi.fn().mockResolvedValue(undefined);
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ refreshPermissions, user: { full_name: "Aizaz Admin Aramco" } }),
}));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const sparkPlans = { get: vi.fn(), create: vi.fn(), update: vi.fn(), subscribers: vi.fn(), list: vi.fn(), remove: vi.fn(), companies: vi.fn() };
const subscriptions = { plans: vi.fn(), current: vi.fn(), startCheckout: vi.fn(), pay: vi.fn(), requestQuote: vi.fn() };
vi.mock("@/lib/api", () => ({ sparkPlans, subscriptions }));

const { default: SparkPlanEditorPage, limitsChanged } = await import("@/pages/spark/SparkPlanEditorPage");
const { default: SparkSubscriptionsPage } = await import("@/pages/spark/SparkSubscriptionsPage");
const { peopleTotal, departmentUsersTotal, resizeDepartments } = await import("@/components/subscriptions/PlanFields");
const { PlanCard, fitScale, scrollingListHeight } = await import("@/components/subscriptions/PlanCard");
const { default: SparkQuotesPage } = await import("@/pages/spark/SparkQuotesPage");
const { QuoteForm } = await import("@/components/subscriptions/QuoteForm");
const { default: SubscriptionPage, orderPlans } = await import("@/pages/admin/SubscriptionPage");
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

describe("cards fit the height instead of scrolling", () => {
  it("full size when there's room, shrunk just enough when there isn't, never bigger", () => {
    expect(fitScale(700, 400)).toBe(1);
    expect(fitScale(450, 400)).toBeCloseTo(450 / (400 + 50));
    expect(fitScale(300, 400)).toBeCloseTo(300 / 450);
    expect(fitScale(0, 400)).toBe(1);            // not measured yet (e.g. tests): leave it
  });
});

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

  const page = (items: unknown[], total = items.length) =>
    ({ items, total, page: 1, limit: 3, modules_catalogue: CATALOGUE });

  it("shows the plans as cards without Buy now; clicking one gives Edit and Delete (never Archive)", async () => {
    sparkPlans.list.mockResolvedValue(page([GOLD, ENTERPRISE]));
    renderPage();
    expect(await screen.findByRole("button", { name: "Gold" })).toBeInTheDocument();
    expect(screen.queryByText("Buy now")).not.toBeInTheDocument();
    expect(screen.queryByText("Contact us")).not.toBeInTheDocument();
    expect(screen.queryByText("2 companies")).not.toBeInTheDocument();     // no company count on the cards

    fireEvent.click(screen.getByRole("button", { name: "Gold" }));
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();       // in use: Delete too
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "✎ Edit" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/spark/subscriptions/plan_gold/edit");
  });

  it("has Published, Drafts and Custom plans tabs with counts — no Archived tab", async () => {
    sparkPlans.list.mockImplementation((query: { kind?: string; status?: string; limit?: number }) => {
      if (query.limit === 1) return Promise.resolve(page([], query.kind === "custom" ? 7 : query.status === "draft" ? 1 : 5));
      return Promise.resolve(page([GOLD]));
    });
    renderPage();
    expect(await screen.findByRole("tab", { name: /^Published\s*5$/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Drafts\s*1$/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Custom plans\s*7$/ })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Archived/ })).not.toBeInTheDocument();
    // Published asks for plans for every company, 3 at a time, cheapest first.
    expect(sparkPlans.list).toHaveBeenCalledWith(expect.objectContaining({ kind: "public", status: "published", limit: 3, page: 1 }));
  });

  it("pages the cards 3 at a time and sends the duration chip to the server with Enterprise", async () => {
    sparkPlans.list.mockResolvedValue(page([GOLD, GOLD, GOLD].map((p, i) => ({ ...p, id: `p${i}`, name: `Plan ${i}` })), 5));
    renderPage();
    expect(await screen.findByText(/Showing/)).toHaveTextContent("Showing 1–3 of 5");
    expect(screen.queryByText("Rows per page")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    await waitFor(() => expect(sparkPlans.list).toHaveBeenCalledWith(expect.objectContaining({ page: 2, limit: 3 })));
    fireEvent.click(screen.getByRole("tab", { name: "Quarterly" }));
    await waitFor(() => expect(sparkPlans.list).toHaveBeenCalledWith(
      expect.objectContaining({ duration: "quarterly", with_enterprise: true, page: 1 })));
  });

  it("Delete asks first, then says what the server did", async () => {
    sparkPlans.list.mockResolvedValue(page([GOLD]));
    sparkPlans.remove.mockResolvedValue({ result: "hidden", companies_on_it: 2 });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Gold" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(confirm.mock.calls[0][0]).toBe("2 companies are on Gold. They keep it until it ends, but nobody new can buy it. Delete Gold?");
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "Gold deleted. 2 companies keep it until it ends." }));
    confirm.mockRestore();
  });

  it("Custom plans: a table of companies, the first one's cards with Draft / Published tags", async () => {
    const forAramco = { ...GOLD, id: "plan_a", name: "Custom plan for Aramco", company_id: "cmp_a", status: "draft" as const };
    sparkPlans.list.mockImplementation((query: { kind?: string; company_id?: string; limit?: number }) =>
      Promise.resolve(query.limit === 1 ? page([], 2) : query.company_id === "cmp_a" ? page([forAramco]) : page([GOLD])));
    sparkPlans.companies.mockResolvedValue({
      items: [{ company_id: "cmp_a", company_name: "Aramco", plans: 1, published: 0, drafts: 1 },
              { company_id: "cmp_b", company_name: "BUPA", plans: 1, published: 1, drafts: 0 }],
      total: 2, page: 1, limit: 10,
    });
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: /Custom plans/ }));
    expect(await screen.findByText("Custom plans for Aramco")).toBeInTheDocument();
    const card = await screen.findByRole("button", { name: "Custom plan for Aramco" });
    expect(within(card).getByText("Draft")).toBeInTheDocument();
    expect(sparkPlans.list).toHaveBeenCalledWith(expect.objectContaining({ kind: "custom", company_id: "cmp_a", limit: 3 }));

    fireEvent.click(screen.getByText("BUPA"));
    await waitFor(() => expect(sparkPlans.list).toHaveBeenCalledWith(expect.objectContaining({ company_id: "cmp_b", page: 1 })));
    expect(screen.getByText("Custom plans for BUPA")).toBeInTheDocument();
  });

  it("Custom plans with no company yet says where they come from", async () => {
    sparkPlans.list.mockResolvedValue(page([]));
    sparkPlans.companies.mockResolvedValue({ items: [], total: 0, page: 1, limit: 10 });
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: /Custom plans/ }));
    expect(await screen.findByText(/They appear when a company sends a request/)).toBeInTheDocument();
    expect(screen.getByText("No custom plans yet.")).toBeInTheDocument();
  });
});

describe("Delete wording", () => {
  it("asks plainly for a plan nobody is on, and reports deleted vs hidden", async () => {
    const { deleteQuestion, deletedMessage } = await import("@/pages/spark/SparkSubscriptionsPage");
    expect(deleteQuestion({ ...GOLD, subscriber_count: 0 })).toBe("Delete Gold? This can't be undone.");
    expect(deleteQuestion({ ...GOLD, subscriber_count: 1 })).toMatch(/^1 company is on Gold\./);
    expect(deletedMessage("Gold", "deleted", 0)).toBe("Gold deleted");
    expect(deletedMessage("Gold", "hidden", 0)).toBe("Gold deleted. Companies that bought it keep their history.");
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

    fireEvent.click(screen.getByRole("button", { name: /Reports/ }));                    // new plan: the group starts closed
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

  it("modules are grouped: a new plan starts with Reports closed; ungrouped modules always show", async () => {
    renderEditor();
    const reports = await screen.findByRole("button", { name: /Reports/ });
    expect(reports).toHaveAttribute("aria-expanded", "false");
    expect(reports).toHaveTextContent("0 of 2 on");
    expect(screen.getByText("Nothing switched on")).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Quarterly Report" })).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Leadership" })).toBeInTheDocument();         // no group
    expect(screen.queryByRole("button", { name: /Validators/ })).not.toBeInTheDocument();  // none in this catalogue
  });

  it("editing a plan opens the groups with modules on; closing shows what's on; switching off keeps it open", async () => {
    sparkPlans.get.mockResolvedValue(GOLD);
    renderEditor("/spark/subscriptions/plan_gold/edit");
    const reports = await screen.findByRole("button", { name: /Reports/ });
    expect(reports).toHaveAttribute("aria-expanded", "true");
    expect(reports).toHaveTextContent("1 of 2 on");

    fireEvent.click(reports);
    expect(screen.getByText("Quarterly Report · 4")).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Quarterly Report" })).not.toBeInTheDocument();

    fireEvent.click(reports);
    fireEvent.click(screen.getByRole("switch", { name: "Quarterly Report" }));             // last one off
    expect(reports).toHaveAttribute("aria-expanded", "true");
    expect(reports).toHaveTextContent("0 of 2 on");
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
      quote: { name: "Aizaz", phone: "+966 55 123 4567", message: "Two subsidiaries", enterprise_plan_id: "plan_ent",
               asked_by: "usr_a", asked_by_name: "Aizaz", asked_at: "" },
    });
    sparkPlans.update.mockResolvedValue({});
    renderEditor("/spark/subscriptions/plan_gold/edit");
    expect(await screen.findByText(/Their request:/)).toHaveTextContent("Their request: Aizaz · +966 55 123 4567 — “Two subsidiaries”");
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

describe("plan order on the client page", () => {
  it("Your plan first, then Made for you, then the rest cheapest first, Enterprise last", () => {
    const plan = (id: string, price: number | null, extra = {}) =>
      ({ ...GOLD, id, name: id, price, made_for_you: false, too_small: [], lost_modules: [], ...extra });
    const ordered = orderPlans([
      plan("enterprise", null, { duration: "enterprise" }),
      plan("standard", 150),
      plan("cheap", 50),
      plan("custom", 900, { made_for_you: true }),
      plan("starter", 66),
    ], "starter");
    expect(ordered.map((p) => p.id)).toEqual(["starter", "custom", "cheap", "standard", "enterprise"]);
  });
});

describe("SubscriptionPage", () => {
  beforeEach(() => {
    subscriptions.plans.mockResolvedValue({
      items: [
        { ...GOLD, made_for_you: false, too_small: [], lost_modules: [] },
        { ...GOLD, id: "plan_custom", name: "Custom plan for Aramco", duration: "quarterly", price: 9000, made_for_you: true,
          too_small: [], lost_modules: [] },
        { ...GOLD, id: "plan_small", name: "Starter", duration: "half_year", price: 66, made_for_you: false,
          too_small: ["You have 5 PMs; this plan allows 2."], lost_modules: [] },
        { ...GOLD, id: "plan_std", name: "Standard", duration: "yearly", price: 250, made_for_you: false,
          too_small: [], lost_modules: ["Board Report"] },
        { ...ENTERPRISE, made_for_you: false, too_small: [], lost_modules: [] },
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
    fireEvent.click((await screen.findAllByRole("button", { name: "Buy now" }))[0]);     // the plan made for them
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/admin-console/subscription/checkout"));
    const [body, key] = subscriptions.startCheckout.mock.calls[0];
    expect(body).toEqual({ plan_id: "plan_custom" });
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("Contact us opens the form with the card's contact and the admin's name filled in", async () => {
    renderSubscriptionPage();
    fireEvent.click(await screen.findByRole("button", { name: "Contact us" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("✉ sales@centriyon.com")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Aizaz Admin Aramco");
    expect(within(dialog).getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("a plan too small for the team shows why in a popup and can't be bought", async () => {
    renderSubscriptionPage();
    const starter = (await screen.findByText("Starter")).closest(".sub-pc") as HTMLElement;
    fireEvent.click(within(starter).getByRole("button", { name: "Buy now" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Starter is too small for your team")).toBeInTheDocument();
    expect(within(dialog).getByText("• You have 5 PMs; this plan allows 2.")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /payment/ })).not.toBeInTheDocument();
    expect(subscriptions.startCheckout).not.toHaveBeenCalled();
  });

  it("a plan missing a module asks to confirm, then sends accept_lost_modules", async () => {
    subscriptions.startCheckout.mockResolvedValue({ id: "chk_2" });
    renderSubscriptionPage();
    const standard = (await screen.findByText("Standard")).closest(".sub-pc") as HTMLElement;
    fireEvent.click(within(standard).getByRole("button", { name: "Buy now" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("• Board Report")).toBeInTheDocument();
    const go = within(dialog).getByRole("button", { name: "Continue to payment" });
    expect(go).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(go);
    await waitFor(() => expect(subscriptions.startCheckout).toHaveBeenCalledWith(
      { plan_id: "plan_std", accept_lost_modules: true }, expect.any(String)));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/admin-console/subscription/checkout"));
  });
});

describe("CheckoutPage", () => {
  const CHECKOUT = {
    ...LIMITS, id: "chk_1", plan_name: "Standard", billing_period: "half_year", price: 12000,
    starts_at: "2026-11-04", ends_at: "2027-05-03", status: "pending_payment", max_departments: 3,
    modules: ["quarterly_report", "leadership"], report_limits: { quarterly: 4 },
  };

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

  it("shows the steps, the plan, the period and what they get", () => {
    renderCheckout({ checkout: CHECKOUT, catalogue: CATALOGUE });
    expect(screen.getByText("Choose plan")).toBeInTheDocument();
    expect(screen.getByText("Payment").closest(".sub-co-step")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("per 6 months")).toBeInTheDocument();
    expect(screen.getByText("6 months")).toBeInTheDocument();                     // on the timeline
    expect(screen.getByText("3 May 2027")).toBeInTheDocument();
    expect(screen.getByText("✓ Quarterly Report · 4 reports")).toBeInTheDocument();
    expect(screen.getByText("✓ Leadership")).toBeInTheDocument();
    expect(screen.getByText("1 + 2")).toBeInTheDocument();                        // admin + PMs
    expect(screen.getByText("3 · 8")).toBeInTheDocument();                        // departments · users
    expect(screen.getByText("TEST MODE")).toBeInTheDocument();
    expect(screen.queryByText("Changing plan")).not.toBeInTheDocument();          // first subscription
  });

  it("when switching, shows the old plan and the modules they confirmed giving up", () => {
    renderCheckout({ checkout: CHECKOUT, catalogue: CATALOGUE, replaces: "Starter", switchedOff: ["Board Report"] });
    expect(screen.getByText("Changing plan")).toBeInTheDocument();
    expect(screen.getByText("Starter", { selector: ".old" })).toBeInTheDocument();
    expect(screen.getByText("✗ Board Report")).toBeInTheDocument();
    expect(screen.getByText(/Switched off \(you confirmed\):/)).toBeInTheDocument();
  });

  it("Pay activates it once, refreshes the login and shows the branded success popup", async () => {
    subscriptions.pay.mockResolvedValue({ ...CHECKOUT, status: "active" });
    renderCheckout({ checkout: CHECKOUT, catalogue: CATALOGUE });
    fireEvent.click(screen.getByRole("button", { name: "🔒 Pay $12,000" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Standard is active", { selector: ".sub-co-success h2" })).toBeInTheDocument();
    expect(subscriptions.pay).toHaveBeenCalledTimes(1);
    expect(refreshPermissions).toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Go to my subscription" }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/admin-console/subscription"));
  });

  it("shows the error and lets them try again when the payment fails", async () => {
    subscriptions.pay.mockRejectedValue(new Error("This checkout can't be paid any more. Start a new one."));
    renderCheckout({ checkout: CHECKOUT, catalogue: CATALOGUE });
    fireEvent.click(screen.getByRole("button", { name: "🔒 Pay $12,000" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("can't be paid any more");
    expect(screen.getByRole("button", { name: "🔒 Pay $12,000" })).toBeEnabled();
  });

  it("without a checkout (e.g. after a refresh) goes back to the plans", () => {
    renderCheckout(null);
    expect(screen.getByTestId("where")).toHaveTextContent("/admin-console/subscription");
  });
});

describe("QuoteForm (Contact us)", () => {
  function renderForm(onSent = vi.fn()) {
    render(<QuoteForm enterprisePlanId="plan_ent" contact={ENTERPRISE.contact} defaultName="Aizaz" onSent={onSent} onClose={vi.fn()} />);
    return onSent;
  }

  it("needs a name, a real phone number and a message before Send works", async () => {
    subscriptions.requestQuote.mockResolvedValue({});
    const onSent = renderForm();
    const send = screen.getByRole("button", { name: "Send" });
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "12" } });
    fireEvent.blur(screen.getByLabelText("Phone number"));
    expect(screen.getByText("Enter a valid phone number")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "+966 55 123 4567" } });
    expect(send).toBeDisabled();                                    // no message yet
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "All modules, 3 subsidiaries" } });
    fireEvent.click(send);
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(subscriptions.requestQuote).toHaveBeenCalledWith({
      plan_id: "plan_ent", name: "Aizaz", phone: "+966 55 123 4567", message: "All modules, 3 subsidiaries",
    });
    expect(screen.getByText("Request sent")).toBeInTheDocument();
  });

  it("shows the server's answer when a request is already open", async () => {
    subscriptions.requestQuote.mockRejectedValue(new Error("You already asked for a quote on 2026-11-01."));
    renderForm();
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "+966 55 123 4567" } });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("You already asked for a quote on 2026-11-01.")).toBeInTheDocument();
  });
});

describe("SparkQuotesPage", () => {
  it("lists each request's name, phone and message, with Make a plan", async () => {
    sparkPlans.list.mockResolvedValue({
      items: [{ ...GOLD, id: "q1", status: "draft", company_id: "c1", company_name: "Aramco", modules: [],
                quote: { name: "Aizaz", phone: "+966 55 123 4567", message: "All modules please", enterprise_plan_id: "plan_ent",
                         asked_by: "usr_a", asked_by_name: "Aizaz", asked_at: "2026-11-04T10:00:00Z" } }],
      total: 1, page: 1, limit: 10, modules_catalogue: CATALOGUE,
    });
    render(
      <MemoryRouter initialEntries={["/spark/quotes"]}>
        <Routes>
          <Route path="/spark/quotes" element={<SparkQuotesPage />} />
          <Route path="/spark/subscriptions/:planId/edit" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("+966 55 123 4567")).toBeInTheDocument();
    expect(screen.getByText("All modules please")).toBeInTheDocument();
    expect(screen.getByText("Needs a plan", { selector: "span" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Make a plan" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/spark/subscriptions/q1/edit");
  });
});

describe("module list past 15 modules", () => {
  it("scrolls inside the card: the list loses what the card is too tall, never below 120px", () => {
    expect(scrollingListHeight(500, 800, 600)).toBe(300);
    expect(scrollingListHeight(300, 900, 400)).toBe(120);
  });
});
