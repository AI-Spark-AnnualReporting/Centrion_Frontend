// Company licensing in the frontend:
//  - spark_admin is pinned to /spark (no company of its own)
//  - spark_admin's key form sends what was typed (blank number = unlimited)
//  - the client admin's banner appears only when the license isn't active,
//    and refreshes the login the moment Spark activates it.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import type { CompanyLicense } from "@/types/license";

let mockAuth: Record<string, unknown> = {};

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

vi.mock("@/lib/appRouting", () => ({
  shouldStayInCentriton: () => true,
  redirectToApp: vi.fn(),
}));

vi.mock("@/lib/features", () => ({
  isFeatureVisible: () => true,
}));

const licenseGet = vi.fn();
const requestUpgrade = vi.fn();
const licenseUsage = vi.fn();
const generate = vi.fn();
const resetWithCode = vi.fn();

vi.mock("@/lib/api", () => ({
  license: {
    get: (...args: unknown[]) => licenseGet(...args),
    usage: (...args: unknown[]) => licenseUsage(...args),
    requestUpgrade: (...args: unknown[]) => requestUpgrade(...args),
  },
  sparkLicenses: { generate: (...args: unknown[]) => generate(...args) },
  auth: { resetPasswordWithCode: (...args: unknown[]) => resetWithCode(...args) },
}));

const { ProtectedRoute } = await import("@/components/ProtectedRoute");
const { LicenseBanner, PageLimitBanner, pickBanner, daysUntil } = await import("@/components/license/LicenseBanner");
const { LicenseKeyForm } = await import("@/components/spark/LicenseKeyForm");
const { ResetWithCodePage } = await import("@/components/auth/ResetWithCodePage");

const SPARK_ADMIN = {
  user_id: "usr_sa",
  email: "owner@wearespark.me",
  full_name: "Spark Admin",
  role: "spark_admin",
  company_id: null,
  must_change_password: false,
  onboarding_completed: true,
};

const CLIENT_ADMIN = { ...SPARK_ADMIN, user_id: "usr_a", role: "admin", company_id: "cmp_1" };

const MODULES = [
  { key: "board_report", label: "Board Report", report_type: "board_report" },
  { key: "quarterly_report", label: "Quarterly Report", report_type: "quarterly" },
  { key: "leadership", label: "Leadership", report_type: null },
];

function licenseOf(status: string, extra: Record<string, unknown> = {}): CompanyLicense {
  return {
    deployment: "cloud", status, message: null, starts_at: null, expires_at: null,
    modules: [], report_limits: {}, max_seats: null, seats_used: 0, reports_used: {},
    lock_id: null, lock_reason: null, server_id: null, upgrade_requested_at: null,
    modules_catalogue: MODULES, ...extra,
  } as CompanyLicense;
}

describe("spark_admin routing", () => {
  beforeEach(() => {
    mockAuth = { user: SPARK_ADMIN, loading: false, actingCompany: null };
  });

  function renderAt(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<div>DASHBOARD</div>} />
            <Route path="/spark" element={<div>SPARK HOME</div>} />
            <Route path="/spark/licenses" element={<div>LICENSES</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  }

  it("sends spark_admin from any company page to /spark", () => {
    renderAt("/dashboard");
    expect(screen.getByText("SPARK HOME")).toBeInTheDocument();
  });

  it("lets spark_admin open the Licenses page", () => {
    renderAt("/spark/licenses");
    expect(screen.getByText("LICENSES")).toBeInTheDocument();
  });
});

