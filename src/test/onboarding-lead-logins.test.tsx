// Spark "Create department lead logins" in the onboarding wizard (spec 5.2, 5.3).
//
// What must hold:
//   - Only spark_internal sees the card on the Departments step. A client admin
//     gets today's screen, grid height included.
//   - The popover asks the server for the preview emails by department name,
//     so they match what the server will create, and shows the fixed
//     temporary password 1234.
//   - The leads are created AFTER completeOnboarding succeeds (the departments
//     only exist then) and BEFORE the app opens, exactly once, and never when
//     onboarding failed.
//   - The result is left in sessionStorage for the Logins dialog. No password
//     is sent: the server sets the fixed one itself.
//
// BrandStep and UploadReportsStep are stubbed: they have their own tests and
// heavy dependencies, and here they are only doors to the next step.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const navigate = vi.fn();
const completeOnboarding = vi.fn();
const departmentOptions = vi.fn();
const leadEmails = vi.fn();
const createLeads = vi.fn();
const getMyCompany = vi.fn();
const ingestOnboarding = vi.fn();

type TestUser = { role: string; company_id: string; company_name: string };
let authUser: TestUser = { role: "admin", company_id: "cmp_1", company_name: "Acme" };

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: authUser, completeOnboarding, refresh: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  auth: { onboardingDepartmentOptions: () => departmentOptions() },
  sparkInternal: {
    leadEmails: (companyId: string, departmentNames: string[]) => leadEmails(companyId, departmentNames),
    createLeads: (companyId: string) => createLeads(companyId),
  },
  companies: {
    getMyCompany: () => getMyCompany(),
    ingestOnboarding: (...args: unknown[]) => ingestOnboarding(...args),
  },
  extractCompanyProfile: vi.fn(),
  getSectors: () => Promise.resolve([{ id: "sec_fin", code: "financial_services", name: "Financial Services" }]),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message?: string) {
      super(message ?? `ApiError ${status}`);
      this.status = status;
    }
  },
}));

vi.mock("@/pages/onboarding/BrandStep", () => ({
  default: ({ onContinue }: { onContinue: () => void }) => (
    <button type="button" onClick={onContinue}>Brand continue</button>
  ),
}));

vi.mock("@/pages/onboarding/UploadReportsStep", () => ({
  default: ({
    onProcess,
    onSkip,
  }: {
    onProcess: (files: unknown[]) => void;
    onSkip?: () => void;
  }) => (
    <>
      <button type="button" onClick={onSkip}>Skip uploads</button>
      <button
        type="button"
        onClick={() =>
          onProcess([{ file: new File(["x"], "ar.pdf"), docType: "annual_report", documentId: "doc_1", period: "2025" }])
        }
      >
        Process uploads
      </button>
    </>
  ),
}));

const { default: OnboardingPage } = await import("@/pages/OnboardingPage");
const { default: DepartmentSelectionStep } = await import("@/pages/onboarding/DepartmentSelectionStep");
const { default: SetupInProgressAnimation } = await import("@/pages/onboarding/SetupInProgressAnimation");

const SPARK_COMPANY_ID = "cmp_9";
const NEW_LOGINS_KEY = `spark:newLogins:${SPARK_COMPANY_ID}`;

const OPTIONS = [
  { code: "FIN", name: "Finance", description: "Money", category: "core" },
  { code: "HR", name: "Human Resources", description: "People", category: "support" },
  { code: "IR", name: "Investor Relations", description: "Investors", category: "commercial" },
  { code: "ESG", name: "Sustainability", description: "Planet", category: "core" },
];

// The server answers by department name; a department not created yet has no
// code, so the badge code is looked up by name.
const PREVIEW_EMAILS = [
  { department_code: null, department_name: "Finance", email: "finance-acme@hod.com" },
  { department_code: null, department_name: "Human Resources", email: "human-resources-acme@hod.com" },
  { department_code: null, department_name: "Investor Relations", email: "investor-relations-acme@hod.com" },
  { department_code: null, department_name: "Sustainability", email: "sustainability-acme@hod.com" },
];

const CREATED = [
  { user_id: "u_1", email: "finance-acme@hod.com", department_code: "FIN", department_name: "Finance" },
];

