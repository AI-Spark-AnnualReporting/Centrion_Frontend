// The Spark Logins dialog (spec 5.4) and its one-shot auto-open on the Annual
// Report landing.
//
// What matters: it always reads GET /logins (the sessionStorage record only
// picks the header); one shared plate when everyone waiting has the same
// password, per-row Show when they differ, an amber note when the server
// can't decrypt them; Reset password sits behind a confirm; "Create missing
// leads" refreshes the list; and the landing opens it once, for Spark only.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { SparkLogin, SparkLoginsResponse } from "@/lib/api";

const logins = vi.fn();
const createLeads = vi.fn();
const resetPassword = vi.fn();
const list = vi.fn();
let authValue: {
  user: { role: string; full_name?: string } | null;
  actingCompany: { id: string; name: string } | null;
} = { user: { role: "spark_internal" }, actingCompany: null };

vi.mock("@/lib/api", () => ({
  sparkInternal: {
    logins: (companyId: string) => logins(companyId),
    createLeads: (companyId: string) => createLeads(companyId),
    resetPassword: (companyId: string, userId: string) => resetPassword(companyId, userId),
  },
  sarCycles: { list: () => list() },
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => authValue,
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/lib/features", () => ({
  useFeaturePermissions: () => ({ canCreate: false, canRead: true }),
}));
vi.mock("@/pages/annual-report/CycleForm", () => ({ default: () => null }));
const downloadText = vi.fn();
vi.mock("@/lib/utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/utils")>("@/lib/utils");
  return { ...actual, downloadText: (name: string, text: string) => downloadText(name, text) };
});

const { default: CompanyLoginsDialog } = await import("@/pages/spark/CompanyLoginsDialog");
const { default: CyclesListPage } = await import("@/pages/annual-report/CyclesListPage");

const ADMIN: SparkLogin = {
  user_id: "usr_admin",
  email: "acme-test@admin.com",
  full_name: "Acme Test Admin",
  role: "admin",
  department_code: null,
  department_name: null,
  must_change_password: true,
  temp_password: "Xk7#pQ2mRv9a",
};

const FIN: SparkLogin = {
  user_id: "usr_fin",
  email: "acme-test-fin@hod.com",
  full_name: "Finance Lead",
  role: "hod",
  department_code: "FIN",
  department_name: "Finance",
  must_change_password: true,
  temp_password: "Xk7#pQ2mRv9a",
};

const PM: SparkLogin = {
  user_id: "usr_pm",
  email: "acme-test@pm.com",
  full_name: "Acme Test PM",
  role: "project_manager",
  department_code: null,
  department_name: null,
  must_change_password: true,
  temp_password: "Xk7#pQ2mRv9a",
};

const HR: SparkLogin = {
  ...FIN,
  user_id: "usr_hr",
  email: "acme-test-hr@hod.com",
  full_name: "HR Lead",
  department_code: "HR",
  department_name: "Human Resources",
};

/** The user ids of the table rows, top to bottom. */
function rowOrder(): string[] {
  return screen
    .getAllByTestId(/^login-row-/)
    .map((row) => (row.getAttribute("data-testid") ?? "").replace("login-row-", ""));
}

function response(rows: SparkLogin[], departmentsWithoutLead = 0): SparkLoginsResponse {
  return {
    company: { id: "cmp_1", name: "Acme Test" },
    logins: rows,
    departments_without_lead: departmentsWithoutLead,
  };
}

function renderDialog(props: Partial<Parameters<typeof CompanyLoginsDialog>[0]> = {}) {
  const onClose = vi.fn();
  render(<CompanyLoginsDialog companyId="cmp_1" companyName="Acme Test" onClose={onClose} {...props} />);
  return { onClose };
}

