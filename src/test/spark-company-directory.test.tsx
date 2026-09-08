// The directory is the only page a Spark user sees before choosing a company,
// so what matters is: it lists clients with the one metric asked for (cycle
// count — explicitly no status and no progress bars), picking one SETS the
// acting company before navigating (get that order wrong and the dashboard
// loads against a NULL company), and a company created here goes to setup
// rather than to a dashboard with nothing in it.
//
// Yours/All is a SERVER filter, one request per tab, so the tests here are about
// what is asked for and what is rendered from the answer — not about filtering a
// list in the browser. That is also why the stat tiles can be trusted to match
// the rows: they are computed from the same response.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const companies = vi.fn();
const createCompany = vi.fn();
const switchCompany = vi.fn();
const leaveCompany = vi.fn();
let actingCompany: { id: string; name: string } | null = null;
const navigate = vi.fn();

vi.mock("@/lib/api", () => ({
  sparkInternal: {
    companies: (opts: unknown) => companies(opts),
    createCompany: (body: unknown) => createCompany(body),
  },
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { role: "spark_internal" },
    switchCompany,
    leaveCompany,
    get actingCompany() {
      return actingCompany;
    },
  }),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
}));

const { default: SparkCompaniesPage } = await import("@/pages/spark/CompaniesPage");

const ROWS = [
  { id: "cmp_1", name: "Acme Corporation", cycle_count: 4 },
  { id: "cmp_2", name: "Bahri", cycle_count: 0 },
];

const STATS = {
  companies: 2,
  active_cycles: 3,
  active_client_count: 1,
  past_deadline: 2,
  oldest_overdue_days: 12,
  due_soon: 1,
  next_due: { company_name: "Acme Corporation", date: "2026-09-21" },
};

