// The Add company modal's optional "Company admin login" section (spec 5.1).
//
// What matters: with the switch off the request is exactly today's (no
// `admin` key); with it on, the fixed temporary password 1234 is shown and
// Create waits for a free email; a taken email offers the server's next free
// one; a failed check does NOT block (the server re-checks); a click on the
// backdrop never loses the form; and the request never carries a password.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const companies = vi.fn();
const createCompany = vi.fn();
const emailAvailable = vi.fn();
const switchCompany = vi.fn();
const navigate = vi.fn();

const extractProfileAtSignup = vi.fn();

vi.mock("@/lib/api", () => ({
  extractProfileAtSignup: (companyId: string, file: File | null, url?: string) =>
    extractProfileAtSignup(companyId, file, url),
  sparkInternal: {
    companies: (opts: unknown) => companies(opts),
    createCompany: (body: unknown) => createCompany(body),
    emailAvailable: (email: string) => emailAvailable(email),
  },
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { role: "spark_internal", full_name: "Spark Staff" },
    switchCompany,
    leaveCompany: vi.fn(),
    actingCompany: null,
  }),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
}));

const { default: SparkCompaniesPage } = await import("@/pages/spark/CompaniesPage");

/** Open the page and the Add company modal. */
async function openModal() {
  render(<SparkCompaniesPage />);
  fireEvent.click(await screen.findByText("+ Add company"));
  return screen.getByRole("dialog");
}

function typeName(value: string) {
  fireEvent.change(screen.getByPlaceholderText("Acme Corporation"), { target: { value } });
}

function createButton() {
  return screen.getByRole("button", { name: "Create and set up →" });
}

function emailInput() {
  return screen.getByLabelText("Admin email") as HTMLInputElement;
}

