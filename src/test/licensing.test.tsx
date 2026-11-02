// Company licensing in the frontend:
//  - spark_admin is pinned to /spark (no company of its own)
//  - spark_admin's key form sends what was typed (blank number = unlimited)
//  - the client admin's banner appears only when the license isn't active,
//    and refreshes the login the moment Spark activates it.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
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
const generate = vi.fn();
const resetWithCode = vi.fn();

vi.mock("@/lib/api", () => ({
  license: {
    get: (...args: unknown[]) => licenseGet(...args),
    requestUpgrade: (...args: unknown[]) => requestUpgrade(...args),
  },
  sparkLicenses: { generate: (...args: unknown[]) => generate(...args) },
  auth: { resetPasswordWithCode: (...args: unknown[]) => resetWithCode(...args) },
}));

const { ProtectedRoute } = await import("@/components/ProtectedRoute");
const { LicenseBanner, pickBanner, daysUntil } = await import("@/components/license/LicenseBanner");
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
  beforeEach(() => {
    generate.mockReset();
    generate.mockResolvedValue({ license_key: "KEY", activated: false, claims: {} });
  });

  it("sends the typed limits, with blank meaning unlimited, and shows an on-prem key to copy", async () => {
    const row = {
      company_id: "cmp_onprem", company_name: "BUPA", deployment: "on_prem", status: "none",
      starts_at: "2026-01-01", expires_at: "2026-12-31", issued_at: null,
      modules: ["board_report", "quarterly_report"], report_limits: { board_report: 10 },
      max_seats: 25, server_id: "SRV-AAAA-BBBB-CCCC", seats_used: null, reports_counted: {},
      lock: null, open_upgrade_requests: 0,
    } as const;
    render(<LicenseKeyForm row={row as never} modules={MODULES} onDone={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Generate key" }));

    await waitFor(() => expect(generate).toHaveBeenCalled());
    const [companyId, body] = generate.mock.calls[0];
    expect(companyId).toBe("cmp_onprem");
    expect(body.report_limits).toEqual({ board_report: 10, quarterly: null });
    expect(body.max_seats).toBe(25);
    expect(body.server_id).toBe("SRV-AAAA-BBBB-CCCC");
    expect(await screen.findByText("License key")).toBeInTheDocument();
    expect(screen.getByDisplayValue("KEY")).toBeInTheDocument();
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
  const NONE_CLOSED = new Set<"limit" | "ending">();

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

  it("lists what's full and what's still free; a full limit beats ending soon", () => {
    const data = ACTIVE({ reports_used: { board_report: 10, quarterly: 2 }, seats_used: 25 });
    const banner = pickBanner(data, NONE_CLOSED, "2026-12-19")!;
    expect(banner.title).toBe("You've reached a license limit.");
    expect(banner.text).toBe("You can't create more Board Report or add users until Centriyon raises the limit.");
    expect(banner.rows[0].items).toEqual(["Board Report 10 / 10", "Users 25 / 25"]);
    expect(banner.rows[1].items).toEqual(["Quarterly Report 2 / 8"]);
    // Closed for today: the next warning shows instead.
    expect(pickBanner(data, new Set(["limit"]), "2026-12-19")!.tone).toBe("blue");
  });

  it("✕ closes a warning until tomorrow", async () => {
    licenseGet.mockResolvedValue(ACTIVE({ seats_used: 25 }));
    render(<MemoryRouter><LicenseBanner /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Close until tomorrow" }));
    expect(screen.queryByText("You've reached a license limit.")).not.toBeInTheDocument();
    expect(Object.values(localStorage).length).toBe(1);
  });

  it("Request upgrade sends what's full to Centriyon", async () => {
    licenseGet.mockResolvedValue(ACTIVE({ seats_used: 25 }));
    render(<MemoryRouter><LicenseBanner /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Request upgrade" }));
    await waitFor(() => expect(requestUpgrade).toHaveBeenCalledWith({ note: "Limit reached: Users 25 / 25." }));
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
