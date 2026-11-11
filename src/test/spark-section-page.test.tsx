// /spark/:section — the three lists. Worth pinning:
//   1. Users and reports must be grouped under the company they belong to; an
//      ungrouped flat list looks fine and is the wrong screen.
//   2. Each section fetches only its own endpoint — arriving at /spark/users
//      must not also pull every report on the platform.
//   3. An unknown section is a typo or a stale link, not an error screen.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const overview = vi.fn();
const listUsers = vi.fn();
const listReports = vi.fn();

const COMPANIES = [
  { id: "c1", name: "Aramco", user_count: 2, report_count: 1, jurisdiction: "KSA" },
  { id: "c2", name: "Zain KSA", user_count: 1, report_count: 0 },
];

const USERS = [
  { user_id: "u1", full_name: "Sara Haddad", email: "sara@aramco.com", role: "admin", status: "active", company_id: "c1", company_name: "Aramco" },
  { user_id: "u2", full_name: "Omar Nasser", email: "omar@zain.com", role: "ir", status: "invited", company_id: "c2", company_name: "Zain KSA" },
  { user_id: "u3", full_name: "Lina Farah", email: "lina@aramco.com", role: "ir", status: "active", company_id: "c1", company_name: "Aramco" },
];

vi.mock("@/lib/api", () => ({
  spark: {
    overview: () => overview(),
    listUsers: () => listUsers(),
    listReports: () => listReports(),
  },
}));

const { default: SparkSectionPage } = await import("@/pages/spark/SparkSectionPage");

const landOn = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/spark" element={<div>OVERVIEW</div>} />
        <Route path="/spark/:section" element={<SparkSectionPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe("Spark section page", () => {
  beforeEach(() => {
    overview.mockReset().mockResolvedValue({
      total_companies: 2,
      total_reports: 1,
      total_users: 3,
      companies: COMPANIES,
    });
    listUsers.mockReset().mockResolvedValue(USERS);
    listReports.mockReset().mockResolvedValue([]);
  });

  it("groups users under their company, and fetches only users", async () => {
    landOn("/spark/users");
    await screen.findByText("Sara Haddad");

    // One group header per company, carrying that company's row count.
    expect(screen.getByText("Aramco").parentElement!.textContent).toContain("2");
    expect(screen.getByText("Zain KSA").parentElement!.textContent).toContain("1");
    expect(screen.getByText("Lina Farah")).toBeTruthy();

    expect(listUsers).toHaveBeenCalledTimes(1);
    expect(listReports).not.toHaveBeenCalled();
    expect(overview).not.toHaveBeenCalled();
  });

  it("lists companies flat, from the overview", async () => {
    landOn("/spark/companies");
    await screen.findByText("Aramco");
    expect(screen.getByText("Zain KSA")).toBeTruthy();
    expect(overview).toHaveBeenCalledTimes(1);
    expect(listUsers).not.toHaveBeenCalled();
  });

  it("collapses one company group without dropping the others", async () => {
    landOn("/spark/users");
    await screen.findByText("Sara Haddad");

    fireEvent.click(screen.getByText("Aramco"));
    expect(screen.queryByText("Sara Haddad")).toBeNull();
    expect(screen.getByText("Omar Nasser")).toBeTruthy();
  });

  it("searches across every group, not just within one company", async () => {
    landOn("/spark/users");
    await screen.findByText("Sara Haddad");

    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "omar" } });
    expect(screen.queryByText("Sara Haddad")).toBeNull();
    expect(screen.getByText("Omar Nasser")).toBeTruthy();
    // Aramco has no matching rows, so its group header goes too.
    expect(screen.queryByText("Aramco")).toBeNull();
  });

  it("sends an unknown section back to the overview", async () => {
    landOn("/spark/nonsense");
    await waitFor(() => screen.getByText("OVERVIEW"));
    expect(listUsers).not.toHaveBeenCalled();
    expect(overview).not.toHaveBeenCalled();
  });
});
