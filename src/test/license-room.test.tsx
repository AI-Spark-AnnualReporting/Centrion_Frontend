// Warn before a license limit: the room-left rules, the tag, and one real
// create button (the annual Create Cycle) greyed out when the limit is full.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { LicenseUsage } from "@/types/license";

let mockUser: Record<string, unknown> = { user_id: "usr_admin", role: "admin", company_id: "cmp_1" };
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: mockUser }) }));

const usage = vi.fn();
const requestUpgrade = vi.fn();
vi.mock("@/lib/api", () => ({
  license: {
    usage: (...args: unknown[]) => usage(...args),
    requestUpgrade: (...args: unknown[]) => requestUpgrade(...args),
  },
  adminConsole: { listUsers: vi.fn().mockResolvedValue({ users: [] }) },
  sarCycles: { create: vi.fn() },
}));

const { roomFor } = await import("@/components/license/useLicenseRoom");
const { LimitHint } = await import("@/components/license/LimitHint");
const { default: CycleForm } = await import("@/pages/annual-report/CycleForm");

function usageOf(extra: Partial<LicenseUsage> = {}): LicenseUsage {
  return {
    unlimited: false, status: "active", deployment: "cloud", message: null, can_request: true, is_admin: true,
    seats: { used: 9, max: 16 },
    reports: {
      board_report: { module_on: true, used: 10, limit: 10 },
      annual: { module_on: true, used: 4, limit: 5 },
      quarterly: { module_on: true, used: 3, limit: 8 },
      esg: { module_on: true, used: 1, limit: null },
      earnings: { module_on: false, used: 0, limit: null },
    },
    ...extra,
  };
}

describe("roomFor", () => {
  it("users: plenty, almost full, full", () => {
    expect(roomFor(usageOf(), "seats")).toMatchObject({ blocked: false, tone: "ok", hint: "9 of 16 users" });
    expect(roomFor(usageOf({ seats: { used: 14, max: 16 } }), "seats"))
      .toMatchObject({ blocked: false, tone: "low", hint: "2 seats left (14 of 16)" });
    const full = roomFor(usageOf({ seats: { used: 16, max: 16 } }), "seats");
    expect(full).toMatchObject({ blocked: true, tone: "full", hint: "User limit reached (16 / 16)" });
    expect(full.reason).toContain("Deactivate a user or ask Centriyon for more");
  });

  it("reports: room, last one, full, unlimited, not in the license", () => {
    expect(roomFor(usageOf(), "quarterly", "Quarterly Reports")).toMatchObject({ blocked: false, hint: "3 of 8 used" });
    expect(roomFor(usageOf(), "annual", "Annual Reports")).toMatchObject({ tone: "low", hint: "Last one left (4 of 5)" });
    expect(roomFor(usageOf(), "board_report", "Board Reports"))
      .toMatchObject({ blocked: true, hint: "Limit reached (10 / 10)" });
    expect(roomFor(usageOf(), "esg", "ESG reports")).toMatchObject({ blocked: false, hint: "Unlimited" });
    expect(roomFor(usageOf(), "earnings", "Earnings Reports"))
      .toMatchObject({ blocked: true, hint: "Not in your license" });
  });

  it("a license that isn't active blocks everything, with the server's reason", () => {
    const room = roomFor(usageOf({ status: "expired", message: "Your license expired on 2026-12-31. Contact Centriyon." }), "quarterly");
    expect(room).toMatchObject({ blocked: true, hint: "License expired" });
    expect(room.reason).toBe("Your license expired on 2026-12-31. Contact Centriyon.");
  });

  it("never blocks while loading, after a failed call, or for Spark staff", () => {
    expect(roomFor(null, "seats").blocked).toBe(false);
    expect(roomFor({ unlimited: true }, "board_report").blocked).toBe(false);
  });
});

describe("useLicenseRoom", () => {
  it("checks again when the browser tab comes back", async () => {
    const { useLicenseRoom } = await import("@/components/license/useLicenseRoom");
    usage.mockReset().mockResolvedValue(usageOf());
    const Probe = () => { useLicenseRoom("seats"); return null; };
    render(<Probe />);
    await waitFor(() => expect(usage).toHaveBeenCalledTimes(1));
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(usage).toHaveBeenCalledTimes(2));
  });
});

describe("LimitHint", () => {
  beforeEach(() => {
    requestUpgrade.mockReset().mockResolvedValue({ requested: true });
  });

  it("a cloud admin's Change plan goes to the Subscription page", async () => {
    mockUser = { role: "admin" };
    let seen = "";
    const Where = () => { seen = useLocation().pathname + useLocation().hash; return null; };
    render(
      <MemoryRouter>
        <LimitHint room={roomFor(usageOf({ seats: { used: 16, max: 16 } }), "seats")} />
        <Where />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Change plan" }));
    await waitFor(() => expect(seen).toBe("/admin-console/subscription"));
    expect(requestUpgrade).not.toHaveBeenCalled();
  });

  it("other roles are told to ask their admin", () => {
    mockUser = { role: "ir" };
    render(<LimitHint room={roomFor(usageOf({ can_request: false, is_admin: false }), "board_report", "Board Reports")} />);
    expect(screen.getByText(/Ask your admin/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change plan" })).not.toBeInTheDocument();
  });
});

describe("Create Cycle button", () => {
  beforeEach(() => {
    mockUser = { user_id: "usr_admin", role: "admin", company_id: "cmp_1" };
  });

  it("is greyed out with the reason when the annual limit is full", async () => {
    usage.mockResolvedValue(usageOf({ reports: { annual: { module_on: true, used: 5, limit: 5 } } }));
    render(<MemoryRouter><CycleForm onCreated={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByText("Create Reporting Cycle"));
    expect(await screen.findByText("Limit reached (5 / 5)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Cycle" })).toBeDisabled();
    expect(screen.getByText(/allows 5 Annual Reports this period/)).toBeInTheDocument();
  });

  it("stays usable when the license call fails (the server still checks)", async () => {
    usage.mockRejectedValue(new Error("network"));
    render(<MemoryRouter><CycleForm onCreated={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByText("Create Reporting Cycle"));
    await waitFor(() => expect(usage).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Create Cycle" })).toBeEnabled();
  });
});

describe("roomFor users: one total, the admin included", () => {
  it("shows used of max when there's room", () => {
    expect(roomFor(usageOf({ seats: { used: 10, max: 25 } }), "seats")).toMatchObject({
      blocked: false, tone: "ok", hint: "10 of 25 users",
    });
  });

  it("warns when only a few are left", () => {
    expect(roomFor(usageOf({ seats: { used: 23, max: 25 } }), "seats")).toMatchObject({ blocked: false, tone: "low" });
  });

  it("is blocked when the total is full", () => {
    expect(roomFor(usageOf({ seats: { used: 25, max: 25 } }), "seats")).toMatchObject({
      blocked: true, hint: "User limit reached (25 / 25)",
    });
  });
});
