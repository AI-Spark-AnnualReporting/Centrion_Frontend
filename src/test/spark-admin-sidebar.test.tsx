// spark_admin's menu (approved mockup spark-sidebar-mockup.html, version A):
// Overview and the three lists, then a "Licensing & billing" group with
// Licenses (on-premises) first, then Subscriptions, then Quotes with the number
// of open Enterprise requests. Every item has an icon and the right one is active.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { user_id: "usr_spark_admin", full_name: "Usama Javed", role: "spark_admin", company_id: null },
    logout: vi.fn(), actingCompany: null, leaveCompany: vi.fn(),
  }),
}));
vi.mock("@/lib/features", () => ({ useFeatureAccess: () => ({ isVisible: () => true, visibleFeatures: [] }), isFeatureVisible: () => true }));
vi.mock("@/lib/appRouting", () => ({ sparkStudioUrl: (path: string) => path }));
const list = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  sparkPlans: { list: (...args: unknown[]) => list(...args) },
}));

const { Sidebar } = await import("@/components/layout/Sidebar");

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar />
      <Routes><Route path="*" element={<Where />} /></Routes>
    </MemoryRouter>,
  );
}

/** The menu item labels in the order they appear (the hint under a name is left out). */
function menuOrder(): string[] {
  return Array.from(document.querySelectorAll(".sb-spark-label")).map((label) => label.firstChild?.textContent ?? "");
}

beforeEach(() => {
  list.mockReset().mockResolvedValue({ items: [], total: 2, page: 1, limit: 1, modules_catalogue: [] });
});

describe("spark_admin sidebar", () => {
  it("lists Licenses before Subscriptions and Quotes, in a Licensing & billing group", () => {
    renderAt("/spark");
    expect(menuOrder()).toEqual(["Overview", "Companies", "Reports", "Users", "Licenses", "Subscriptions", "Quotes"]);
    const group = document.querySelector(".sb-spark-group") as HTMLElement;
    expect(screen.getByText("Licensing & billing")).toBeInTheDocument();
    expect(within(group).getByText("On-premises keys")).toBeInTheDocument();
    expect(within(group).getByText("Cloud plans")).toBeInTheDocument();
    expect(within(group).getByText("Enterprise requests")).toBeInTheDocument();
  });

  it("gives every item an icon", () => {
    renderAt("/spark");
    for (const item of Array.from(document.querySelectorAll(".sb-spark-item"))) {
      expect(item.querySelector(".sb-spark-ic svg")).not.toBeNull();
    }
  });

  it("shows how many Enterprise requests are open on Quotes", async () => {
    renderAt("/spark");
    expect(await screen.findByLabelText("2 open")).toHaveTextContent("2");
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ quotes_only: true, offer_state: "received" }));   // new quotes only
  });

  it("keeps Subscriptions active on the plan editor, and only Overview on /spark", () => {
    renderAt("/spark/subscriptions/plan_1/edit");
    expect(screen.getByText("Subscriptions").closest("button")).toHaveClass("act");
    expect(screen.getByText("Overview").closest("button")).not.toHaveClass("act");
  });

  it("opens the page when an item is clicked", async () => {
    renderAt("/spark");
    fireEvent.click(screen.getByText("Licenses"));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/spark/licenses"));
  });
});