// A company row that sends the wizard straight to Review with every required
// field filled except the fiscal year, which is never seeded (see OnboardingPage).
const COMPANY = {
  id: SPARK_COMPANY_ID,
  name: "Acme",
  description: "Acme is a Saudi investment bank with a long enough description.",
  sector_id: "sec_fin",
  employee_count: 50,
  company_profile: "listed",
  reporting_sector: "banking",
  profile_extraction_status: "done",
  report_extraction_status: "done",
  // A Spark user made it, so the server allows lead logins for it.
  created_by: "spark_user_1",
};

function useSparkUser(): void {
  authUser = { role: "spark_internal", company_id: SPARK_COMPANY_ID, company_name: "Acme" };
}

beforeEach(() => {
  sessionStorage.clear();
  authUser = { role: "admin", company_id: "cmp_1", company_name: "Acme" };
  navigate.mockReset();
  completeOnboarding.mockReset().mockResolvedValue(undefined);
  departmentOptions.mockReset().mockResolvedValue({ departments: OPTIONS });
  leadEmails.mockReset().mockResolvedValue({ emails: PREVIEW_EMAILS });
  createLeads.mockReset().mockResolvedValue({ created: CREATED, skipped: [] });
  getMyCompany.mockReset().mockResolvedValue({ ...COMPANY });
  ingestOnboarding.mockReset().mockResolvedValue({});
});

afterEach(() => vi.restoreAllMocks());

/** Render the wizard and click through Review and Brand to the Departments step. */
async function openDepartmentsStep() {
  const view = render(
    <MemoryRouter>
      <OnboardingPage />
    </MemoryRouter>,
  );
  await screen.findByText(/Review Company Details/i);
  fireEvent.change(screen.getByDisplayValue("Select month"), { target: { value: "12" } });
  fireEvent.click(screen.getByRole("button", { name: /Looks good, Continue/i }));
  fireEvent.click(await screen.findByRole("button", { name: "Brand continue" }));
  await screen.findByText(/4 \/ 4 selected/);
  return view;
}

/** From the Departments step, continue and skip the uploads, which starts setup. */
function continueAndSkipUploads(): void {
  fireEvent.click(screen.getByRole("button", { name: /Continue →/ }));
  fireEvent.click(screen.getByRole("button", { name: "Skip uploads" }));
}

/** The department grid: the scroll box that holds the category groups. */
function departmentGrid(): HTMLElement {
  return screen.getByText("Core Operations").parentElement?.parentElement as HTMLElement;
}

