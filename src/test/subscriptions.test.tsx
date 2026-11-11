// Cloud subscriptions v2: the pricing cards, spark_admin's plan editor page
// (Enterprise, reports ≥ 1, department cards, "who gets new limits"), the
// client's Subscription page (Buy now / Contact us), payment and quote form.
// Plan: Centriton/.claude/plans/cloud-subscriptions-v2-redesign.md

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const refreshPermissions = vi.fn().mockResolvedValue(undefined);
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ refreshPermissions, user: { full_name: "Aizaz Admin Aramco" } }),
}));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const sparkPlans = { get: vi.fn(), create: vi.fn(), update: vi.fn(), subscribers: vi.fn(), list: vi.fn(), remove: vi.fn(), companies: vi.fn(), sendOffer: vi.fn(), approveOffer: vi.fn() };
const subscriptions = { plans: vi.fn(), current: vi.fn(), startCheckout: vi.fn(), pay: vi.fn(), requestQuote: vi.fn() };
vi.mock("@/lib/api", () => ({ sparkPlans, subscriptions }));

const { default: SparkPlanEditorPage, limitsChanged } = await import("@/pages/spark/SparkPlanEditorPage");
const { default: SparkSubscriptionsPage } = await import("@/pages/spark/SparkSubscriptionsPage");
const { peopleTotal, departmentUsersTotal, resizeDepartments } = await import("@/components/subscriptions/PlanFields");
const { CardStrip, PlanCard, fitScale, scrollingListHeight } = await import("@/components/subscriptions/PlanCard");
const { default: SparkQuotesPage } = await import("@/pages/spark/SparkQuotesPage");
const { QuoteForm } = await import("@/components/subscriptions/QuoteForm");
const { default: SubscriptionPage, orderPlans } = await import("@/pages/admin/SubscriptionPage");
const { default: CheckoutPage } = await import("@/pages/admin/CheckoutPage");
const { offerAddedUp } = await import("@/components/subscriptions/OfferBreakdown");

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
    // Published asks for all plans for every company (the slider shows them), cheapest first.
    expect(sparkPlans.list).toHaveBeenCalledWith(expect.objectContaining({ kind: "public", status: "published", limit: 100 }));
  });

  it("shows all the plans in the slider (no pager) and sends the duration chip to the server with Enterprise", async () => {
    sparkPlans.list.mockResolvedValue(page([GOLD, GOLD, GOLD, GOLD, GOLD].map((p, i) => ({ ...p, id: `p${i}`, name: `Plan ${i}` })), 5));
    renderPage();
    expect(await screen.findByRole("button", { name: "Plan 4" })).toBeInTheDocument();
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next ›" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Quarterly" }));
    await waitFor(() => expect(sparkPlans.list).toHaveBeenCalledWith(
      expect.objectContaining({ duration: "quarterly", with_enterprise: true, limit: 100 })));
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
    expect(sparkPlans.list).toHaveBeenCalledWith(expect.objectContaining({ kind: "custom", company_id: "cmp_a", limit: 100 }));

    fireEvent.click(screen.getByText("BUPA"));
    await waitFor(() => expect(sparkPlans.list).toHaveBeenCalledWith(expect.objectContaining({ company_id: "cmp_b" })));
    expect(screen.getByText("Custom plans for BUPA")).toBeInTheDocument();
  });

  it("Custom plans: an emailed offer's card says Offer sent and can be approved; a new quote's can't", async () => {
    const quote = { name: "Aizaz", phone: "+966 55 123 4567", message: "x", enterprise_plan_id: "plan_ent",
                    asked_by: "usr_a", asked_by_name: "Aizaz", asked_at: "" };
    const emailed = { ...GOLD, id: "plan_sent", name: "Offer for Aramco", company_id: "cmp_a", company_name: "Aramco",
                      status: "draft" as const, offer_state: "sent" as const,
                      quote: { ...quote, offer: { sent_at: "2026-11-09T10:00:00Z", sent_to: ["admin@aramco.test"] } } };
    const fresh = { ...GOLD, id: "plan_new", name: "New quote for Aramco", company_id: "cmp_a", company_name: "Aramco",
                    status: "draft" as const, offer_state: "received" as const, quote };
    sparkPlans.list.mockImplementation((query: { limit?: number; company_id?: string }) =>
      Promise.resolve(query.limit === 1 ? page([], 2) : query.company_id === "cmp_a" ? page([emailed, fresh]) : page([GOLD])));
    sparkPlans.companies.mockResolvedValue({
      items: [{ company_id: "cmp_a", company_name: "Aramco", plans: 2, published: 0, drafts: 2 }], total: 1, page: 1, limit: 10,
    });
    sparkPlans.approveOffer.mockResolvedValue({});
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: /Custom plans/ }));

    const newCard = await screen.findByRole("button", { name: "New quote for Aramco" });
    expect(within(newCard).getByText("Draft")).toBeInTheDocument();
    fireEvent.click(newCard);
    expect(screen.queryByRole("button", { name: "✓ Approve" })).not.toBeInTheDocument();   // not emailed yet

    const sentCard = screen.getByRole("button", { name: "Offer for Aramco" });
    expect(within(sentCard).getByText("Offer sent")).toBeInTheDocument();
    fireEvent.click(sentCard);
    fireEvent.click(screen.getByRole("button", { name: "✓ Approve" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Approve this plan for Aramco?");
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(sparkPlans.approveOffer).toHaveBeenCalledWith("plan_sent"));
    expect(toast).toHaveBeenCalledWith({ title: "Approved — Aramco can subscribe now" });
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

  const QUOTE = {
    ...GOLD, status: "draft" as const, price: null, company_id: "c1", company_name: "Aramco", offer_state: "received" as const,
    quote: { name: "Aizaz", phone: "+966 55 123 4567", message: "Two subsidiaries", enterprise_plan_id: "plan_ent",
             asked_by: "usr_a", asked_by_name: "Aizaz", asked_at: "" },
  };

  it("opens a quote as an Enterprise offer: prices add up, the offer is emailed, the page stays", async () => {
    sparkPlans.get.mockResolvedValue({ ...QUOTE, company_admin_emails: ["admin@aramco.test"] });
    sparkPlans.update.mockResolvedValue({});
    sparkPlans.sendOffer.mockResolvedValue({ ...QUOTE, quote: { ...QUOTE.quote, offer: { sent_at: "2026-11-09T10:00:00Z", sent_to: ["admin@aramco.test", "cfo@aramco.test"] } } });
    renderEditor("/spark/subscriptions/plan_gold/edit");
    expect(await screen.findByText(/Their request:/)).toHaveTextContent("Their request: Aizaz · +966 55 123 4567 — “Two subsidiaries”");
    expect(screen.getByRole("option", { name: "Enterprise · 1 year" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Publish/ })).not.toBeInTheDocument();

    // Quarterly: 4 reports × $500; Users $300; Departments $200 → $2,500.
    fireEvent.change(screen.getByLabelText("Quarterly Report price per report"), { target: { value: "500" } });
    fireEvent.change(screen.getByLabelText("Price for the users"), { target: { value: "300" } });
    fireEvent.change(screen.getByLabelText("Price for the departments"), { target: { value: "200" } });
    expect(screen.getByLabelText(/Price \(USD\)/)).toHaveValue("2500");

    // The popup starts with the company's admin; a second email can be added.
    fireEvent.click(screen.getByRole("button", { name: "✉ Send offer" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("admin@aramco.test")).toBeInTheDocument();
    expect(within(dialog).getByText(/Reply to this email to accept the offer/)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("To"), { target: { value: "cfo@aramco.test" } });
    fireEvent.keyDown(within(dialog).getByLabelText("To"), { key: "Enter" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send offer" }));

    await waitFor(() => expect(sparkPlans.sendOffer).toHaveBeenCalledWith("plan_gold", {
      recipients: ["admin@aramco.test", "cfo@aramco.test"], subject: "Your Enterprise offer from Centriyon",
    }));
    expect(sparkPlans.update).toHaveBeenCalledWith("plan_gold", expect.objectContaining({
      status: "draft", price: null, offer_prices: { modules: { quarterly_report: 500 }, users: 300, departments: 200 },
    }));
    expect(toast).toHaveBeenCalledWith({ title: "Offer emailed to admin@aramco.test, cfo@aramco.test" });
    expect(await screen.findByText(/Offer sent 2026-11-09 to admin@aramco.test, cfo@aramco.test/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "✓ Approve for Aramco" })).toBeEnabled();   // appears once it's emailed
  });

  it("a save that fails while sending shows its error in the popup, and nothing is emailed", async () => {
    sparkPlans.get.mockResolvedValue({ ...QUOTE, company_admin_emails: ["admin@aramco.test"] });
    sparkPlans.update.mockRejectedValue(new Error("There's already a plan called Gold. Choose another name."));
    renderEditor("/spark/subscriptions/plan_gold/edit");
    fireEvent.click(await screen.findByRole("button", { name: "✉ Send offer" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Send offer" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("There's already a plan called Gold. Choose another name.");
    expect(sparkPlans.sendOffer).not.toHaveBeenCalled();
  });

  it("shows the client's current plan as small 'Current' words in the cards", async () => {
    sparkPlans.get.mockResolvedValue({ ...QUOTE, current_plan: {
      name: "QA Fit Plus", ends_at: "2027-11-08", modules: ["quarterly_report", "leadership"], report_limits: { quarterly: 2 },
      max_pms: 2, max_ir_users: 6, department_sizes: [3, 3, 3, 3] } });
    renderEditor("/spark/subscriptions/plan_gold/edit");
    expect(await screen.findByText(/Their request:/)).toHaveTextContent("Current plan: QA Fit Plus (ends 2027-11-08)");
    expect(screen.getByRole("switch", { name: "Quarterly Report" })).toHaveTextContent("Current: 2 reports");
    expect(screen.getByRole("switch", { name: "Leadership" })).toHaveTextContent("Current: included");
    expect(screen.getByRole("switch", { name: "Earnings Report" })).not.toHaveTextContent("Current");   // not in their plan
    expect(screen.getByText("Project managers (PMs)")).toHaveTextContent("current 2");
    expect(screen.getByText("IR users", { selector: "span" })).toHaveTextContent("current 6");
    expect(screen.getByText("Number of departments")).toHaveTextContent("current 4");
    expect(screen.getByText("Department 1")).toHaveTextContent("current 3");
  });

  it("a new offer with nothing on still opens the group of a current module, so its 'Current' words show", async () => {
    sparkPlans.get.mockResolvedValue({ ...QUOTE, modules: [], report_limits: {}, current_plan: {
      name: "Standard", ends_at: "2027-02-08", modules: ["quarterly_report"], report_limits: { quarterly: 3 },
      max_pms: 10, max_ir_users: 10, department_sizes: [1] } });
    renderEditor("/spark/subscriptions/plan_gold/edit");
    const tile = await screen.findByRole("switch", { name: "Quarterly Report" });
    expect(tile).toHaveAttribute("aria-checked", "false");          // still off: only shown, not switched on
    expect(tile).toHaveTextContent("Current: 3 reports");
    expect(within(tile).getByText("Current: 3 reports")).toHaveClass("cur");   // blue, so it stands out
  });

  it("no 'Current' words when the client has no plan", async () => {
    sparkPlans.get.mockResolvedValue({ ...QUOTE, current_plan: null });
    renderEditor("/spark/subscriptions/plan_gold/edit");
    expect(await screen.findByText(/Their request:/)).not.toHaveTextContent("Current plan");
    expect(screen.queryByText(/current \d/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Current:/)).not.toBeInTheDocument();
  });

  it("a wrong email can't be sent", async () => {
    sparkPlans.get.mockResolvedValue({ ...QUOTE, company_admin_emails: [] });
    renderEditor("/spark/subscriptions/plan_gold/edit");
    fireEvent.click(await screen.findByRole("button", { name: "✉ Send offer" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Add at least one email.")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("To"), { target: { value: "not-an-email" } });
    fireEvent.keyDown(within(dialog).getByLabelText("To"), { key: "Enter" });
    expect(within(dialog).getByText("not-an-email isn't an email address.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Send offer" })).toBeDisabled();
  });

  it("Approve isn't there until the offer is emailed — only Send offer", async () => {
    sparkPlans.get.mockResolvedValue(QUOTE);
    renderEditor("/spark/subscriptions/plan_gold/edit");
    expect(await screen.findByRole("button", { name: "✉ Send offer" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "✓ Approve for Aramco" })).not.toBeInTheDocument();
  });

  it("Approve publishes an emailed offer for the company after a confirm", async () => {
    sparkPlans.get.mockResolvedValue({ ...QUOTE, offer_state: "sent",
      quote: { ...QUOTE.quote, offer: { sent_at: "2026-11-09T10:00:00Z", sent_to: ["admin@aramco.test"] } } });
    sparkPlans.update.mockResolvedValue({});
    sparkPlans.approveOffer.mockResolvedValue({});
    renderEditor("/spark/subscriptions/plan_gold/edit");
    fireEvent.click(await screen.findByRole("button", { name: "✓ Approve for Aramco" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Approve this plan for Aramco?");
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(sparkPlans.approveOffer).toHaveBeenCalledWith("plan_gold"));
    expect(toast).toHaveBeenCalledWith({ title: "Approved — Aramco can subscribe now" });
  });

  it("changing an emailed offer hides Approve until it's sent again", async () => {
    sparkPlans.get.mockResolvedValue({ ...QUOTE, offer_state: "sent",
      quote: { ...QUOTE.quote, offer: { sent_at: "2026-11-09T10:00:00Z", sent_to: ["admin@aramco.test"] } } });
    renderEditor("/spark/subscriptions/plan_gold/edit");
    expect(await screen.findByRole("button", { name: "✓ Approve for Aramco" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Price for the users"), { target: { value: "999" } });
    expect(screen.queryByRole("button", { name: "✓ Approve for Aramco" })).not.toBeInTheDocument();
    expect(screen.getByText(/Changed since you emailed it on 2026-11-09 — send the offer again/)).toBeInTheDocument();
    // Typing the old number back = what the client saw: Approve is back.
    fireEvent.change(screen.getByLabelText("Price for the users"), { target: { value: "0" } });
    expect(screen.getByRole("button", { name: "✓ Approve for Aramco" })).toBeInTheDocument();
  });

  it("an offer saved with changes after sending opens without Approve", async () => {
    sparkPlans.get.mockResolvedValue({ ...QUOTE, offer_state: "changed",
      quote: { ...QUOTE.quote, offer: { sent_at: "2026-11-09T10:00:00Z", changed_at: "2026-11-09T11:00:00Z", sent_to: ["admin@aramco.test"] } } });
    renderEditor("/spark/subscriptions/plan_gold/edit");
    expect(await screen.findByText(/send the offer again/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "✓ Approve for Aramco" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "✉ Send offer" })).toBeEnabled();
  });

  it("a typed total replaces the added-up one, and the preview shows both", async () => {
    sparkPlans.get.mockResolvedValue({ ...QUOTE, quote: { ...QUOTE.quote, prices: { modules: { quarterly_report: 500 }, users: 0, departments: 0 } } });
    renderEditor("/spark/subscriptions/plan_gold/edit");
    const price = await screen.findByLabelText(/Price \(USD\)/);
    expect(price).toHaveValue("2000");
    fireEvent.change(price, { target: { value: "1800" } });
    expect(screen.getByText("Added up").nextSibling).toHaveTextContent("$2,000");
    expect(screen.getByText(/^Your price/).nextSibling).toHaveTextContent("$1,800");
  });

  it("adds up reports × price per report, flat prices and the two cards", () => {
    const limits = { ...LIMITS, modules: ["quarterly_report", "leadership"] };
    const prices = { modules: { quarterly_report: 500, leadership: 1500, earnings_report: 99 }, users: 3000, departments: 4000 };
    expect(offerAddedUp(limits, prices, CATALOGUE)).toBe(4 * 500 + 1500 + 3000 + 4000);
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
  it("lists each request's name, phone and message, with Make offer", async () => {
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
    expect(screen.getByText("Quote received", { selector: "span" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Make offer" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/spark/subscriptions/q1/edit");
  });

  it("shows an emailed offer with who it went to, and approves it from the list", async () => {
    sparkPlans.list.mockResolvedValue({
      items: [{ ...GOLD, id: "q2", status: "draft", company_id: "c1", company_name: "Aramco", offer_state: "sent",
                quote: { name: "Aizaz", phone: "+966 55 123 4567", message: "All modules please", enterprise_plan_id: "plan_ent",
                         asked_by: "usr_a", asked_by_name: "Aizaz", asked_at: "2026-11-04T10:00:00Z",
                         offer: { sent_at: "2026-11-05T09:00:00Z", sent_to: ["admin@aramco.test"] } } }],
      total: 1, page: 1, limit: 10, modules_catalogue: CATALOGUE,
    });
    sparkPlans.approveOffer.mockResolvedValue({});
    render(<MemoryRouter><SparkQuotesPage /></MemoryRouter>);
    expect(await screen.findByText("Offer sent", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Emailed 2026-11-05 to admin@aramco.test")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit offer" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "✓ Approve" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(sparkPlans.approveOffer).toHaveBeenCalledWith("q2"));
    expect(toast).toHaveBeenCalledWith({ title: "Approved — Aramco can subscribe now" });
  });

  it("an offer changed since it was emailed says send again and can't be approved from the list", async () => {
    sparkPlans.list.mockResolvedValue({
      items: [{ ...GOLD, id: "q4", status: "draft", company_id: "c1", company_name: "Aramco", offer_state: "changed",
                quote: { name: "Aizaz", phone: "+966 55 123 4567", message: "x", enterprise_plan_id: "plan_ent",
                         asked_by: "usr_a", asked_by_name: "Aizaz", asked_at: "2026-11-04T10:00:00Z",
                         offer: { sent_at: "2026-11-05T09:00:00Z", changed_at: "2026-11-06T09:00:00Z", sent_to: ["admin@aramco.test"] } } }],
      total: 1, page: 1, limit: 10, modules_catalogue: CATALOGUE,
    });
    render(<MemoryRouter><SparkQuotesPage /></MemoryRouter>);
    expect(await screen.findByText("Changed — send again", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit offer" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "✓ Approve" })).not.toBeInTheDocument();
  });

  it("deletes a quote after a confirm", async () => {
    sparkPlans.list.mockResolvedValue({
      items: [{ ...GOLD, id: "q3", status: "draft", company_id: "c1", company_name: "Aramco", offer_state: "received",
                quote: { name: "Aizaz", phone: "+966 55 123 4567", message: "x", enterprise_plan_id: "plan_ent",
                         asked_by: "usr_a", asked_by_name: "Aizaz", asked_at: "2026-11-04T10:00:00Z" } }],
      total: 1, page: 1, limit: 10, modules_catalogue: CATALOGUE,
    });
    sparkPlans.remove.mockResolvedValue({ result: "deleted", companies_on_it: 0 });
    render(<MemoryRouter><SparkQuotesPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    // A new quote has no offer for the client yet, so it can't be approved.
    expect(screen.queryByRole("button", { name: "✓ Approve" })).not.toBeInTheDocument();
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(sparkPlans.remove).toHaveBeenCalledWith("q3"));
  });
});

describe("module list past 15 modules", () => {
  it("scrolls inside the card: the list loses what the card is too tall, never below 120px", () => {
    expect(scrollingListHeight(500, 800, 600)).toBe(300);
    expect(scrollingListHeight(300, 900, 400)).toBe(120);
  });
});


// ── The slider ───────────────────────────────────────────────────────

describe("CardStrip (the plan slider)", () => {
  // jsdom lays nothing out, so give the strip a size: 3 of 5 cards fit.
  function fakeLayout() {
    const sizes = { scrollWidth: 1280, clientWidth: 760, clientHeight: 600 };
    const restore: (() => void)[] = [];
    for (const [key, value] of Object.entries(sizes)) {
      const before = Object.getOwnPropertyDescriptor(HTMLElement.prototype, key);
      Object.defineProperty(HTMLElement.prototype, key, { configurable: true, get() { return this.classList?.contains("sub-strip") ? value : 0; } });
      // These sizes live on Element.prototype, so removing ours brings the real ones back.
      restore.push(() => {
        if (before) Object.defineProperty(HTMLElement.prototype, key, before);
        else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
      });
    }
    const scrollBy = vi.fn();
    const scrollTo = vi.fn();
    Object.assign(HTMLElement.prototype, { scrollBy, scrollTo });
    return { scrollBy, scrollTo, restore: () => restore.forEach((r) => r()) };
  }

  function strip(props: { paused?: boolean } = {}) {
    return render(
      <CardStrip {...props}>
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="sub-pc">Card {i}</div>)}
      </CardStrip>,
    );
  }

  it("shows the next arrow and one dot per card when they don't all fit, and dots jump to a card", () => {
    const layout = fakeLayout();
    strip();
    expect(screen.getByRole("button", { name: "More plans" })).not.toHaveClass("hide");
    expect(screen.getByRole("button", { name: "Previous plans" })).toHaveClass("hide");   // at the start
    expect(screen.getAllByRole("button", { name: /Go to plan/ })).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Go to plan 4" }));
    expect(layout.scrollTo).toHaveBeenCalled();
    layout.restore();
  });

  it("slides by itself every 4 seconds, but not while the mouse is over it or a card is selected", () => {
    vi.useFakeTimers();
    const layout = fakeLayout();
    const { container, rerender } = strip();
    act(() => { vi.advanceTimersByTime(4000); });
    expect(layout.scrollBy).toHaveBeenCalledTimes(1);

    fireEvent.mouseEnter(container.querySelector(".sub-strip-wrap") as HTMLElement);
    act(() => { vi.advanceTimersByTime(8000); });
    expect(layout.scrollBy).toHaveBeenCalledTimes(1);                 // hovering: still
    fireEvent.mouseLeave(container.querySelector(".sub-strip-wrap") as HTMLElement);

    rerender(<CardStrip paused>{[0, 1, 2, 3, 4].map((i) => <div key={i} className="sub-pc">Card {i}</div>)}</CardStrip>);
    act(() => { vi.advanceTimersByTime(8000); });
    expect(layout.scrollBy).toHaveBeenCalledTimes(1);                 // a card is selected: still
    layout.restore();
    vi.useRealTimers();
  });

  it("waits 8 seconds after someone moves it before sliding again", () => {
    vi.useFakeTimers();
    const layout = fakeLayout();
    strip();
    fireEvent.click(screen.getByRole("button", { name: "More plans" }));
    expect(layout.scrollBy).toHaveBeenCalledTimes(1);                 // the click itself
    act(() => { vi.advanceTimersByTime(7900); });
    expect(layout.scrollBy).toHaveBeenCalledTimes(1);                 // still quiet
    act(() => { vi.advanceTimersByTime(200); });                      // the 8 seconds are over...
    act(() => { vi.advanceTimersByTime(4000); });                     // ...then one normal wait
    expect(layout.scrollBy).toHaveBeenCalledTimes(2);
    layout.restore();
    vi.useRealTimers();
  });

  it("has no arrows, dots or auto-slide when every card fits", () => {
    vi.useFakeTimers();
    const scrollBy = vi.fn();
    Object.assign(HTMLElement.prototype, { scrollBy });
    strip();
    expect(screen.queryByRole("button", { name: /Go to plan/ })).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(8000); });
    expect(scrollBy).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

// ── Client: no offer card (only Spark decides) ───────────────────────

describe("Subscription page — offers", () => {
  it("shows plans only: an offer waiting for Spark's approval isn't there", async () => {
    subscriptions.plans.mockResolvedValue({ items: [], modules_catalogue: CATALOGUE });
    subscriptions.current.mockResolvedValue({ status: "none", reason: null, subscription: null });
    render(<MemoryRouter><SubscriptionPage /></MemoryRouter>);
    expect(await screen.findByText("No plans are available yet. Please check back soon.")).toBeInTheDocument();
    expect(screen.queryByText("New offer")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "✓ Approve" })).not.toBeInTheDocument();
  });
});

// ── Compliance Validation counts validations (2026-11-09) ────────────

describe("Compliance Validation is counted in validations", () => {
  const WITH_COMPLIANCE = [...CATALOGUE, { key: "compliance_validation", label: "Compliance Validation", report_type: "compliance_validation" }];

  it("the plan card says validations", () => {
    const plan = { ...LIMITS, name: "Gold", duration: "yearly" as const, price: 1, contact: null,
                   modules: ["compliance_validation"], report_limits: { compliance_validation: 10 } };
    render(<PlanCard plan={plan} position={0} catalogue={WITH_COMPLIANCE} />);
    expect(screen.getByText("Compliance Validation · 10 validations")).toBeInTheDocument();
  });

  it("the module tile has a validations stepper instead of Included", async () => {
    const { ModulesCard } = await import("@/components/subscriptions/PlanFields");
    const value = { ...LIMITS, modules: ["compliance_validation"], report_limits: { compliance_validation: 3 } };
    render(<ModulesCard value={value} onChange={vi.fn()} catalogue={WITH_COMPLIANCE} />);
    expect(screen.getByLabelText("Compliance Validation validations")).toHaveValue("3");
    expect(screen.getByText("Validations per plan period")).toBeInTheDocument();
    expect(screen.queryByText("Included")).not.toBeInTheDocument();
  });
});
