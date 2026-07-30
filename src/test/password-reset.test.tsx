// The reset flow's two silent failure modes, both security-shaped:
//   1. /forgot-password leaking which emails have accounts — a 404 rendered as
//      "no such user" turns the form into an enumeration oracle.
//   2. /reset-password submitting with no token, which would either 422 in a
//      confusing way or (worse, on a lax backend) reset the wrong account.
// Neither shows up in normal clicking, so they get the test.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

class ApiError extends Error {
  constructor(public status: number, public body: unknown = null) {
    super(`API ${status}`);
  }
}

const forgotPassword =
  vi.fn<(email: string) => Promise<{ sent: boolean; reset_link?: string }>>();
const resetPassword = vi.fn<(t: string, p: string) => Promise<unknown>>();

vi.mock("@/lib/api", () => ({
  auth: {
    forgotPassword: (email: string) => forgotPassword(email),
    resetPassword: (t: string, p: string) => resetPassword(t, p),
  },
  ApiError,
}));

const { ForgotPasswordPage, ResetPasswordPage } = await import(
  "@/components/auth/PasswordResetPages"
);

const submitEmail = async (value: string) => {
  fireEvent.change(screen.getByPlaceholderText("ahmad@al-noor.sa"), {
    target: { value },
  });
  fireEvent.click(screen.getByText("Send reset link"));
};

describe("forgot password", () => {
  beforeEach(() => {
    forgotPassword.mockReset();
    resetPassword.mockReset();
  });

  it("shows the same neutral screen whether or not the account exists", async () => {
    for (const outcome of [
      () => Promise.resolve({ sent: true }),
      () => Promise.reject(new ApiError(404)),
    ]) {
      forgotPassword.mockImplementation(outcome);
      const view = render(
        <MemoryRouter>
          <ForgotPasswordPage />
        </MemoryRouter>,
      );
      await submitEmail("nobody@example.com");
      await waitFor(() => screen.getByText("Check your inbox"));
      // Nothing on screen distinguishes the two cases.
      expect(screen.queryByText(/no account/i)).toBeNull();
      expect(screen.queryByText(/not found/i)).toBeNull();
      view.unmount();
    }
  });

  it("does not call the API for a malformed address", async () => {
    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );
    await submitEmail("ahmad");
    await waitFor(() => screen.getByText(/valid email address/i));
    expect(forgotPassword).not.toHaveBeenCalled();
  });
});

describe("reset password", () => {
  // Braces matter: `() => resetPassword.mockReset()` returns the mock from the
  // hook and vitest then surfaces its last rejected result as a test failure.
  beforeEach(() => {
    resetPassword.mockReset();
  });

  const renderAt = (search: string) =>
    render(
      <MemoryRouter initialEntries={[`/reset-password${search}`]}>
        <ResetPasswordPage />
      </MemoryRouter>,
    );

  it("refuses to submit without a token in the URL", () => {
    renderAt("");
    expect(screen.getByText(/missing its reset token/i)).toBeTruthy();
    // No password fields at all — there is nothing valid to submit.
    expect(screen.queryByPlaceholderText("At least 8 characters")).toBeNull();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("blocks mismatched confirmation before hitting the API", async () => {
    renderAt("?token=t0k3n");
    fireEvent.change(screen.getByPlaceholderText("At least 8 characters"), {
      target: { value: "correct-horse" },
    });
    fireEvent.change(screen.getByPlaceholderText("Re-type the new password"), {
      target: { value: "correct-hors" },
    });
    fireEvent.click(screen.getByText("Set password"));
    await waitFor(() => screen.getByText(/do not match/i));
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("sends the URL token with a valid password", async () => {
    resetPassword.mockResolvedValue({ reset: true });
    renderAt("?token=t0k3n");
    fireEvent.change(screen.getByPlaceholderText("At least 8 characters"), {
      target: { value: "correct-horse" },
    });
    fireEvent.change(screen.getByPlaceholderText("Re-type the new password"), {
      target: { value: "correct-horse" },
    });
    fireEvent.click(screen.getByText("Set password"));
    await waitFor(() =>
      expect(resetPassword).toHaveBeenCalledWith("t0k3n", "correct-horse"),
    );
  });

  it("tells the user to request a fresh link when the token is spent", async () => {
    // 400 is the backend's one answer for expired / malformed / reused tokens.
    // mockImplementation, not mockRejectedValue: the latter builds the rejected
    // promise at setup time and trips the unhandled-rejection detector.
    resetPassword.mockImplementation(() =>
      Promise.reject(new ApiError(400, { detail: 'Invalid or expired reset link' })),
    );
    renderAt("?token=stale");
    fireEvent.change(screen.getByPlaceholderText("At least 8 characters"), {
      target: { value: "correct-horse" },
    });
    fireEvent.change(screen.getByPlaceholderText("Re-type the new password"), {
      target: { value: "correct-horse" },
    });
    fireEvent.click(screen.getByText("Set password"));
    await waitFor(() => screen.getByText(/expired or already been used/i));
  });
});
