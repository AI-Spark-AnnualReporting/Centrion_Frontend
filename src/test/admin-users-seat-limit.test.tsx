// Users & Roles: "+ Invite user" shows the seats left, and is greyed out once
// the license's user limit is full (the server still checks every invite).

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const usage = vi.fn();

vi.mock("@/lib/api", () => ({
  admin: { updateUserRole: vi.fn(), updateUserStatus: vi.fn() },
  adminConsole: {
    listUsers: () => Promise.resolve({ users: [] }),
    listDepartments: () => Promise.resolve([]),
  },
  adminUserPermissions: { get: vi.fn(), grant: vi.fn(), revoke: vi.fn() },
  license: { usage: () => usage(), requestUpgrade: vi.fn() },
  ApiError: class extends Error {},
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { user_id: "usr_admin", role: "admin", company_id: "cmp_1" } }),
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const { default: AdminUsersPage } = await import("@/pages/admin/AdminUsersPage");

function usageWithSeats(used: number, max: number) {
  return { unlimited: false, status: "active", deployment: "cloud", can_request: true,
           seats: { used, max }, reports: {} };
}

describe("Invite user and the seat limit", () => {
  it("shows the seats left while there's room", async () => {
    usage.mockResolvedValue(usageWithSeats(14, 16));
    render(<MemoryRouter><AdminUsersPage /></MemoryRouter>);
    expect(await screen.findByText("2 seats left (14 of 16)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Invite user" })).toBeEnabled();
  });

  it("greys out Invite user when the limit is full", async () => {
    usage.mockResolvedValue(usageWithSeats(16, 16));
    render(<MemoryRouter><AdminUsersPage /></MemoryRouter>);
    expect(await screen.findByText(/User limit reached \(16 \/ 16\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Invite user" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Change plan" })).toBeInTheDocument();
  });
});
