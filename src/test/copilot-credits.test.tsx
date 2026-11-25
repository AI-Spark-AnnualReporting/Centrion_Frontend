// The AI Copilot greys out its send box, with the reason, when the company
// can't afford a Copilot message. Plan: Centriton/.claude/plans/ai-credits-before-start.md

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const status = vi.fn();

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { full_name: "Sara", role: "ir" } }) }));
vi.mock("@/lib/api", () => ({
  chat: { getSession: () => Promise.resolve({ messages: [] }), send: vi.fn(), clearSession: vi.fn() },
  aiCredits: { status: () => status() },
}));

const { default: AIPage } = await import("@/pages/AIPage");

const open = () =>
  render(
    // No QueryClientProvider: rendered the way the app renders it.
    <MemoryRouter>
      <AIPage />
    </MemoryRouter>,
  );

const REASON = "Not enough AI credits for this step. Ask your admin to buy more.";

describe("AI Copilot credits", () => {
  beforeEach(() => {
    status.mockReset();
  });

  it("greys out the send box with the reason when credits are short", async () => {
    status.mockResolvedValue({
      applies: true, balance: null,
      actions: { "centriyon.copilot": { minimum: 1, allowed: false, reason: REASON } },
    });
    open();
    await screen.findByText(REASON);
    expect((screen.getByPlaceholderText(/Ask about ESG/) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("stays usable when credits are fine", async () => {
    status.mockResolvedValue({
      applies: true, balance: null,
      actions: { "centriyon.copilot": { minimum: 1, allowed: true, reason: null } },
    });
    open();
    await waitFor(() => expect(status).toHaveBeenCalled());
    await waitFor(() =>
      expect((screen.getByPlaceholderText(/Ask about ESG/) as HTMLInputElement).disabled).toBe(false));
    expect(screen.queryByText(REASON)).toBeNull();
  });

  it("never blocks when the status call fails", async () => {
    status.mockImplementation(() => Promise.reject(new Error("offline")));
    open();
    await waitFor(() => expect(status).toHaveBeenCalled());
    await waitFor(() =>
      expect((screen.getByPlaceholderText(/Ask about ESG/) as HTMLInputElement).disabled).toBe(false));
  });
});
