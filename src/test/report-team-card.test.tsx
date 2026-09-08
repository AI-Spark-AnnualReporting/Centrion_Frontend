// The Report team card is mostly a URL builder, and the URL is where it can go
// wrong invisibly:
//
//   - miss `company` and every scoped route in the SAR app answers
//     "Select a company first" — the tab opens on a broken page, not an error;
//   - miss `next` and all three rows land in the same place, which is exactly
//     the bug the department switcher exists to avoid;
//   - link a department with no session yet and the tab opens on nothing.
//
// It must also stay a NEW tab: a same-tab hop loses the acting company.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Cycle, CycleDepartmentProgress } from "@/types/cycles";

vi.mock("@/lib/api", () => ({ getToken: () => "jwt-abc" }));

let actingCompany: { id: string; name: string } | null = { id: "cmp_1", name: "Acme" };
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ actingCompany }),
}));

const { default: ReportTeamCard } = await import(
  "@/pages/annual-report/ReportTeamCard"
);

const CYCLE = {
  id: "cyc_1",
  company_id: "cmp_1",
  fiscal_year: 2026,
  status: "active",
  project_manager_id: "usr_pm",
  submission_deadline: "2026-03-31",
  has_subsidiaries: false,
  has_sukuk: false,
  created_at: "",
  updated_at: "",
  total_departments: 2,
} as Cycle;

const DEPTS = [
  {
    session_id: "sess_hr",
    department_id: "dep_hr",
    department_name: "Human Resources",
    department_code: "HR",
    hod_name: "Hr HOD",
    assigned_user_name: "Sara Khalid",
    assigned_user_email: "sara@acme.com",
    session_status: "in_progress",
    progress: 36,
    submitted_at: null,
  },
  {
    // Not activated yet — no session, so nowhere to link to.
    department_id: "dep_fin",
    department_name: "Finance",
    department_code: "FIN",
    hod_name: null,
    session_status: "not_started",
    progress: 0,
    submitted_at: null,
  },
] as CycleDepartmentProgress[];

const links = () =>
  Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href")!);

describe("Report team card", () => {
  beforeEach(() => {
    actingCompany = { id: "cmp_1", name: "Acme" };
  });

  it("sends each role to a different workspace", () => {
    render(<ReportTeamCard cycle={CYCLE} departments={DEPTS} pmName="Sara Nasser" />);
    const paths = links().map((h) => new URL(h).searchParams.get("next"));
    expect(paths).toEqual([
      "/pm",
      "/hod/sessions/sess_hr",
      "/department/sessions/sess_hr",
    ]);
  });

  it("carries the token and the acting company on every link", () => {
    render(<ReportTeamCard cycle={CYCLE} departments={DEPTS} pmName="Sara Nasser" />);
    for (const href of links()) {
      const q = new URL(href).searchParams;
      expect(q.get("token")).toBe("jwt-abc");
      // Without this the SAR app has no company and every scoped route 403s.
      expect(q.get("company")).toBe("cmp_1");
    }
  });

  it("opens in a new tab, and can't reach back into this one", () => {
    render(<ReportTeamCard cycle={CYCLE} departments={DEPTS} pmName="Sara Nasser" />);
    for (const a of document.querySelectorAll("a")) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  it("follows the department switcher", () => {
    const withTwo: CycleDepartmentProgress[] = [
      DEPTS[0],
      { ...DEPTS[1], session_id: "sess_fin" },
    ];
    render(<ReportTeamCard cycle={CYCLE} departments={withTwo} pmName="Sara Nasser" />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "dep_fin" } });
    const paths = links().map((h) => new URL(h).searchParams.get("next"));
    expect(paths).toContain("/hod/sessions/sess_fin");
    expect(paths).not.toContain("/hod/sessions/sess_hr");
  });

  it("disables the department rows when there is no session to open", () => {
    render(<ReportTeamCard cycle={CYCLE} departments={[DEPTS[1]]} pmName="Sara Nasser" />);
    // PM is cycle-level and stays available; the other two have nowhere to go.
    expect(links()).toHaveLength(1);
    expect(new URL(links()[0]).searchParams.get("next")).toBe("/pm");
  });

  it("still renders when nothing is assigned", () => {
    render(<ReportTeamCard cycle={CYCLE} departments={[]} pmName={undefined} />);
    // Both the PM and the Head row read "Not set" with nothing assigned.
    expect(screen.getAllByText("Not set")).toHaveLength(2);
    expect(screen.getByText("Nobody")).toBeInTheDocument();
    expect(screen.getByText(/No departments assigned yet/)).toBeInTheDocument();
  });

  it("falls back to the cycle's company when acting on none", () => {
    // A client admin reading their own cycle has no acting company.
    actingCompany = null;
    render(<ReportTeamCard cycle={CYCLE} departments={DEPTS} pmName="Sara Nasser" />);
    expect(new URL(links()[0]).searchParams.get("company")).toBe("cmp_1");
  });
});