describe("Spark company directory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actingCompany = null;
    companies.mockResolvedValue({ companies: ROWS, total: 2, stats: STATS });
  });

  it("drops the acting company when arriving with one still set", async () => {
    // Browser-back and a typed URL can land here from inside a client; no click
    // handler can cover those, so the page clears on mount as a catch-all.
    actingCompany = { id: "cmp_1", name: "Acme Corporation" };
    render(<SparkCompaniesPage />);
    await screen.findByText("Acme Corporation");
    expect(leaveCompany).toHaveBeenCalled();
  });

  it("does not clear the company it just set when a row is clicked", async () => {
    // The catch-all is mount-only for exactly this reason: keyed on
    // actingCompany it would fire the moment a row set it and wipe the
    // selection before the navigate landed.
    render(<SparkCompaniesPage />);
    fireEvent.click(await screen.findByText("Acme Corporation"));
    expect(switchCompany).toHaveBeenCalled();
    expect(leaveCompany).not.toHaveBeenCalled();
  });

  it("lists every company with its cycle count", async () => {
    render(<SparkCompaniesPage />);
    expect(await screen.findByText("Acme Corporation")).toBeInTheDocument();
    expect(screen.getByText("Bahri")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    // A client who hasn't started still belongs in the directory, shown as words
    // rather than a bare 0 so the column reads as a state, not a score.
    expect(screen.getByText("Not started")).toBeInTheDocument();
  });

  it("renders the four headline numbers from the server, not from the rows", async () => {
    render(<SparkCompaniesPage />);
    // "client workspaces" is the Companies tile's hint — unique, unlike the
    // label itself, which collides with the page heading.
    await screen.findByText("client workspaces");
    expect(screen.getByText("Active cycles")).toBeInTheDocument();
    expect(screen.getByText("across 1 client")).toBeInTheDocument();
    expect(screen.getByText("Past deadline")).toBeInTheDocument();
    expect(screen.getByText("oldest 12 days over")).toBeInTheDocument();
    expect(screen.getByText("Due in 30 days")).toBeInTheDocument();
    expect(screen.getByText(/next: Acme Corporation/)).toBeInTheDocument();
  });

  it("says so plainly when nothing is overdue or due", async () => {
    companies.mockResolvedValue({
      companies: ROWS,
      total: 2,
      stats: { ...STATS, past_deadline: 0, due_soon: 0, next_due: null },
    });
    render(<SparkCompaniesPage />);
    expect(await screen.findByText("nothing overdue")).toBeInTheDocument();
    expect(screen.getByText("nothing due")).toBeInTheDocument();
  });

  it("opens on Yours, and asks the server for it", async () => {
    render(<SparkCompaniesPage />);
    await screen.findByText("Acme Corporation");
    expect(companies).toHaveBeenCalledWith({ mine: true });
  });

  it("re-asks for the whole platform when All is picked", async () => {
    // Not a view of one list: the tab decides what is fetched, which is what
    // lets the tiles above the table describe the rows in it.
    render(<SparkCompaniesPage />);
    await screen.findByText("Acme Corporation");

    companies.mockResolvedValue({
      companies: [...ROWS, { id: "cmp_3", name: "Zed Holdings", cycle_count: 1 }],
      total: 3,
      stats: { ...STATS, companies: 3 },
    });
    fireEvent.click(screen.getByText("All"));

    expect(await screen.findByText("Zed Holdings")).toBeInTheDocument();
    expect(companies).toHaveBeenLastCalledWith({ mine: false });
  });

  it("says so plainly when you have not added anything yet", async () => {
    // The default tab, so an empty one is the first thing a new Spark user sees.
    // "Try a different filter or search" would be wrong advice for it.
    companies.mockResolvedValue({ companies: [], total: 0, stats: { ...STATS, companies: 0 } });
    render(<SparkCompaniesPage />);
    expect(await screen.findByText("You haven't added any companies")).toBeInTheDocument();
    expect(screen.getByText(/switch to All to see every client/)).toBeInTheDocument();
  });

  it("shows no status or progress for a company", async () => {
    const { container } = render(<SparkCompaniesPage />);
    await screen.findByText("Acme Corporation");
    expect(screen.queryByText(/progress/i)).not.toBeInTheDocument();
    // No per-company status pill and no bar. Scoped to the table so the tab
    // controls above it can never satisfy the assertion by accident.
    expect(container.querySelector("table .badge")).toBeNull();
    expect(container.querySelector("table progress")).toBeNull();
  });

  it("switches into the company BEFORE navigating, and goes to its annual report", async () => {
    render(<SparkCompaniesPage />);
    fireEvent.click(await screen.findByText("Acme Corporation"));
    expect(switchCompany).toHaveBeenCalledWith({ id: "cmp_1", name: "Acme Corporation" });
    // The annual report is what this role exists to run — not the Command Center.
    expect(navigate).toHaveBeenCalledWith("/annual-report");
    // Order matters: navigating first would load the dashboard with no company.
    expect(switchCompany.mock.invocationCallOrder[0])
      .toBeLessThan(navigate.mock.invocationCallOrder[0]);
  });

  it("filters by search", async () => {
    render(<SparkCompaniesPage />);
    await screen.findByText("Acme Corporation");
    fireEvent.change(screen.getByPlaceholderText("Search company"), {
      target: { value: "bah" },
    });
    expect(screen.queryByText("Acme Corporation")).not.toBeInTheDocument();
    expect(screen.getByText("Bahri")).toBeInTheDocument();
  });

  it("sends a new company straight to setup, already switched in", async () => {
    createCompany.mockResolvedValue({ company: { id: "cmp_new", name: "Fresh Co" } });
    render(<SparkCompaniesPage />);
    fireEvent.click(await screen.findByText("+ Add company"));
    fireEvent.change(screen.getByPlaceholderText("Acme Corporation"), {
      target: { value: "Fresh Co" },
    });
    fireEvent.click(screen.getByText("Create and set up →"));

    await waitFor(() => expect(switchCompany).toHaveBeenCalledWith({
      id: "cmp_new",
      name: "Fresh Co",
    }));
    // Onboarding, not the dashboard — a brand-new company has nothing to show.
    expect(navigate).toHaveBeenCalledWith("/onboarding");
  });

  it("refuses an empty company name without calling the API", async () => {
    render(<SparkCompaniesPage />);
    fireEvent.click(await screen.findByText("+ Add company"));
    fireEvent.click(screen.getByText("Create and set up →"));
    expect(await screen.findByText("Company name is required.")).toBeInTheDocument();
    expect(createCompany).not.toHaveBeenCalled();
  });

  it("surfaces a load failure instead of rendering an empty directory", async () => {
    companies.mockRejectedValue(new Error("Backend down"));
    render(<SparkCompaniesPage />);
    expect(await screen.findByText("Backend down")).toBeInTheDocument();
  });
});