describe("Add company modal: admin login section", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    companies.mockResolvedValue({ companies: [], total: 0, stats: null });
    emailAvailable.mockImplementation((email: string) =>
      Promise.resolve({ email, valid: true, available: true, suggestion: null }),
    );
  });

  it("starts with the switch off and sends no admin key", async () => {
    createCompany.mockResolvedValue({ company: { id: "cmp_new", name: "Fresh Co" } });
    await openModal();
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    typeName("Fresh Co");
    fireEvent.click(createButton());
    await waitFor(() => expect(createCompany).toHaveBeenCalled());
    const body = createCompany.mock.calls[0][0];
    expect(body).toEqual({ name: "Fresh Co", jurisdiction: "KSA" });
    expect("admin" in body).toBe(false);
    // And the email check never ran while the switch was off.
    expect(emailAvailable).not.toHaveBeenCalled();
  });

  it("sends the website after Create, the same way signup does, then opens the wizard", async () => {
    createCompany.mockResolvedValue({ company: { id: "cmp_new", name: "Fresh Co" } });
    extractProfileAtSignup.mockResolvedValue(undefined);
    await openModal();
    typeName("Fresh Co");
    fireEvent.change(screen.getByLabelText(/Website/), { target: { value: " https://fresh.co " } });
    fireEvent.click(createButton());
    await waitFor(() => expect(switchCompany).toHaveBeenCalled());
    expect(extractProfileAtSignup).toHaveBeenCalledWith("cmp_new", null, "https://fresh.co");
    // The URL is not part of the create request itself.
    expect(createCompany.mock.calls[0][0]).toEqual({ name: "Fresh Co", jurisdiction: "KSA" });
  });

  it("still opens the wizard when the website read fails to start", async () => {
    createCompany.mockResolvedValue({ company: { id: "cmp_new", name: "Fresh Co" } });
    extractProfileAtSignup.mockRejectedValue(new Error("down"));
    await openModal();
    typeName("Fresh Co");
    fireEvent.change(screen.getByLabelText(/Website/), { target: { value: "https://fresh.co" } });
    fireEvent.click(createButton());
    await waitFor(() => expect(switchCompany).toHaveBeenCalled());
  });

  it("sends no website call when the field is empty", async () => {
    createCompany.mockResolvedValue({ company: { id: "cmp_new", name: "Fresh Co" } });
    await openModal();
    typeName("Fresh Co");
    fireEvent.click(createButton());
    await waitFor(() => expect(switchCompany).toHaveBeenCalled());
    expect(extractProfileAtSignup).not.toHaveBeenCalled();
  });

  it("prefills the email from the name and checks it after a pause", async () => {
    await openModal();
    fireEvent.click(screen.getByRole("switch"));
    typeName("Bank Al Jazeera");
    expect(emailInput().value).toBe("bank-al-jazeera@admin.com");
    // Inside the 400 ms wait: no request yet.
    expect(emailAvailable).not.toHaveBeenCalled();
    expect(await screen.findByText("Available")).toBeInTheDocument();
    expect(emailAvailable).toHaveBeenCalledWith("bank-al-jazeera@admin.com");
  });

  it("exposes the stable test hooks from ui.md 5.6", async () => {
    await openModal();
    fireEvent.click(screen.getByTestId("admin-login-switch"));
    expect(screen.getByTestId("admin-login-switch")).toBe(screen.getByRole("switch"));
    expect(screen.getByTestId("admin-email-status")).toBeInTheDocument();
  });

  it("shows the fixed temporary password 1234 with no New password or tick box", async () => {
    await openModal();
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByTestId("temp-password-code")).toHaveTextContent("1234");
    expect(screen.queryByRole("button", { name: "↻ New password" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByTestId("admin-saved-check")).not.toBeInTheDocument();
  });

  it("says a PM login is made too, only while the admin switch is on", async () => {
    await openModal();
    const note = screen.getByTestId("pm-login-note");
    // Off: the note sits in the collapsed admin body, hidden from everyone.
    expect(note.closest("[aria-hidden]")).toHaveAttribute("aria-hidden", "true");
    expect(note).not.toBeVisible();

    fireEvent.click(screen.getByRole("switch"));
    expect(note.closest("[aria-hidden]")).toHaveAttribute("aria-hidden", "false");
    expect(note).toBeVisible();
    // No name yet: no made-up email in the sentence.
    expect(note).toHaveTextContent("A project manager login is made too, with the same password.");
    expect(note).not.toHaveTextContent("@pm.com");
  });

  it("builds the PM email from the company name, not from the admin email box", async () => {
    await openModal();
    fireEvent.click(screen.getByRole("switch"));
    typeName("Bank Al Jazeera");
    const note = screen.getByTestId("pm-login-note");
    expect(note).toHaveTextContent(
      "A project manager login (bank-al-jazeera@pm.com) is made too, with the same password.",
    );
    // The email itself is the bold part.
    expect(note.querySelector("b")).toHaveTextContent("bank-al-jazeera@pm.com");

    typeName("Aramco");
    expect(note).toHaveTextContent("(aramco@pm.com)");

    // A hand-edited admin email does not move the PM email: the server slugs the name.
    await screen.findByText("Available");
    fireEvent.change(emailInput(), { target: { value: "boss@admin.com" } });
    expect(note).toHaveTextContent("(aramco@pm.com)");
  });

  it("keeps Create disabled until there is a name and the email is free", async () => {
    await openModal();
    fireEvent.click(screen.getByRole("switch"));
    expect(createButton()).toBeDisabled();
    expect(screen.getByText("Add a company name first.")).toBeInTheDocument();

    typeName("Acme Test");
    expect(screen.getByText("Waiting for the email check…")).toBeInTheDocument();
    await screen.findByText("Available");
    expect(createButton()).toBeEnabled();
  });

  it("offers the next free email when the one typed is taken", async () => {
    emailAvailable.mockImplementation((email: string) =>
      Promise.resolve(
        email === "aramco@admin.com"
          ? { email, valid: true, available: false, suggestion: "aramco-2@admin.com" }
          : { email, valid: true, available: true, suggestion: null },
      ),
    );
    await openModal();
    fireEvent.click(screen.getByRole("switch"));
    typeName("Aramco");
    expect(await screen.findByText("Already used.")).toBeInTheDocument();
    expect(emailInput()).toHaveClass("inp-error");
    expect(screen.getByText("Pick an email that isn't used yet.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Use aramco-2@admin.com" }));
    expect(emailInput().value).toBe("aramco-2@admin.com");
    expect(await screen.findByText("Available")).toBeInTheDocument();
    expect(emailAvailable).toHaveBeenLastCalledWith("aramco-2@admin.com");
    // Edited by hand now, so "Use suggested" brings the name-based one back.
    fireEvent.click(screen.getByRole("button", { name: "Use suggested" }));
    expect(emailInput().value).toBe("aramco@admin.com");
  });

  it("rejects a malformed email without asking the server", async () => {
    await openModal();
    fireEvent.click(screen.getByRole("switch"));
    typeName("Acme");
    await screen.findByText("Available");
    emailAvailable.mockClear();
    fireEvent.change(emailInput(), { target: { value: "not an email" } });
    expect(screen.getByText("Enter a valid email.")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(emailAvailable).not.toHaveBeenCalled();
  });

  it("does not block Create when the check fails, and offers Retry", async () => {
    emailAvailable.mockRejectedValueOnce(new Error("offline"));
    await openModal();
    fireEvent.click(screen.getByRole("switch"));
    typeName("Acme Test");
    expect(await screen.findByText("Couldn't check this email.")).toBeInTheDocument();
    expect(createButton()).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Available")).toBeInTheDocument();
  });

  it("sends the admin email only and stores nothing on success", async () => {
    createCompany.mockResolvedValue({
      company: { id: "cmp_new", name: "Acme Test" },
      admin: { user_id: "usr_a", email: "acme-test@admin.com" },
    });
    await openModal();
    fireEvent.click(screen.getByRole("switch"));
    typeName("Acme Test");
    await screen.findByText("Available");
    fireEvent.click(createButton());

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/onboarding"));
    // The server sets the fixed password itself, so none is sent.
    expect(createCompany).toHaveBeenCalledWith({
      name: "Acme Test",
      jurisdiction: "KSA",
      admin: { email: "acme-test@admin.com" },
    });
    expect(sessionStorage.length).toBe(0);
    expect(switchCompany).toHaveBeenCalledWith({ id: "cmp_new", name: "Acme Test" });
  });

  it("never sends a PM email: the server makes the PM login by itself", async () => {
    createCompany.mockResolvedValue({
      company: { id: "cmp_new", name: "Acme Test" },
      admin: { user_id: "usr_a", email: "acme-test@admin.com" },
      pm: { user_id: "usr_pm", email: "acme-test@pm.com" },
    });
    await openModal();
    fireEvent.click(screen.getByRole("switch"));
    typeName("Acme Test");
    await screen.findByText("Available");
    fireEvent.click(createButton());

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/onboarding"));
    const body = createCompany.mock.calls[0][0];
    expect(body).toEqual({ name: "Acme Test", jurisdiction: "KSA", admin: { email: "acme-test@admin.com" } });
    expect("pm" in body).toBe(false);
    // Only the admin email is checked; the PM email is the server's job.
    for (const call of emailAvailable.mock.calls) {
      expect(call[0]).not.toContain("@pm.com");
    }
    expect(sessionStorage.length).toBe(0);
  });

  it("goes back to 'Already used' on a 409, keeping the password plate", async () => {
    const conflict = Object.assign(new Error("This email is already used."), {
      status: 409,
      body: { detail: { message: "This email is already used.", suggestion: "acme-test-2@admin.com" } },
    });
    createCompany.mockRejectedValue(conflict);
    await openModal();
    fireEvent.click(screen.getByRole("switch"));
    typeName("Acme Test");
    await screen.findByText("Available");
    fireEvent.click(createButton());

    expect(await screen.findByText("Already used.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use acme-test-2@admin.com" })).toBeInTheDocument();
    expect(screen.getByTestId("temp-password-code")).toHaveTextContent("1234");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("shows any other failure in a callout and keeps the form", async () => {
    createCompany.mockRejectedValue(new Error("Backend down"));
    await openModal();
    typeName("Acme Test");
    fireEvent.click(createButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Backend down");
    expect((screen.getByPlaceholderText("Acme Corporation") as HTMLInputElement).value).toBe("Acme Test");
  });

  it("disables everything while saving", async () => {
    let finish: (value: unknown) => void = () => {};
    createCompany.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await openModal();
    fireEvent.click(screen.getByRole("switch"));
    typeName("Acme Test");
    await screen.findByText("Available");
    fireEvent.click(createButton());

    expect(screen.getByRole("button", { name: "Creating…" })).toBeDisabled();
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(emailInput()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    expect(screen.getByTestId("temp-password-copy")).toBeDisabled();
    await act(async () => finish({ company: { id: "cmp_new", name: "Acme Test" } }));
  });

  it("never closes on a backdrop click", async () => {
    await openModal();
    const overlay = document.querySelector(".modal-overlay") as HTMLElement;
    fireEvent.pointerDown(overlay);
    fireEvent.mouseDown(overlay);
    fireEvent.click(overlay);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes on Escape only while untouched", async () => {
    await openModal();
    typeName("Acme");
    fireEvent.keyDown(screen.getByPlaceholderText("Acme Corporation"), { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    typeName("");
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.keyDown(screen.getByRole("switch"), { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch"));
    fireEvent.keyDown(screen.getByRole("switch"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("closes with the ✕ button", async () => {
    await openModal();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