describe("LicenseKeyForm", () => {
  const today = new Date().toISOString().slice(0, 10);
  const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const ACTIVE_ROW = {
    company_id: "cmp_1", company_name: "Aramco", deployment: "cloud", status: "active",
    starts_at: addDays(today, -1), expires_at: addDays(today, 363), issued_at: null,
    modules: ["board_report", "quarterly_report"], report_limits: { board_report: 10, quarterly: 1 },
    max_seats: 21, server_id: null, seats_used: 20, reports_counted: {},
    reports_used: { board_report: 2, quarterly: 1 }, lock: null, open_upgrade_requests: 0,
  };
  const formFor = (row: object) =>
    render(<LicenseKeyForm row={row as never} modules={MODULES} onDone={vi.fn()} onCancel={vi.fn()} />);

  beforeEach(() => {
    generate.mockReset();
    generate.mockResolvedValue({ license_key: "KEY", activated: false, claims: {} });
  });

  it("no license yet: starts today, sends the typed limits, and shows an on-prem key to copy", async () => {
    const row = {
      company_id: "cmp_onprem", company_name: "BUPA", deployment: "on_prem", status: "none",
      starts_at: null, expires_at: null, issued_at: null, modules: ["board_report", "quarterly_report"],
      report_limits: { board_report: 10 }, max_seats: 25, server_id: "SRV-AAAA-BBBB-CCCC", seats_used: null,
      reports_counted: {}, lock: null, open_upgrade_requests: 0,
    };
    formFor(row);
    expect(screen.getByText(/Generate license key — BUPA/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(await screen.findByRole("button", { name: "Generate key" }));

    await waitFor(() => expect(generate).toHaveBeenCalled());
    const [companyId, body] = generate.mock.calls[0];
    expect(companyId).toBe("cmp_onprem");
    expect(body.starts_at).toBe(today);
    expect(body.report_limits).toEqual({ board_report: 10, quarterly: null });
    expect(body.max_seats).toBe(25);
    expect(body.server_id).toBe("SRV-AAAA-BBBB-CCCC");
    expect(await screen.findByText("License key")).toBeInTheDocument();
    expect(screen.getByDisplayValue("KEY")).toBeInTheDocument();
  });

  it("active: an upgrade keeps the start date and nothing can go down", async () => {
    formFor(ACTIVE_ROW);
    expect(screen.getByText(/Upgrade license — Aramco/)).toBeInTheDocument();
    expect(screen.getByText(/^Started /)).toBeInTheDocument();
    expect(screen.queryByDisplayValue(ACTIVE_ROW.starts_at)).not.toBeInTheDocument();   // start isn't editable

    fireEvent.change(screen.getByLabelText("Board Report max reports"), { target: { value: "9" } });
    expect(screen.getByText("Min 10 (now)")).toBeInTheDocument();           // current limit 10, 2 used
    fireEvent.change(screen.getByLabelText("Users"), { target: { value: "20" } });
    expect(screen.getByText("Min 21 (now)")).toBeInTheDocument();           // current max 21, 20 users
    expect(screen.getByRole("button", { name: "Review" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Board Report" })).toBeDisabled();   // can't remove a module

    fireEvent.change(screen.getByLabelText("Board Report max reports"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Users"), { target: { value: "25" } });
    expect(screen.getByText("+2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByText("Upgrade Aramco's license?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Upgrade and activate" }));
    await waitFor(() => expect(generate).toHaveBeenCalled());
    expect(generate.mock.calls[0][1].starts_at).toBe(ACTIVE_ROW.starts_at);
  });

  it("expired: a renewal starts today and report counts start again, so any limit is fine", async () => {
    formFor({ ...ACTIVE_ROW, status: "expired", starts_at: addDays(today, -370), expires_at: addDays(today, -5) });
    expect(screen.getByText(/Renew license — Aramco/)).toBeInTheDocument();
    expect(screen.getByText(/expired 5 days ago/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Board Report max reports"), { target: { value: "1" } });
    expect(screen.queryByText(/\(used\)/)).not.toBeInTheDocument();
    expect(screen.getByText(/Users don't reset/)).toBeInTheDocument();
    // Counts restart, so no +/− against last period's limit; the column says it's last period.
    expect(screen.getByText("Last period: used / limit")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Quarterly Report max reports"), { target: { value: "5" } });
    expect(screen.queryByText("+4")).not.toBeInTheDocument();
    expect(screen.getByText("20 already have an account — at least 20")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    // The confirm step says what a renewal means, in words.
    expect(screen.getByText("Users: 21 in total (20 now, 1 more can be added)")).toBeInTheDocument();
    expect(screen.getByText("Board Report: 1 new reports this period")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Renew and activate" }));
    await waitFor(() => expect(generate).toHaveBeenCalled());
    expect(generate.mock.calls[0][1].starts_at).toBe(today);
  });

  it("in the last 30 days it still only upgrades, and says how to avoid a gap", () => {
    formFor({ ...ACTIVE_ROW, expires_at: addDays(today, 15) });
    expect(screen.getByText(/Upgrade license — Aramco/)).toBeInTheDocument();
    expect(screen.getByText(/Renewal opens when it expires on/)).toBeInTheDocument();
  });

  it("the same limit as now says it isn't an upgrade yet", () => {
    formFor(ACTIVE_ROW);
    expect(screen.getByText("Same as now — enter more than 1 to upgrade")).toBeInTheDocument();   // Quarterly 1 / 1
    fireEvent.change(screen.getByLabelText("Quarterly Report max reports"), { target: { value: "3" } });
    expect(screen.queryByText("Same as now — enter more than 1 to upgrade")).not.toBeInTheDocument();
    expect(screen.getByText("Same as now — enter more than 10 to upgrade")).toBeInTheDocument();   // Board 10 unchanged
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("a client's request is shown and already filled in", () => {
    formFor({
      ...ACTIVE_ROW,
      open_request: {
        sent_at: "2026-11-03T09:00:00Z", asked_by: "Aizaz",
        lines: ["Users: 23", "Board Report: 12", "Confirmed by Aizaz on 2026-11-03"],
        asked: { renewal: false, max_seats: 23, report_limits: { board_report: 12 } },
      },
    });
    expect(screen.getByText("Aramco asked for:")).toBeInTheDocument();
    expect(screen.getByText("Users 21 → 23 (+2)")).toBeInTheDocument();
    expect(screen.getByText("Board Report 10 → 12 (+2)")).toBeInTheDocument();
    expect(screen.getByText(/already filled in below/)).toBeInTheDocument();
    expect(screen.getByLabelText("Users")).toHaveValue("23");
    expect(screen.getByLabelText("Board Report max reports")).toHaveValue("12");
    expect(screen.getAllByText("✓ As asked")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Board Report max reports"), { target: { value: "15" } });
    expect(screen.getByText("Asked for 12")).toBeInTheDocument();
  });

  it("an old request without numbers shows the text but doesn't fill in", () => {
    formFor({ ...ACTIVE_ROW, open_request: { sent_at: "2026-11-01T09:00:00Z", asked_by: "Aizaz", lines: ["Users: 30"], asked: null } });
    expect(screen.getByText("Users: 30")).toBeInTheDocument();
    expect(screen.getByText(/fill it in below/)).toBeInTheDocument();
    expect(screen.getByLabelText("Users")).toHaveValue("21");
  });

  it("nothing changed means nothing to review", () => {
    formFor(ACTIVE_ROW);
    expect(screen.getByText("No changes yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review" })).toBeDisabled();
  });
});

describe("LicenseBanner", () => {
  beforeEach(() => {
    licenseGet.mockReset();
  });

  function renderBanner() {
    return render(
      <MemoryRouter>
        <LicenseBanner />
      </MemoryRouter>,
    );
  }

  it("says the license isn't active yet for a new company", async () => {
    mockAuth = { user: CLIENT_ADMIN, refreshPermissions: vi.fn() };
    licenseGet.mockResolvedValue(licenseOf("none"));
    renderBanner();
    expect(await screen.findByText("Your company doesn't have a license yet.")).toBeInTheDocument();
  });

  it("shows the Lock ID when locked", async () => {
    mockAuth = { user: CLIENT_ADMIN, refreshPermissions: vi.fn() };
    licenseGet.mockResolvedValue(licenseOf("locked", { lock_id: "LCK-4F2A" }));
    renderBanner();
    expect(await screen.findByText("LCK-4F2A")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy Lock ID" })).toBeInTheDocument();
  });

  it("shows nothing when active, and nothing for other roles", async () => {
    mockAuth = { user: CLIENT_ADMIN, refreshPermissions: vi.fn() };
    licenseGet.mockResolvedValue(licenseOf("active"));
    const { container } = renderBanner();
    await waitFor(() => expect(licenseGet).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();

    licenseGet.mockClear();
    mockAuth = { user: { ...CLIENT_ADMIN, role: "hod" }, refreshPermissions: vi.fn() };
    renderBanner();
    expect(licenseGet).not.toHaveBeenCalled();
  });

  it("refreshes the login when Spark adds a module to an active license", async () => {
    const refreshPermissions = vi.fn().mockResolvedValue(undefined);
    mockAuth = { user: CLIENT_ADMIN, refreshPermissions };
    const far = { starts_at: "2026-01-01", expires_at: "2099-12-31" };
    licenseGet.mockResolvedValueOnce(licenseOf("active", { ...far, modules: ["board_report"] }))
      .mockResolvedValue(licenseOf("active", { ...far, modules: ["board_report", "leadership"] }));
    const Go = () => { const navigate = useNavigate(); return <button onClick={() => navigate("/b")}>go</button>; };
    render(<MemoryRouter initialEntries={["/a"]}><LicenseBanner /><Go /></MemoryRouter>);
    await waitFor(() => expect(licenseGet).toHaveBeenCalledTimes(1));
    expect(refreshPermissions).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "go" }));   // a page change re-checks the license
    await waitFor(() => expect(refreshPermissions).toHaveBeenCalledTimes(1));
  });

  it("refreshes the login when Spark activates the license", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const refreshPermissions = vi.fn().mockResolvedValue(undefined);
    mockAuth = { user: CLIENT_ADMIN, refreshPermissions };
    licenseGet.mockResolvedValueOnce(licenseOf("none")).mockResolvedValue(licenseOf("active"));
    renderBanner();
    await screen.findByText("Your company doesn't have a license yet.");

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    await waitFor(() => expect(refreshPermissions).toHaveBeenCalledTimes(1));
    vi.useRealTimers();
  });
});


describe("ResetWithCodePage (on-premises password reset)", () => {
  function fill() {
    render(
      <MemoryRouter>
        <ResetWithCodePage />
      </MemoryRouter>,
    );
    const inputs = document.querySelectorAll("input, textarea");
    fireEvent.change(inputs[0], { target: { value: "ahmed@bupa.com" } });
    fireEvent.change(inputs[1], { target: { value: " CODE " } });
    fireEvent.change(inputs[2], { target: { value: "NewPassw0rd" } });
    fireEvent.change(inputs[3], { target: { value: "NewPassw0rd" } });
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));
  }

  it("sends the email, the code and the new password", async () => {
    resetWithCode.mockReset().mockResolvedValue({ reset: true });
    fill();
    await waitFor(() => expect(resetWithCode).toHaveBeenCalledWith("ahmed@bupa.com", "CODE", "NewPassw0rd"));
  });

  it("shows the backend's reason when the code is refused", async () => {
    resetWithCode.mockReset().mockRejectedValue(new Error("This reset code has already been used. Ask Centriyon for a new one."));
    fill();
    expect(await screen.findByText(/already been used/)).toBeInTheDocument();
  });
});


describe("LicenseBanner details", () => {
  const ACTIVE = (extra: Record<string, unknown> = {}) =>
    licenseOf("active", {
      modules: ["board_report", "quarterly_report", "leadership"],
      starts_at: "2026-01-01", expires_at: "2026-12-31",
      report_limits: { board_report: 10, quarterly: 8 },
      reports_used: { board_report: 3, quarterly: 2 },
      max_seats: 25, seats_used: 4, ...extra,
    });
  const NONE_CLOSED = new Set<"ending">();

  beforeEach(() => {
    licenseGet.mockReset();
    requestUpgrade.mockReset().mockResolvedValue({ requested: true, details: "" });
    localStorage.clear();
    mockAuth = { user: CLIENT_ADMIN, refreshPermissions: vi.fn() };
  });

  it("names the modules in the key when read-only, and all modules when there's no license", () => {
    const expired = pickBanner(ACTIVE({ status: "expired" }), NONE_CLOSED, "2027-01-05")!;
    expect(expired.tone).toBe("red");
    expect(expired.title).toBe("Your license expired on 31 Dec 2026.");
    expect(expired.rows[0].items).toEqual(["Board Report", "Quarterly Report", "Leadership"]);

    const none = pickBanner(licenseOf("none"), NONE_CLOSED)!;
    expect(none.rows[0].items).toEqual(["Board Report", "Quarterly Report", "Leadership"]); // the whole catalogue
  });

  it("shows nothing for a healthy active license", () => {
    expect(pickBanner(ACTIVE(), NONE_CLOSED, "2026-06-01")).toBeNull();
  });

  it("warns 30 days before the end, not 31", () => {
    expect(daysUntil("2026-12-31", "2026-12-01")).toBe(30);
    expect(pickBanner(ACTIVE(), NONE_CLOSED, "2026-11-30")).toBeNull();
    const ending = pickBanner(ACTIVE(), NONE_CLOSED, "2026-12-19")!;
    expect(ending.tone).toBe("blue");
    expect(ending.title).toBe("Your license ends on 31 Dec 2026 — in 12 days.");
  });

  it("a full limit is never in the global banner (it's on the create page)", () => {
    const data = ACTIVE({ reports_used: { board_report: 10, quarterly: 2 }, seats_used: 25 });
    expect(pickBanner(data, NONE_CLOSED, "2026-06-01")).toBeNull();
    expect(pickBanner(data, NONE_CLOSED, "2026-12-19")!.tone).toBe("blue");   // ending soon still shows
  });

  it("✕ closes the ending-soon warning until tomorrow", async () => {
    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    licenseGet.mockResolvedValue(ACTIVE({ expires_at: soon }));
    render(<MemoryRouter><LicenseBanner /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Close until tomorrow" }));
    expect(screen.queryByText(/Your license ends on/)).not.toBeInTheDocument();
    expect(Object.values(localStorage).length).toBe(1);
  });

  it("Open license on the Admin Console scrolls to the card instead of navigating", async () => {
    licenseGet.mockResolvedValue(licenseOf("expired", { expires_at: "2026-01-31", deployment: "on_prem" }));
    const card = document.createElement("div");
    card.id = "license-card";
    card.scrollIntoView = vi.fn();
    document.body.appendChild(card);
    render(
      <MemoryRouter initialEntries={["/admin-console"]}>
        <LicenseBanner />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Open license" }));
    expect(card.scrollIntoView).toHaveBeenCalled();
    card.remove();
  });
});


describe("LicenseCard always shows the license message", () => {
  it("shows 'ends in N days' on the card, with no way to close it", async () => {
    const { LicenseCard } = await import("@/components/license/LicenseCard");
    const soon = new Date(Date.now() + 17 * 86_400_000).toISOString().slice(0, 10);
    localStorage.setItem("license-banner-closed:ending", new Date().toISOString().slice(0, 10));   // banner was closed
    mockAuth = { user: CLIENT_ADMIN, refreshPermissions: vi.fn() };
    licenseGet.mockReset().mockResolvedValue(licenseOf("active", {
      starts_at: "2026-01-01", expires_at: soon, modules: ["board_report"], max_seats: 5, seats_used: 1,
    }));
    render(<MemoryRouter><LicenseCard /></MemoryRouter>);
    expect(await screen.findByText(/in 17 days/)).toBeInTheDocument();
    expect(screen.getByRole("note")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close until tomorrow" })).not.toBeInTheDocument();
    localStorage.clear();
  });

  it("after a request is sent, it says so instead of 'Contact Centriyon'", () => {
    const soon = new Date(Date.now() + 17 * 86_400_000).toISOString().slice(0, 10);
    const banner = pickBanner(licenseOf("active", {
      starts_at: "2026-01-01", expires_at: soon, upgrade_requested_at: "2026-11-03T09:00:00Z",
    }), new Set())!;
    expect(banner.text).toContain("Your request was sent on 3 Nov 2026 — Centriyon will be in touch.");
    expect(banner.text).not.toContain("Contact Centriyon to renew");
  });

  it("shows nothing extra for a healthy active license", async () => {
    const { LicenseCard } = await import("@/components/license/LicenseCard");
    mockAuth = { user: CLIENT_ADMIN, refreshPermissions: vi.fn() };
    licenseGet.mockReset().mockResolvedValue(licenseOf("active", {
      starts_at: "2026-01-01", expires_at: "2099-12-31", modules: ["board_report"], max_seats: 5, seats_used: 1,
    }));
    render(<MemoryRouter><LicenseCard /></MemoryRouter>);
    await screen.findByText("License");
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});

describe("LicenseCard loading", () => {
  it("shows a skeleton of the card while the license loads", async () => {
    const { LicenseCard } = await import("@/components/license/LicenseCard");
    mockAuth = { user: CLIENT_ADMIN, refreshPermissions: vi.fn() };
    licenseGet.mockReset().mockReturnValue(new Promise(() => {}));   // never resolves
    render(<MemoryRouter><LicenseCard /></MemoryRouter>);
    expect(screen.getByLabelText("Loading license")).toBeInTheDocument();
  });
});


describe("PageLimitBanner (limit reached, on the create page only)", () => {
  const USAGE = {
    unlimited: false, status: "active", deployment: "cloud", message: null, can_request: true, is_admin: true,
    seats: { used: 20, max: 21 },
    reports: { quarterly: { module_on: true, used: 1, limit: 1 }, annual: { module_on: true, used: 2, limit: 3 } },
  };

  beforeEach(() => {
    localStorage.clear();
    licenseUsage.mockReset().mockResolvedValue(USAGE);
    requestUpgrade.mockReset();
  });

  function renderAt(path: string) {
    let seen = "";
    const Where = () => { seen = useLocation().pathname + useLocation().hash; return null; };
    render(<MemoryRouter initialEntries={[path]}><PageLimitBanner /><Where /></MemoryRouter>);
    return () => seen;
  }

  it("shows on the new Quarterly report page, with only that limit", async () => {
    renderAt("/reports/quarterly");
    expect(await screen.findByText("You can't create more Quarterly Reports until Centriyon raises the limit.")).toBeInTheDocument();
    expect(screen.getByText("Quarterly Report 1 / 1")).toBeInTheDocument();
    expect(screen.queryByText(/Annual Report/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Users/)).not.toBeInTheDocument();
  });

  it("is not shown on a later step of an existing report, or on other pages", async () => {
    renderAt("/quarterly-report/rep_1/extraction");
    renderAt("/dashboard");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(licenseUsage).not.toHaveBeenCalled();
    expect(screen.queryByText(/reached a license limit/)).not.toBeInTheDocument();
  });

  it("is not shown on a create page whose own limit still has room", async () => {
    renderAt("/annual-report");
    await waitFor(() => expect(licenseUsage).toHaveBeenCalled());
    expect(screen.queryByText(/reached a license limit/)).not.toBeInTheDocument();
  });

  it("Request upgrade opens the popup on the License card, sending nothing itself", async () => {
    const seen = renderAt("/reports/quarterly");
    fireEvent.click(await screen.findByRole("button", { name: "Request upgrade" }));
    await waitFor(() => expect(seen()).toBe("/admin-console#request-upgrade"));
    expect(requestUpgrade).not.toHaveBeenCalled();
  });

  it("says the request was sent instead of offering another", async () => {
    licenseUsage.mockResolvedValue({ ...USAGE, upgrade_requested_at: "2026-11-03T09:00:00Z" });
    renderAt("/reports/quarterly");
    expect(await screen.findByText("Request sent on 2026-11-03")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request upgrade" })).not.toBeInTheDocument();
  });

  it("✕ hides it until tomorrow", async () => {
    renderAt("/reports/quarterly");
    fireEvent.click(await screen.findByRole("button", { name: "Close until tomorrow" }));
    expect(screen.queryByText(/reached a license limit/)).not.toBeInTheDocument();
    expect(localStorage.getItem("license-limit-closed:quarterly")).not.toBeNull();
  });
});
