// The temp-password controls are a credential on an admin screen, so the two
// things worth pinning are the ones that go wrong quietly:
//   1. A user who already set their own password must offer nothing to reveal —
//      the backend has dropped its readable copy, and a "Show" button there
//      would be a live-credential control pointing at nothing.
//   2. Regeneration invalidates the current password, so it must not fire
//      without a confirmation.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const getTempPassword =
  vi.fn<(id: string) => Promise<{ user_id: string; temp_password: string }>>();
const regenerateTempPassword = vi.fn<(id: string) => Promise<{ temp_password: string }>>();

const USERS = [
  {
    user_id: "usr_invited",
    full_name: "Sara Haddad",
    email: "sara@example.com",
    role: "department_user",
    status: "invited",
    has_temp_password: true,
  },
  {
    user_id: "usr_active",
    full_name: "Omar Nasser",
    email: "omar@example.com",
    role: "department_user",
    status: "active",
    has_temp_password: false,
  },
];

vi.mock("@/lib/api", () => ({
  admin: { updateUserRole: vi.fn(), updateUserStatus: vi.fn() },
  adminConsole: {
    listUsers: () => Promise.resolve({ users: USERS }),
    listDepartments: () => Promise.resolve([]),
    getTempPassword: (id: string) => getTempPassword(id),
    regenerateTempPassword: (id: string) => regenerateTempPassword(id),
    updateUserDepartment: vi.fn(),
  },
  ApiError,
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { user_id: "usr_admin" } }),
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const { default: AdminUsersPage } = await import("@/pages/admin/AdminUsersPage");

// Open a user's row — the controls only exist in the expanded panel.
const expandRow = async (name: string) => {
  render(<AdminUsersPage />);
  fireEvent.click(await screen.findByText(name));
};

describe("temp password controls", () => {
  beforeEach(() => {
    getTempPassword.mockReset();
    regenerateTempPassword.mockReset();
    vi.restoreAllMocks();
  });

  it("reveals the password on demand for a user who hasn't activated", async () => {
    getTempPassword.mockResolvedValue({
      user_id: "usr_invited",
      temp_password: "Xk9#mQ2vLp4z",
    });
    await expandRow("Sara Haddad");
    fireEvent.click(screen.getByText("Show"));
    await waitFor(() => screen.getByText("Xk9#mQ2vLp4z"));
    expect(getTempPassword).toHaveBeenCalledWith("usr_invited");
  });

  it("offers nothing to reveal once the user is active", async () => {
    await expandRow("Omar Nasser");
    expect(screen.queryByText("Temporary password")).toBeNull();
    expect(screen.queryByText("Show")).toBeNull();
    expect(getTempPassword).not.toHaveBeenCalled();
  });

  it("relays the backend's reason when the row has gone stale", async () => {
    // They activated after the list loaded, so the row still says
    // has_temp_password. The 409 detail is the only thing that knows better.
    // mockImplementation, not mockRejectedValue — the latter builds the
    // rejected promise at setup time and trips the unhandled-rejection check.
    getTempPassword.mockImplementation(() =>
      Promise.reject(
        new ApiError(
          409,
          "This user has set their own password — there is no temporary password to show",
        ),
      ),
    );
    await expandRow("Sara Haddad");
    fireEvent.click(screen.getByText("Show"));
    await waitFor(() => screen.getByText(/set their own password/i));
  });

  it("does not regenerate when the confirmation is dismissed", async () => {
    await expandRow("Sara Haddad");
    fireEvent.click(screen.getByText("Regenerate"));
    screen.getByText("Regenerate temporary password?"); // the confirm modal
    fireEvent.click(screen.getByText("Cancel"));
    expect(regenerateTempPassword).not.toHaveBeenCalled();
  });

  it("shows the new password after a confirmed regeneration", async () => {
    regenerateTempPassword.mockResolvedValue({ temp_password: "Nw7$tRb1Ke8s" });
    await expandRow("Sara Haddad");
    fireEvent.click(screen.getByText("Regenerate"));
    // Two buttons read "Regenerate" once the modal is up — the second is the
    // one inside it that actually commits.
    fireEvent.click(screen.getAllByText("Regenerate")[1]);
    await waitFor(() => screen.getByText("Nw7$tRb1Ke8s"));
    expect(regenerateTempPassword).toHaveBeenCalledWith("usr_invited");
  });
});