describe("Departments step card", () => {
  it("is hidden for a client admin, who keeps today's grid height", async () => {
    await openDepartmentsStep();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByText("Create department lead logins")).toBeNull();
    expect(departmentGrid().style.maxHeight).toBe("340px");
  });

  it("shows for Spark, off by default, with the shorter grid", async () => {
    useSparkUser();
    await openDepartmentsStep();
    const toggle = screen.getByRole("switch", { name: "Create department lead logins" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(departmentGrid().style.maxHeight).toBe("288px");
    // No "View N logins" until the switch is on.
    expect(screen.queryByRole("button", { name: /View 4 lead logins/ })).toBeNull();
  });

  it("is hidden for Spark on a self-signup company, which the server refuses", async () => {
    useSparkUser();
    getMyCompany.mockResolvedValue({ ...COMPANY, created_by: null });
    await openDepartmentsStep();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByText("Create department lead logins")).toBeNull();
    expect(departmentGrid().style.maxHeight).toBe("340px");
  });

  it("creates no leads for Spark on a self-signup company", async () => {
    useSparkUser();
    getMyCompany.mockResolvedValue({ ...COMPANY, created_by: null });
    await openDepartmentsStep();
    continueAndSkipUploads();
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(createLeads).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(NEW_LOGINS_KEY)).toBeNull();
  });

  it("hides the View link when no department is selected", async () => {
    render(
      <DepartmentSelectionStep
        selectedCodes={[]}
        onSelect={() => {}}
        onBack={() => {}}
        onSubmit={() => {}}
        onOptionsLoaded={() => {}}
        leadLogins={{ enabled: true, onChange: () => {}, companyId: SPARK_COMPANY_ID }}
      />,
    );
    // Loading first, so the card waits for the options.
    expect(screen.queryByRole("switch")).toBeNull();
    await screen.findByRole("switch");
    expect(screen.queryByRole("button", { name: /lead logins/ })).toBeNull();
  });

  it("asks for the preview emails by department name and lists them", async () => {
    useSparkUser();
    await openDepartmentsStep();

    fireEvent.click(screen.getByRole("switch", { name: "Create department lead logins" }));
    fireEvent.click(screen.getByRole("button", { name: "View 4 lead logins" }));

    const list = await screen.findByRole("list");
    expect(screen.getByTestId("leads-card")).toBeInTheDocument();
    expect(screen.getByTestId("leads-popover")).toContainElement(list);
    expect(leadEmails).toHaveBeenCalledWith(SPARK_COMPANY_ID, [
      "Finance",
      "Human Resources",
      "Investor Relations",
      "Sustainability",
    ]);
    for (const item of PREVIEW_EMAILS) {
      expect(within(list).getByText(item.email)).toBeInTheDocument();
    }
    // The server sent no codes, so each badge code comes from the name.
    for (const code of ["FIN", "HR", "IR", "ESG"]) {
      expect(within(list).getByText(code)).toBeInTheDocument();
    }
  });

  it("shows the fixed temporary password in the popover footer", async () => {
    useSparkUser();
    await openDepartmentsStep();
    fireEvent.click(screen.getByRole("switch", { name: "Create department lead logins" }));
    fireEvent.click(screen.getByRole("button", { name: "View 4 lead logins" }));
    await screen.findByRole("list");
    const popover = screen.getByTestId("leads-popover");
    expect(within(popover).getByText("1234").parentElement).toHaveTextContent("Temporary password: 1234");
    expect(within(popover).getByText("If an address is already used, a number is added.")).toBeInTheDocument();
  });

  it("offers Retry when the preview can't be loaded", async () => {
    useSparkUser();
    leadEmails.mockRejectedValueOnce(new Error("boom"));
    await openDepartmentsStep();
    fireEvent.click(screen.getByRole("switch", { name: "Create department lead logins" }));
    fireEvent.click(screen.getByRole("button", { name: "View 4 lead logins" }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await screen.findByRole("list");
    expect(leadEmails).toHaveBeenCalledTimes(2);
  });
});

describe("creating the leads after the wizard", () => {
  it("creates them once, after onboarding and before the app opens, with only the company id", async () => {
    useSparkUser();
    await openDepartmentsStep();
    fireEvent.click(screen.getByRole("switch", { name: "Create department lead logins" }));
    continueAndSkipUploads();

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/annual-report", expect.anything()));
    expect(createLeads).toHaveBeenCalledTimes(1);
    expect(createLeads).toHaveBeenCalledWith(SPARK_COMPANY_ID);
    expect(completeOnboarding.mock.invocationCallOrder[0]).toBeLessThan(createLeads.mock.invocationCallOrder[0]);
    expect(createLeads.mock.invocationCallOrder[0]).toBeLessThan(navigate.mock.invocationCallOrder[0]);

    const stored = sessionStorage.getItem(NEW_LOGINS_KEY) as string;
    expect(JSON.parse(stored)).toEqual({ ok: true, created: CREATED, skipped: [] });
  });

  it("keeps the company the wizard opened on, even after a switch in another tab", async () => {
    useSparkUser();
    await openDepartmentsStep();
    // Another tab switches the acting company; the next render sees it.
    authUser = { role: "spark_internal", company_id: "cmp_other", company_name: "Other" };
    fireEvent.click(screen.getByRole("switch", { name: "Create department lead logins" }));
    continueAndSkipUploads();

    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(createLeads).toHaveBeenCalledWith(SPARK_COMPANY_ID);
    expect(sessionStorage.getItem(NEW_LOGINS_KEY)).not.toBeNull();
  });

  it("records an error when creating the leads fails, and still opens the app", async () => {
    useSparkUser();
    createLeads.mockRejectedValueOnce(new Error("Server down"));
    await openDepartmentsStep();
    fireEvent.click(screen.getByRole("switch", { name: "Create department lead logins" }));
    continueAndSkipUploads();

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    const stored = sessionStorage.getItem(NEW_LOGINS_KEY) as string;
    const record = JSON.parse(stored);
    expect(record.ok).toBe(false);
    // Only the reason: the Logins dialog adds its own leading sentence.
    expect(record.error).toBe("Server down");
  });

  it("creates nothing when the switch stays off", async () => {
    useSparkUser();
    await openDepartmentsStep();
    continueAndSkipUploads();

    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(createLeads).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(NEW_LOGINS_KEY)).toBeNull();
  });

  it("never calls the Spark API for a client admin", async () => {
    await openDepartmentsStep();
    continueAndSkipUploads();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/dashboard", expect.anything()));
    expect(createLeads).not.toHaveBeenCalled();
    expect(leadEmails).not.toHaveBeenCalled();
  });

  it("records that setup failed when onboarding fails on the files path", async () => {
    useSparkUser();
    completeOnboarding.mockRejectedValue(new Error("nope"));
    await openDepartmentsStep();
    fireEvent.click(screen.getByRole("switch", { name: "Create department lead logins" }));
    fireEvent.click(screen.getByRole("button", { name: /Continue →/ }));
    fireEvent.click(screen.getByRole("button", { name: "Process uploads" }));

    // The files path polls the ingest once (after 1.5 s) before finishing.
    await waitFor(() => expect(navigate).toHaveBeenCalled(), { timeout: 4000 });
    expect(createLeads).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem(NEW_LOGINS_KEY) as string)).toEqual({
      ok: false,
      error: "Setup didn't finish.",
    });
  });
});