describe("CompanyLoginsDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    authValue = { user: { role: "spark_internal" }, actingCompany: null };
  });

  it("loads the logins and shows one shared password", async () => {
    logins.mockResolvedValue(response([ADMIN, FIN]));
    renderDialog();
    expect(screen.getByLabelText("Loading logins")).toBeInTheDocument();
    expect(await screen.findByText("acme-test@admin.com")).toBeInTheDocument();
    expect(logins).toHaveBeenCalledWith("cmp_1");
    expect(screen.getByText("Logins · Acme Test")).toBeInTheDocument();
    expect(screen.getAllByTestId("temp-password-plate")).toHaveLength(1);
    expect(screen.getByTestId("temp-password-code")).toHaveTextContent("Xk7#pQ2mRv9a");
    expect(screen.getByRole("button", { name: "Download .txt" })).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("FIN")).toBeInTheDocument();
    expect(screen.getAllByText("Waiting for first sign-in")).toHaveLength(2);
    // One plate is enough: no per-row Show.
    expect(screen.queryByRole("button", { name: /^Show password/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("logins-dialog")).toBeInTheDocument();
  });

  it("keeps the ui.md column widths so the email gets the room", async () => {
    logins.mockResolvedValue(response([ADMIN, FIN]));
    renderDialog();
    await screen.findByText("acme-test@admin.com");
    const headers = screen.getAllByRole("columnheader");
    expect(headers[0].style.width).toBe("130px");
    expect(headers[1].style.width).toBe("");
    expect(headers[2].style.width).toBe("160px");
    // The actions are icon buttons, so their column stays narrow.
    expect(headers[3].style.width).toBe("44px");
  });

  it("puts only the logins still waiting on the sign-in sheet", async () => {
    logins.mockResolvedValue(
      response([ADMIN, { ...FIN, must_change_password: false, temp_password: null }]),
    );
    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Download .txt" }));
    expect(downloadText).toHaveBeenCalledTimes(1);
    const sheet = downloadText.mock.calls[0][1] as string;
    expect(sheet).toContain("Temporary password: Xk7#pQ2mRv9a");
    expect(sheet).toContain("acme-test@admin.com");
    // FIN already chose their own password, so the temporary one is not theirs.
    expect(sheet).not.toContain("acme-test-fin@hod.com");
  });

  it("says so when everyone already set their own password", async () => {
    logins.mockResolvedValue(
      response([
        { ...ADMIN, must_change_password: false, temp_password: null },
        { ...FIN, must_change_password: false, temp_password: null },
      ]),
    );
    renderDialog();
    expect(await screen.findByText("Everyone has set their own password.")).toBeInTheDocument();
    expect(screen.getAllByText("Password set")).toHaveLength(2);
    expect(screen.queryByTestId("temp-password-plate")).not.toBeInTheDocument();
  });

  it("shows the amber note when the server can't read the password", async () => {
    logins.mockResolvedValue(response([{ ...ADMIN, temp_password: null }]));
    renderDialog();
    expect(
      await screen.findByText("The temporary password can't be shown again on this server."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("temp-password-plate")).not.toBeInTheDocument();
  });

  it("gives each row Show when the passwords differ", async () => {
    logins.mockResolvedValue(response([ADMIN, { ...FIN, temp_password: "Other#Pass99" }]));
    renderDialog();
    await screen.findByText("acme-test@admin.com");
    expect(screen.queryByTestId("temp-password-plate")).not.toBeInTheDocument();
    const finRow = screen.getByTestId("login-row-usr_fin");
    const showButton = within(finRow).getByRole("button", { name: "Show password for acme-test-fin@hod.com" });
    // ui.md: a text "Show" in btn bs bsm, not an icon.
    expect(showButton).toHaveTextContent("Show");
    expect(showButton).toHaveClass("btn", "bs", "bsm");
    fireEvent.click(showButton);
    // Revealed inline as a small chip in the same row, with its own Copy.
    const chip = within(finRow).getByTestId("login-password-code");
    expect(chip).toHaveTextContent("Other#Pass99");
    expect(chip.style.fontSize).toBe("13px");
    expect(within(finRow).getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3); // header + 2 logins, no extra row
    fireEvent.click(within(finRow).getByRole("button", { name: "Hide password for acme-test-fin@hod.com" }));
    expect(screen.queryByTestId("login-password-code")).not.toBeInTheDocument();
  });

  it("shows the error state with Retry", async () => {
    logins.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(response([ADMIN]));
    renderDialog();
    expect(await screen.findByText("Couldn't load the logins.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("acme-test@admin.com")).toBeInTheDocument();
    expect(logins).toHaveBeenCalledTimes(2);
  });

  it("shows the empty state", async () => {
    logins.mockResolvedValue(response([], 2));
    renderDialog();
    expect(await screen.findByText("No logins for this company yet.")).toBeInTheDocument();
    expect(screen.getByText("Create lead logins for its departments below.")).toBeInTheDocument();
  });

  it("creates missing leads, then refreshes the list and flashes the new rows", async () => {
    logins
      .mockResolvedValueOnce(response([ADMIN], 1))
      .mockResolvedValueOnce(response([ADMIN, FIN], 0));
    createLeads.mockResolvedValue({
      created: [{ user_id: "usr_fin", email: FIN.email, department_code: "FIN", department_name: "Finance" }],
      skipped: [],
    });
    renderDialog();
    expect(await screen.findByText("1 department has no lead")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create missing leads" }));

    expect(await screen.findByText("1 lead login created.")).toBeInTheDocument();
    expect(await screen.findByText("acme-test-fin@hod.com")).toBeInTheDocument();
    expect(createLeads).toHaveBeenCalledWith("cmp_1");
    expect(screen.getByTestId("login-row-usr_fin")).toHaveAttribute("data-flash", "true");
    // Count is 0 now, so the footer offers only Done.
    expect(screen.queryByRole("button", { name: "Create missing leads" })).not.toBeInTheDocument();
  });

  it("creates leads with only the company id and reports the skipped ones", async () => {
    logins.mockResolvedValue(response([ADMIN], 1));
    createLeads.mockResolvedValue({ created: [], skipped: [{ department_code: "HR", reason: "taken" }] });
    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Create missing leads" }));
    expect(await screen.findByText("0 lead logins created, 1 skipped.")).toBeInTheDocument();
    // The server sets the fixed temporary password; the dialog sends none.
    expect(createLeads).toHaveBeenCalledWith("cmp_1");
  });

  it("shows a create failure and lets you try again", async () => {
    logins.mockResolvedValue(response([ADMIN], 1));
    createLeads.mockRejectedValue(new Error("Company not found"));
    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Create missing leads" }));
    expect(await screen.findByText("Company not found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create missing leads" })).toBeEnabled();
  });

  it("resets a password only after the confirm, and shows the new one", async () => {
    logins
      .mockResolvedValueOnce(response([ADMIN, FIN]))
      .mockResolvedValueOnce(response([ADMIN, { ...FIN, temp_password: null }]));
    resetPassword.mockResolvedValue({ user_id: "usr_fin", email: FIN.email, temp_password: "Fresh#Pass777" });
    renderDialog();
    await screen.findByText("acme-test-fin@hod.com");

    fireEvent.click(screen.getByRole("button", { name: "Reset password for acme-test-fin@hod.com" }));
    expect(screen.getByText("Reset password?")).toBeInTheDocument();
    expect(resetPassword).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    expect(await screen.findByText("New temporary password made for acme-test-fin@hod.com.")).toBeInTheDocument();
    expect(resetPassword).toHaveBeenCalledWith("cmp_1", "usr_fin");
    // The reset password differs from the admin's, so it shows on its row.
    await waitFor(() =>
      expect(screen.getAllByTestId("login-password-code").map((el) => el.textContent)).toContain("Fresh#Pass777"),
    );
    expect(logins).toHaveBeenCalledTimes(2);
  });

  it("shows the PM with its own badge, between the admin and the leads", async () => {
    // Shuffled on purpose: the dialog keeps admin -> PM -> leads whatever the
    // server sends, and the leads keep the server's own order.
    logins.mockResolvedValue(response([FIN, PM, HR, ADMIN]));
    renderDialog();
    await screen.findByText("acme-test@pm.com");
    expect(rowOrder()).toEqual(["usr_admin", "usr_pm", "usr_fin", "usr_hr"]);

    const pmRow = screen.getByTestId("login-row-usr_pm");
    const badge = within(pmRow).getByText("PM");
    expect(badge).toHaveClass("badge", "b-tl");
    expect(badge).toHaveAttribute("title", "Project manager");
    // Not mistaken for a lead, nor for the admin.
    expect(within(pmRow).queryByText(/Lead/)).not.toBeInTheDocument();
    expect(within(pmRow).queryByText("Admin")).not.toBeInTheDocument();
    expect(screen.getByText("Sign-in details for this company's admin, project manager and leads.")).toBeInTheDocument();
  });

  it("treats the PM as Spark-made: shared 1234 plate, Copy and an enabled Reset", async () => {
    logins.mockResolvedValue(
      response([
        { ...ADMIN, temp_password: "1234" },
        { ...PM, temp_password: "1234" },
        { ...FIN, temp_password: "1234" },
      ]),
    );
    renderDialog();
    await screen.findByText("acme-test@pm.com");
    // Everyone waiting has 1234, the PM included, so one plate covers them all.
    expect(screen.getAllByTestId("temp-password-plate")).toHaveLength(1);
    expect(screen.getByTestId("temp-password-code")).toHaveTextContent("1234");
    expect(screen.getByRole("button", { name: "Copy acme-test@pm.com" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset password for acme-test@pm.com" })).toBeEnabled();
  });

  it("shows the PM's own password behind Show when it differs from the rest", async () => {
    logins.mockResolvedValue(
      response([
        { ...ADMIN, temp_password: "1234" },
        { ...PM, temp_password: "Pm#Own5678" },
      ]),
    );
    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Show password for acme-test@pm.com" }));
    const pmRow = screen.getByTestId("login-row-usr_pm");
    expect(within(pmRow).getByTestId("login-password-code")).toHaveTextContent("Pm#Own5678");
  });

  it("resets the PM's password after the confirm", async () => {
    logins
      .mockResolvedValueOnce(response([{ ...ADMIN, temp_password: "1234" }, { ...PM, temp_password: "1234" }]))
      .mockResolvedValueOnce(response([{ ...ADMIN, temp_password: "1234" }, { ...PM, temp_password: "1234" }]));
    resetPassword.mockResolvedValue({ user_id: "usr_pm", email: PM.email, temp_password: "1234" });
    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Reset password for acme-test@pm.com" }));
    expect(screen.getByText("Reset password?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    expect(await screen.findByText("New temporary password made for acme-test@pm.com.")).toBeInTheDocument();
    expect(resetPassword).toHaveBeenCalledWith("cmp_1", "usr_pm");
    // Back to 1234 for everyone, so the one shared plate stays.
    await waitFor(() => expect(logins).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("temp-password-code")).toHaveTextContent("1234");
  });

  it("puts the PM on the sign-in sheet, after the admin and before the leads", async () => {
    logins.mockResolvedValue(
      response([
        { ...FIN, temp_password: "1234" },
        { ...PM, temp_password: "1234" },
        { ...ADMIN, temp_password: "1234" },
      ]),
    );
    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Download .txt" }));
    expect(downloadText).toHaveBeenCalledTimes(1);
    const [fileName, sheet] = downloadText.mock.calls[0] as [string, string];
    expect(fileName).toBe("centriyon-logins-acme-test.txt");
    expect(sheet).toContain("Temporary password: 1234");
    const lines = sheet.split("\n");
    const adminLine = lines.indexOf("Admin        acme-test@admin.com");
    const pmLine = lines.indexOf("PM           acme-test@pm.com");
    const finLine = lines.indexOf("Lead · FIN   acme-test-fin@hod.com");
    expect(adminLine).toBeGreaterThan(-1);
    expect(pmLine).toBe(adminLine + 1);
    expect(finLine).toBe(pmLine + 1);
  });

  it("drops a PM who already set a password from the sign-in sheet", async () => {
    logins.mockResolvedValue(
      response([
        { ...ADMIN, temp_password: "1234" },
        { ...PM, must_change_password: false, temp_password: null },
      ]),
    );
    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Download .txt" }));
    const sheet = downloadText.mock.calls[0][1] as string;
    expect(sheet).toContain("acme-test@admin.com");
    expect(sheet).not.toContain("acme-test@pm.com");
  });

  it("cancelling the confirm resets nothing", async () => {
    logins.mockResolvedValue(response([ADMIN]));
    renderDialog();
    await screen.findByText("acme-test@admin.com");
    fireEvent.click(screen.getByRole("button", { name: "Reset password for acme-test@admin.com" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText("Reset password?")).not.toBeInTheDocument());
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("uses the 'Logins created' header after a successful wizard", async () => {
    logins.mockResolvedValue(response([ADMIN, FIN]));
    renderDialog({
      origin: {
        ok: true,
        created: [{ user_id: "usr_fin", email: FIN.email, department_code: "FIN", department_name: "Finance" }],
        skipped: [],
      },
    });
    expect(screen.getByText("Logins created")).toBeInTheDocument();
    await screen.findByText("acme-test@admin.com");
    expect(logins).toHaveBeenCalledWith("cmp_1");
  });

  it("shows the wizard's error and makes Create missing leads the main action", async () => {
    logins.mockResolvedValue(response([ADMIN], 3));
    renderDialog({ origin: { ok: false, error: "Setup didn't finish." } });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn't create the department lead logins. Setup didn't finish",
    );
    const button = await screen.findByRole("button", { name: "Create missing leads" });
    expect(button).toHaveClass("bp");
  });

  it("leaves a real invited colleague out of the shared password and offers no reset", async () => {
    // The client admin invited cfo@client.com; the server sends no password
    // for them and refuses to reset them (403).
    const realColleague: SparkLogin = {
      user_id: "usr_cfo",
      email: "cfo@client.com",
      full_name: "Real CFO",
      role: "admin",
      department_code: null,
      department_name: null,
      must_change_password: true,
      temp_password: null,
    };
    logins.mockResolvedValue(response([ADMIN, realColleague, FIN]));
    renderDialog();
    await screen.findByText("cfo@client.com");

    // The shared plate stays, and nothing claims a password is unreadable.
    expect(screen.getByTestId("temp-password-code")).toHaveTextContent("Xk7#pQ2mRv9a");
    expect(screen.queryByText(/can't be shown again/)).not.toBeInTheDocument();

    // The .txt sheet lists only Spark's logins.
    fireEvent.click(screen.getByRole("button", { name: "Download .txt" }));
    const sheet = downloadText.mock.calls[0][1] as string;
    expect(sheet).toContain("acme-test@admin.com");
    expect(sheet).toContain("acme-test-fin@hod.com");
    expect(sheet).not.toContain("cfo@client.com");

    // Reset is offered on Spark's rows only; the real row's is disabled and says why.
    const realRow = screen.getByTestId("login-row-usr_cfo");
    const realReset = within(realRow).getByRole("button", { name: /^Reset password for cfo@client\.com is not available/ });
    expect(realReset).toBeDisabled();
    expect(realReset.parentElement).toHaveAttribute("title", "Real account: recovers through Forgot password");
    expect(within(realRow).queryByRole("button", { name: /^Show password/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset password for acme-test@admin.com" })).toBeEnabled();
  });

  it("keeps per-row Show off a real colleague when Spark's passwords differ", async () => {
    const realLead: SparkLogin = {
      ...FIN,
      user_id: "usr_hr",
      email: "head.hr@client.com",
      department_code: "HR",
      department_name: "HR",
      temp_password: null,
    };
    logins.mockResolvedValue(response([ADMIN, { ...FIN, temp_password: "Other#Pass99" }, realLead]));
    renderDialog();
    await screen.findByText("head.hr@client.com");
    expect(screen.getByText(/different temporary passwords/)).toBeInTheDocument();
    expect(screen.queryByText(/can't be shown again/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Show password for/ })).toHaveLength(2);
  });

  it("does not say everyone set a password while a real colleague is still waiting", async () => {
    logins.mockResolvedValue(
      response([
        { ...ADMIN, must_change_password: false, temp_password: null },
        { ...ADMIN, user_id: "usr_cfo", email: "cfo@client.com", temp_password: null },
      ]),
    );
    renderDialog();
    await screen.findByText("cfo@client.com");
    expect(screen.queryByText("Everyone has set their own password.")).not.toBeInTheDocument();
    expect(screen.queryByText(/can't be shown again/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("temp-password-plate")).not.toBeInTheDocument();
  });

  it("drops the wizard's error once Create missing leads works", async () => {
    logins
      .mockResolvedValueOnce(response([ADMIN], 1))
      .mockResolvedValueOnce(response([ADMIN, FIN], 0));
    createLeads.mockResolvedValue({
      created: [{ user_id: "usr_fin", email: FIN.email, department_code: "FIN", department_name: "Finance" }],
      skipped: [],
    });
    renderDialog({ origin: { ok: false, error: "Setup didn't finish." } });
    fireEvent.click(await screen.findByRole("button", { name: "Create missing leads" }));
    expect(await screen.findByText("1 lead login created.")).toBeInTheDocument();
    expect(screen.queryByText(/We couldn't create the department lead logins/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the wizard's error when Create missing leads fails again", async () => {
    logins.mockResolvedValue(response([ADMIN], 1));
    createLeads.mockRejectedValue(new Error("Still down"));
    renderDialog({ origin: { ok: false, error: "Setup didn't finish." } });
    fireEvent.click(await screen.findByRole("button", { name: "Create missing leads" }));
    expect(await screen.findByText("Still down")).toBeInTheDocument();
    expect(screen.getByText(/We couldn't create the department lead logins/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create missing leads" })).toHaveClass("bp");
  });

  it("disables Done while the logins load", async () => {
    let finishLoading: (value: SparkLoginsResponse) => void = () => {};
    logins.mockReturnValue(new Promise<SparkLoginsResponse>((resolve) => (finishLoading = resolve)));
    renderDialog();
    expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
    finishLoading(response([ADMIN]));
    await screen.findByText("acme-test@admin.com");
    expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
  });

  it("closes with Done", async () => {
    logins.mockResolvedValue(response([ADMIN]));
    const { onClose } = renderDialog();
    await screen.findByText("acme-test@admin.com");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("Annual Report landing opens the Logins dialog once", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    list.mockResolvedValue([]);
    logins.mockResolvedValue(response([ADMIN, FIN]));
  });

  it("opens for Spark when the wizard left a record, and clears it", async () => {
    authValue = { user: { role: "spark_internal" }, actingCompany: { id: "cmp_1", name: "Acme Test" } };
    sessionStorage.setItem(
      "spark:newLogins:cmp_1",
      JSON.stringify({ ok: true, created: [], skipped: [] }),
    );
    render(<CyclesListPage />);
    expect(await screen.findByText("Logins created")).toBeInTheDocument();
    expect(sessionStorage.getItem("spark:newLogins:cmp_1")).toBeNull();
    expect(logins).toHaveBeenCalledWith("cmp_1");
  });

  it("stays shut for Spark without a record", async () => {
    authValue = { user: { role: "spark_internal" }, actingCompany: { id: "cmp_1", name: "Acme Test" } };
    render(<CyclesListPage />);
    await screen.findByText("No cycles found");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(logins).not.toHaveBeenCalled();
  });

  it("ignores the record for a client admin", async () => {
    authValue = { user: { role: "admin" }, actingCompany: null };
    sessionStorage.setItem("spark:newLogins:cmp_1", JSON.stringify({ ok: true, created: [], skipped: [] }));
    render(<CyclesListPage />);
    await screen.findByText("No cycles found");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Not even read: the key is left alone.
    expect(sessionStorage.getItem("spark:newLogins:cmp_1")).not.toBeNull();
  });
});
