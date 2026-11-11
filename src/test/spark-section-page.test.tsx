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
const listInternalUsers = vi.fn();
const createInternalUser = vi.fn();
const activateUser = vi.fn();

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
    listInternalUsers: (p: unknown) => listInternalUsers(p),
    createInternalUser: (b: unknown) => createInternalUser(b),
    activateUser: (id: string) => activateUser(id),
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
    listInternalUsers.mockReset().mockResolvedValue({
      users: [{ user_id: "s1", full_name: "Sam Doe", email: "sam@wearespark.me", role: "spark_internal", status: "active" }],
      total: 1, page: 1, limit: 25,
    });
    createInternalUser.mockReset();
    activateUser.mockReset().mockResolvedValue({ user_id: "u4", status: "active" });
  });

  it("marks a collapsed company that has a user waiting for activation", async () => {
    listUsers.mockResolvedValue([
      ...USERS,
      { user_id: "u4", full_name: "Ahmed Khan", email: "ahmed@zain.com", role: "admin",
        status: "pending", company_id: "c2", company_name: "Zain KSA", awaiting_email_code: true },
    ]);
    landOn("/spark/users");
    await screen.findByText("Aramco");

    // Groups are collapsed, yet Zain KSA's row says it has someone waiting.
    expect(screen.queryByText("Ahmed Khan")).toBeNull();
    expect(screen.getByText("Zain KSA").parentElement!.textContent).toContain("1 pending");
    expect(screen.getByText("Aramco").parentElement!.textContent).not.toContain("pending");
  });

  it("shows Activate only for a user stuck on the email code, and activates them", async () => {
    listUsers.mockResolvedValue([
      ...USERS,
      { user_id: "u4", full_name: "Ahmed Khan", email: "ahmed@zain.com", role: "admin",
        status: "pending", company_id: "c2", company_name: "Zain KSA", awaiting_email_code: true },
    ]);
    landOn("/spark/users");
    await screen.findByText("Aramco");
    fireEvent.click(screen.getByText("Aramco"));
    fireEvent.click(screen.getByText("Zain KSA"));

    // Omar (invited) has no button; only Ahmed does.
    expect(screen.getAllByRole("button", { name: /^Activate / })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Activate Ahmed Khan" }));
    fireEvent.click(await screen.findByRole("button", { name: "Activate" }));

    await waitFor(() => expect(activateUser).toHaveBeenCalledWith("u4"));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Activate Ahmed Khan" })).toBeNull(),
    );
  });

  it("creates an internal user with a password the Spark admin typed, no password popup", async () => {
    createInternalUser.mockResolvedValue({
      user_id: "s3", email: "sara@wearespark.me", temp_password: null,
      email_sent: false, email_message: "Password set by Spark Admin, no email sent",
    });
    landOn("/spark/users");
    await screen.findByText("Aramco");
    fireEvent.click(screen.getByRole("tab", { name: /^Internal users/ }));
    await screen.findByText("Sam Doe");

    fireEvent.click(screen.getByText("+ Add internal user"));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Sara" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "sara@wearespark.me" } });
    fireEvent.click(screen.getByLabelText(/Set password myself/));
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "short" } });
    fireEvent.click(screen.getByText("Create user"));
    expect(await screen.findByText("Password must be at least 8 characters")).toBeTruthy();
    expect(createInternalUser).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Spark2026!" } });
    fireEvent.click(screen.getByText("Create user"));
    await waitFor(() =>
      expect(createInternalUser).toHaveBeenCalledWith({
        full_name: "Sara", email: "sara@wearespark.me", password: "Spark2026!",
      }),
    );
    // No temp password to hand over, so the password popup never opens.
    await waitFor(() => expect(screen.queryByText("User invited")).toBeNull());
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add internal user" })).toBeNull());
  });

  it("shows Spark staff on the Internal users tab, not grouped by company", async () => {
    landOn("/spark/users");
    await screen.findByText("Aramco");
    // Only the one-row count call so far; the tab carries the total.
    expect(listInternalUsers).toHaveBeenCalledWith({ page: 1, limit: 1 });
    expect(await screen.findByRole("tab", { name: "Internal users (1)" })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /^Internal users/ }));
    await screen.findByText("Sam Doe");
    expect(screen.queryByText("Sara Haddad")).toBeNull();
    expect(listInternalUsers).toHaveBeenCalledWith({ page: 1, limit: 25, search: undefined });
  });

  it("adds an internal user and shows the temp password when the email failed", async () => {
    createInternalUser.mockResolvedValue({
      user_id: "s2", email: "ali@wearespark.me", temp_password: "Xk7pQ2mLw9",
      email_sent: false, email_message: "SMTP down.",
    });
    landOn("/spark/users");
    await screen.findByText("Aramco");
    fireEvent.click(screen.getByRole("tab", { name: /^Internal users/ }));
    await screen.findByText("Sam Doe");

    fireEvent.click(screen.getByText("+ Add internal user"));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Ali Khan" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ali@wearespark.me" } });
    fireEvent.click(screen.getByText("Send invite"));

    await screen.findByText("Xk7pQ2mLw9");
    expect(createInternalUser).toHaveBeenCalledWith({ full_name: "Ali Khan", email: "ali@wearespark.me" });
    // The list reloads so the new person shows up.
    await waitFor(() => expect(listInternalUsers.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("groups users under their company, and fetches only users", async () => {
    landOn("/spark/users");
    await screen.findByText("Aramco");

    // One group header per company, carrying that company's row count.
    expect(screen.getByText("Aramco").parentElement!.textContent).toContain("2");
    expect(screen.getByText("Zain KSA").parentElement!.textContent).toContain("1");
    fireEvent.click(screen.getByText("Aramco"));
    expect(screen.getByText("Sara Haddad")).toBeTruthy();
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

  it("starts with every company collapsed, and opens one at a time", async () => {
    landOn("/spark/users");
    await screen.findByText("Aramco");
    expect(screen.queryByText("Sara Haddad")).toBeNull();
    expect(screen.queryByText("Omar Nasser")).toBeNull();

    fireEvent.click(screen.getByText("Aramco"));
    expect(screen.getByText("Sara Haddad")).toBeTruthy();
    expect(screen.queryByText("Omar Nasser")).toBeNull();

    fireEvent.click(screen.getByText("Aramco"));
    expect(screen.queryByText("Sara Haddad")).toBeNull();
  });

  it("searches across every group, not just within one company", async () => {
    landOn("/spark/users");
    await screen.findByText("Aramco");

    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "omar" } });
    expect(screen.queryByText("Sara Haddad")).toBeNull();
    // Search opens the groups, so the match shows without a click.
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
