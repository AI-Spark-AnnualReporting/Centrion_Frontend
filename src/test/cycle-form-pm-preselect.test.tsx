// Spark staff run the cycles they create for a client, so the form should open
// with them already in Project Manager.
//
// Two halves, and skipping either looks like nothing happened: a `<select
// value>` whose value matches no `<option>` silently falls back to the
// placeholder, so the option has to be there as well as the default. And it
// must stay a default — the client's own PMs remain selectable, and no other
// role sees any of this.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const SPARK = {
  user_id: "usr_spark",
  full_name: "Spark Staff",
  role: "spark_internal",
};
const ADMIN = { user_id: "usr_admin", full_name: "Acme Admin", role: "admin" };

let user: typeof SPARK | typeof ADMIN = SPARK;
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user }) }));

const CLIENT_PMS = [
  { user_id: "usr_pm1", full_name: "testpm", role: "project_manager" },
  { user_id: "usr_pm2", full_name: "Other PM", role: "project_manager" },
];

vi.mock("@/lib/api", () => ({
  adminConsole: { listUsers: vi.fn().mockResolvedValue({ users: CLIENT_PMS }) },
  sarCycles: { create: vi.fn() },
}));

const { default: CycleForm } = await import("@/pages/annual-report/CycleForm");

const pmSelect = () => screen.getByRole("combobox") as HTMLSelectElement;
const options = () =>
  Array.from(pmSelect().options).map((o) => [o.value, o.text] as const);

describe("Project Manager preselection", () => {
  beforeEach(() => {
    user = SPARK;
  });

  it("opens on the Spark user, with the client's PMs still listed", async () => {
    render(<CycleForm onCreated={vi.fn()} />);
    await waitFor(() => expect(options()).toHaveLength(4));

    expect(pmSelect().value).toBe("usr_spark");
    expect(options()).toEqual([
      ["", "Select a Project Manager"],
      ["usr_spark", "Spark Staff (you)"],
      ["usr_pm1", "testpm"],
      ["usr_pm2", "Other PM"],
    ]);
  });

  it("shows the option, not just the value — or the select renders blank", async () => {
    // The silent half: React shows the placeholder when `value` matches no
    // option, so preselecting without prepending would look like a no-op.
    render(<CycleForm onCreated={vi.fn()} />);
    const selected = await screen.findByText("Spark Staff (you)");
    expect((selected as HTMLOptionElement).selected).toBe(true);
  });

  it("leaves every other role exactly as it was", async () => {
    user = ADMIN;
    render(<CycleForm onCreated={vi.fn()} />);
    await waitFor(() => expect(options()).toHaveLength(3));

    expect(pmSelect().value).toBe("");
    expect(screen.queryByText(/\(you\)/)).not.toBeInTheDocument();
    expect(screen.queryByText("Acme Admin")).not.toBeInTheDocument();
  });
});
