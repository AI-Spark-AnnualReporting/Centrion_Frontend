// The bell polls the Communication Hub every 45s from the app shell, so it
// runs on every authenticated page. Threads live inside a company, so for a
// user who has none (the platform-owner `spark_admin`) that poll is a 400 on
// a loop, forever, on a screen that has nothing to do with communications.
//
// A regression here is silent — the page still works, it just quietly hammers
// a failing endpoint — so the guard is pinned rather than left to review.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const listThreads = vi.fn();
const auth: { user: Record<string, unknown> | null } = { user: null };

vi.mock("@/lib/api", () => ({
  communications: { listThreads: () => listThreads(), markThreadRead: vi.fn() },
  ApiError: class extends Error {},
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));

const { NotificationBell } = await import("@/components/layout/NotificationBell");

describe("notification bell scoping", () => {
  beforeEach(() => {
    listThreads.mockReset().mockResolvedValue({ threads: [] });
  });

  it("does not poll, or render, for a user with no company", async () => {
    auth.user = { user_id: "u_spark", role: "spark_admin", company_id: null };
    const { container } = render(<NotificationBell />);
    await waitFor(() => expect(listThreads).not.toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("still polls and renders for a normal company user", async () => {
    auth.user = { user_id: "u_admin", role: "admin", company_id: "cmp_1" };
    render(<NotificationBell />);
    await waitFor(() => expect(listThreads).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button")).toBeTruthy();
  });
});