describe("SetupInProgressAnimation's onOnboarded", () => {
  const PAYLOAD = { description: "x".repeat(30) } as never;
  const FILES = [{ file: new File(["x"], "ar.pdf"), docType: "annual_report", documentId: "doc_1", period: "2025" }] as never;

  function renderSetup(props: Record<string, unknown>) {
    return render(<SetupInProgressAnimation payload={PAYLOAD} landingPath="/annual-report" {...props} />);
  }

  it("is awaited once after success on the no-files path, before the app opens", async () => {
    let finishCallback: () => void = () => {};
    const onOnboarded = vi.fn(() => new Promise<void>((resolve) => { finishCallback = resolve; }));
    renderSetup({ onOnboarded });

    await waitFor(() => expect(onOnboarded).toHaveBeenCalledTimes(1));
    // Still waiting on the callback, so the app hasn't opened yet.
    expect(navigate).not.toHaveBeenCalled();
    finishCallback();
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    expect(onOnboarded).toHaveBeenCalledTimes(1);
  });

  it("is called once after success on the files path", async () => {
    const onOnboarded = vi.fn().mockResolvedValue(undefined);
    const onOnboardingFailed = vi.fn();
    renderSetup({ files: FILES, onOnboarded, onOnboardingFailed });

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(onOnboarded).toHaveBeenCalledTimes(1);
    expect(onOnboardingFailed).not.toHaveBeenCalled();
    expect(completeOnboarding.mock.invocationCallOrder[0]).toBeLessThan(onOnboarded.mock.invocationCallOrder[0]);
  });

  it("is never called when onboarding fails on the no-files path", async () => {
    completeOnboarding.mockRejectedValue(new Error("Setup failed badly"));
    const onOnboarded = vi.fn().mockResolvedValue(undefined);
    renderSetup({ onOnboarded });

    await screen.findByText(/Setup failed badly/);
    expect(onOnboarded).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("calls onOnboardingFailed instead when onboarding fails on the files path", async () => {
    completeOnboarding.mockRejectedValue(new Error("nope"));
    const onOnboarded = vi.fn().mockResolvedValue(undefined);
    const onOnboardingFailed = vi.fn();
    renderSetup({ files: FILES, onOnboarded, onOnboardingFailed });

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(onOnboarded).not.toHaveBeenCalled();
    expect(onOnboardingFailed).toHaveBeenCalledTimes(1);
  });

  it("still opens the app when the callback throws", async () => {
    const onOnboarded = vi.fn().mockRejectedValue(new Error("unexpected"));
    renderSetup({ onOnboarded });
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
  });

  it("does not restart the flow when the parent passes a new callback", async () => {
    let finishCallback: () => void = () => {};
    const first = vi.fn(() => new Promise<void>((resolve) => { finishCallback = resolve; }));
    const view = renderSetup({ onOnboarded: first });
    await waitFor(() => expect(first).toHaveBeenCalledTimes(1));

    view.rerender(
      <SetupInProgressAnimation payload={PAYLOAD} landingPath="/annual-report" onOnboarded={vi.fn()} />,
    );
    finishCallback();
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    expect(completeOnboarding).toHaveBeenCalledTimes(1);
  });
});
